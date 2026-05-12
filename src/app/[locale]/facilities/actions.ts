"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { reviewSchema } from "@/lib/validations";
import { tr } from "@/lib/i18n-errors";

// SAH-76: review submission moved off direct client→supabase to a server
// action so we can rate-limit (5/h/user) before the insert. The RLS
// policies on reviews still enforce ownership + the "must have completed
// booking" rule — this just adds an upstream throttle so a spam bot can't
// burn through the policies as fast as their network allows.

export async function submitReviewAction(
    facilityId: string,
    input: { rating: number; comment?: string | null },
): Promise<{ success?: true; error?: string; code?: string; retryAfter?: number }> {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: await tr("common.not_authenticated"), code: "unauthenticated" };

    const parsed = reviewSchema.safeParse({
        rating: input.rating,
        comment: input.comment ?? "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid review", code: "invalid" };

    const rl = await rateLimit("review_submit", user.id);
    if (!rl.success) {
        return {
            error: `You're submitting reviews too quickly. Try again in ${Math.ceil(rl.retryAfter / 60)} min.`,
            code: "rate_limited",
            retryAfter: rl.retryAfter,
        };
    }

    const { error } = await supabase.from("reviews").insert({
        facility_id: facilityId,
        user_id: user.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment?.trim() || null,
    });

    if (error) {
        if (error.code === "23505") return { error: await tr("review.already_reviewed"), code: "duplicate" };
        if (error.code === "42501") return { error: await tr("review.needs_completed_booking"), code: "no_booking" };
        return { error: error.message, code: error.code };
    }

    revalidatePath(`/${locale}/facilities/${facilityId}`);
    return { success: true };
}
