import { NextResponse } from "next/server";
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
