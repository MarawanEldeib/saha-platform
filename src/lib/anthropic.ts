/**
 * Anthropic SDK wrapper for SAH-40 (description generator) and SAH-41
 * (natural language search). Both gracefully no-op when ANTHROPIC_API_KEY
 * is missing so non-prod stays operational.
 */

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
    if (cached !== undefined) return cached;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        cached = null;
        return null;
    }
    cached = new Anthropic({ apiKey });
    return cached;
}

export const HAIKU_MODEL = "claude-haiku-4-5";

/** Pull plain text out of an Anthropic message response. */
export function textFromMessage(message: Anthropic.Message): string {
    return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
}
