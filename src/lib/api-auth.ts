/**
 * SAH-118: dual-auth helper for the public REST API.
 *
 * Accepts either of:
 *   - **Supabase JWT** in `Authorization: Bearer <token>` — for AI agents,
 *     MCP clients, and any external caller that obtained a token via the
 *     Supabase auth flow (sign-in → access_token).
 *   - **Cookie session** — same as the rest of the app, lets browser
 *     callers hit the API without a separate token flow.
 *
 * Returns a Supabase client scoped to the resolved user so RLS continues
 * to enforce access. Never bypasses RLS — that's the admin client's job
 * and it lives elsewhere.
 *
 * The cookie path uses `createClient()` from `src/lib/supabase/server.ts`
 * (already wired through `proxy.ts` for session refresh). The Bearer path
 * builds a fresh client with the JWT in the `Authorization` global header
 * — Supabase's client honours that header for `auth.getUser()` and every
 * subsequent query.
 */

import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface AuthedClient {
    supabase: SupabaseClient<Database>;
    user: User;
    /** "cookie" | "bearer" — useful for logging and rate-limit keys. */
    source: "cookie" | "bearer";
}

function bearerToken(req: NextRequest): string | null {
    const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1]?.trim() ?? null;
}

function clientFromBearer(token: string): SupabaseClient<Database> {
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            // No cookies — purely token-driven. Supabase still reads `getUser()`
            // from the Authorization header we set below.
            cookies: { getAll: () => [], setAll: () => {} },
            global: { headers: { Authorization: `Bearer ${token}` } },
        }
    );
}

/**
 * Resolve the authenticated user for an API request. Returns `null` when
 * no valid auth was supplied (caller should reply 401).
 *
 * Preference order: Bearer header (explicit) → cookie session (implicit).
 * If both are present, Bearer wins because the caller went out of their
 * way to set it.
 */
export async function getApiUser(req: NextRequest): Promise<AuthedClient | null> {
    const token = bearerToken(req);

    if (token) {
        const supabase = clientFromBearer(token);
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) return null;
        return { supabase, user: data.user, source: "bearer" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return { supabase, user: data.user, source: "cookie" };
}
