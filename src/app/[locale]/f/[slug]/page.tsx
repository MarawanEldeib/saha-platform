import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import FacilityDetailPage from "../../facilities/[id]/page";

// SAH-89: branded booking pages. Each facility has a stable kebab-case
// slug (e.g. /en/f/just-padel-jbr) that owners can drop in their
// Instagram bio or print on flyers. The slug resolves to the same
// facility detail content rendered at /facilities/[id].

async function resolveSlug(slug: string): Promise<string | null> {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from("facilities")
        .select("id")
        .eq("slug", slug)
        .single();
    return (data as { id: string } | null)?.id ?? null;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from("facilities")
        .select("name, description")
        .eq("slug", slug)
        .single();
    return {
        title: data?.name ?? "Facility",
        description: data?.description ?? undefined,
    };
}

export default async function FacilityBySlugPage({
    params,
}: {
    params: Promise<{ locale: string; slug: string }>;
}) {
    const { slug, locale } = await params;
    const id = await resolveSlug(slug);
    if (!id) notFound();
    return (
        <FacilityDetailPage params={Promise.resolve({ locale, id })} />
    );
}
