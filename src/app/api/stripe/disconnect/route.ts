import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getActiveFacility } from "@/lib/facility-context";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Only disconnect the active facility — multi-facility owners may have
    // other facilities still connected.
    const active = await getActiveFacility(supabase, user.id);
    if (!active) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    const { error } = await supabase
        .from("facilities")
        .update({ stripe_account_id: null } as never)
        .eq("id", active.id);

    if (error) {
        // SAH-155: don't surface DB error strings.
        Sentry.captureException(error, {
            tags: { route: "stripe/disconnect" },
            extra: { facility_id: active.id },
        });
        return NextResponse.json({ error: "Could not disconnect Stripe" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
