import { describe, it, expect } from "vitest";
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    profileUpdateSchema,
    facilityUpdateSchema,
    courtSchema,
    availabilitySlotSchema,
    generateSlotsSchema,
    eventSchema,
    matchmakingSchema,
} from "@/lib/validations";

describe("loginSchema", () => {
    it("accepts a valid email + ≥8-char password", () => {
        expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
    });

    it("rejects an invalid email", () => {
        expect(loginSchema.safeParse({ email: "not-an-email", password: "12345678" }).success).toBe(false);
    });

    it("rejects a password under 8 chars", () => {
        expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    });
});

describe("registerSchema", () => {
    it("accepts a matching password + confirm", () => {
        const ok = registerSchema.safeParse({
            display_name: "Player One",
            email: "p@example.com",
            password: "abcd1234",
            confirm_password: "abcd1234",
            role: "user",
        });
        expect(ok.success).toBe(true);
    });

    it("rejects mismatched password + confirm", () => {
        const result = registerSchema.safeParse({
            display_name: "Player One",
            email: "p@example.com",
            password: "abcd1234",
            confirm_password: "different",
            role: "user",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toContain("confirm_password");
        }
    });

    it("only allows user or business roles (no admin)", () => {
        // SAH-84 hardens against admin elevation via metadata; the schema is
        // the first line of defence.
        const result = registerSchema.safeParse({
            display_name: "Bad Actor",
            email: "x@example.com",
            password: "abcd1234",
            confirm_password: "abcd1234",
            role: "admin",
        });
        expect(result.success).toBe(false);
    });
});

describe("forgotPasswordSchema", () => {
    it("requires a valid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
        expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
    });
});

describe("resetPasswordSchema", () => {
    it("requires the two passwords to match and be ≥8", () => {
        expect(resetPasswordSchema.safeParse({ password: "abcd1234", confirm_password: "abcd1234" }).success).toBe(true);
        expect(resetPasswordSchema.safeParse({ password: "short", confirm_password: "short" }).success).toBe(false);
        expect(resetPasswordSchema.safeParse({ password: "abcd1234", confirm_password: "diff5678" }).success).toBe(false);
    });
});

describe("profileUpdateSchema", () => {
    it("accepts valid display name + UAE phone", () => {
        expect(profileUpdateSchema.safeParse({ display_name: "Ali Hassan", phone: "+971501234567" }).success).toBe(true);
    });

    it("accepts an empty phone string", () => {
        expect(profileUpdateSchema.safeParse({ display_name: "Ali Hassan", phone: "" }).success).toBe(true);
    });

    it("rejects a phone without country code", () => {
        expect(profileUpdateSchema.safeParse({ display_name: "Ali", phone: "0501234567" }).success).toBe(false);
    });

    it("rejects an over-short display name", () => {
        expect(profileUpdateSchema.safeParse({ display_name: "A", phone: "" }).success).toBe(false);
    });
});

describe("facilityUpdateSchema", () => {
    it("rejects descriptions under 20 chars", () => {
        const result = facilityUpdateSchema.safeParse({
            name: "Just Padel",
            description: "Too short",
            address: "Some address",
            city: "Dubai",
            postal_code: "12345",
        });
        expect(result.success).toBe(false);
    });

    it("accepts a complete payload", () => {
        const result = facilityUpdateSchema.safeParse({
            name: "Just Padel",
            description: "A premium padel facility in the heart of Dubai with 8 courts.",
            address: "Sheikh Zayed Road",
            city: "Dubai",
            postal_code: "12345",
            phone: "+97140000000",
            website: "https://justpadel.ae",
        });
        expect(result.success).toBe(true);
    });
});

describe("courtSchema", () => {
    it("requires capacity ≥ 1", () => {
        expect(courtSchema.safeParse({ name: "Court A", sport_id: "1", capacity: 0, price_per_hour: 100 }).success).toBe(false);
    });

    it("rejects negative price", () => {
        expect(courtSchema.safeParse({ name: "Court A", sport_id: "1", capacity: 4, price_per_hour: -10 }).success).toBe(false);
    });

    it("accepts empty sport_id (no sport assigned)", () => {
        expect(courtSchema.safeParse({ name: "Court A", sport_id: "", capacity: 4, price_per_hour: 100 }).success).toBe(true);
    });
});

describe("availabilitySlotSchema", () => {
    it("requires a UUID court id", () => {
        expect(availabilitySlotSchema.safeParse({ court_id: "not-a-uuid", date: "2026-06-01", start_time: "09:00", end_time: "10:00" }).success).toBe(false);
    });

    it("accepts valid times", () => {
        expect(availabilitySlotSchema.safeParse({
            court_id: "00000000-0000-0000-0000-000000000000",
            date: "2026-06-01",
            start_time: "09:00",
            end_time: "10:00",
        }).success).toBe(true);
    });
});

describe("generateSlotsSchema", () => {
    it("clamps duration to 30..240 minutes", () => {
        const base = {
            court_id: "00000000-0000-0000-0000-000000000000",
            date: "2026-06-01",
            from_time: "09:00",
            to_time: "21:00",
        };
        expect(generateSlotsSchema.safeParse({ ...base, duration_minutes: 30 }).success).toBe(true);
        expect(generateSlotsSchema.safeParse({ ...base, duration_minutes: 240 }).success).toBe(true);
        expect(generateSlotsSchema.safeParse({ ...base, duration_minutes: 15 }).success).toBe(false);
        expect(generateSlotsSchema.safeParse({ ...base, duration_minutes: 300 }).success).toBe(false);
    });
});

describe("eventSchema", () => {
    it("requires a description ≥ 10 chars", () => {
        const ok = eventSchema.safeParse({
            name: "Open Padel Night",
            description: "Long enough description",
            event_date: "2026-06-15",
        });
        expect(ok.success).toBe(true);
        const tooShort = eventSchema.safeParse({
            name: "Open Padel Night",
            description: "Short",
            event_date: "2026-06-15",
        });
        expect(tooShort.success).toBe(false);
    });
});

describe("matchmakingSchema", () => {
    it("only allows the three skill levels", () => {
        const base = {
            sport_id: 1,
            post_date: "2026-06-15",
            message: "Looking for a partner this weekend.",
        };
        for (const skill of ["beginner", "intermediate", "advanced"] as const) {
            expect(matchmakingSchema.safeParse({ ...base, skill_level: skill }).success).toBe(true);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(matchmakingSchema.safeParse({ ...base, skill_level: "expert" } as any).success).toBe(false);
    });
});
