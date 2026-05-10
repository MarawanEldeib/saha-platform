"use client";

import * as React from "react";
import { format, isSameDay } from "date-fns";
import { Send } from "lucide-react";
import { sendMessageAction, markMessagesReadAction } from "../actions";
import { createClient } from "@/lib/supabase/client";

interface MessageRow {
    id: string;
    sender_id: string;
    body: string;
    read_at: string | null;
    created_at: string;
}

interface Props {
    conversationId: string;
    currentUserId: string;
    recipientId: string;
    initialMessages: MessageRow[];
}

/**
 * SAH-96 PR B: thread view + composer + Realtime.
 *
 * Subscribes to the `messages` table filtered to this conversation_id. New
 * INSERT events from either side append to the local list without a refresh.
 * Server-side RLS still applies — clients only receive INSERTs they could
 * have SELECTed, so non-participants don't leak.
 *
 * Optimistic-append on send still happens (zero-latency feel) but the
 * Realtime echo for our own message is deduplicated by id.
 */
export function ConversationView({
    conversationId,
    currentUserId,
    recipientId,
    initialMessages,
}: Props) {
    const [messages, setMessages] = React.useState<MessageRow[]>(initialMessages);
    const [draft, setDraft] = React.useState("");
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        // Stick to the bottom on mount and after each message append.
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "auto" });
    }, [messages.length]);

    // Realtime subscription. Filter is server-side via PostgREST-style filter
    // string; we still rely on RLS as the actual auth boundary.
    React.useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel(`messages:${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (payload: { new: any }) => {
                    const row = payload.new as MessageRow;
                    setMessages((prev) => {
                        // Skip if we already have it (server echo of our own optimistic
                        // append, or a duplicate from a reconnect replay).
                        if (prev.some((m) => m.id === row.id)) return prev;
                        // Replace the temp optimistic row if its body matches and it
                        // came from us — otherwise just append.
                        const tempIdx = prev.findIndex(
                            (m) =>
                                m.id.startsWith("temp-") &&
                                m.sender_id === row.sender_id &&
                                m.body === row.body,
                        );
                        if (tempIdx !== -1) {
                            const next = [...prev];
                            next[tempIdx] = row;
                            return next;
                        }
                        return [...prev, row];
                    });

                    // If the incoming message is from the other player and we're
                    // looking at the thread, mark as read immediately.
                    if (row.sender_id !== currentUserId) {
                        void markMessagesReadAction(conversationId);
                    }
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [conversationId, currentUserId]);

    async function send() {
        const body = draft.trim();
        if (!body || sending) return;
        setError(null);
        setSending(true);
        try {
            const result = await sendMessageAction(recipientId, body, null);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            // Optimistic append (PR B will replace this with realtime broadcast)
            setMessages((prev) => [
                ...prev,
                {
                    id: `temp-${Date.now()}`,
                    sender_id: currentUserId,
                    body,
                    read_at: null,
                    created_at: new Date().toISOString(),
                },
            ]);
            setDraft("");
        } finally {
            setSending(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        // Enter to send, Shift+Enter for newline.
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
        }
    }

    return (
        <>
            {/* Scrollable message list */}
            <div
                ref={scrollerRef}
                data-conversation-id={conversationId}
                className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3 space-y-2"
            >
                {messages.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-500 py-8">
                        No messages yet — say hi.
                    </p>
                ) : (
                    messages.map((msg, i) => {
                        const isMine = msg.sender_id === currentUserId;
                        const prev = messages[i - 1];
                        const showDateHeader =
                            !prev || !isSameDay(new Date(prev.created_at), new Date(msg.created_at));
                        return (
                            <React.Fragment key={msg.id}>
                                {showDateHeader && (
                                    <div className="text-center my-3">
                                        <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-600 font-medium">
                                            {format(new Date(msg.created_at), "PP")}
                                        </span>
                                    </div>
                                )}
                                <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                                            isMine
                                                ? "bg-emerald-600 text-white rounded-br-md"
                                                : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                        <p
                                            className={`text-[10px] mt-1 ${
                                                isMine ? "text-emerald-100/80" : "text-gray-500 dark:text-gray-500"
                                            }`}
                                        >
                                            {format(new Date(msg.created_at), "p")}
                                            {isMine && msg.read_at && " · read"}
                                        </p>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })
                )}
            </div>

            {/* Composer */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-3 py-2 shadow-sm">
                {error && (
                    <p className="text-xs text-red-500 mb-1.5" role="alert">
                        {error}
                    </p>
                )}
                <div className="flex gap-2 items-end">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message…"
                        rows={1}
                        maxLength={2000}
                        className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
                        aria-label="Message"
                    />
                    <button
                        type="button"
                        onClick={() => void send()}
                        disabled={!draft.trim() || sending}
                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="Send"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1 px-1">
                    {draft.length}/2000 · Enter to send · Shift+Enter for new line
                </p>
            </div>
        </>
    );
}
