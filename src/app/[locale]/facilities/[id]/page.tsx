import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { ReviewForm } from "@/components/facility/ReviewForm";
import { MapPin, Globe, Phone, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { DAY_KEYS, formatTime } from "@/lib/utils";
import Image from "next/image";
import type { Metadata } from "next";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const supabase = await createClient();
    const { id } = await params;
    const { data } = await supabase.from("facilities").select("name, description").eq("id", id).single();
    return {
        title: data?.name ?? "Facility",
        description: data?.description ?? undefined,
    };
}

export default async function FacilityDetailPage({
    params,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const { id } = await params;
    const t = await getTranslations("facility");
    const locale = await getLocale();
    const supabase = await createClient();

    const { data: facility, error } = await supabase
        .from("facilities")
        .select(
            `*, 
       facility_sports(sport_id, sports(id, name)), 
       facility_hours(*), 
       facility_images(*),
       student_discounts(*),
       reviews(*, profiles(display_name, avatar_url)),
       events(id, name, event_date, status)`
        )
        .eq("id", id)
        .eq("status", "active")
        .single();

    if (error || !facility) notFound();

    const hours = [...(facility.facility_hours ?? [])].sort(
        (a, b) => a.day_of_week - b.day_of_week
    );

    const avgRating =
        facility.reviews?.length
            ? facility.reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
            facility.reviews.length
            : 0;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{facility.name}</h1>
                    <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">
                            {facility.address}, {facility.city}, {facility.postal_code}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <FacilityStatusBadge status={facility.status} />
                        {facility.student_discounts?.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-medium">
                                {t("discount_available")}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <StarRating value={Math.round(avgRating)} readOnly size={18} />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({facility.reviews?.length ?? 0})
                    </span>
                </div>
            </div>

            {/* Images */}
            {facility.facility_images?.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {facility.facility_images.slice(0, 6).map((img: { id: string; storage_path: string }) => (
                        <div key={img.id} className="aspect-video relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <Image
                                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/facility-images/${img.storage_path}`}
                                alt={facility.name}
                                fill
                                className="object-cover"
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Description */}
                    {facility.description && (
                        <div>
                            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{facility.description}</p>
                        </div>
                    )}

                    {/* Sports */}
                    {facility.facility_sports?.length > 0 && (
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t("sports")}</h2>
                            <div className="flex flex-wrap gap-2">
                                {facility.facility_sports.map((fs: { sport_id: number; sports: { name: string } }) => (
                                    <span key={fs.sport_id} className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm rounded-full font-medium">
                                        {fs.sports.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Events */}
                    {facility.events?.filter((e: { status: string }) => e.status === "approved").length > 0 && (
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t("events_title")}</h2>
                            <div className="space-y-3">
                                {facility.events
                                    .filter((e: { status: string }) => e.status === "approved")
                                    .map((ev: { id: string; name: string; event_date: string }) => (
                                        <div key={ev.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                            <Calendar className="h-5 w-5 text-emerald-500 shrink-0" />
                                            <div>
                                                <p className="font-medium text-sm text-gray-900 dark:text-white">{ev.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(ev.event_date), "PPP")}</p>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Reviews */}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t("reviews_title")}</h2>
                        {facility.reviews?.length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_reviews")}</p>
                        )}
                        <div className="space-y-4 mb-6">
                            {facility.reviews?.map((review: { id: string; rating: number; comment: string | null; created_at: string; profiles: { display_name: string | null } }) => (
                                <div key={review.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <StarRating value={review.rating} readOnly size={14} />
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {review.profiles?.display_name ?? "Anonymous"} · {format(new Date(review.created_at), "PP")}
                                        </span>
                                    </div>
                                    {review.comment && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300">{review.comment}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <ReviewForm facilityId={facility.id} locale={locale} />
                    </div>
                </div>

                {/* Sidebar */}
                <aside className="space-y-6">
                    {/* Contact */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                        {facility.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                                <a href={`tel:${facility.phone}`} className="hover:text-emerald-600 dark:hover:text-emerald-400">{facility.phone}</a>
                            </div>
                        )}
                        {facility.website && (
                            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                                <a href={facility.website} target="_blank" rel="noreferrer" className="hover:text-emerald-600 dark:hover:text-emerald-400 truncate">
                                    {facility.website.replace(/^https?:\/\//, "")}
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Hours */}
                    {hours.length > 0 && (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <Clock className="h-4 w-4" /> {t("hours")}
                            </h3>
                            <div className="space-y-1.5">
                                {hours.map((h) => {
                                    const dayKey = DAY_KEYS[h.day_of_week];
                                    return (
                                        <div key={h.id} className="flex justify-between text-sm">
                                            <span className="capitalize text-gray-600 dark:text-gray-400">{dayKey}</span>
                                            {h.is_closed ? (
                                                <span className="text-gray-400 dark:text-gray-600">{t("closed")}</span>
                                            ) : (
                                                <span className="text-gray-900 dark:text-white">
                                                    {formatTime(h.open_time)} – {formatTime(h.close_time)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Discounts */}
                    {facility.student_discounts?.length > 0 && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2">{t("discounts")}</h3>
                            {facility.student_discounts.map((d: { id: string; description: string; amount: string | null }) => (
                                <div key={d.id} className="text-sm text-emerald-700 dark:text-emerald-400">
                                    <p>{d.description}</p>
                                    {d.amount && <p className="font-bold">{d.amount}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
