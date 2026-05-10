import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConversationView } from "./ConversationView";
import { markMessagesReadAction } from "../actions";

export const metadata = { title: "Conversation – Saha" };

interface ConversationDetail {
    id: string;
    player_low_id: string;
    player_high_id: string;
    matchmaking_post_id: string | null;
    low_profile: { display_name: string | null; avatar_url: string | null } | null;
    high_profile: { display_name: string | null; avatar_url: string | null } | null;
    matchmaking_posts: { id: string; message: string } | null;
}

interface MessageRow {
    id: string;
    sender_id: string;
    body: string;
    read_at: string | null;
    created_at: string;
}

export default async function ConversationPage({
    params,
}: {
    params: Promise<{ conversationId: string }>;
}) {
    const { conversationId } = await params;
    const locale = await getLocale();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login?next=/${locale}/messages/${conversationId}`);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "user") redirect(`/${locale}`);

    // RLS will return null if the caller isn't a participant. profiles RLS
    // is strict — fetch the other player via public_profiles in a 2nd query.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convData } = await (supabase as any)
        .from("conversations")
        .select(
            `id, player_low_id, player_high_id, matchmaking_post_id,
             matchmaking_posts(id, message)`,
        )
        .eq("id", conversationId)
        .maybeSingle();

    if (!convData) notFound();
    const convRaw = convData as Omit<ConversationDetail, "low_profile" | "high_profile">;

    const otherUserId = convRaw.player_low_id === user.id ? convRaw.player_high_id : convRaw.player_low_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: otherProfile } = await (supabase as any)
        .from("public_profiles")
        .select("display_name, avatar_url")
        .eq("id", otherUserId)
        .maybeSingle();
    const otherProfileTyped = otherProfile as { display_name: string | null; avatar_url: string | null } | null;

    const conv: ConversationDetail = {
        ...convRaw,
        low_profile: convRaw.player_low_id === user.id ? null : otherProfileTyped,
        high_profile: convRaw.player_high_id === user.id ? null : otherProfileTyped,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgData } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, body, read_at, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    const messages = (msgData ?? []) as MessageRow[];

    // Mark unread messages from the other player as read on render. Fire-and-
    // forget — failure is silent (the user can see them either way).
    void markMessagesReadAction(conversationId);

    const otherIsLow = conv.player_low_id !== user.id;
    const other = otherIsLow ? conv.low_profile : conv.high_profile;
    const otherId = otherIsLow ? conv.player_low_id : conv.player_high_id;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 min-h-[calc(100vh-4rem)] flex flex-col">
            <Link
                href={`/${locale}/messages`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
                <ArrowLeft className="h-4 w-4" /> Inbox
            </Link>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-5 py-3">
                <p className="font-semibold text-gray-900 dark:text-white">
                    {other?.display_name ?? "Unknown player"}
                </p>
                {conv.matchmaking_posts && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                        re:{" "}
                        <Link
                            href={`/${locale}/community`}
                            className="text-emerald-600 hover:underline"
                        >
                            &quot;{conv.matchmaking_posts.message.slice(0, 80)}{conv.matchmaking_posts.message.length > 80 ? "…" : ""}&quot;
                        </Link>
                    </p>
                )}
            </div>

            <ConversationView
                conversationId={conv.id}
                currentUserId={user.id}
                recipientId={otherId}
                initialMessages={messages}
            />
        </div>
    );
}
