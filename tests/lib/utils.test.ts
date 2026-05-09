import { describe, it, expect } from "vitest";
import { formatPrice, formatTime, truncate, DAY_KEYS } from "@/lib/utils";

describe("formatPrice", () => {
    it("formats AED with the AE prefix", () => {
        expect(formatPrice(125, "AED", "en")).toMatch(/AED\s*125/);
    });

    it("respects locale formatting", () => {
        // Arabic locale uses the Arabic currency name (د.إ.) and Eastern-Arabic
        // digits — it differs from the en output, which is the point.
        const enOut = formatPrice(125, "AED", "en");
        const arOut = formatPrice(125, "AED", "ar");
        expect(arOut.length).toBeGreaterThan(0);
        expect(arOut).not.toBe(enOut);
    });

    it("handles SAR + EGP without throwing", () => {
        expect(() => formatPrice(50, "SAR", "en")).not.toThrow();
        expect(() => formatPrice(75, "EGP", "en")).not.toThrow();
    });

    it("falls back gracefully on an invalid currency code", () => {
        // Three-letter unknown code — should fall back to the manual format.
        const out = formatPrice(100, "ZZZ", "en");
        expect(out).toContain("100");
        expect(out).toContain("ZZZ");
    });

    it("accepts numeric strings", () => {
        expect(formatPrice("250", "AED", "en")).toMatch(/250/);
    });
});

describe("formatTime", () => {
    it("returns HH:MM from a HH:MM:SS string", () => {
        expect(formatTime("14:30:00")).toBe("14:30");
    });

    it("returns the input unchanged when it has no seconds", () => {
        expect(formatTime("09:00")).toBe("09:00");
    });

    it("returns empty string for null", () => {
        expect(formatTime(null)).toBe("");
    });
});

describe("truncate", () => {
    it("returns the string unchanged when shorter than max", () => {
        expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates with an ellipsis when longer", () => {
        expect(truncate("hello world", 8)).toBe("hello w…");
    });

    it("respects exact max length", () => {
        expect(truncate("12345", 5)).toBe("12345");
    });
});

describe("DAY_KEYS", () => {
    it("starts with monday and ends with sunday", () => {
        expect(DAY_KEYS[0]).toBe("monday");
        expect(DAY_KEYS[DAY_KEYS.length - 1]).toBe("sunday");
        expect(DAY_KEYS).toHaveLength(7);
    });
});
