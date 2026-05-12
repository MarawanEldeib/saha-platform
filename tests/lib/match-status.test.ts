// SAH-152 Phase 7: tests for the display-status helper.

import { describe, it, expect } from "vitest";
import { computeDisplayStatus } from "@/lib/match-status";

const now = new Date("2026-05-12T18:00:00Z");

describe("computeDisplayStatus", () => {
    it("returns 'cancelled' when DB status is cancelled", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T20:00:00Z",
            durationMinutes: 60,
            status: "cancelled",
            now,
        })).toBe("cancelled");
    });

    it("returns 'completed' when DB status is completed", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T16:00:00Z",
            durationMinutes: 60,
            status: "completed",
            now,
        })).toBe("completed");
    });

    it("returns 'upcoming' before scheduled_for", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T20:00:00Z",
            durationMinutes: 60,
            status: "open",
            now,
        })).toBe("upcoming");
    });

    it("returns 'live' between scheduled_for and end", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T17:30:00Z",
            durationMinutes: 60,
            status: "open",
            now,
        })).toBe("live");
    });

    it("returns 'live' exactly at scheduled_for", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T18:00:00Z",
            durationMinutes: 60,
            status: "open",
            now,
        })).toBe("live");
    });

    it("returns 'live' exactly at end time", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T17:00:00Z",
            durationMinutes: 60,
            status: "open",
            now,
        })).toBe("live");
    });

    it("returns 'ended' once past end", () => {
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T16:00:00Z",
            durationMinutes: 60,
            status: "open",
            now,
        })).toBe("ended");
    });

    it("clamps duration to 480 minutes", () => {
        // Started at 14:00 with a maliciously huge duration → still live at
        // 18:00 (4 h elapsed, clamp = 8 h), but ended at 18:00 if started
        // at 08:00 (10 h elapsed > 8 h clamp).
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T14:00:00Z",
            durationMinutes: 9999,
            status: "open",
            now,
        })).toBe("live");
        expect(computeDisplayStatus({
            scheduledForIso: "2026-05-12T08:00:00Z",
            durationMinutes: 9999,
            status: "open",
            now,
        })).toBe("ended");
    });
});
