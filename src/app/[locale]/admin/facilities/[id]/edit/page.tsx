import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { AdminFacilityEditForm } from "./AdminFacilityEditForm";

interface FacilityRow {
    id: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string | null;
    phone: string | null;
    website: string | null;
    trn: string | null;
    profiles: { display_name: string | null } | null;
}

export const metadata = { title: "Edit Facility – Admin" };

export default async function AdminFacilityEditPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const locale = await getLocale();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profileResult.data as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    // Read with admin client so a future suspended-status filter (or any
    // future RLS tightening on the facilities table) doesn't make the row
    // invisible to the moderation flow.
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
        .from("facilities")
        .select("id, name, description, address, city, postal_code, phone, website, trn, profiles!inner(display_name)")
        .eq("id", id)
        .single();

    if (error || !data) notFound();
    const facility = data as unknown as FacilityRow;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link
                    href={`/${locale}/admin/facilities/${facility.id}`}
                    className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                    ← Back to facility
                </Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emergency edit</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Editing <span className="font-medium text-gray-700 dark:text-gray-300">{facility.name}</span>
                    {facility.profiles?.display_name ? ` (owner: ${facility.profiles.display_name})` : ""}.
                    Sports, hours, and photos stay owner-managed.
                </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-900 dark:text-amber-200">
                Admin edits are logged with previous and next values plus your reason.
                Use this only when the owner is unreachable or the change is urgent
                (abusive content, broken contact info, etc.).
            </div>

            <AdminFacilityEditForm
                facility={{
                    id: facility.id,
                    name: facility.name,
                    description: facility.description ?? "",
                    address: facility.address,
                    city: facility.city,
                    postal_code: facility.postal_code ?? "",
                    phone: facility.phone ?? "",
                    website: facility.website ?? "",
                    trn: facility.trn ?? "",
                }}
                locale={locale}
            />
        </div>
    );
}
