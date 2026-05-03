import { getLocale } from "next-intl/server";

export const metadata = { title: "Privacy Policy – Saha" };

export default async function PrivacyPage() {
    const locale = await getLocale();
    const isGerman = locale === "de";

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {isGerman ? "Datenschutzerklärung" : "Privacy Policy"}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {isGerman
                    ? "Saha verarbeitet nur Daten, die für Kontoverwaltung, Plattformfunktionen und Sicherheit erforderlich sind. Wir verkaufen keine personenbezogenen Daten."
                    : "Saha only processes data required for account management, platform functionality, and security. We do not sell personal data."}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {isGerman
                    ? "Wenn du Auskunft, Berichtigung oder Löschung deiner Daten anfragen möchtest, kontaktiere uns unter hello@saha.app."
                    : "If you need access, correction, or deletion of your data, contact us at hello@saha.app."}
            </p>
        </div>
    );
}
