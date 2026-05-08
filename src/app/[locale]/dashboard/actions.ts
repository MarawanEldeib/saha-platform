"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { facilityUpdateSchema, profileUpdateSchema, courtSchema, type CourtInput, availabilitySlotSchema, facilityHoursSchema } from "@/lib/validations";
import type { Database } from "@/types/database";
import type Stripe from "stripe";
import { getStripe, PLATFORM_FEE_PERCENT } from "@/lib/stripe";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type FacilityInsert = Database["public"]["Tables"]["facility_sports"]["Insert"];

// ---------------------------------------------------------------------------
// Facility: update core details
// ---------------------------------------------------------------------------
export async function updateFacilityAction(formData: FormData) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const raw = {
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        address: formData.get("address") as string,
        city: formData.get("city") as string,
        postal_code: formData.get("postal_code") as string,
        phone: (formData.get("phone") as string) || undefined,
        website: (formData.get("website") as string) || undefined,
    };

    const parsed = facilityUpdateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const update: FacilityUpdate = {
        ...parsed.data,
        phone: parsed.data.phone ?? null,
        website: parsed.data.website ?? null,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("facilities")
        .update(update)
        .eq("owner_id", user.id);

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/facility`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Facility: update sports selection
// ---------------------------------------------------------------------------
export async function updateFacilitySportsAction(facilityId: string, sportIds: number[]) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify ownership
    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Facility not found or access denied" };

    // Replace all sports: delete existing, then insert selected
    const { error: deleteError } = await supabase
        .from("facility_sports")
        .delete()
        .eq("facility_id", facilityId);
    if (deleteError) return { error: deleteError.message };

    if (sportIds.length > 0) {
        const rows: FacilityInsert[] = sportIds.map((id) => ({
            facility_id: facilityId,
            sport_id: id,
        }));
        const { error } = await supabase.from("facility_sports").insert(rows);
        if (error) return { error: error.message };
    }

    revalidatePath(`/${locale}/dashboard/facility`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: submit a new event
// ---------------------------------------------------------------------------
export async function submitEventAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const eventDate = formData.get("event_date") as string;
    const facilityId = formData.get("facility_id") as string;

    if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
    if (!eventDate) return { error: "Please select an event date." };
    if (!facilityId) return { error: "No facility found. Complete onboarding first." };

    const { error } = await supabase.from("events").insert({
        facility_id: facilityId,
        submitted_by: user.id,
        name,
        description: description || null,
        event_date: eventDate,
        status: "pending",
    });

    if (error) return { error: error.message };
    return { success: true };
}

// ---------------------------------------------------------------------------
// Availability: create single slot
// ---------------------------------------------------------------------------
export async function createAvailabilitySlotAction(
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const parsed = availabilitySlotSchema.safeParse({ court_id: courtId, date, start_time: startTime, end_time: endTime });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { data: courtRow } = await supabase.from("courts").select("facility_id").eq("id", courtId).single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase.from("facilities").select("id").eq("id", courtRow.facility_id).eq("owner_id", user.id).single();
    if (!facility) return { error: "Access denied" };

    const { error } = await supabase.from("court_availability").insert({
        court_id: courtId,
        date,
        start_time: startTime,
        end_time: endTime,
        is_booked: false,
    });

    if (error) return { error: error.code === "23505" ? "A slot already exists at that time" : error.message };
    revalidatePath(`/${locale}/dashboard/availability`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Availability: generate slots for a full day
// ---------------------------------------------------------------------------
function timeToMinutes(t: string) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function minutesToTime(mins: number) {
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export async function generateAvailabilitySlotsAction(
    courtId: string,
    date: string,
    fromTime: string,
    toTime: string,
    durationMinutes: number,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: courtRow } = await supabase.from("courts").select("facility_id").eq("id", courtId).single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase.from("facilities").select("id").eq("id", courtRow.facility_id).eq("owner_id", user.id).single();
    if (!facility) return { error: "Access denied" };

    const start = timeToMinutes(fromTime);
    const end = timeToMinutes(toTime);
    if (start >= end) return { error: "From time must be before to time" };
    if (end - start < durationMinutes) return { error: "Time range is shorter than the slot duration" };

    const rows = [];
    for (let cur = start; cur + durationMinutes <= end; cur += durationMinutes) {
        rows.push({
            court_id: courtId,
            date,
            start_time: minutesToTime(cur),
            end_time: minutesToTime(cur + durationMinutes),
            is_booked: false,
        });
    }

    const { error } = await supabase.from("court_availability").upsert(rows, {
        onConflict: "court_id,date,start_time",
        ignoreDuplicates: true,
    });

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/availability`);
    return { success: true, count: rows.length };
}

