"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { facilityUpdateSchema, profileUpdateSchema, courtSchema, type CourtInput, availabilitySlotSchema, facilityHoursSchema } from "@/lib/validations";
import type { Database } from "@/types/database";
import type Stripe from "stripe";
import { getStripe, PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { logAuditEvent } from "@/lib/audit";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type FacilityInsert = Database["public"]["Tables"]["facility_sports"]["Insert"];

// ---------------------------------------------------------------------------
// Geocoding helper — uses Mapbox Geocoding API v5
// ---------------------------------------------------------------------------
async function geocodeAddress(address: string, city: string): Promise<string | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return null;
    const query = encodeURIComponent(`${address}, ${city}, UAE`);
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${token}&limit=1&country=ae`,
            { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { features?: { geometry?: { type: string; coordinates: [number, number] } }[] };
        const coords = data.features?.[0]?.geometry?.coordinates;
        if (!coords) return null;
        return `POINT(${coords[0]} ${coords[1]})`;
    } catch {
        return null;
    }
}

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

    const locationWkt = await geocodeAddress(parsed.data.address, parsed.data.city);

    const update: FacilityUpdate = {
        ...parsed.data,
        phone: parsed.data.phone ?? null,
        website: parsed.data.website ?? null,
        updated_at: new Date().toISOString(),
        ...(locationWkt ? { location: locationWkt as never } : {}),
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
// SECURITY: Server is the source of truth for slot times and price. The
// previous version trusted client-supplied start/end times and silently
// fell back to platform-account charges when the connected Stripe account
// wasn't ready (SAH-67, SAH-68).
// ---------------------------------------------------------------------------
export async function createBookingAndCheckoutAction(
    availabilityId: string,
    numPlayers: number,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Authoritative slot data — never trust client times.
    const { data: slot } = await supabase
        .from("court_availability")
        .select("id, court_id, date, start_time, end_time, is_booked")
        .eq("id", availabilityId)
        .single();
    if (!slot) return { error: "Slot not found" };
    if (slot.is_booked) return { error: "Slot is no longer available" };

    const { data: court } = await supabase
        .from("courts")
        .select("id, name, price_per_hour, capacity, facility_id, facilities(id, name, stripe_account_id)")
        .eq("id", slot.court_id)
        .single();
    if (!court) return { error: "Court not found" };

    if (numPlayers < 1 || numPlayers > (court.capacity ?? 1)) {
        return { error: "Invalid number of players" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facilityData = (court as any).facilities;
    const stripeAccountId = facilityData?.stripe_account_id as string | null;

    // Block if facility hasn't connected Stripe — funds would otherwise land
    // in the platform account.
    if (!stripeAccountId) {
        return { error: "This facility is not yet ready to receive payments." };
    }

    // Verify the connected account is fully onboarded before creating the
    // checkout session. Without this, Stripe accepts the session but blocks
    // the transfer at capture time, leaving funds in the platform account.
    try {
        const account = await getStripe().accounts.retrieve(stripeAccountId);
        if (!account.charges_enabled || !account.details_submitted) {
            return { error: "This facility is not yet ready to receive payments." };
        }
    } catch {
        return { error: "Could not verify the facility's payment account. Please try again." };
    }

    // Compute price from authoritative slot times.
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durationHours <= 0) return { error: "Invalid slot" };
    const totalAed = Math.round(court.price_per_hour * durationHours * 100) / 100;

    // Lock the slot to prevent double-booking. Conditional on is_booked=false
    // makes this a CAS — if a concurrent caller locked it first, this returns
    // zero rows and we abort.
    const { data: lockedRows, error: lockError } = await supabase
        .from("court_availability")
        .update({ is_booked: true } as never)
        .eq("id", availabilityId)
        .eq("is_booked", false)
        .select("id");

    if (lockError || !lockedRows || lockedRows.length === 0) {
        return { error: "Slot is no longer available" };
    }

    // Create booking record (pending) using slot-canonical times.
    const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
            availability_id: availabilityId,
            court_id: slot.court_id,
            player_id: user.id,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            num_players: numPlayers,
            total_price: totalAed,
            currency: "AED",
            status: "pending",
        } as never)
        .select("id")
        .single();

    if (bookingError || !booking) {
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

    const feeAmount = Math.round(totalAed * 100 * PLATFORM_FEE_PERCENT / 100);
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
            quantity: 1,
            price_data: {
                currency: "aed",
                unit_amount: Math.round(totalAed * 100),
                product_data: {
                    name: facilityData?.name ? `${facilityData.name} — ${court.name}` : court.name,
                    description: `${slot.date} · ${slot.start_time}–${slot.end_time}`,
                },
            },
        }],
        metadata: { booking_id: booking.id, availability_id: availabilityId },
        success_url: `${appUrl}/${locale}/bookings/${booking.id}?success=1`,
        cancel_url: `${appUrl}/${locale}/bookings/${booking.id}?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min to pay
        payment_intent_data: {
            application_fee_amount: feeAmount,
            transfer_data: { destination: stripeAccountId },
        },
    };

    let session: Stripe.Checkout.Session;
    try {
        session = await getStripe().checkout.sessions.create(sessionParams);
    } catch {
        // Stripe rejected the session — release the slot, mark booking cancelled,
        // and surface a clear error rather than silently rerouting to platform.
        await supabase.from("bookings").update({ status: "cancelled" } as never).eq("id", booking.id);
        await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", availabilityId);
        return { error: "Could not start payment. Please try again." };
    }

    return { checkoutUrl: session.url };
}

