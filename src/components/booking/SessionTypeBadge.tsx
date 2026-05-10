import { useTranslations } from "next-intl";
import { isValidSessionType, SESSION_TYPE_STYLES, SESSION_TYPE_GLYPHS, type SessionType } from "@/lib/session-types";

interface Props {
    type: string | null | undefined;
    size?: "xs" | "sm";
}

export function SessionTypeBadge({ type, size = "xs" }: Props) {
    const t = useTranslations("session_types");
    if (!type || !isValidSessionType(type) || type === "mixed") return null;
    const sessionType: SessionType = type;
    const padding = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]";
    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-medium ${padding} ${SESSION_TYPE_STYLES[sessionType]}`}>
            {SESSION_TYPE_GLYPHS[sessionType] && <span aria-hidden>{SESSION_TYPE_GLYPHS[sessionType]}</span>}
            {t(`type_${sessionType}`)}
        </span>
    );
}
