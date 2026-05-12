/**
 * SAH-152 Phase 3: /players/me/contacts — manage contacts + groups.
 *
 * Server wrapper pre-loads the caller's contacts (join profiles) and
 * groups (with member count) and hands them to the client component.
 */

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ContactsClient } from "./ContactsClient";

export const metadata = { title: "My Contacts — Saha" };

interface ContactRow {
    contact_user_id: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface GroupRow {
    id: string;
    name: string;
    member_count: number;
    members: Array<{
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
    }>;
}

export default async function ContactsPage() {
    const locale = await getLocale();
    const t = await getTranslations("contacts");
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login?next=/${locale}/players/me/contacts`);

    // Contacts: join profiles via the FK alias.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contactsData } = await (supabase as any)
        .from("player_contacts")
        .select(`
            contact_user_id,
            profiles!player_contacts_contact_user_id_fkey(display_name, avatar_url)
        `)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

    const contacts = (contactsData ?? []) as ContactRow[];

    // Groups: list + member rows in parallel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: groupsRaw } = await (supabase as any)
        .from("player_groups")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

    const groupRows = (groupsRaw ?? []) as Array<{ id: string; name: string }>;
    const groupIds = groupRows.map((g) => g.id);

    const memberLookup = new Map<string, Array<{
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
    }>>();

    if (groupIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: members } = await (supabase as any)
            .from("player_group_members")
            .select(`
                group_id, member_user_id,
                profiles!player_group_members_member_user_id_fkey(display_name, avatar_url)
            `)
            .in("group_id", groupIds);

        for (const m of (members ?? []) as Array<{
            group_id: string;
            member_user_id: string;
            profiles: { display_name: string | null; avatar_url: string | null } | null;
        }>) {
            if (!memberLookup.has(m.group_id)) memberLookup.set(m.group_id, []);
            memberLookup.get(m.group_id)!.push({
                user_id: m.member_user_id,
                display_name: m.profiles?.display_name ?? null,
                avatar_url: m.profiles?.avatar_url ?? null,
            });
        }
    }

    const groups: GroupRow[] = groupRows.map((g) => {
        const members = memberLookup.get(g.id) ?? [];
        return { id: g.id, name: g.name, member_count: members.length, members };
    });

    const contactList = contacts.map((c) => ({
        user_id: c.contact_user_id,
        display_name: c.profiles?.display_name ?? null,
        avatar_url: c.profiles?.avatar_url ?? null,
    }));

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {t("title")}
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
            </div>
            <ContactsClient initialContacts={contactList} initialGroups={groups} />
        </div>
    );
}
