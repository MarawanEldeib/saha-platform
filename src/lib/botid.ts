/**
 * SAH-78: Vercel BotID wrapper. The botid package is a thin runtime around
 * a Vercel platform feature; if the platform doesn't recognise the request
 * (local dev, missing config), `checkBotId()` returns `isBot: false`.
 *
 * We wrap it so:
 * - Server actions can call `await assertNotBot()` and bail with a generic
 *   error string if Vercel flags the request.
 * - Local dev / preview / non-Vercel envs gracefully no-op.
 */

let cachedCheck: (() => Promise<{ isBot: boolean }>) | null | undefined;

async function loadCheck(): Promise<(() => Promise<{ isBot: boolean }>) | null> {
    if (cachedCheck !== undefined) return cachedCheck;
    try {
        // Dynamic import so a missing/incompatible package doesn't blow up
        // the whole module graph at import time.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import("botid/server")) as any;
        cachedCheck = typeof mod?.checkBotId === "function" ? mod.checkBotId : null;
    } catch {
        cachedCheck = null;
    }
    return cachedCheck ?? null;
}

/**
 * Returns true if Vercel BotID flags the current request as a bot.
 * Returns false when BotID isn't configured / available.
 */
export async function isBotRequest(): Promise<boolean> {
    const check = await loadCheck();
    if (!check) return false;
    try {
        const result = await check();
        return !!result?.isBot;
    } catch (err) {
        console.warn("[botid] check failed", err);
        return false;
    }
}

/**
 * For mutating server actions on auth/forgot/reset endpoints. Returns a
 * generic error string when flagged so we don't leak which checks fired.
 * Caller bails with `if (botError) return { error: botError };`.
 *
 * Kill switch: set `BOTID_DISABLED=1` (Vercel env var) to short-circuit the
 * check entirely. Useful when BotID's signal is too aggressive and locking
 * legitimate users out — flip the env var, redeploy, investigate, flip back.
 * Without this, a misbehaving signal would require a code rollback to
 * unblock auth, which is too slow during an incident.
 */
export async function botSignalCheck(): Promise<string | null> {
    if (process.env.BOTID_DISABLED === "1") return null;
    if (await isBotRequest()) {
        return "Sign-in temporarily unavailable. Please try again in a moment.";
    }
    return null;
}
