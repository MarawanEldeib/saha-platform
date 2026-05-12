"use client";

/**
 * SAH-152 Phase 4: match-scoped chat.
 *
 * Participant-only (RLS). Composer + scrollable message thread. Polls
 * server every 8 s for new rows — realtime channels are deferred to
 * Phase 5 so we don't add a websocket cost yet.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMatchMessageAction } from "../actions";

interface ChatMessage {
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
    sender_display_name: string | null;
    sender_avatar_url: string | null;
}

interface Props {
    matchId: string;
    viewerId: string;
    initialMessages: ChatMessage[];
}

const POLL_MS = 8000;

function Avatar({ url, name }: { url: string | null; name: string }) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-7 w-7 rounded-full object-cover bg-gray-200" />
        );
    }
    return (
        <div className="h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
            {initial}
        </div>
    );
}

export function MatchChat({ matchId, viewerId, initialMessages }: Props) {
    const t = useTranslations("match_chat");
    const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
    const [draft, setDraft] = React.useState("");
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const threadRef = React.useRef<HTMLDivElement | null>(null);

    // Scroll-to-bottom on new messages or first mount.
    React.useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [messages]);

    // Poll for new messages.
    React.useEffect(() => {
        const supabase = createClient();
        let cancelled = false;

        async function fetchLatest() {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase as any)
                .from("match_messages")
                .select(`
                    id, sender_id, body, created_at,
                    profiles!match_messages_sender_id_fkey(display_name, avatar_url)
                `)
                .eq("match_id", matchId)
                .order("created_at", { ascending: true })
                .limit(200);
            if (cancelled) return;
            const rows = ((data ?? []) as Array<{
                id: string; sender_id: string; body: string; created_at: string;
                profiles: { display_name: string | null; avatar_url: string | null } | null;
            }>).map((r) => ({
                id: r.id,
                sender_id: r.sender_id,
                body: r.body,
                created_at: r.created_at,
                sender_display_name: r.profiles?.display_name ?? null,
                sender_avatar_url: r.profiles?.avatar_url ?? null,
            }));
            setMessages(rows);
        }

        const interval = setInterval(fetchLatest, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [matchId]);

    async function send() {
        const body = draft.trim();
        if (!body || sending) return;
        setError(null);
        setSending(true);
        const result = await sendMatchMessageAction(matchId, body);
        setSending(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        // Optimistic append; the next poll will reconcile.
        const provisional: ChatMessage = {
            id: `provisional-${Date.now()}`,
            sender_id: viewerId,
            body,
            created_at: new Date().toISOString(),
            sender_display_name: null,
            sender_avatar_url: null,
        };
        setMessages((prev) => [...prev, provisional]);
        setDraft("");
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
        }
    }

    return (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 sm:p-6 mt-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
                {t("heading")}
            </h2>

            <div
                ref={threadRef}
                className="space-y-3 max-h-80 overflow-y-auto py-2"
            >
                {messages.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        {t("empty")}
                    </p>
                ) : (
                    messages.map((m) => {
                        const mine = m.sender_id === viewerId;
                        return (
                            <div
                                key={m.id}
                                className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}
                            >
                                {!mine && (
                                    <Avatar url={m.sender_avatar_url} name={m.sender_display_name ?? "?"} />
                                )}
                                <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                                    mine
                                        ? "bg-emerald-600 text-white rounded-tr-sm"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-sm"
                                }`}>
                                    {!mine && (
                                        <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1">
                                            {m.sender_display_name ?? t("anonymous")}
                                        </div>
                                    )}
                                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-3 flex items-end gap-2">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("placeholder")}
                    rows={1}
                    maxLength={2000}
                    className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
                    aria-label={t("placeholder")}
                />
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!draft.trim() || sending}
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label={t("send")}
                >
                    <Send className="h-4 w-4" />
                </button>
            </div>
            {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
