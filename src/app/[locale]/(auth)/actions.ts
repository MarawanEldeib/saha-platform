"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from "@/lib/validations";
import { botSignalCheck } from "@/lib/botid";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function loginAction(formData: FormData) {
    // SAH-78: Vercel BotID — drops drive-by bots before they hit Supabase.
    const botError = await botSignalCheck();
    if (botError) return { error: botError };

    // SAH-76: 5 attempts / 15 min / IP. Combined IP+email key so one IP
    // can't lock the same email out everywhere by hammering it.
    const rl = await rateLimit("auth_login", (formData.get("email") as string) ?? "");
    if (!rl.success) {
        return { error: `Too many attempts. Try again in ${rl.retryAfter}s.` };
    }

    const raw = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
        return { error: "Invalid email or password." };
    }

    const locale = formData.get("locale") as string ?? "en";
    const next = formData.get("next") as string | null;
    revalidatePath("/", "layout");
    redirect(next || `/${locale}`);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
export async function registerAction(formData: FormData) {
    const botError = await botSignalCheck();
    if (botError) return { error: botError };

    const rl = await rateLimit("auth_signup");
    if (!rl.success) {
        return { error: `Too many sign-ups from this IP. Try again in ${rl.retryAfter}s.` };
    }

    const raw = {
        display_name: formData.get("display_name") as string,
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        confirm_password: formData.get("confirm_password") as string,
        role: formData.get("role") as string,
    };

    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
            data: {
                display_name: parsed.data.display_name,
                role: parsed.data.role,
            },
        },
    });

    if (error) {
        if (error.code === "user_already_exists") {
            return { error: "This email is already in use." };
        }
        return { error: error.message };
    }

    // If email confirmation is disabled in Supabase, user is immediately signed in
    if (data.session) {
        const locale = formData.get("locale") as string ?? "en";
        revalidatePath("/", "layout");
        if (parsed.data.role === "business") {
            redirect(`/${locale}/dashboard/onboarding`);
        }
        redirect(`/${locale}`);
    }

    return { success: true };
}

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------
export async function forgotPasswordAction(formData: FormData) {
    const botError = await botSignalCheck();
    if (botError) return { error: botError };

    const rl = await rateLimit("auth_forgot", (formData.get("email") as string) ?? "");
    if (!rl.success) {
        return { error: `Too many reset requests. Try again in ${rl.retryAfter}s.` };
    }

    const raw = { email: formData.get("email") as string };
    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message };
    }

    const locale = formData.get("locale") as string ?? "en";
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/reset-password`,
    });

    if (error) {
        return { error: error.message };
    }

    return { success: true };
}

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------
export async function resetPasswordAction(formData: FormData) {
    const raw = {
        password: formData.get("password") as string,
        confirm_password: formData.get("confirm_password") as string,
    };

    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
        return { error: error.message };
    }

    const locale = formData.get("locale") as string ?? "en";
    redirect(`/${locale}/login`);
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export async function logoutAction() {
    const supabase = await createClient();
    const locale = await getLocale();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect(`/${locale}`);
}

