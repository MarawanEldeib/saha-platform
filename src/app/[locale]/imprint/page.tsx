import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Imprint" };

export default async function ImprintPage() {
    const t = await getTranslations("footer");
    const locale = await getLocale();
    const isAr = locale === "ar";

    return (
        <div className="max-w-3xl mx-auto px-4 py-16">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t("impressum")}</h1>
            <div className="space-y-8 text-gray-700 dark:text-gray-300">
                {isAr ? (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">الشركة</h2>
                            <p className="font-medium text-gray-900 dark:text-white">منصة ساها</p>
                            <p>دبي، الإمارات العربية المتحدة</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">التواصل</h2>
                            <p>للتواصل: <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">مركز المساعدة</a></p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">إخلاء المسؤولية</h2>
                            <p>المعلومات المقدمة على هذه المنصة للأغراض المعلوماتية العامة فقط. لا تقدم منصة ساها أي ضمانات بشأن اكتمال أو دقة أو موثوقية قوائم المرافق المُدرجة.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">آخر تحديث: مايو ٢٠٢٦</p>
                    </>
                ) : (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Company</h2>
                            <p className="font-medium text-gray-900 dark:text-white">Saha</p>
                            <p>Dubai, United Arab Emirates</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Contact</h2>
                            <p>Reach us through the <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">help center</a>.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Disclaimer</h2>
                            <p>The information provided on this platform is for general informational purposes only. Saha makes no warranties about the completeness, accuracy, or reliability of facility listings.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">Last updated: May 2026</p>
                    </>
                )}
            </div>
        </div>
    );
}
