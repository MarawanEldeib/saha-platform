"use client";

import React from "react";
import { ArrowDown, ArrowUp, Trash2, UploadCloud, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getStorageUrl } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { FacilityImage } from "@/types/database";
import { useTranslations } from "next-intl";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_IMAGES = 10;
// SAH-160: server-side route enforces magic-byte + size limits. Keep this
// constant in sync with MAX_IMAGE_BYTES in lib/image-validation.ts so we
// can warn the user instantly before sending oversized payloads.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type UploadStatus = "uploading" | "uploaded" | "error";

type ImageItem = {
    key: string;
    id?: string;
    storagePath?: string;
    publicUrl?: string;
    previewUrl: string;
    isLocal: boolean;
    progress: number;
    status: UploadStatus;
    error?: string;
    file?: File;
};

interface ImageUploaderProps {
    facilityId: string;
    initialImages?: FacilityImage[];
    maxImages?: number;
}

function getRandomId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getReadableName(item: ImageItem): string {
    if (item.file?.name) return item.file.name;
    if (item.storagePath) return item.storagePath.split("/").pop() ?? "image";
    return "image";
}

export function ImageUploader({ facilityId, initialImages = [], maxImages = DEFAULT_MAX_IMAGES }: ImageUploaderProps) {
    const t = useTranslations("image_uploader");
    const supabase = React.useMemo(() => createClient(), []);
    const [items, setItems] = React.useState<ImageItem[]>(() => {
        const sorted = [...initialImages].sort(
            (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
        );
        return sorted.map((img) => {
            const publicUrl = getStorageUrl("facility-images", img.storage_path);
            return {
                key: img.id,
                id: img.id,
                storagePath: img.storage_path,
                publicUrl,
                previewUrl: publicUrl,
                isLocal: false,
                progress: 100,
                status: "uploaded" as const,
            };
        });
    });
    const [error, setError] = React.useState<string | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const itemsRef = React.useRef(items);

    React.useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    React.useEffect(() => {
        return () => {
            itemsRef.current.forEach((item) => {
                if (item.isLocal) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
        };
    }, []);

    const updateItem = React.useCallback((key: string, patch: Partial<ImageItem>) => {
        setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    }, []);

    const getItemIndex = React.useCallback((key: string) => {
        const index = itemsRef.current.findIndex((item) => item.key === key);
        return index === -1 ? itemsRef.current.length : index;
    }, []);

    // SAH-160: goes through /api/facility-images/upload so the server can
    // verify ownership, file size, and magic bytes before anything hits
    // Supabase Storage. XHR is retained for upload-progress events.
    const uploadWithProgress = React.useCallback(
        async (
            file: File,
            facilityIdValue: string,
            displayOrder: number,
            onProgress: (progress: number) => void,
        ): Promise<{ id: string; storage_path: string }> => {
            return await new Promise((resolve, reject) => {
                const form = new FormData();
                form.append("file", file);
                form.append("facility_id", facilityIdValue);
                form.append("display_order", String(displayOrder));

                const xhr = new XMLHttpRequest();
                xhr.open("POST", "/api/facility-images/upload");

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        onProgress(percent);
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const parsed = JSON.parse(xhr.responseText) as { id: string; storage_path: string };
                            resolve(parsed);
                        } catch {
                            reject(new Error("Upload returned an invalid response"));
                        }
                    } else {
                        let message = `Upload failed (${xhr.status})`;
                        try {
                            const parsed = JSON.parse(xhr.responseText) as { error?: string };
                            if (parsed.error) message = parsed.error;
                        } catch { /* swallow — fall back to generic message */ }
                        reject(new Error(message));
                    }
                };

                xhr.onerror = () => reject(new Error("Upload failed"));
                xhr.send(form);
            });
        },
        []
    );

    const persistOrder = React.useCallback(
        async (nextItems: ImageItem[]) => {
            const updates = nextItems
                .filter((item) => item.id)
                .map((item, index) => ({ id: item.id as string, display_order: index }));
            if (updates.length === 0) return;

            const results = await Promise.all(
                updates.map((update) =>
                    supabase
                        .from("facility_images")
                        .update({ display_order: update.display_order })
                        .eq("id", update.id)
                )
            );

            const firstError = results.find((result) => result.error);
            if (firstError?.error) {
                setError(firstError.error.message);
            }
        },
        [supabase]
    );

    const uploadItem = React.useCallback(
        async (item: ImageItem) => {
            if (!item.file) return;

            try {
                const displayOrder = getItemIndex(item.key);
                const { id, storage_path } = await uploadWithProgress(
                    item.file,
                    facilityId,
                    displayOrder,
                    (progress) => updateItem(item.key, { progress, status: "uploading" }),
                );

                const publicUrl = getStorageUrl("facility-images", storage_path);
                if (item.isLocal) {
                    URL.revokeObjectURL(item.previewUrl);
                }
                updateItem(item.key, {
                    id,
                    storagePath: storage_path,
                    publicUrl,
                    previewUrl: publicUrl,
                    isLocal: false,
                    progress: 100,
                    status: "uploaded",
                    error: undefined,
                    file: undefined,
                });
            } catch (uploadError) {
                const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
                updateItem(item.key, { status: "error", error: message, progress: 0 });
            }
        },
        [facilityId, getItemIndex, updateItem, uploadWithProgress]
    );

    const addFiles = React.useCallback(
        (files: File[]) => {
            setError(null);

            const availableSlots = maxImages - itemsRef.current.length;
            if (availableSlots <= 0) {
                setError(t("max_images_error", { max: maxImages }));
                return;
            }

            const typedOk = files.filter((file) => ACCEPTED_TYPES.has(file.type));
            const typedBad = files.filter((file) => !ACCEPTED_TYPES.has(file.type));
            // SAH-160: matches the server-side cap so we don't ship huge
            // payloads only to be rejected at the route. Server is still
            // the authority.
            const sizedOk = typedOk.filter((file) => file.size <= MAX_IMAGE_BYTES);
            const sizedBad = typedOk.filter((file) => file.size > MAX_IMAGE_BYTES);

            if (typedBad.length > 0) setError(t("invalid_type_error"));
            if (sizedBad.length > 0) {
                setError(t("file_too_large_error", { max_mb: Math.floor(MAX_IMAGE_BYTES / 1024 / 1024) }));
            }

            const nextFiles = sizedOk.slice(0, availableSlots);
            if (sizedOk.length > availableSlots) {
                setError(t("max_images_error", { max: maxImages }));
            }
            if (nextFiles.length === 0) return;

            const newItems = nextFiles.map((file) => ({
                key: getRandomId(),
                file,
                previewUrl: URL.createObjectURL(file),
                isLocal: true,
                progress: 0,
                status: "uploading" as const,
            }));

            setItems((prev) => [...prev, ...newItems]);
            newItems.forEach((nextItem) => {
                void uploadItem(nextItem);
            });
        },
        [maxImages, uploadItem]
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        if (files.length > 0) {
            addFiles(files);
        }
        event.target.value = "";
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const files = Array.from(event.dataTransfer.files ?? []);
        if (files.length > 0) {
            addFiles(files);
        }
    };

    const handleMove = (index: number, direction: "up" | "down") => {
        const nextIndex = direction === "up" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= itemsRef.current.length) return;
        if (itemsRef.current[index].status !== "uploaded") return;
        if (itemsRef.current[nextIndex].status !== "uploaded") return;

        const reordered = [...itemsRef.current];
        const temp = reordered[index];
        reordered[index] = reordered[nextIndex];
        reordered[nextIndex] = temp;
        setItems(reordered);
        void persistOrder(reordered);
    };

    const handleRemove = async (item: ImageItem) => {
        if (item.status === "uploading") return;
        setError(null);

        if (!item.id || !item.storagePath) {
            if (item.isLocal) {
                URL.revokeObjectURL(item.previewUrl);
            }
            const remaining = itemsRef.current.filter((img) => img.key !== item.key);
            setItems(remaining);
            return;
        }

        const { error: storageError } = await supabase.storage
            .from("facility-images")
            .remove([item.storagePath]);

        if (storageError) {
            setError(storageError.message);
            return;
        }

        const { error: dbError } = await supabase
            .from("facility_images")
            .delete()
            .eq("id", item.id);

        if (dbError) {
            setError(dbError.message);
            return;
        }

        const remaining = itemsRef.current.filter((img) => img.key !== item.key);
        setItems(remaining);
        void persistOrder(remaining);
    };

    return (
        <div className="space-y-4">
            <div
                className={cn(
                    "border-2 border-dashed rounded-2xl px-6 py-8 text-center transition",
                    "bg-gray-50 dark:bg-gray-900",
                    isDragging
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20"
                        : "border-gray-200 dark:border-gray-800"
                )}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleInputChange}
                />
                <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="h-6 w-6 text-emerald-500" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t("drag_drop")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("or_browse")}</p>
                    <p className="text-xs text-gray-400">{t("format_hint", { max: maxImages })}</p>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{items.length} / {maxImages}</span>
                <span>{t("size_hint")}</span>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600" role="alert">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            {items.length > 0 && (
                <div className="space-y-3">
                    {items.map((item, index) => (
                        <div
                            key={item.key}
                            className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-800 p-3"
                        >
                            <div className="relative h-20 w-full sm:w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                                <img
                                    src={item.previewUrl}
                                    alt={getReadableName(item)}
                                    className="h-full w-full object-cover"
                                />
                                {item.status === "uploading" && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-semibold text-white">
                                        {item.progress}%
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {getReadableName(item)}
                                    </p>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {item.status === "uploading" && t("uploading")}
                                        {item.status === "uploaded" && t("uploaded")}
                                        {item.status === "error" && t("failed")}
                                    </span>
                                </div>

                                {item.status === "uploading" && (
                                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800">
                                        <div
                                            className="h-2 rounded-full bg-emerald-500 transition-all"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                )}

                                {item.status === "error" && item.error && (
                                    <p className="text-xs text-red-600">{item.error}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMove(index, "up")}
                                    disabled={index === 0 || item.status !== "uploaded"}
                                    aria-label="Move image up"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMove(index, "down")}
                                    disabled={index === items.length - 1 || item.status !== "uploaded"}
                                    aria-label="Move image down"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemove(item)}
                                    disabled={item.status === "uploading"}
                                    aria-label="Delete image"
                                >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