// ---------------------------------------------------------------------------
// Availability: delete a slot (only if not booked)
// ---------------------------------------------------------------------------
export async function deleteAvailabilitySlotAction(slotId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: slot } = await supabase.from("court_availability").select("id, is_booked, court_id").eq("id", slotId).single();
    if (!slot) return { error: "Slot not found" };
    if (slot.is_booked) return { error: "Cannot delete a booked slot" };

    const { data: courtRow } = await supabase.from("courts").select("facility_id").eq("id", slot.court_id).single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase.from("facilities").select("id").eq("id", courtRow.facility_id).eq("owner_id", user.id).single();
    if (!facility) return { error: "Access denied" };

    const { error } = await supabase.from("court_availability").delete().eq("id", slotId);
    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/availability`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Courts: create
// ---------------------------------------------------------------------------
export async function createCourtAction(facilityId: string, input: CourtInput) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Facility not found or access denied" };

    const parsed = courtSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { error } = await supabase.from("courts").insert({
        facility_id: facilityId,
        name: parsed.data.name,
        sport_id: parsed.data.sport_id === "" ? null : parseInt(parsed.data.sport_id, 10),
        capacity: parsed.data.capacity,
        price_per_hour: parsed.data.price_per_hour,
        is_active: true,
    });

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/courts`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Courts: update
// ---------------------------------------------------------------------------
export async function updateCourtAction(courtId: string, input: CourtInput) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: courtRow } = await supabase
        .from("courts")
        .select("facility_id")
        .eq("id", courtId)
        .single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", courtRow.facility_id)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Access denied" };

    const parsed = courtSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { error } = await supabase
        .from("courts")
        .update({
            name: parsed.data.name,
            sport_id: parsed.data.sport_id === "" ? null : parseInt(parsed.data.sport_id, 10),
            capacity: parsed.data.capacity,
            price_per_hour: parsed.data.price_per_hour,
        })
        .eq("id", courtId);

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/courts`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Courts: toggle active
// ---------------------------------------------------------------------------
export async function toggleCourtActiveAction(courtId: string, isActive: boolean) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: courtRow } = await supabase
        .from("courts")
        .select("facility_id")
        .eq("id", courtId)
        .single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", courtRow.facility_id)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Access denied" };

    const { error } = await supabase
        .from("courts")
        .update({ is_active: isActive })
        .eq("id", courtId);

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/courts`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Courts: delete
// ---------------------------------------------------------------------------
export async function deleteCourtAction(courtId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: courtRow } = await supabase
        .from("courts")
        .select("facility_id")
        .eq("id", courtId)
        .single();
    if (!courtRow) return { error: "Court not found" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", courtRow.facility_id)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Access denied" };

    const { error } = await supabase
        .from("courts")
        .delete()
        .eq("id", courtId);

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/courts`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Facility: save opening hours (upsert all 7 days)
// ---------------------------------------------------------------------------
export async function saveFacilityHoursAction(
    facilityId: string,
    hours: Array<{ day_of_week: number; is_closed: boolean; open_time: string | null; close_time: string | null }>,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Access denied" };

    const parsed = facilityHoursSchema.safeParse({ hours });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const rows = parsed.data.hours.map((h) => ({
        facility_id: facilityId,
        day_of_week: h.day_of_week,
        is_closed: h.is_closed,
        open_time: h.is_closed ? null : h.open_time,
        close_time: h.is_closed ? null : h.close_time,
    }));

    const { error } = await supabase
        .from("facility_hours")
        .upsert(rows, { onConflict: "facility_id,day_of_week" });

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/facility`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Booking: get available slots for a court on a date (used by player booking widget)
// ---------------------------------------------------------------------------
export async function getAvailableSlotsAction(courtId: string, date: string) {
    const supabase = await createClient();
    const { data } = await supabase
        .from("court_availability")
        .select("id, start_time, end_time")
        .eq("court_id", courtId)
        .eq("date", date)
        .eq("is_booked", false)
        .order("start_time");
    return { slots: data ?? [] };
}

