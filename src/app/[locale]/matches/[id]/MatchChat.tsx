"use client";

/**
 * SAH-152 Phase 4 + Phase 6: match-scoped chat.
 *
 * Participant-only (RLS). Composer + scrollable thread. Phase 6 swapped the
 * 8 s poll for a Supabase Realtime subscription on `match_messages`. The
 * new payload only carries the row (no profile join), so on each INSERT
 * event we run a single-row select with the FK join to hydrate sender
 * name + avatar before appending.
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

    // Realtime subscription. RLS still enforces the auth boundary — the
    // websocket only delivers rows the caller is permitted to SELECT.
    React.useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel(`match-chat:${matchId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "match_messages",
                    filter: `match_id=eq.${matchId}`,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async (payload: { new: any }) => {
                    const row = payload.new as {
                        id: string; sender_id: string; body: string; created_at: string;
                    };
                    // Hydrate sender profile in a single follow-up query.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: profile } = await (supabase as any)
                        .from("profiles")
                        .select("display_name, avatar_url")
                        .eq("id", row.sender_id)
                        .single();

                    const hydrated: ChatMessage = {
                        id: row.id,
                        sender_id: row.sender_id,
                        body: row.body,
                        created_at: row.created_at,
                        sender_display_name: (profile as { display_name: string | null } | null)?.display_name ?? null,
                        sender_avatar_url: (profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
                    };

                    setMessages((prev) => {
                        // Dedup against the optimistic provisional row + already-present rows.
                        if (prev.some((m) => m.id === hydrated.id)) return prev;
                        const provisionalIdx = prev.findIndex(
                            (m) =>
                                m.id.startsWith("provisional-") &&
                                m.sender_id === hydrated.sender_id &&
                                m.body === hydrated.body,
                        );
                        if (provisionalIdx !== -1) {
                            const next = [...prev];
                            next[provisionalIdx] = hydrated;
                            return next;
                        }
                        return [...prev, hydrated];
                    });
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
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
