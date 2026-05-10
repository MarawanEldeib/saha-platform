"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { EVENT_TAG_STYLES, type EventTag } from "@/lib/event-tags";
import { X } from "lucide-react";

interface Props {
    allTags: EventTag[];
    activeTags: EventTag[];
}

export function EventTagFilterChips({ allTags, activeTags }: Props) {
    const t = useTranslations("event_tags");
    const tFilter = useTranslations("events");
    const router = useRouter();
    const searchParams = useSearchParams();

    const setTags = (next: EventTag[]) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("tag");
        next.forEach((tag) => params.append("tag", tag));
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const toggle = (tag: EventTag) => {
        if (activeTags.includes(tag)) setTags(activeTags.filter((s) => s !== tag));
        else setTags([...activeTags, tag]);
    };

    const clear = () => setTags([]);

    return (
        <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">
                    {tFilter("filter_label")}:
                </span>
                {allTags.map((tag) => {
                    const isOn = activeTags.includes(tag);
                    return (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggle(tag)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors border ${
                                isOn
                                    ? `${EVENT_TAG_STYLES[tag]} border-transparent`
                                    : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
                            }`}
                            aria-pressed={isOn}
                        >
                            {t(`tag_${tag}`)}
                        </button>
                    );
                })}
                {activeTags.length > 0 && (
                    <button
                        type="button"
                        onClick={clear}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white ml-1"
                    >
                        <X className="h-3.5 w-3.5" />
                        {tFilter("clear_filters")}
                    </button>
                )}
            </div>
        </div>
    );
}
