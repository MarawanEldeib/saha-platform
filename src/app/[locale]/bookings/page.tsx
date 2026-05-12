import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Calendar } from "lucide-react";
import Link from "next/link";
import { BookingTabs } from "./BookingTabs";

export const metadata = { title: "My Bookings – Saha" };

export default async function MyBookingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("bookings");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // SAH-125: /bookings is the player booking history. Owners manage
    // bookings on their courts via /dashboard/bookings; admins via /admin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRow } = await (supabase as any)
        .from("profiles").select("role").eq("id", user.id).single();
    if (roleRow?.role === "business") redirect(`/${locale}/dashboard/bookings`);
    if (roleRow?.role === "admin") redirect(`/${locale}/admin/bookings`);

    const { data: bookings } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, total_price, currency, qr_code_token, num_players,
            recurring_group_id,
            courts(name, facilities(name, address, city))
        `)
        .eq("player_id", user.id)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false });

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
            </div>

            {!bookings?.length ? (
                <div className="text-center py-16 space-y-3">
                    <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto" />
                    <p className="text-gray-500 dark:text-gray-400">{t("no_bookings")}</p>
                    <Link
                        href={`/${locale}/map`}
                        className="inline-block px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        {t("find_court")}
                    </Link>
                </div>
            ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <BookingTabs bookings={bookings as any} locale={locale} appUrl={appUrl} />
            )}
        </div>
    );
}
