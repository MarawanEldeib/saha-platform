import "server-only";
import { getTranslations } from "next-intl/server";

/**
 * SAH-158: shorthand translator for server-action error strings.
 *
 *   return { error: await tr("booking.not_found") };
 *   return { error: await tr("booking.too_many_attempts", { seconds: 30 }) };
 *
 * Resolves keys under the `errors.*` namespace of `messages/{locale}.json`.
 * The optional `values` map fills ICU placeholders ({name}, {count}, …).
 */
export async function tr(
    key: string,
    values?: Record<string, string | number | Date>,
): Promise<string> {
    const t = await getTranslations("errors");
    return t(key, values);
}
