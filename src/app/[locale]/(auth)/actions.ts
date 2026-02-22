"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from "@/lib/validations";

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function loginAction(formData: FormData) {
    const raw = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.errors[0].message };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
        return { error: "Invalid email or password." };
    }

    // Check if user has TOTP enrolled (business/admin must complete 2FA)
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totpFactor = factors?.totp?.[0];

    if (totpFactor && totpFactor.status === "verified") {
        const locale = formData.get("locale") as string ?? "en";
        redirect(`/${locale}/2fa/verify`);
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
    const raw = {
        display_name: formData.get("display_name") as string,
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        confirm_password: formData.get("confirm_password") as string,
        role: formData.get("role") as string,
    };

    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.errors[0].message };
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
    const raw = { email: formData.get("email") as string };
    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: parsed.error.errors[0].message };
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
        return { error: parsed.error.errors[0].message };
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
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/en");
}

// ---------------------------------------------------------------------------
// 2FA: Enroll TOTP factor
// ---------------------------------------------------------------------------
export async function enrollTotpAction() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Saha Authenticator",
    });
    if (error) return { error: error.message };
    return { data };
}

// ---------------------------------------------------------------------------
// 2FA: Verify TOTP and complete challenge
// ---------------------------------------------------------------------------
export async function verifyTotpAction(formData: FormData) {
    const code = formData.get("code") as string;
    const factorId = formData.get("factor_id") as string;

    if (!code || code.length !== 6) {
        return { error: "Invalid code." };
    }

    const supabase = await createClient();

    // Create challenge then verify
    const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return { error: challengeError.message };

    const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
    });

    if (verifyError) return { error: "Invalid code. Please try again." };

    const locale = formData.get("locale") as string ?? "en";
    const next = formData.get("next") as string | null;
    revalidatePath("/", "layout");
    redirect(next ?? `/${locale}`);
}

// ---------------------------------------------------------------------------
// 2FA: Unenroll a TOTP factor (admin action)
// ---------------------------------------------------------------------------
export async function unenrollTotpAction(factorId: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
}
