import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CheckCircle2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { QuickReviewForm } from "./QuickReviewForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quick review — Saha" };

export default async function QuickReviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ bookingId: string }>;
    searchParams: Promise<{ done?: string }>;
}) {
    const { bookingId } = await params;
    const { done } = await searchParams;
    const locale = await getLocale();
    const supabase = await createClient();
    const t = await getTranslations("quick_review");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        // Bounce back here after login so the deep link works for users
        // tapping from a WhatsApp / email reminder.
        redirect(`/${locale}/login?next=/${locale}/review/${bookingId}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: booking } = await (supabase as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, player_id,
            courts(name, facility_id, facilities(id, slug, name, city))
        `)
        .eq("id", bookingId)
        .single();

    if (!booking) notFound();
    if (booking.player_id !== user.id) redirect(`/${locale}/bookings`);
    // Only completed bookings can review — matches the RLS policy on reviews.
    if (booking.status !== "completed") {
        redirect(`/${locale}/bookings/${bookingId}`);
    }

    const facility = booking.courts?.facilities;
    const facilityId = facility?.id as string;
    const facilitySlug = facility?.slug as string;

    if (done === "1") {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
                <div className="max-w-sm w-full text-center space-y-5">
                    <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("thanks_title")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("thanks_body")}</p>
                    <div className="flex gap-3 justify-center pt-2">
                        <Link
                            href={`/${locale}/f/${facilitySlug}`}
                            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                        >
                            {t("back_to_facility")}
                        </Link>
                        <Link
                            href={`/${locale}/bookings`}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            {t("my_bookings")}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
            <div className="max-w-sm w-full space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("heading")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subheading")}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-sm space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{facility?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {booking.courts?.name} · {format(new Date(booking.date), "PPP")} · {booking.start_time.slice(0, 5)}
                    </p>
                </div>

                <QuickReviewForm
                    bookingId={bookingId}
                    facilityId={facilityId}
                    locale={locale}
                />
            </div>
        </div>
    );
}
