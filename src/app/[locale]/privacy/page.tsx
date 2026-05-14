import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
    const t = await getTranslations("footer");
    const locale = await getLocale();
    const isAr = locale === "ar";

    return (
        <div className="max-w-3xl mx-auto px-4 py-16">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t("privacy_policy")}</h1>
            <div className="space-y-8 text-gray-700 dark:text-gray-300">
                {isAr ? (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">١. البيانات التي نجمعها</h2>
                            <p>نجمع المعلومات التي تقدّمها لنا مباشرةً، مثل اسمك وعنوان بريدك الإلكتروني عند التسجيل، وبيانات الموقع الجغرافي عند استخدام ميزة الخريطة للعثور على الملاعب القريبة منك.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٢. كيف نستخدم بياناتك</h2>
                            <p>نستخدم بياناتك لتقديم خدماتنا وتحسينها، ومعالجة الحجوزات، وإرسال تأكيدات الحجز، وعرض مرافق رياضية قريبة منك. لا نبيع بياناتك الشخصية لأطراف ثالثة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٣. ملفات تعريف الارتباط</h2>
                            <p>نستخدم ملفات تعريف الارتباط الأساسية اللازمة للمصادقة وإدارة الجلسات فقط. لا نستخدم ملفات التتبع أو الإعلانات دون موافقتك الصريحة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٤. تخزين البيانات</h2>
                            <p>تُخزَّن بياناتك بأمان باستخدام بنية Supabase التحتية. تتم معالجة مدفوعات الحجز عبر Stripe وتخضع لسياسة الخصوصية الخاصة بهم.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٥. حقوقك</h2>
                            <p>يمكنك في أي وقت طلب الاطلاع على بياناتك الشخصية أو تصحيحها أو حذفها عبر <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">مركز المساعدة</a>.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٦. التواصل</h2>
                            <p>لأي استفسارات تتعلق بالخصوصية، يُرجى التواصل عبر <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">مركز المساعدة</a>.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">آخر تحديث: مايو ٢٠٢٦</p>
                    </>
                ) : (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Data We Collect</h2>
                            <p>We collect information you provide directly to us, such as your name and email address when you register, and location data when you use our map features to find nearby courts.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. How We Use Your Data</h2>
                            <p>We use your data to provide and improve our services, process bookings, send booking confirmations, and show you nearby sports facilities. We do not sell your personal data to third parties.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Cookies</h2>
                            <p>We use essential cookies required for authentication and session management. We do not use tracking or advertising cookies without your explicit consent.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Data Storage</h2>
                            <p>Your data is stored securely using Supabase infrastructure. Booking payments are processed by Stripe and subject to their privacy policy.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Your Rights</h2>
                            <p>You may request access to, correction of, or deletion of your personal data at any time through the <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">help center</a>.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Contact</h2>
                            <p>For any privacy-related questions, please reach us through the <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">help center</a>.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">Last updated: May 2026</p>
                    </>
                )}
            </div>
        </div>
    );
}
