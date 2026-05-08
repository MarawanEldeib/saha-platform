import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: facility } = await supabase
        .from("facilities")
        .select("id, name, stripe_account_id")
        .eq("owner_id", user.id)
        .limit(1)
        .single();

    if (!facility) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    let accountId = facility.stripe_account_id as string | null;

    try {
        if (!accountId) {
            const account = await getStripe().accounts.create({
                type: "express",
                business_profile: { name: facility.name },
            });
            accountId = account.id;
            await supabase
                .from("facilities")
                .update({ stripe_account_id: accountId } as never)
                .eq("id", facility.id);
        }

        const accountSession = await getStripe().accountSessions.create({
            account: accountId,
            components: {
                account_onboarding: { enabled: true },
            },
        });

        return NextResponse.json({ clientSecret: accountSession.client_secret });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Stripe error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
