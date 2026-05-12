import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getActiveFacility } from "@/lib/facility-context";
import { getLocale } from "next-intl/server";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Connect/disconnect operate on the owner's currently-active facility.
    // Multi-facility owners switch via the dashboard sidebar; the cookie
    // tells us which one to act on.
    const active = await getActiveFacility(supabase, user.id);
    if (!active) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    const { data: facility } = await supabase
        .from("facilities")
        .select("id, name, stripe_account_id, currency")
        .eq("id", active.id)
        .single();

    if (!facility) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    let accountId = facility.stripe_account_id as string | null;
    const currency = ((facility as { currency?: string }).currency ?? "AED").toLowerCase();

    // SAH-64: capabilities must be requested at account-creation time when
    // the country (UAE) isn't enabled by default for Express in the
    // platform's Stripe Connect settings. Without these, Stripe rejects the
    // account_link with: "You must provide an account with capabilities…".
    // Both card_payments and transfers are needed for the booking flow's
    // application_fee_amount + transfer_data split to work.
    const REQUIRED_CAPABILITIES = {
        card_payments: { requested: true },
        transfers: { requested: true },
    } as const;

    try {
        if (!accountId) {
            const account = await getStripe().accounts.create({
                type: "express",
                country: "AE",
                business_profile: { name: facility.name },
                default_currency: currency,
                capabilities: REQUIRED_CAPABILITIES,
            });
            accountId = account.id;
            await supabase
                .from("facilities")
                .update({ stripe_account_id: accountId } as never)
                .eq("id", facility.id);
        } else {
            // Existing accounts created before SAH-64 don't have capabilities
            // requested. Stripe lets us add them via accounts.update — this
            // is idempotent, so it's safe to run on every connect attempt.
            try {
                await getStripe().accounts.update(accountId, {
                    capabilities: REQUIRED_CAPABILITIES,
                });
            } catch (capErr) {
                // Surface but don't block — the link creation below will
                // fail with a clearer message if capabilities really can't
                // be granted (e.g. account is in a deauthorized state).
                console.warn("[stripe/connect] capability backfill failed", capErr);
            }
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
        // SAH-64: keep the locale the user is in so they don't get bounced
        // to /en/ when they return from Stripe-hosted onboarding.
        const locale = await getLocale();
        const link = await getStripe().accountLinks.create({
            account: accountId,
            refresh_url: `${appUrl}/${locale}/dashboard/facility?stripe=refresh`,
            return_url: `${appUrl}/${locale}/dashboard/facility?stripe=success`,
            type: "account_onboarding",
        });

        return NextResponse.json({ url: link.url });
    } catch (err: unknown) {
        // SAH-155: don't surface Stripe SDK internals to the client.
        Sentry.captureException(err, {
            tags: { route: "stripe/connect" },
            extra: { facility_id: facility.id, account_id: accountId },
        });
        return NextResponse.json({ error: "Could not start Stripe onboarding" }, { status: 500 });
    }
}
