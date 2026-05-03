import { getLocale } from "next-intl/server";

export const metadata = { title: "Terms of Service – Saha" };

export default async function TermsPage() {
    const locale = await getLocale();
    const isGerman = locale === "de";

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {isGerman ? "Nutzungsbedingungen" : "Terms of Service"}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {isGerman
                    ? "Durch die Nutzung von Saha stimmst du zu, korrekte Informationen bereitzustellen und die Plattform nicht missbräuchlich zu verwenden."
                    : "By using Saha, you agree to provide accurate information and not misuse the platform."}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {isGerman
                    ? "Wir behalten uns vor, Inhalte oder Konten bei Verstoß gegen diese Bedingungen zu entfernen oder einzuschränken."
                    : "We reserve the right to remove or restrict content/accounts that violate these terms."}
            </p>
        </div>
    );
}
