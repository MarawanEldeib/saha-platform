import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { ReviewForm } from "@/components/facility/ReviewForm";
import { ReviewList } from "@/components/facility/ReviewList";
import { MapPin, Globe, Phone, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { DAY_KEYS, formatTime, getStorageUrl } from "@/lib/utils";
import Image from "next/image";
import type { Metadata } from "next";
import { BookingWidget } from "./BookingWidget";

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
    const tf = await getTranslations("facility_form");
    const tc = await getTranslations("common");
    const tSports = await getTranslations("sports");
    const sportName = (name: string) =>
        (["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const).includes(name as never)
            ? tSports(name as Parameters<typeof tSports>[0])
            : name;
    const locale = await getLocale();
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    // SAH-93: caller's wallet balance for the booking widget. Anonymous
    // visitors have no wallet — leave at 0.
    // SAH-127: also fetch role so we can hide booking + review actions for
    // owners/admins (strict role separation: they need a player account).
    let walletBalance = 0;
    let userRole: string | null = null;
    if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [{ data: walletRow }, { data: profileRow }] = await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).from("wallet_balances").select("credit_aed").eq("user_id", user.id).maybeSingle(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).from("profiles").select("role").eq("id", user.id).maybeSingle(),
        ]);
        walletBalance = Number(walletRow?.credit_aed ?? 0);
        userRole = (profileRow as { role?: string } | null)?.role ?? null;
    }
    const canBookOrReview = !user || userRole === "user";

    const { data: facility, error } = await supabase
        .from("facilities")
        .select(
            `*,
       facility_sports(sport_id, sports(id, name)),
       facility_hours(*),
       facility_images(*),
       reviews(*, profiles(display_name, avatar_url)),
       events(id, name, event_date, status),
       courts(id, name, price_per_hour, sport_id, is_active)`
        )
        .eq("id", id)
        .eq("status", "active")
        .single();

    if (error || !facility) notFound();

    // SAH-124: pass the current user id to ReviewList so each row can show
    // edit/delete affordances only on the author's own review. Anonymous
    // viewers see all reviews read-only. Reuses the `user` already loaded
    // above for the wallet/booking widget.
    const currentUserId = user?.id ?? null;

    const hours = [...(facility.facility_hours ?? [])].sort(
        (a, b) => a.day_of_week - b.day_of_week
    );

    const avgRating =
        facility.reviews?.length
            ? facility.reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
            facility.reviews.length
            : 0;

    const images = [...(facility.facility_images ?? [])].sort(
        (a: { display_order?: number | null }, b: { display_order?: number | null }) =>
            (a.display_order ?? 0) - (b.display_order ?? 0)
    );

    // SAH-39: schema.org/SportsActivityLocation structured data so search
    // engines + AI assistants can index facility metadata directly.
    // facility_hours uses 0=Monday … 6=Sunday in our DB.
    const SCHEMA_DAYS = [
        "https://schema.org/Monday",
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
        "https://schema.org/Saturday",
        "https://schema.org/Sunday",
    ] as const;
    const openingHoursSpec = hours
        .filter((h) => !h.is_closed && h.open_time && h.close_time && SCHEMA_DAYS[h.day_of_week])
        .map((h) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: SCHEMA_DAYS[h.day_of_week],
            opens: h.open_time!.slice(0, 5),
            closes: h.close_time!.slice(0, 5),
        }));

    // location is a PostGIS GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }
    const geoCoords = (facility.location as { type?: string; coordinates?: [number, number] } | null)?.coordinates;

    const sportsList = (facility.facility_sports ?? [])
        .map((fs: { sports: { name: string } | null }) => fs.sports?.name)
        .filter(Boolean) as string[];

    const facilityImages = images
        .map((img: { storage_path: string }) => getStorageUrl("facility-images", img.storage_path))
        .filter(Boolean);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsActivityLocation",
        name: facility.name,
        description: facility.description ?? undefined,
        address: {
            "@type": "PostalAddress",
            streetAddress: facility.address,
            addressLocality: facility.city,
            postalCode: facility.postal_code ?? undefined,
            addressCountry: facility.country ?? "AE",
        },
        ...(geoCoords && geoCoords.length === 2
            ? { geo: { "@type": "GeoCoordinates", latitude: geoCoords[1], longitude: geoCoords[0] } }
            : {}),
        ...(facility.phone ? { telephone: facility.phone } : {}),
        ...(facility.website ? { url: facility.website } : {}),
        ...(facilityImages.length > 0 ? { image: facilityImages } : {}),
        ...(sportsList.length > 0 ? { sport: sportsList } : {}),
        ...(openingHoursSpec.length > 0 ? { openingHoursSpecification: openingHoursSpec } : {}),
        ...(facility.reviews?.length
            ? {
                aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: avgRating.toFixed(1),
                    reviewCount: facility.reviews.length,
                    bestRating: 5,
                    worstRating: 1,
                },
            }
            : {}),
    };

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
            <script
                type="application/ld+json"
                // Server-rendered, value comes from our DB — XSS-safe.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{facility.name}</h1>
                    <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm" dir="ltr">
                            {facility.address}, {facility.city}{facility.postal_code ? `, ${facility.postal_code}` : ""}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <FacilityStatusBadge status={facility.status} />
                        {(facility.has_prayer_room || facility.has_wudu_area) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                {tf("prayer_friendly_badge")}
                                {facility.has_prayer_room && facility.has_wudu_area
                                    ? ` · ${tf("has_prayer_room")} + ${tf("has_wudu_area")}`
                                    : facility.has_prayer_room
                                        ? ` · ${tf("has_prayer_room")}`
                                        : ` · ${tf("has_wudu_area")}`}
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
            {images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {images.map((img: { id: string; storage_path: string }) => (
                        <div key={img.id} className="aspect-video relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <Image
                                src={getStorageUrl("facility-images", img.storage_path)}
                                alt={facility.name}
                                fill
                                className="object-cover"
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    {tf("no_photos")}
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
                                        {sportName(fs.sports.name)}
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
                        <ReviewList
                            reviews={(facility.reviews ?? []) as never}
                            currentUserId={currentUserId}
                        />
                        {/* SAH-127: only player accounts can write reviews. */}
                        {canBookOrReview ? (
                            <ReviewForm facilityId={facility.id} locale={locale} />
                        ) : (
                            <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-400">
                                {t("review_player_only")}
                            </div>
                        )}
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
                                            <span className="capitalize text-gray-600 dark:text-gray-400">{tc(dayKey as Parameters<typeof tc>[0])}</span>
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

                    {/* SAH-127: Booking is a player-only action. Owners and
                        admins see a CTA explaining they need a player account. */}
                    {canBookOrReview ? (
                        <BookingWidget
                            facilityId={facility.id}
                            courts={(facility.courts ?? []).filter((c: { is_active: boolean }) => c.is_active)}
                            isLoggedIn={!!user}
                            locale={locale}
                            currency={(facility as { currency?: string }).currency}
                            walletBalance={walletBalance}
                        />
                    ) : (
                        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-sm text-gray-600 dark:text-gray-400">
                            {t("booking_player_only")}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
