import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getActiveFacility } from "@/lib/facility-context";

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

    try {
        // Create a new Express connected account if not already connected
        if (!accountId) {
            const account = await getStripe().accounts.create({
                type: "express",
                country: "AE",
                business_profile: { name: facility.name },
                default_currency: currency,
            });
            accountId = account.id;
            await supabase
                .from("facilities")
                .update({ stripe_account_id: accountId } as never)
                .eq("id", facility.id);
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
        const link = await getStripe().accountLinks.create({
            account: accountId,
            refresh_url: `${appUrl}/en/dashboard/facility?stripe=refresh`,
            return_url: `${appUrl}/en/dashboard/facility?stripe=success`,
            type: "account_onboarding",
        });

        return NextResponse.json({ url: link.url });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Stripe error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
