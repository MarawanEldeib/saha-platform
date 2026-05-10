import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Community Guidelines – Saha" };

export default async function CommunityGuidelinesPage() {
    const t = await getTranslations("community_guidelines");
    const tf = await getTranslations("footer");
    const locale = await getLocale();
    const isAr = locale === "ar";

    return (
        <div className="max-w-3xl mx-auto px-4 py-16">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{t("title")}</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-10">{t("intro")}</p>

            <div className="space-y-8 text-gray-700 dark:text-gray-300">
                {isAr ? (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">١. السلوك المحترم</h2>
                            <p>تعامل مع جميع اللاعبين والمنشآت باحترام. نحظر تماماً المضايقة، والإساءة اللفظية، والشتائم، والكلام التمييزي على أساس العرق أو الدين أو الجنس أو الجنسية. أي مخالفة قد تؤدي إلى تعليق الحساب نهائياً.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٢. لا للمراسلات الرومانسية أو المغازلة</h2>
                            <p>ساحة منصة لرياضات المضرب، وليست تطبيقاً للتعارف. لا تستخدم الرسائل المباشرة أو منشورات البحث عن شريك للمغازلة، أو طلب أرقام هواتف لأغراض شخصية، أو إرسال إيحاءات رومانسية. خصص محادثاتك لتنسيق المباريات والتدريب فقط.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٣. لا للصور أو المحتوى غير اللائق</h2>
                            <p>صور الملف الشخصي ومحتوى الرسائل يجب أن يلتزم بالحشمة والاحترام. الصور الكاشفة أو المحتوى ذو الإيحاءات الجنسية أو أي صورة تنتهك الذوق العام للمجتمع الإماراتي ستُزال فوراً.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٤. الفعاليات الممنوعة</h2>
                            <p>لا يُسمح بترويج فعاليات تتضمن أو تروّج لأي مما يلي على ساحة:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>المشروبات الكحولية</li>
                                <li>القمار أو المراهنات النقدية</li>
                                <li>المحتوى غير اللائق أو المخالف لقيم المجتمع</li>
                            </ul>
                            <p className="mt-2">يراجع فريق الإشراف كل فعالية قبل نشرها، وسيتم رفض الفعاليات المخالفة.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٥. الإبلاغ والتطبيق</h2>
                            <p>إذا واجهت سلوكاً يخالف هذه الإرشادات، أبلغنا فوراً بالضغط على زر &quot;إبلاغ&quot; على الملف الشخصي أو المنشور أو المراجعة. يراجع المشرفون البلاغات يومياً ونتخذ إجراءات تتراوح بين التحذير وحظر الحساب الدائم بحسب خطورة المخالفة.</p>
                            <p className="mt-2">للحالات الخطيرة (تهديد، تحرّش، محتوى غير قانوني)، تواصل معنا مباشرة على <a href="mailto:hello@saha.ae" className="text-emerald-600 dark:text-emerald-400 hover:underline">hello@saha.ae</a>.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٦. تحديث الإرشادات</h2>
                            <p>قد نُحدّث هذه الإرشادات من وقت لآخر لتعكس واقع المجتمع. باستخدامك المنصة، فأنت توافق على الإصدار الحالي.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">آخر تحديث: مايو ٢٠٢٦</p>
                    </>
                ) : (
                    <>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. Respectful Conduct</h2>
                            <p>Treat every player and facility with respect. Harassment, abusive language, slurs, and discriminatory speech based on race, religion, gender, or nationality are strictly prohibited. Violations may result in permanent suspension.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. No Romantic Advances or Flirting</h2>
                            <p>Saha is a racket sports platform — not a dating app. Do not use direct messages or matchmaking posts to flirt, request personal phone numbers, or send romantic overtures. Keep conversations focused on coordinating matches, training, and play.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. No Indecent Photos or Content</h2>
                            <p>Profile pictures and message content must be modest and respectful. Revealing imagery, sexually suggestive content, or anything that violates the cultural standards of the UAE community will be removed immediately, and the account may be suspended.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. Prohibited Events</h2>
                            <p>Events that involve or promote any of the following may not be listed on Saha:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Alcoholic beverages</li>
                                <li>Gambling or paid betting</li>
                                <li>Indecent themes or content that contradicts community values</li>
                            </ul>
                            <p className="mt-2">Every event is reviewed by the moderation team before publication. Submissions that violate this rule will be rejected.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. Reporting and Enforcement</h2>
                            <p>If you encounter behavior that violates these guidelines, please report it using the &quot;Report&quot; button on the profile, post, or review. Moderators review reports daily and take action ranging from a warning to permanent account ban depending on severity.</p>
                            <p className="mt-2">For serious cases (threats, harassment, illegal content), email us directly at <a href="mailto:hello@saha.ae" className="text-emerald-600 dark:text-emerald-400 hover:underline">hello@saha.ae</a>.</p>
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Updates to These Guidelines</h2>
                            <p>We may update these guidelines from time to time as the community evolves. By continuing to use Saha, you agree to the current version.</p>
                        </section>
                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">Last updated: May 2026</p>
                    </>
                )}
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-500">
                    {t("see_also")}{" "}
                    <Link href={`/${locale}/terms`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        {tf("terms_of_service")}
                    </Link>
                    {" · "}
                    <Link href={`/${locale}/privacy`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        {tf("privacy_policy")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
