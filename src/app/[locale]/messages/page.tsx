import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { PushOptIn } from "@/components/messaging/PushOptIn";

export const metadata = { title: "Messages – Saha" };

interface ConversationRow {
    id: string;
    player_low_id: string;
    player_high_id: string;
    last_message_at: string;
    matchmaking_post_id: string | null;
    low_profile: { display_name: string | null; avatar_url: string | null } | null;
    high_profile: { display_name: string | null; avatar_url: string | null } | null;
}

export default async function MessagesInboxPage() {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login?next=/${locale}/messages`);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = (profile as { role: string } | null)?.role;
    if (role !== "user") redirect(`/${locale}`);

    // Fetch conversations + the other player's profile separately. profiles
    // RLS is strict (own-row only), so we go through the public_profiles
    // view for the other side's display_name + avatar_url.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convData } = await (supabase as any)
        .from("conversations")
        .select("id, player_low_id, player_high_id, last_message_at, matchmaking_post_id")
        .order("last_message_at", { ascending: false });

    const convsRaw = (convData ?? []) as Omit<ConversationRow, "low_profile" | "high_profile">[];

    const otherIds = Array.from(
        new Set(
            convsRaw
                .flatMap((c) => [
                    c.player_low_id !== user.id ? c.player_low_id : null,
                    c.player_high_id !== user.id ? c.player_high_id : null,
                ])
                .filter((x): x is string => !!x),
        ),
    );

    const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (otherIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profileData } = await (supabase as any)
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", otherIds);
        for (const p of (profileData ?? []) as {
            id: string;
            display_name: string | null;
            avatar_url: string | null;
        }[]) {
            profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
        }
    }

    const conversations: ConversationRow[] = convsRaw.map((c) => ({
        ...c,
        low_profile: c.player_low_id === user.id ? null : profileMap.get(c.player_low_id) ?? null,
        high_profile: c.player_high_id === user.id ? null : profileMap.get(c.player_high_id) ?? null,
    }));

    // Unread counts in one query — group by conversation_id, only messages
    // where sender != me and read_at is null.
    const unreadByConv: Record<string, number> = {};
    if (conversations.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: unreadData } = await (supabase as any)
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", conversations.map((c) => c.id))
            .neq("sender_id", user.id)
            .is("read_at", null);
        for (const row of (unreadData ?? []) as { conversation_id: string }[]) {
            unreadByConv[row.conversation_id] = (unreadByConv[row.conversation_id] ?? 0) + 1;
        }
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Direct messages with other players from matchmaking posts.
                </p>
            </div>

            <PushOptIn />

            {conversations.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
                    <MessageSquare className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No conversations yet. Open a{" "}
                        <Link href={`/${locale}/community`} className="text-emerald-600 hover:underline">
                            matchmaking post
                        </Link>{" "}
                        and tap &quot;Message&quot; to start one.
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {conversations.map((c) => {
                            const otherIsLow = c.player_low_id !== user.id;
                            const other = otherIsLow ? c.low_profile : c.high_profile;
                            const unread = unreadByConv[c.id] ?? 0;
                            const initials =
                                other?.display_name?.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() ||
                                "?";
                            return (
                                <li key={c.id}>
                                    <Link
                                        href={`/${locale}/messages/${c.id}`}
                                        className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                    >
                                        <div
                                            className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"
                                            aria-hidden
                                        >
                                            {other?.avatar_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={other.avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{initials}</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p
                                                    className={`truncate ${
                                                        unread > 0
                                                            ? "font-semibold text-gray-900 dark:text-white"
                                                            : "font-medium text-gray-700 dark:text-gray-300"
                                                    }`}
                                                >
                                                    {other?.display_name ?? "Unknown player"}
                                                </p>
                                                <span className="text-xs text-gray-500 dark:text-gray-500 shrink-0">
                                                    {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                        </div>
                                        {unread > 0 && (
                                            <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold">
                                                {unread > 99 ? "99+" : unread}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                Last activity sorted newest first. {conversations.length} conversation{conversations.length === 1 ? "" : "s"}.
            </p>
        </div>
    );
}