// ---------------------------------------------------------------------------
// Profile: update avatar URL
// ---------------------------------------------------------------------------
export async function updateAvatarAction(avatarUrl: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl } as never)
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
}

// ---------------------------------------------------------------------------
// Profile: remove avatar
// ---------------------------------------------------------------------------
export async function removeAvatarAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Delete from storage (ignore errors — file may not exist)
    await supabase.storage.from("avatars").remove([`${user.id}/avatar.jpg`]);

    const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null } as never)
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
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

// ---------------------------------------------------------------------------
// Booking: cancel by player (refund if paid and within 24h of booking date)
// ---------------------------------------------------------------------------
export async function cancelBookingAction(bookingId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: booking } = await supabase
        .from("bookings")
        .select("id, status, date, start_time, availability_id")
        .eq("id", bookingId)
        .eq("player_id", user.id)
        .single();

    if (!booking) return { error: "Booking not found" };
    if (!["confirmed", "pending"].includes(booking.status)) return { error: "This booking cannot be cancelled" };

    // Check cancellation window: must be >24h before the booking start
    const bookingStart = new Date(`${booking.date}T${booking.start_time}`);
    const hoursUntil = (bookingStart.getTime() - Date.now()) / 3_600_000;
    const withinWindow = hoursUntil > 24;

    // Get payment record for refund
    const { data: payment } = await supabase
        .from("payments")
        .select("stripe_payment_intent_id, amount, status")
        .eq("booking_id", bookingId)
        .single();

    // Issue Stripe refund if payment succeeded and within window
    if (withinWindow && payment?.stripe_payment_intent_id && payment.status === "succeeded") {
        try {
            await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
            await supabase.from("payments").update({ status: "refunded" } as never).eq("booking_id", bookingId);
        } catch {
            // refund failed — still cancel the booking
        }
    }

    // Cancel booking + release slot
    await supabase.from("bookings").update({ status: "cancelled" } as never).eq("id", bookingId);
    await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", booking.availability_id);

    const refunded = withinWindow && payment?.status === "succeeded";
    await logAuditEvent({
        actorId: user.id,
        actorRole: "user",
        action: "booking.cancel.player",
        targetType: "booking",
        targetId: bookingId,
        metadata: {
            refunded,
            within_window: withinWindow,
            hours_until: hoursUntil,
        },
    });

    revalidatePath(`/${locale}/bookings`);
    return { success: true, refunded };
}

// ---------------------------------------------------------------------------
// Booking: cancel by facility owner — full refund regardless of 24h window.
// SAH-87: closes the gap where RLS allows owners to UPDATE bookings but no
// action handles the refund + notification side. If we let an owner just
// flip status='cancelled' the player loses money silently.
// ---------------------------------------------------------------------------
export async function ownerCancelBookingAction(bookingId: string, reason: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify caller owns the facility containing the court for this booking.
    const { data: booking } = await supabase
        .from("bookings")
        .select(`
            id, status, availability_id, court_id,
            courts(facility_id, facilities(owner_id))
        `)
        .eq("id", bookingId)
        .single();

    if (!booking) return { error: "Booking not found" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerId = (booking as any).courts?.facilities?.owner_id;
    if (ownerId !== user.id) return { error: "Access denied" };

    if (!["confirmed", "pending"].includes(booking.status)) {
        return { error: "This booking cannot be cancelled" };
    }

    // Issue full refund regardless of window — owner-initiated cancellations
    // should never punish the player.
    const { data: payment } = await supabase
        .from("payments")
        .select("stripe_payment_intent_id, status")
        .eq("booking_id", bookingId)
        .single();

    let refunded = false;
    if (payment?.stripe_payment_intent_id && payment.status === "succeeded") {
        try {
            await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
            await supabase.from("payments").update({ status: "refunded" } as never).eq("booking_id", bookingId);
            refunded = true;
        } catch (err) {
            console.error("[ownerCancel] refund failed for", bookingId, err);
            // Continue cancelling so the slot is released. Refund will be
            // retried via the audit trail / Stripe dashboard.
        }
    }

    await supabase.from("bookings").update({ status: "cancelled" } as never).eq("id", bookingId);
    await supabase
        .from("court_availability")
        .update({ is_booked: false } as never)
        .eq("id", booking.availability_id);

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "booking.cancel.owner",
        targetType: "booking",
        targetId: bookingId,
        metadata: { reason: reason || null, refunded, prior_status: booking.status },
    });

    revalidatePath(`/${locale}/dashboard/bookings`);
    revalidatePath(`/${locale}/bookings`);
    return { success: true, refunded };
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
