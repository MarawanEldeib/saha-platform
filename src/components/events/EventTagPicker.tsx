"use client";

import { useTranslations } from "next-intl";
import { EVENT_TAGS, EVENT_TAG_STYLES, type EventTag } from "@/lib/event-tags";

interface Props {
    selected: EventTag[];
    onChange: (next: EventTag[]) => void;
    name?: string;
    label?: string;
}

export function EventTagPicker({ selected, onChange, name, label }: Props) {
    const t = useTranslations("event_tags");

    const toggle = (tag: EventTag) => {
        if (selected.includes(tag)) onChange(selected.filter((s) => s !== tag));
        else onChange([...selected, tag]);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {label ?? t("label")}
            </label>
            <div className="flex flex-wrap gap-2">
                {EVENT_TAGS.map((tag) => {
                    const isOn = selected.includes(tag);
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
            </div>
            {name && selected.map((tag) => <input key={tag} type="hidden" name={name} value={tag} />)}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">{t("hint")}</p>
        </div>
    );
}
