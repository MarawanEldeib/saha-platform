// SAH-160: server-validated facility image upload.
//
// The browser previously talked directly to Supabase Storage with the
// user's session token; the only validation was a client-side MIME check
// on `file.type` (which is user-controlled). This route is the new
// upload boundary — it auths the caller, verifies facility ownership,
// caps the byte length, and checks the file's *real* magic bytes before
// forwarding to Supabase Storage and inserting the `facility_images` row.

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_BYTES,
    detectImageMimeFromBytes,
} from "@/lib/image-validation";

const BUCKET = "facility-images";

function sanitizeFileName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "image";
    return trimmed.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
}

function extensionForMime(mime: string): string {
    switch (mime) {
        case "image/jpeg": return "jpg";
        case "image/png": return "png";
        case "image/webp": return "webp";
        default: return "bin";
    }
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit("public_api");
    if (!rl.success) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: "Invalid form payload" }, { status: 400 });
    }

    const file = form.get("file");
    const facilityId = form.get("facility_id");
    const displayOrderRaw = form.get("display_order");

    if (!(file instanceof File) || typeof facilityId !== "string") {
        return NextResponse.json({ error: "file and facility_id are required" }, { status: 400 });
    }

    // Verify ownership BEFORE reading the file body — fail fast on the
    // cheap check, before allocating bytes for a stranger's upload.
    const { data: facility } = await supabase
        .from("facilities")
        .select("id, owner_id")
        .eq("id", facilityId)
        .single();
    if (!facility || facility.owner_id !== user.id) {
        return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    // Size check before reading. `file.size` is already known from the
    // multipart boundary so this rejects oversized uploads without
    // buffering them.
    if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
            { error: `File too large. Max ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)} MB.` },
            { status: 413 },
        );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());

    // Defensive: re-check post-read in case the multipart parser misreports.
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const detectedMime = detectImageMimeFromBytes(buffer);
    if (!detectedMime) {
        return NextResponse.json(
            { error: "Unsupported file type. Only JPEG, PNG, and WebP are accepted." },
            { status: 400 },
        );
    }
    // detectedMime is already in ALLOWED_IMAGE_MIME_TYPES by construction, but
    // be paranoid in case the list ever changes shape.
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(detectedMime)) {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const safeBase = sanitizeFileName(file.name);
    const ext = extensionForMime(detectedMime);
    const path = `${facilityId}/${Date.now()}-${crypto.randomUUID()}-${safeBase}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType: detectedMime,
            upsert: false,
        });

    if (uploadError) {
        Sentry.captureException(uploadError, {
            tags: { route: "facility-images/upload" },
            extra: { facility_id: facilityId, user_id: user.id, byte_length: buffer.byteLength },
        });
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const displayOrder = Number.isFinite(Number(displayOrderRaw)) ? Number(displayOrderRaw) : 0;

    const { data: inserted, error: insertError } = await supabase
        .from("facility_images")
        .insert({
            facility_id: facilityId,
            storage_path: path,
            display_order: displayOrder,
        })
        .select("id")
        .single();

    if (insertError) {
        // Roll back the upload so the bucket stays consistent with the
        // facility_images table.
        await supabase.storage.from(BUCKET).remove([path]);
        Sentry.captureException(insertError, {
            tags: { route: "facility-images/upload" },
            extra: { facility_id: facilityId, path },
        });
        return NextResponse.json({ error: "Could not save image" }, { status: 500 });
    }

    return NextResponse.json({ id: inserted.id, storage_path: path });
}
