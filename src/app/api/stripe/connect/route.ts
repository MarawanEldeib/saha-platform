import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch the facility owned by this user
    const { data: facility } = await supabase
        .from("facilities")
        .select("id, name, stripe_account_id")
        .eq("owner_id", user.id)
        .limit(1)
        .single();

    if (!facility) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    let accountId = facility.stripe_account_id as string | null;

    try {
        // Create a new Express connected account if not already connected
        if (!accountId) {
            const account = await getStripe().accounts.create({
                type: "express",
                country: "AE",
                business_profile: { name: facility.name },
                default_currency: "aed",
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
