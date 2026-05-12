// SAH-160: magic-byte verification for facility image uploads. The
// browser-reported `file.type` is user-controlled; checking the first
// few bytes ensures the file is actually a JPEG/PNG/WebP rather than
// a renamed executable.

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Inspect the first bytes of a buffer to determine whether it is one of
 * our allowed image formats. Returns the canonical MIME on match, or
 * `null` if the bytes don't match any allowed signature.
 *
 * Signatures:
 *   - JPEG: FF D8 FF
 *   - PNG:  89 50 4E 47 0D 0A 1A 0A
 *   - WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF + size + WEBP)
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): typeof ALLOWED_IMAGE_MIME_TYPES[number] | null {
    if (bytes.length < 12) return null;

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }

    // PNG
    if (
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
        return "image/png";
    }

    // WebP — "RIFF" header then "WEBP" at offset 8
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return "image/webp";
    }

    return null;
}
