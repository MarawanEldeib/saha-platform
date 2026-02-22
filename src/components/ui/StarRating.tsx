"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
    value: number;
    onChange?: (value: number) => void;
    readOnly?: boolean;
    size?: number;
    className?: string;
}

export function StarRating({
    value,
    onChange,
    readOnly = false,
    size = 20,
    className,
}: StarRatingProps) {
    const [hovered, setHovered] = React.useState(0);

    return (
        <div
            className={cn("flex gap-0.5", className)}
            role={readOnly ? undefined : "radiogroup"}
            aria-label="Rating"
        >
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = (hovered || value) >= star;
                return (
                    <button
                        key={star}
                        type="button"
                        role={readOnly ? undefined : "radio"}
                        aria-checked={value === star}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                        disabled={readOnly}
                        onClick={() => onChange?.(star)}
                        onMouseEnter={() => !readOnly && setHovered(star)}
                        onMouseLeave={() => !readOnly && setHovered(0)}
                        className={cn(
                            "transition-colors",
                            readOnly
                                ? "cursor-default"
                                : "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                        )}
                    >
                        <Star
                            size={size}
                            className={cn(
                                "transition-colors",
                                filled
                                    ? "fill-amber-400 text-amber-400"
                                    : "fill-none text-gray-300 dark:text-gray-600"
                            )}
                        />
                    </button>
                );
            })}
        </div>
    );
}
