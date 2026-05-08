import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
    const t = await getTranslations("footer");
    const locale = await getLocale();
    const isAr = locale === "ar";

    return (
        <div className="max-w-3xl mx-auto px-4 py-16">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t("terms_of_service")}</h1>
            <div className="space-y-8 text-gray-700 dark:text-gray-300">
                {isAr ? (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">١. قبول الشروط</h2>
                            <p>باستخدامك منصة ساها، فإنك توافق على الالتزام بهذه الشروط. إن لم توافق عليها، يُرجى عدم استخدام المنصة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٢. استخدام المنصة</h2>
                            <p>ساها منصة للعثور على ملاعب رياضات المضرب وحجزها في الإمارات العربية المتحدة. توافق على استخدامها لأغراض مشروعة فقط وبما يتوافق مع هذه الشروط.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٣. الحجوزات والمدفوعات</h2>
                            <p>تُؤكَّد الحجوزات عند اكتمال الدفع بنجاح. تحدد كل منشأة سياستها الخاصة للإلغاء واسترداد المبالغ. تأخذ ساها عمولة ١٠٪ على كل حجز يتم عبر منصتنا.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٤. قوائم المرافق</h2>
                            <p>يتحمل أصحاب المرافق المسؤولية الكاملة عن دقة بياناتهم المُدرجة. تحتفظ ساها بحق إزالة أو تعليق أي قائمة تُخالف سياساتنا.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٥. حدود المسؤولية</h2>
                            <p>لا تتحمل ساها مسؤولية أي نزاعات بين اللاعبين ومشغّلي المرافق، أو أي إصابة أو خسارة تقع داخل أي منشأة مُدرجة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٦. التعديل على الشروط</h2>
                            <p>نحتفظ بحق تحديث هذه الشروط في أي وقت. يُعدّ استمرارك في استخدام المنصة بعد أي تعديل قبولاً للشروط الجديدة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٧. التواصل</h2>
                            <p>لأي استفسارات حول هذه الشروط، تواصل معنا على <a href="mailto:hello@saha.ae" className="text-emerald-600 dark:text-emerald-400 hover:underline">hello@saha.ae</a>.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">آخر تحديث: مايو ٢٠٢٦</p>
                    </>
                ) : (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Acceptance of Terms</h2>
                            <p>By accessing or using Saha, you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. Use of the Platform</h2>
                            <p>Saha is a platform for discovering and booking racket sports courts in the UAE. You agree to use it only for lawful purposes and in accordance with these terms.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Bookings and Payments</h2>
                            <p>Bookings are confirmed upon successful payment. Cancellation and refund policies are set by individual facilities. Saha takes a 10% platform fee on each booking processed through our system.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Facility Listings</h2>
                            <p>Facility owners are responsible for the accuracy of their listings. Saha reserves the right to remove or suspend listings that violate our policies.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Limitation of Liability</h2>
                            <p>Saha is not liable for disputes between players and facility operators, or for any injury or loss occurring at a listed facility.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Changes to Terms</h2>
                            <p>We reserve the right to update these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7. Contact</h2>
                            <p>Questions about these terms? Contact us at <a href="mailto:hello@saha.ae" className="text-emerald-600 dark:text-emerald-400 hover:underline">hello@saha.ae</a>.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">Last updated: May 2026</p>
                    </>
                )}
            </div>
        </div>
    );
}
