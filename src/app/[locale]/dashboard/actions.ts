"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capWalletCredit, computeCheckoutAmounts } from "@/lib/booking-pricing";
import { rateLimit } from "@/lib/rate-limit";
import { facilityUpdateSchema, profileUpdateSchema, courtSchema, type CourtInput, availabilitySlotSchema, facilityHoursSchema } from "@/lib/validations";
import { sanitizeTextInput } from "@/lib/utils";
import { sanitizeEventTags } from "@/lib/event-tags";
import { geocodeAddress } from "@/lib/geocoding";
import { bookCourtCore } from "@/lib/booking-flow";
import type { Database } from "@/types/database";
import type Stripe from "stripe";
import { getStripe, PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { logAuditEvent } from "@/lib/audit";
import {
    FACILITY_COOKIE_NAME,
    FACILITY_COOKIE_MAX_AGE,
    getActiveFacility,
} from "@/lib/facility-context";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type FacilityInsert = Database["public"]["Tables"]["facility_sports"]["Insert"];

// ---------------------------------------------------------------------------
// Facility selection: set the cookie that scopes dashboard pages to a
// specific facility owned by the caller. SAH-65.
// ---------------------------------------------------------------------------
export async function setActiveFacilityAction(facilityId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify the caller owns this facility before trusting the cookie value.
    const { data: facility } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!facility) return { error: "Access denied" };

    const cookieStore = await cookies();
    cookieStore.set(FACILITY_COOKIE_NAME, facilityId, {
        path: "/",
        maxAge: FACILITY_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/", "layout");
    return { success: true };
}

// ---------------------------------------------------------------------------
// Facility: update core details — scoped to a specific facility id passed
// in the form (SAH-65). Previously updated every facility owned by the
// caller, which would have been wrong as soon as a single owner had two.
// ---------------------------------------------------------------------------
export async function updateFacilityAction(formData: FormData) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const facilityId = formData.get("facility_id") as string;
    if (!facilityId) return { error: "Facility id missing" };

    // Verify ownership before updating.
    const { data: own } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!own) return { error: "Access denied" };

    // SAH-120: normalize free-text inputs before validation/storage so the API
    // doesn't surface Windows line endings or trailing whitespace from form
    // submissions.
    const raw = {
        name: sanitizeTextInput((formData.get("name") as string) ?? ""),
        description: sanitizeTextInput((formData.get("description") as string) ?? ""),
        address: sanitizeTextInput((formData.get("address") as string) ?? ""),
        city: sanitizeTextInput((formData.get("city") as string) ?? ""),
        postal_code: sanitizeTextInput((formData.get("postal_code") as string) ?? ""),
        phone: (formData.get("phone") as string) || undefined,
        website: (formData.get("website") as string) || undefined,
        trn: (formData.get("trn") as string) || undefined,
    };

    const parsed = facilityUpdateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    // SAH-119: if Mapbox is configured (it is in prod), require the address
    // to resolve before letting the save through. We previously silently
    // dropped the location update on no_match, which produced ghost
    // facilities (e.g. CyberSport had status='active' with location IS NULL,
    // so it didn't appear on the map).
    const geo = await geocodeAddress(parsed.data.address, parsed.data.city);
    if (geo.status === "no_match") {
        return {
            error: "We couldn't locate that address on the map. Double-check the street and city, then try again.",
        };
    }

    const update: FacilityUpdate = {
        ...parsed.data,
        phone: parsed.data.phone ?? null,
        website: parsed.data.website ?? null,
        trn: parsed.data.trn || null,
        updated_at: new Date().toISOString(),
        ...(geo.status === "ok" ? { location: geo.wkt as never } : {}),
    };

    const { error } = await supabase
        .from("facilities")
        .update(update)
        .eq("id", facilityId);

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
    const tags = sanitizeEventTags(formData.getAll("tags"));

    if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
    if (!eventDate) return { error: "Please select an event date." };
    if (!facilityId) return { error: "No facility found. Complete onboarding first." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("events").insert({
        facility_id: facilityId,
        submitted_by: user.id,
        name,
        description: description || null,
        event_date: eventDate,
        status: "pending",
        tags,
    });

    if (error) return { error: error.message };
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: update an existing event (SAH-123).
// Owner can correct typos / change date. Resets status to 'pending' so the
// edited content goes through admin review again — otherwise an owner could
// approve a clean draft and swap content past review. Apply sanitizeTextInput
// the same way updateFacilityAction does (SAH-120).
// ---------------------------------------------------------------------------
export async function updateEventAction(
    eventId: string,
    raw: { name: string; description: string; event_date: string },
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const name = sanitizeTextInput(raw.name ?? "");
    const description = sanitizeTextInput(raw.description ?? "");
    const eventDate = raw.event_date;

    if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
    if (!eventDate) return { error: "Please select an event date." };

    // Ownership check: the event must belong to a facility owned by the caller.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from("events")
        .select("id, facility_id, status, facilities!inner(owner_id)")
        .eq("id", eventId)
        .single();
    if (!existing) return { error: "Event not found" };
    if (existing.facilities?.owner_id !== user.id) return { error: "Access denied" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("events")
        .update({
            name,
            description: description || null,
            event_date: eventDate,
            status: "pending", // re-review after any content change
        })
        .eq("id", eventId);

    if (error) return { error: error.message };

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "event.update",
        targetType: "event",
        targetId: eventId,
        metadata: { facility_id: existing.facility_id, previous_status: existing.status },
    });

    revalidatePath(`/${locale}/dashboard/events`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: delete (SAH-123). Hard delete; owner-scoped. Audit log captures
// what was removed in case we need to reverse-engineer a complaint.
// ---------------------------------------------------------------------------
export async function deleteEventAction(eventId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from("events")
        .select("id, name, facility_id, status, facilities!inner(owner_id)")
        .eq("id", eventId)
        .single();
    if (!existing) return { error: "Event not found" };
    if (existing.facilities?.owner_id !== user.id) return { error: "Access denied" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("events")
        .delete()
        .eq("id", eventId);

    if (error) return { error: error.message };

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "event.delete",
        targetType: "event",
        targetId: eventId,
        metadata: { facility_id: existing.facility_id, name: existing.name, status: existing.status },
    });

    revalidatePath(`/${locale}/dashboard/events`);
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
// SAH-92: split a confirmed booking into per-guest Stripe Payment Links.
// The booker has already paid in full; each friend's link pays the
// platform, and on success we award the booker an equal wallet credit.
//
// This is intentionally a thin v1: no live invitations (the booker shares
// the URL via WhatsApp manually), no per-guest cancellation, no auto-Stripe
// refund to the booker. We stack settle-up via the existing wallet flow,
// which keeps the Stripe surface tiny and avoids destination-charge gymnastics.
// ---------------------------------------------------------------------------
export async function splitBookingAction(
    bookingId: string,
    guests: { name?: string; email?: string }[],
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!Array.isArray(guests) || guests.length < 1 || guests.length > 7) {
        return { error: "Invite between 1 and 7 friends." };
    }

    const { data: booking } = await supabase
        .from("bookings")
        .select("id, status, total_price, currency, player_id")
        .eq("id", bookingId)
        .eq("player_id", user.id)
        .single();
    if (!booking) return { error: "Booking not found" };
    if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be split" };

    // Existing splits? Don't double-create.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from("booking_guests")
        .select("id")
        .eq("booking_id", bookingId)
        .limit(1);
    if (existing && existing.length > 0) {
        return { error: "This booking has already been split." };
    }

    // Booker is one of the players, so split the total across (guests + 1).
    const totalShares = guests.length + 1;
    const sharePerPerson = Math.round((Number(booking.total_price) / totalShares) * 100) / 100;
    const currency = booking.currency || "AED";

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
    const successUrl = `${appUrl}/en/bookings/${bookingId}?split_paid=1`;

    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertedGuests, error: insertError } = await (admin as any)
        .from("booking_guests")
        .insert(
            guests.map((g) => ({
                booking_id: bookingId,
                name: g.name?.trim() || null,
                email: g.email?.trim() || null,
                share_amount: sharePerPerson,
                currency,
                payment_status: "pending" as const,
            })),
        )
        .select("id, name, email, share_amount");
    if (insertError || !insertedGuests) {
        return { error: "Could not create guest records" };
    }

    // Create one Stripe Payment Link per guest. Each link is platform-only
    // (no Connect transfer) — the friend reimburses the booker via wallet
    // credit awarded in the webhook.
    const stripe = getStripe();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: any[] = [];
    for (const guest of insertedGuests as { id: string; share_amount: number; name: string | null; email: string | null }[]) {
        try {
            const product = await stripe.products.create({
                name: `Saha booking split — ${(guest.name ?? guest.email ?? "guest")}`,
                description: `Your share of booking ${bookingId.slice(0, 8)}`,
            });
            const price = await stripe.prices.create({
                product: product.id,
                currency: currency.toLowerCase(),
                unit_amount: Math.round(Number(guest.share_amount) * 100),
            });
            const link = await stripe.paymentLinks.create({
                line_items: [{ price: price.id, quantity: 1 }],
                metadata: {
                    booking_guest_id: guest.id,
                    booking_id: bookingId,
                    booker_id: user.id,
                },
                after_completion: { type: "redirect", redirect: { url: successUrl } },
            });
            await admin
                .from("booking_guests")
                .update({
                    stripe_payment_link_id: link.id,
                    stripe_payment_link_url: link.url,
                } as never)
                .eq("id", guest.id);
            enriched.push({
                id: guest.id,
                name: guest.name,
                email: guest.email,
                share_amount: guest.share_amount,
                url: link.url,
            });
        } catch (err) {
            console.error("[split] payment link failed for guest", guest.id, err);
            await admin
                .from("booking_guests")
                .update({ payment_status: "failed" } as never)
                .eq("id", guest.id);
            enriched.push({
                id: guest.id,
                name: guest.name,
                email: guest.email,
                share_amount: guest.share_amount,
                url: null,
            });
        }
    }

    return {
        success: true,
        sharePerPerson,
        currency,
        guests: enriched,
    };
}

// ---------------------------------------------------------------------------
// SAH-40: AI description generator. Owners often struggle with the
// description copy during onboarding — this gives them a polished 2-3
// sentence start they can edit. Returns notConfigured: true when
// ANTHROPIC_API_KEY isn't set so the UI can hide the button.
// ---------------------------------------------------------------------------
export async function generateFacilityDescriptionAction(input: {
    facilityName: string;
    sports: string[];
    city: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { getAnthropic, HAIKU_MODEL, textFromMessage } = await import("@/lib/anthropic");
    const client = getAnthropic();
    if (!client) return { notConfigured: true as const };

    if (!input.facilityName || input.sports.length === 0 || !input.city) {
        return { error: "Need facility name, at least one sport, and city" };
    }

    const sportsList = input.sports.join(", ");
    try {
        const message = await client.messages.create({
            model: HAIKU_MODEL,
            max_tokens: 200,
            messages: [{
                role: "user",
                content:
                    `Write a 2-3 sentence description for a sports facility listing on Saha, a UAE court-booking platform. ` +
                    `Plain prose, no marketing fluff, no emojis. Mention the sports and a hint of atmosphere. ` +
                    `Facility: ${input.facilityName}\nSports: ${sportsList}\nCity: ${input.city}`,
            }],
        });
        return { description: textFromMessage(message) };
    } catch (err) {
        console.error("[ai] description generation failed", err);
        return { error: "Could not generate a description right now." };
    }
}

// ---------------------------------------------------------------------------
// SAH-41: natural-language court search. Translates a free-text query
// into structured filters the existing facilities_within_radius RPC can
// accept. Returns notConfigured for the same reason as SAH-40.
// ---------------------------------------------------------------------------
export async function parseSearchQueryAction(query: string) {
    if (!query || query.trim().length < 4) {
        return { error: "Query is too short" };
    }

    const { getAnthropic, HAIKU_MODEL, textFromMessage } = await import("@/lib/anthropic");
    const client = getAnthropic();
    if (!client) return { notConfigured: true as const };

    try {
        const message = await client.messages.create({
            model: HAIKU_MODEL,
            max_tokens: 200,
            messages: [{
                role: "user",
                content:
                    `Parse this UAE court-search query into a JSON object with keys ` +
                    `{"sport": "Padel"|"Pickleball"|"Tennis"|"Squash"|"Badminton"|null, ` +
                    `"city": string|null, "date": "YYYY-MM-DD"|null, "time_of_day": "morning"|"afternoon"|"evening"|null}. ` +
                    `Return JSON only, no commentary. Query: ${query}`,
            }],
        });
        const raw = textFromMessage(message);
        const json = raw.match(/\{[\s\S]*\}/)?.[0];
        if (!json) return { error: "Could not parse query" };
        try {
            const parsed = JSON.parse(json) as {
                sport?: string | null;
                city?: string | null;
                date?: string | null;
                time_of_day?: string | null;
            };
            return { filters: parsed };
        } catch {
            return { error: "Could not parse query" };
        }
    } catch (err) {
        console.error("[ai] query parse failed", err);
        return { error: "Search assistant is unavailable right now." };
    }
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
// SAH-128: returns a discriminated result so the UI can show a specific
// reason instead of the generic "no slots" message — owners reported being
// confused when the silent empty array meant "you haven't published any
// availability for this date" vs "everything's booked" vs a real error.
// ---------------------------------------------------------------------------
export type GetSlotsResult =
    | { ok: true; slots: { id: string; start_time: string; end_time: string }[]; totalDefinedForDate: number }
    | { ok: false; code: "past_date" | "no_court" | "no_slots_defined" | "all_booked" | "error"; error: string };

export async function getAvailableSlotsAction(courtId: string, date: string): Promise<GetSlotsResult> {
    if (!courtId || !date) {
        return { ok: false, code: "error", error: "Missing court or date." };
    }

    // Past-date guard. Compare in YYYY-MM-DD strings to avoid timezone drift.
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
        return { ok: false, code: "past_date", error: "Pick today or a future date." };
    }

    const supabase = await createClient();

    // Verify the court exists and belongs to an active facility. RLS already
    // restricts this read to public-active facilities, so a null result =
    // unknown court (or facility suspended).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: court } = await (supabase as any)
        .from("courts")
        .select("id, is_active")
        .eq("id", courtId)
        .maybeSingle();
    if (!court || !court.is_active) {
        return { ok: false, code: "no_court", error: "Court not found or inactive." };
    }

    const { data, error } = await supabase
        .from("court_availability")
        .select("id, start_time, end_time, is_booked")
        .eq("court_id", courtId)
        .eq("date", date)
        .order("start_time");

    if (error) {
        return { ok: false, code: "error", error: "Could not load slots. Please try again." };
    }

    const allRows = (data ?? []) as { id: string; start_time: string; end_time: string; is_booked: boolean }[];
    if (allRows.length === 0) {
        return { ok: false, code: "no_slots_defined", error: "No time slots are published for this date yet." };
    }

    const open = allRows.filter((r) => !r.is_booked);
    if (open.length === 0) {
        return { ok: false, code: "all_booked", error: "All slots are booked for this date." };
    }

    return {
        ok: true,
        slots: open.map(({ id, start_time, end_time }) => ({ id, start_time, end_time })),
        totalDefinedForDate: allRows.length,
    };
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
    /** Optional wallet credit to apply (SAH-93). Capped server-side at the
     * platform fee (10% of total) so the owner stays whole. */
    creditToApply?: number,
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // SAH-76: 20 bookings / 1h / IP — slot squatting / booking spam guard.
    const rl = await rateLimit("booking_create", user.id);
    if (!rl.success) {
        return { error: `Too many booking attempts. Try again in ${rl.retryAfter}s.` };
    }

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;

    // SAH-118: shared core handles slot-lock + booking insert + Stripe Checkout.
    // The same helper backs `POST /api/v1/bookings` so behaviour stays identical
    // across the website and AI-agent flows.
    const result = await bookCourtCore({
        supabase,
        userId: user.id,
        availabilityId,
        numPlayers,
        creditToApply,
        appUrl,
        locale,
    });

    if (!result.ok) return { error: result.error };
    return { checkoutUrl: result.checkoutUrl };
}

// ---------------------------------------------------------------------------
// Booking: create a weekly recurring series (SAH-91).
//
// Player picks a slot + N weeks. We need a free slot at the same court +
// same time every following week. We lock all of them, create N pending
// bookings sharing a `recurring_group_id`, and bundle the full series into
// a single Stripe Checkout session. The webhook flips them all to confirmed
// at once (and only emails/whatsapps the first occurrence so the player
// isn't spammed). Per-occurrence cancellation, holiday auto-skip, and partial
// refund are intentionally out of scope here — see follow-up work on SAH-91.
// ---------------------------------------------------------------------------
export async function createRecurringBookingAndCheckoutAction(
    availabilityId: string,
    numPlayers: number,
    weeks: number,
) {
    if (weeks <= 1) {
        return createBookingAndCheckoutAction(availabilityId, numPlayers);
    }
    if (![2, 4, 8, 12].includes(weeks)) {
        return { error: "Invalid recurrence length" };
    }

    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Authoritative slot data — never trust client times.
    const { data: firstSlot } = await supabase
        .from("court_availability")
        .select("id, court_id, date, start_time, end_time, is_booked")
        .eq("id", availabilityId)
        .single();
    if (!firstSlot) return { error: "Slot not found" };
    if (firstSlot.is_booked) return { error: "Slot is no longer available" };

    const { data: court } = await supabase
        .from("courts")
        .select("id, name, price_per_hour, capacity, facility_id, facilities(id, name, stripe_account_id, currency)")
        .eq("id", firstSlot.court_id)
        .single();
    if (!court) return { error: "Court not found" };

    if (numPlayers < 1 || numPlayers > (court.capacity ?? 1)) {
        return { error: "Invalid number of players" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facilityData = (court as any).facilities;
    const stripeAccountId = facilityData?.stripe_account_id as string | null;
    const currency = (facilityData?.currency as string) ?? "AED";

    if (!stripeAccountId) {
        return { error: "This facility is not yet ready to receive payments." };
    }
    try {
        const account = await getStripe().accounts.retrieve(stripeAccountId);
        if (!account.charges_enabled || !account.details_submitted) {
            return { error: "This facility is not yet ready to receive payments." };
        }
    } catch {
        return { error: "Could not verify the facility's payment account. Please try again." };
    }

    const [sh, sm] = firstSlot.start_time.split(":").map(Number);
    const [eh, em] = firstSlot.end_time.split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durationHours <= 0) return { error: "Invalid slot" };
    const perWeekPrice = Math.round(court.price_per_hour * durationHours * 100) / 100;

    // Look up the matching slot for each subsequent week. A slot must be
    // pre-generated by the owner for that date and start at the same time
    // on the same court — we don't auto-generate availability.
    const slotIds: string[] = [firstSlot.id];
    const slotDates: string[] = [firstSlot.date];
    const missingWeeks: number[] = [];

    for (let w = 1; w < weeks; w++) {
        const target = new Date(firstSlot.date + "T00:00:00Z");
        target.setUTCDate(target.getUTCDate() + 7 * w);
        const dateKey = target.toISOString().split("T")[0];

        const { data: weekSlot } = await supabase
            .from("court_availability")
            .select("id, is_booked")
            .eq("court_id", firstSlot.court_id)
            .eq("date", dateKey)
            .eq("start_time", firstSlot.start_time)
            .eq("end_time", firstSlot.end_time)
            .maybeSingle();

        if (!weekSlot || weekSlot.is_booked) {
            missingWeeks.push(w + 1);
            continue;
        }
        slotIds.push(weekSlot.id);
        slotDates.push(dateKey);
    }

    if (missingWeeks.length > 0) {
        return {
            error: `Some weeks are unavailable at this time: week ${missingWeeks.join(", ")}. Pick a different time or fewer weeks.`,
        };
    }

    // Lock every slot via CAS. Roll back on any failure so we don't leak
    // inventory.
    const lockedIds: string[] = [];
    for (const id of slotIds) {
        const { data: rows } = await supabase
            .from("court_availability")
            .update({ is_booked: true } as never)
            .eq("id", id)
            .eq("is_booked", false)
            .select("id");
        if (!rows || rows.length === 0) {
            // Release everything we locked so far and bail.
            for (const lockedId of lockedIds) {
                await supabase
                    .from("court_availability")
                    .update({ is_booked: false } as never)
                    .eq("id", lockedId);
            }
            return { error: "One of the weekly slots was just taken — please try again." };
        }
        lockedIds.push(id);
    }

    // Generate the group id client-side via crypto so we can stash it on
    // every row up-front and reuse it as Stripe metadata.
    const recurringGroupId = crypto.randomUUID();
    const totalPrice = Math.round(perWeekPrice * weeks * 100) / 100;

    // Insert N pending bookings tied by recurring_group_id. Per-row price
    // is the per-week amount so the existing cancellation refund math works
    // for one-off cancellations.
    const rowsToInsert = slotIds.map((id, idx) => ({
        availability_id: id,
        court_id: firstSlot.court_id,
        player_id: user.id,
        date: slotDates[idx],
        start_time: firstSlot.start_time,
        end_time: firstSlot.end_time,
        num_players: numPlayers,
        total_price: perWeekPrice,
        currency,
        status: "pending" as const,
        recurring_group_id: recurringGroupId,
    }));

    const { data: insertedBookings, error: bookingError } = await supabase
        .from("bookings")
        .insert(rowsToInsert as never)
        .select("id");

    if (bookingError || !insertedBookings) {
        for (const id of lockedIds) {
            await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", id);
        }
        return { error: "Failed to create booking series" };
    }

    const firstBookingId = insertedBookings[0].id;

    // One pending payment row per booking so reconciliation stays consistent.
    await supabase.from("payments").insert(
        insertedBookings.map((b) => ({
            booking_id: b.id,
            amount: perWeekPrice,
            currency,
            status: "pending",
        })) as never,
    );

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;

    const feeAmount = Math.round(totalPrice * 100 * PLATFORM_FEE_PERCENT / 100);
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
            quantity: 1,
            price_data: {
                currency: currency.toLowerCase(),
                unit_amount: Math.round(totalPrice * 100),
                product_data: {
                    name: facilityData?.name ? `${facilityData.name} — ${court.name}` : court.name,
                    description: `${weeks} weeks · ${firstSlot.start_time}–${firstSlot.end_time} from ${firstSlot.date}`,
                },
            },
        }],
        metadata: {
            recurring_group_id: recurringGroupId,
            booking_id: firstBookingId,
            weeks: String(weeks),
        },
        success_url: `${appUrl}/${locale}/bookings/${firstBookingId}?success=1`,
        cancel_url: `${appUrl}/${locale}/bookings/${firstBookingId}?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        payment_intent_data: {
            application_fee_amount: feeAmount,
            transfer_data: { destination: stripeAccountId },
        },
    };

    let session: Stripe.Checkout.Session;
    try {
        session = await getStripe().checkout.sessions.create(sessionParams);
    } catch {
        // Cancel all pending bookings + release every slot.
        await supabase
            .from("bookings")
            .update({ status: "cancelled" } as never)
            .eq("recurring_group_id", recurringGroupId);
        for (const id of lockedIds) {
            await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", id);
        }
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

    // SAH-79: changing the phone number invalidates the previous
    // verification — flip phone_verified to false on update so the next
    // booking confirmation send is gated until the user re-verifies.
    const { data: existing } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
    const previousPhone = (existing as { phone: string | null } | null)?.phone ?? null;
    const phoneChanged = (parsed.data.phone || null) !== previousPhone;

    const { error } = await supabase
        .from("profiles")
        .update({
            display_name: parsed.data.display_name,
            phone: parsed.data.phone || null,
            ...(phoneChanged ? { phone_verified: false, phone_verification_sid: null } : {}),
        } as never)
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true, phoneChanged };
}

// ---------------------------------------------------------------------------
// SAH-79: WhatsApp OTP — send a code to the caller's stored phone.
// Returns 'not_configured' when Twilio Verify isn't set up so the UI can
// show "save phone but skip OTP" gracefully instead of erroring.
// ---------------------------------------------------------------------------
export async function startPhoneVerificationAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("phone, phone_verified")
        .eq("id", user.id)
        .single();

    const phone = (profile as { phone: string | null } | null)?.phone;
    if (!phone) return { error: "Save your phone number first." };
    if ((profile as { phone_verified: boolean } | null)?.phone_verified) {
        return { error: "Phone is already verified." };
    }

    const { startWhatsAppVerification } = await import("@/lib/twilio");
    const result = await startWhatsAppVerification(phone);

    if (result.status === "not_configured") {
        return { notConfigured: true };
    }
    if (result.status === "error") return { error: result.message };

    if ("sid" in result) {
        await supabase
            .from("profiles")
            .update({ phone_verification_sid: result.sid } as never)
            .eq("id", user.id);
    }
    return { success: true, status: result.status };
}

export async function checkPhoneVerificationAction(code: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();

    const phone = (profile as { phone: string | null } | null)?.phone;
    if (!phone) return { error: "No phone on file." };

    const { checkWhatsAppVerification } = await import("@/lib/twilio");
    const result = await checkWhatsAppVerification(phone, code);

    if (result.status === "not_configured") return { notConfigured: true };
    if (result.status === "approved") {
        await supabase
            .from("profiles")
            .update({ phone_verified: true, phone_verification_sid: null } as never)
            .eq("id", user.id);
        revalidatePath("/", "layout");
        return { success: true };
    }
    if (result.status === "incorrect") return { error: "Incorrect code. Try again." };
    if (result.status === "expired") return { error: "Code expired — request a new one." };
    if (result.status === "pending") return { error: "Verification still pending." };
    return { error: result.message ?? "Verification failed." };
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
// Booking: move to another free slot on the SAME court (SAH-88).
//
// Constraints (intentionally tight; cross-court + Stripe price-diff are
// follow-ups, see ticket SAH-88):
//   1. Caller owns the booking and it is `confirmed`.
//   2. Move window: original start must be > 24h away.
//   3. One move per booking — `move_count` is incremented and capped at 1.
//   4. New slot must be on the same court, free, and at the same price tier
//      (durations equal, price_per_hour identical → total unchanged).
//   5. Atomic: lock new slot via CAS, release old slot, update booking row.
//      Audit-log the event for ops.
// ---------------------------------------------------------------------------
export async function moveBookingAction(bookingId: string, newAvailabilityId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Load booking with the source court id so we can validate same-court rule.
    const { data: booking } = await supabase
        .from("bookings")
        .select("id, status, date, start_time, end_time, total_price, court_id, availability_id, move_count")
        .eq("id", bookingId)
        .eq("player_id", user.id)
        .single();

    if (!booking) return { error: "Booking not found" };
    if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be moved" };
    if ((booking.move_count ?? 0) >= 1) return { error: "This booking has already been moved once" };

    const originalStart = new Date(`${booking.date}T${booking.start_time}`);
    const hoursUntil = (originalStart.getTime() - Date.now()) / 3_600_000;
    if (hoursUntil <= 24) return { error: "Bookings can only be moved at least 24 hours in advance" };

    if (newAvailabilityId === booking.availability_id) {
        return { error: "Pick a different slot" };
    }

    // Validate the target slot: same court, free, same duration as original.
    const { data: newSlot } = await supabase
        .from("court_availability")
        .select("id, court_id, date, start_time, end_time, is_booked")
        .eq("id", newAvailabilityId)
        .single();

    if (!newSlot) return { error: "Selected slot is no longer available" };
    if (newSlot.court_id !== booking.court_id) {
        return { error: "Cross-court moves are not yet supported" };
    }
    if (newSlot.is_booked) return { error: "Selected slot is no longer available" };

    // Same duration → same price tier (same court_id already implies same price_per_hour).
    const oldDur =
        (new Date(`1970-01-01T${booking.end_time}`).getTime() -
            new Date(`1970-01-01T${booking.start_time}`).getTime()) / 60_000;
    const newDur =
        (new Date(`1970-01-01T${newSlot.end_time}`).getTime() -
            new Date(`1970-01-01T${newSlot.start_time}`).getTime()) / 60_000;
    if (oldDur !== newDur) {
        return { error: "Selected slot must be the same duration as your booking" };
    }

    // Lock new slot via CAS — concurrent caller would race here.
    const { data: lockedRows } = await supabase
        .from("court_availability")
        .update({ is_booked: true } as never)
        .eq("id", newAvailabilityId)
        .eq("is_booked", false)
        .select("id");

    if (!lockedRows || lockedRows.length === 0) {
        return { error: "Selected slot was just taken — please pick another" };
    }

    // Release the old slot and update booking row in two updates. If the
    // booking update fails, roll back the slot lock.
    const { error: bookingError } = await supabase
        .from("bookings")
        .update({
            availability_id: newAvailabilityId,
            date: newSlot.date,
            start_time: newSlot.start_time,
            end_time: newSlot.end_time,
            move_count: (booking.move_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
        } as never)
        .eq("id", bookingId);

    if (bookingError) {
        // Rollback the new-slot lock so we don't leak inventory.
        await supabase
            .from("court_availability")
            .update({ is_booked: false } as never)
            .eq("id", newAvailabilityId);
        return { error: "Could not move booking — please try again" };
    }

    await supabase
        .from("court_availability")
        .update({ is_booked: false } as never)
        .eq("id", booking.availability_id);

    await logAuditEvent({
        actorId: user.id,
        actorRole: "user",
        action: "booking.move",
        targetType: "booking",
        targetId: bookingId,
        metadata: {
            from_availability_id: booking.availability_id,
            to_availability_id: newAvailabilityId,
            from_date: booking.date,
            to_date: newSlot.date,
            from_start: booking.start_time,
            to_start: newSlot.start_time,
        },
    });

    revalidatePath(`/${locale}/bookings`);
    revalidatePath(`/${locale}/bookings/${bookingId}`);
    return { success: true };
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

    // SAH-93 follow-up: if this booking spent wallet credit, refund it back
    // to the player's wallet so they're whole on cancellation.
    const walletRefunded = await refundWalletCreditForBooking(user.id, bookingId);

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
            wallet_credit_refunded: walletRefunded,
        },
    });

    revalidatePath(`/${locale}/bookings`);
    return { success: true, refunded };
}

// ---------------------------------------------------------------------------
// SAH-93 helper: looks up the wallet 'spend' tied to a booking_id and refunds
// it via refund_wallet_credit. Idempotent — checks for existing 'refund' rows
// so a re-cancel doesn't double-refund. Returns the amount refunded.
// ---------------------------------------------------------------------------
async function refundWalletCreditForBooking(userId: string, bookingId: string): Promise<number> {
    try {
        const admin = createAdminClient();
        // Sum signed amounts for this booking — spend is negative, refund is
        // positive. If they cancel out the wallet was already refunded.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: txs } = await (admin as any)
            .from("wallet_transactions")
            .select("amount_aed, reason")
            .eq("user_id", userId)
            .eq("booking_id", bookingId);

        const net = (txs ?? []).reduce(
            (acc: number, t: { amount_aed: number }) => acc + Number(t.amount_aed),
            0,
        );
        // net < 0 means there's an unrefunded spend equal to |net|.
        if (net < 0) {
            const refundAmount = -net;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (admin as any).rpc("refund_wallet_credit", {
                p_user_id: userId,
                p_amount: refundAmount,
                p_booking_id: bookingId,
            });
            return refundAmount;
        }
    } catch (err) {
        console.error("[loyalty] cancel-time wallet refund failed", err);
    }
    return 0;
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
            id, status, availability_id, court_id, player_id,
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

    // SAH-93 follow-up: refund the player's wallet credit if they used any.
    const walletRefunded = await refundWalletCreditForBooking(booking.player_id, bookingId);

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "booking.cancel.owner",
        targetType: "booking",
        targetId: bookingId,
        metadata: {
            reason: reason || null,
            refunded,
            prior_status: booking.status,
            wallet_credit_refunded: walletRefunded,
        },
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

    // Find the player so we can run the loyalty milestone check after the
    // status flip — this is the canonical "completed" trigger.
    const { data: bookingRow } = await supabase
        .from("bookings")
        .select("player_id")
        .eq("id", bookingId)
        .single();

    await supabase
        .from("bookings")
        .update({ status: "completed" } as never)
        .eq("id", bookingId)
        .eq("status", "confirmed");

    // SAH-93: try awarding a milestone credit. RPC is idempotent — safe to
    // call after every check-in, returns 0 until the threshold is hit.
    const playerId = (bookingRow as { player_id: string } | null)?.player_id;
    if (playerId) {
        const admin = createAdminClient();
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (admin as any).rpc("award_loyalty_credit_if_due", { p_user_id: playerId });
        } catch (err) {
            console.error("[loyalty] award_if_due failed", err);
        }
    }

    revalidatePath("/dashboard/checkin");
    return { success: true };
}

// ---------------------------------------------------------------------------
// SAH-93: read the caller's wallet balance + recent ledger. RLS already
// scopes both tables to the caller, so no extra ownership checks needed.
// ---------------------------------------------------------------------------
export async function getWalletAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" as const };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: balanceRow } = await (supabase as any)
        .from("wallet_balances")
        .select("credit_aed, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ledger } = await (supabase as any)
        .from("wallet_transactions")
        .select("id, amount_aed, reason, booking_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

    return {
        balance: Number(balanceRow?.credit_aed ?? 0),
        ledger: (ledger ?? []) as Array<{
            id: string;
            amount_aed: number;
            reason: "booking_milestone" | "spend" | "refund" | "admin";
            booking_id: string | null;
            created_at: string;
        }>,
    };
}

// ---------------------------------------------------------------------------
// SAH-61: scanner-driven check-in. Looks the booking up by its qr_code_token,
// verifies the booking is at one of the caller's facilities and dated today,
// then marks it completed. Returns enough info for the UI to confirm the
// match before flipping status.
// ---------------------------------------------------------------------------
export async function checkInByQrTokenAction(token: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    if (!token || token.length < 8) return { error: "Invalid QR code" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: booking } = await (supabase as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, num_players,
            courts(name, facility_id, facilities(owner_id, name)),
            profiles(display_name)
        `)
        .eq("qr_code_token", token)
        .single();

    if (!booking) return { error: "Booking not found for this QR code" };

    const ownerId = booking.courts?.facilities?.owner_id;
    if (ownerId !== user.id) return { error: "This booking is at a different facility" };

    const today = new Date().toISOString().split("T")[0];
    if (booking.date !== today) {
        return { error: `This booking is for ${booking.date}, not today` };
    }

    if (booking.status === "completed") {
        return {
            alreadyCheckedIn: true,
            booking: {
                id: booking.id,
                playerName: booking.profiles?.display_name ?? "Player",
                courtName: booking.courts?.name ?? "Court",
                startTime: booking.start_time as string,
                endTime: booking.end_time as string,
                numPlayers: booking.num_players as number,
            },
        };
    }
    if (booking.status !== "confirmed") {
        return { error: `Booking status is "${booking.status}" — cannot check in` };
    }

    const { error } = await supabase
        .from("bookings")
        .update({ status: "completed" } as never)
        .eq("id", booking.id)
        .eq("status", "confirmed");

    if (error) return { error: "Could not check in — please try again" };

    revalidatePath("/dashboard/checkin");

    return {
        success: true,
        booking: {
            id: booking.id,
            playerName: booking.profiles?.display_name ?? "Player",
            courtName: booking.courts?.name ?? "Court",
            startTime: booking.start_time as string,
            endTime: booking.end_time as string,
            numPlayers: booking.num_players as number,
        },
    };
}
