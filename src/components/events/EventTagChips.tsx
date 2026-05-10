import { useTranslations } from "next-intl";
import { EVENT_TAG_STYLES, isValidEventTag, type EventTag } from "@/lib/event-tags";

interface Props {
    tags: string[] | null | undefined;
    size?: "sm" | "xs";
}

export function EventTagChips({ tags, size = "sm" }: Props) {
    const t = useTranslations("event_tags");
    if (!tags || tags.length === 0) return null;

    const padding = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

    return (
        <div className="flex flex-wrap gap-1.5">
            {tags.filter(isValidEventTag).map((tag: EventTag) => (
                <span
                    key={tag}
                    className={`inline-flex items-center rounded-full font-medium ${padding} ${EVENT_TAG_STYLES[tag]}`}
                >
                    {t(`tag_${tag}`)}
                </span>
            ))}
        </div>
    );
}