// ---------------------------------------------------------------------------
// Booking: create booking + Stripe checkout session
// ---------------------------------------------------------------------------
export async function createBookingAndCheckoutAction(
    availabilityId: string,
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
    numPlayers: number,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Fetch court + facility info
    const { data: court } = await supabase
        .from("courts")
        .select("id, name, price_per_hour, facility_id, facilities(id, name, stripe_account_id)")
        .eq("id", courtId)
        .single();
    if (!court) return { error: "Court not found" };

    // Calculate price: price_per_hour * duration
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const totalAed = Math.round(court.price_per_hour * durationHours * 100) / 100;

    // Lock the slot immediately to prevent double-booking
    const { error: lockError } = await supabase
        .from("court_availability")
        .update({ is_booked: true } as never)
        .eq("id", availabilityId)
        .eq("is_booked", false);

    if (lockError) return { error: "Slot is no longer available" };

    // Create booking record (pending)
    const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
            availability_id: availabilityId,
            court_id: courtId,
            player_id: user.id,
            date,
            start_time: startTime,
            end_time: endTime,
            num_players: numPlayers,
            total_price: totalAed,
            currency: "AED",
            status: "pending",
        } as never)
        .select("id")
        .single();

    if (bookingError || !booking) {
        // Release the slot on failure
        await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", availabilityId);
        return { error: "Failed to create booking" };
    }

    // Create pending payment record
    await supabase.from("payments").insert({
        booking_id: booking.id,
        amount: totalAed,
        currency: "AED",
        status: "pending",
    } as never);

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facilityData = (court as any).facilities;
    const stripeAccountId = facilityData?.stripe_account_id as string | null;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
            quantity: 1,
            price_data: {
                currency: "aed",
                unit_amount: Math.round(totalAed * 100),
                product_data: {
                    name: `${court.name} — ${date} ${startTime}–${endTime}`,
                    description: facilityData?.name ?? undefined,
                },
            },
        }],
        metadata: { booking_id: booking.id, availability_id: availabilityId },
        success_url: `${appUrl}/${locale}/bookings/${booking.id}?success=1`,
        cancel_url: `${appUrl}/${locale}/bookings/${booking.id}?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min to pay
    };

    // Route payment to facility's connected Stripe account (if connected)
    if (stripeAccountId) {
        const feeAmount = Math.round(totalAed * 100 * PLATFORM_FEE_PERCENT / 100);
        sessionParams.payment_intent_data = {
            application_fee_amount: feeAmount,
            transfer_data: { destination: stripeAccountId },
        };
    }

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return { checkoutUrl: session.url };
}

// ---------------------------------------------------------------------------
// Profile: update display name and phone
// ---------------------------------------------------------------------------
export async function updateProfileAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const rawPhone = (formData.get("phone") as string)?.trim();
    const raw = {
        display_name: (formData.get("display_name") as string)?.trim(),
        phone: rawPhone || "",
    };
    const parsed = profileUpdateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { error } = await supabase
        .from("profiles")
        .update({
            display_name: parsed.data.display_name,
            phone: parsed.data.phone || null,
        } as never)
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
}

// ---------------------------------------------------------------------------
// Booking: retry payment for a pending booking
// ---------------------------------------------------------------------------
export async function retryPaymentAction(bookingId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Confirm this booking belongs to the user and is still pending
    const { data: booking } = await supabase
        .from("bookings")
        .select("id, status")
        .eq("id", bookingId)
        .eq("player_id", user.id)
        .single();

    if (!booking) return { error: "Booking not found" };
    if (booking.status !== "pending") return { error: "Booking is no longer pending" };

    // Get the Stripe session ID from the payments record
    const { data: payment } = await supabase
        .from("payments")
        .select("stripe_checkout_session_id")
        .eq("booking_id", bookingId)
        .single();

    if (!payment?.stripe_checkout_session_id) return { error: "Payment record not found" };

    // Retrieve the Stripe session — if still open, return its URL
    const session = await getStripe().checkout.sessions.retrieve(payment.stripe_checkout_session_id);
    if (session.status === "open" && session.url) return { checkoutUrl: session.url };

    return { error: "Your payment session has expired. The slot has been released — please book again." };
}

export async function markCheckedInAction(bookingId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "No facility found" };

    await supabase
        .from("bookings")
        .update({ status: "completed" } as never)
        .eq("id", bookingId)
        .eq("status", "confirmed");

    revalidatePath("/dashboard/checkin");
    return { success: true };
}
