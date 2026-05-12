import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { captureRouteMessage } from "@/lib/sentry-helpers";

/**
 * SAH-156: extracted from admin/actions.ts as part of the god-module
 * split.
 *
 * Three-layer admin guard for every mutating admin server action.
 * Returns the user-scoped + admin-scoped supabase clients plus the
 * caller's id and role on success. Throws (which the action surfaces
 * to the client) on any of:
 *   - no session             → "Unauthorized"
 *   - role !== 'admin'       → "Forbidden"
 *   - MFA assurance < aal2   → "Two-factor authentication required..."
 *
 * Every rejection emits a Sentry warning with the caller's user id
 * (when known) so a stream of rejections shows up in ops dashboards
 * — either someone misconfigured a role, a stale tab is firing, or
 * we're seeing real privilege-escalation attempts.
 *
 * The aal2 requirement matters because middleware already redirects
 * `/admin/*` page loads when the session falls back to aal1, but
 * server actions can be invoked from stale tabs or direct POSTs
 * outside the page flow.
 */
export async function assertAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        captureRouteMessage("admin guard rejected: unauthenticated", {
            route: "admin/assertAdmin",
            level: "warning",
        });
        throw new Error("Unauthorized");
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = (profile as { role: string } | null)?.role;
    if (role !== "admin") {
        captureRouteMessage("admin guard rejected: not admin role", {
            route: "admin/assertAdmin",
            user_id: user.id,
            level: "warning",
            extra: { role: role ?? "none" },
        });
        throw new Error("Forbidden");
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel !== "aal2") {
        captureRouteMessage("admin guard rejected: aal2 required", {
            route: "admin/assertAdmin",
            user_id: user.id,
            level: "warning",
            extra: { current_level: aal.currentLevel },
        });
        throw new Error("Two-factor authentication required. Sign in again at /admin/2fa.");
    }

    return { supabase, adminClient: createAdminClient(), userId: user.id, role };
}
