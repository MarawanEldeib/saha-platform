import { getLocale } from "next-intl/server";

export const metadata = { title: "Imprint – Saha" };

export default async function ImprintPage() {
    const locale = await getLocale();
    const isGerman = locale === "de";

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {isGerman ? "Impressum" : "Imprint"}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Saha Platform
                <br />
                Stuttgart, Germany
                <br />
                Email: hello@saha.app
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {isGerman
                    ? "Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV: Saha Platform."
                    : "Responsible for content: Saha Platform."}
            </p>
        </div>
    );
}
