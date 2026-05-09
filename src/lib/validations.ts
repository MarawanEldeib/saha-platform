import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth Schemas
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
    .object({
        display_name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirm_password: z.string(),
        role: z.enum(["user", "business"]),
    })
    .refine((d) => d.password === d.confirm_password, {
        message: "Passwords do not match",
        path: ["confirm_password"],
    });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
    .object({
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirm_password: z.string(),
    })
    .refine((d) => d.password === d.confirm_password, {
        message: "Passwords do not match",
        path: ["confirm_password"],
    });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Onboarding / Facility Schemas
// ---------------------------------------------------------------------------
export const onboardingStep1Schema = z.object({
    business_name: z.string().min(2, "Business name is required"),
    business_email: z.string().email("Invalid email"),
    phone: z.string().min(6, "Phone number is required"),
    address: z.string().min(5, "Address is required"),
    city: z.string().min(2, "City is required"),
    postal_code: z.string().min(4, "Postal code is required"),
});
export type OnboardingStep1Input = z.infer<typeof onboardingStep1Schema>;

export const onboardingStep2Schema = z.object({
    facility_name: z.string().min(2, "Facility name is required"),
    description: z.string().min(20, "Describe your facility in at least 20 characters"),
    website: z.string().url("Invalid URL").optional().or(z.literal("")),
    sport_ids: z.array(z.number()).min(1, "Select at least one sport"),
});
export type OnboardingStep2Input = z.infer<typeof onboardingStep2Schema>;

export const facilitySchema = z.object({
    name: z.string().min(2, "Facility name is required"),
    description: z.string().optional(),
    address: z.string().min(5, "Address is required"),
    city: z.string().min(2, "City is required"),
    postal_code: z.string().optional(),
    country: z.string().min(1, "Country is required"),
    phone: z.string().optional(),
    website: z.string().url("Invalid URL").optional().or(z.literal("")),
});
export type FacilityInput = z.infer<typeof facilitySchema>;

export const facilityUpdateSchema = z.object({
    name: z.string().min(2),
    description: z.string().min(20),
    address: z.string().min(5),
    city: z.string().min(2),
    postal_code: z.string().min(4),
    phone: z.string().optional(),
    website: z.string().url().optional().or(z.literal("")),
    // SAH-90: UAE Tax Registration Number, 15 digits per FTA spec.
    trn: z.string().regex(/^\d{15}$/, "TRN must be 15 digits").optional().or(z.literal("")),
});
export type FacilityUpdateInput = z.infer<typeof facilityUpdateSchema>;

export const facilityHoursSchema = z.object({
    hours: z.array(
        z.object({
            day_of_week: z.number().min(0).max(6),
            is_closed: z.boolean(),
            open_time: z.string().nullable(),
            close_time: z.string().nullable(),
        })
    ),
});
export type FacilityHoursInput = z.infer<typeof facilityHoursSchema>;

export const discountSchema = z.object({
    description: z.string().min(5, "Provide a discount description"),
    amount: z.string().optional(),
    valid_until: z.string().optional(),
});
export type DiscountInput = z.infer<typeof discountSchema>;

// ---------------------------------------------------------------------------
// Review Schema
// ---------------------------------------------------------------------------
export const reviewSchema = z.object({
    rating: z.number().min(1).max(5),
    // SAH-113: comment is fully optional. Empty string + length check
    // handled together so the quick-tap form (stars only) validates.
    comment: z
        .string()
        .max(1000, "Comment is too long")
        .refine((v) => v.length === 0 || v.length >= 10, {
            message: "Comment must be at least 10 characters",
        })
        .optional()
        .or(z.literal("")),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

// ---------------------------------------------------------------------------
// Event Schema
// ---------------------------------------------------------------------------
export const eventSchema = z.object({
    name: z.string().min(3, "Event name is required"),
    description: z.string().min(10, "Provide a description"),
    event_date: z.string().min(1, "Date is required"),
});
export type EventInput = z.infer<typeof eventSchema>;

// ---------------------------------------------------------------------------
// Matchmaking Schema
// ---------------------------------------------------------------------------
export const matchmakingSchema = z.object({
    sport_id: z.number().nullable(),
    skill_level: z.enum(["beginner", "intermediate", "advanced"]),
    post_date: z.string().min(1, "Date is required"),
    message: z.string().min(10, "Message must be at least 10 characters"),
    location_text: z.string().optional(),
});
export type MatchmakingInput = z.infer<typeof matchmakingSchema>;

// ---------------------------------------------------------------------------
// Admin Schemas
// ---------------------------------------------------------------------------
export const declineReasonSchema = z.object({
    reason: z.string().optional(),
});
export type DeclineReasonInput = z.infer<typeof declineReasonSchema>;

export const profileUpdateSchema = z.object({
    display_name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid number with country code (e.g. +971501234567)").optional().or(z.literal("")),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ---------------------------------------------------------------------------
// Court Schema
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Availability Schemas
// ---------------------------------------------------------------------------
export const availabilitySlotSchema = z.object({
    court_id: z.string().uuid("Invalid court"),
    date: z.string().min(1, "Date is required"),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
});
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

export const generateSlotsSchema = z.object({
    court_id: z.string().uuid("Invalid court"),
    date: z.string().min(1, "Date is required"),
    from_time: z.string().min(1, "From time is required"),
    to_time: z.string().min(1, "To time is required"),
    duration_minutes: z.number().int().min(30).max(240),
});
export type GenerateSlotsInput = z.infer<typeof generateSlotsSchema>;

// ---------------------------------------------------------------------------
// Court Schema
// ---------------------------------------------------------------------------
export const courtSchema = z.object({
    name: z.string().min(2, "Court name must be at least 2 characters"),
    sport_id: z.string(), // "" = no sport assigned
    capacity: z.number().int().min(1, "Capacity must be at least 1").max(50, "Capacity cannot exceed 50"),
    price_per_hour: z.number().min(0, "Price cannot be negative"),
});
export type CourtInput = z.infer<typeof courtSchema>;
