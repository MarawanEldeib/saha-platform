import { describe, it, expect } from "vitest";
import { detectImageMimeFromBytes, ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "@/lib/image-validation";

// SAH-160: magic-byte detector covers the three formats we accept and
// rejects everything else, including renamed-binary attacks.

const jpegHeader = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const pngHeader = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const webpHeader = Uint8Array.of(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

describe("detectImageMimeFromBytes", () => {
    it("detects JPEG by FF D8 FF prefix", () => {
        expect(detectImageMimeFromBytes(jpegHeader)).toBe("image/jpeg");
    });

    it("detects PNG by 89 50 4E 47 ... 1A 0A signature", () => {
        expect(detectImageMimeFromBytes(pngHeader)).toBe("image/png");
    });

    it("detects WebP by RIFF + WEBP at offset 8", () => {
        expect(detectImageMimeFromBytes(webpHeader)).toBe("image/webp");
    });

    it("returns null for unrecognized headers (e.g. PDF)", () => {
        const pdf = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0);
        expect(detectImageMimeFromBytes(pdf)).toBeNull();
    });

    it("returns null for a renamed executable disguised as JPEG", () => {
        // Windows PE header (MZ)
        const exe = Uint8Array.of(0x4d, 0x5a, 0x90, 0, 0x03, 0, 0, 0, 0x04, 0, 0, 0);
        expect(detectImageMimeFromBytes(exe)).toBeNull();
    });

    it("returns null for an empty buffer", () => {
        expect(detectImageMimeFromBytes(new Uint8Array(0))).toBeNull();
    });

    it("returns null for buffers shorter than 12 bytes (can't disambiguate WebP)", () => {
        expect(detectImageMimeFromBytes(Uint8Array.of(0xff, 0xd8, 0xff))).toBeNull();
    });

    it("MAX_IMAGE_BYTES is 10 MB", () => {
        expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    });

    it("ALLOWED_IMAGE_MIME_TYPES has exactly the three formats", () => {
        expect([...ALLOWED_IMAGE_MIME_TYPES].sort()).toEqual(
            ["image/jpeg", "image/png", "image/webp"],
        );
    });
});
