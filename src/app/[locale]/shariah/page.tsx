import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Shariah Compliance – Saha" };

// SAH-149: public statement of our Shariah-compatible posture. We are
// compliant by design (service fees not interest, concrete bookings, no
// gambling, no auto-renewal, no interest-bearing balances) but until now
// we made no claim. This page closes that gap. It does NOT claim formal
// scholar certification — we welcome review.

export default async function ShariahPage() {
    const tf = await getTranslations("footer");
    const locale = await getLocale();
    const isAr = locale === "ar";

    return (
        <div className="max-w-3xl mx-auto px-4 py-16">
            {isAr ? (
                <>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">الالتزام بأحكام الشريعة</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-10">
                        ساحة منصة لحجز ملاعب رياضات المضرب. نسعى إلى أن تتوافق كل
                        تفاصيل المنصة — الرسوم، والاسترداد، والمحفظة، والفعاليات —
                        مع روح أحكام الشريعة الإسلامية.
                    </p>

                    <div className="space-y-8 text-gray-700 dark:text-gray-300">
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">١. لا فائدة (ربا)</h2>
                            <p>
                                نحن نأخذ نسبة <strong>رسوم خدمة</strong> (حالياً ١٠٪) من
                                قيمة الحجز المؤكد — مقابل تشغيل المنصة، وتوفير الحجز
                                الفوري، ومعالجة الدفع، والدعم. هذه رسوم خدمة محددة
                                مسبقاً وليست فائدة على قرض. لا نقدّم ولا نتلقى أي فائدة
                                على المبالغ المحتفظ بها.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٢. لا غرر</h2>
                            <p>
                                كل حجز محدد بوضوح: ملعب معروف، تاريخ ووقت ومدة محددة،
                                وسعر إجمالي ظاهر قبل الدفع. لا توجد رسوم مخفية أو شروط
                                ضبابية. سياسة الإلغاء معلنة قبل تأكيد الحجز:
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>إلغاء قبل ٢٤ ساعة من الموعد = استرداد كامل.</li>
                                <li>إلغاء خلال آخر ٢٤ ساعة = لا يوجد استرداد، ويُحرَّر الموعد للآخرين.</li>
                                <li>لا توجد رسوم تأخير أو غرامات تراكمية مهما كان السبب.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٣. رصيد المحفظة</h2>
                            <p>
                                رصيد المحفظة هو رصيد <strong>مدفوع مسبقاً</strong>، لا
                                يتراكم عليه أي فائدة. عند إلغاء حجز ضمن نافذة الاسترداد،
                                يُعاد المبلغ كرصيد محفظة قابل للاستخدام في حجز قادم — لا
                                نحتفظ بأموالك مقابل ربح. يمكنك في أي وقت طلب صرف الرصيد
                                المتبقي بالتواصل معنا.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٤. لا اشتراكات تلقائية</h2>
                            <p>
                                لا توجد اشتراكات شهرية، ولا تجديد تلقائي، ولا خصم
                                مفاجئ. تدفع فقط مقابل الحجز الذي تختاره في اللحظة التي
                                تختاره فيها. الحجوزات المتكررة (مثلاً «كل ثلاثاء لمدة
                                ٤ أسابيع») تُدفع دفعةً واحدة مسبقاً، بسعر شفاف.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٥. لا قمار ولا ميسر</h2>
                            <p>
                                لا نسمح بأي فعالية أو ميزة قائمة على المراهنة أو الحظ
                                أو السحوبات النقدية على المنصة. سياستنا في الفعاليات
                                تمنع صراحةً أي محتوى ترويجي للقمار أو الكحول. تقاسم
                                التكلفة بين اللاعبين (تقسيم سعر الملعب) ليس قماراً —
                                هو مجرد قسمة شفافة لتكلفة خدمة محددة.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">٦. مراجعة العلماء</h2>
                            <p>
                                هذه الصفحة ليست شهادة رسمية من هيئة شرعية. إذا كنت
                                باحثاً شرعياً أو ممثلاً لهيئة وتودّ مراجعة أعمالنا،
                                نُرحّب بذلك. تواصل معنا عبر{" "}
                                <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                                    مركز المساعدة
                                </a>
                                .
                            </p>
                        </section>

                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">
                            آخر تحديث: مايو ٢٠٢٦
                        </p>
                    </div>
                </>
            ) : (
                <>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Shariah Compliance</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-10">
                        Saha is a racket-sports court booking platform. We aim for every
                        part of the experience — fees, refunds, the wallet, events — to
                        be aligned with the spirit of Shariah principles.
                    </p>

                    <div className="space-y-8 text-gray-700 dark:text-gray-300">
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. No interest (riba)</h2>
                            <p>
                                We charge a <strong>service fee</strong> (currently 10%)
                                on each confirmed booking — for running the platform,
                                providing real-time availability, processing payment,
                                and supporting users. It is a fixed, disclosed service
                                charge, not interest on a loan. We neither pay nor
                                receive interest on any balances we hold.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. No gharar (excessive uncertainty)</h2>
                            <p>
                                Every booking is concrete: a specific court, a known
                                date and start–end time, a fixed total shown before
                                you pay. No hidden charges and no ambiguous terms.
                                The cancellation policy is shown before you confirm:
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Cancel ≥ 24 hours before the slot — full refund.</li>
                                <li>Cancel within the last 24 hours — no refund; the slot is released for others.</li>
                                <li>No late fees, no compounding penalties, ever.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. Wallet balance</h2>
                            <p>
                                Your wallet balance is a <strong>prepaid balance</strong>.
                                No interest accrues on it. When you cancel a booking
                                within the refund window, the amount is returned to
                                your wallet for use on a future booking — we don&apos;t
                                hold your funds to earn yield. You can request a payout
                                of any remaining balance at any time by contacting us.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. No auto-renewing subscriptions</h2>
                            <p>
                                No monthly subscriptions, no auto-renewal, no surprise
                                charges. You pay only for the booking you choose at the
                                moment you choose it. Recurring bookings (e.g. &ldquo;every
                                Tuesday for 4 weeks&rdquo;) are paid in one transparent
                                upfront charge.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. No gambling or maysir</h2>
                            <p>
                                We do not allow any event or feature based on betting,
                                chance, or paid lotteries. Our event policy explicitly
                                rejects gambling or alcohol-promoting content. Splitting
                                the court price between players (cost-share) is not
                                gambling — it is a transparent division of a defined
                                service fee.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. Scholar review</h2>
                            <p>
                                This page is not a formal certification from a Shariah
                                board. If you are a scholar or represent a board and
                                would like to review our flows, we welcome it. Reach us through the{" "}
                                <a href={`/${locale}/help`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                                    help center
                                </a>
                                .
                            </p>
                        </section>

                        <p className="text-sm text-gray-500 dark:text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">
                            Last updated: May 2026
                        </p>
                    </div>
                </>
            )}

            <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-500">
                    {isAr ? "اطّلع أيضاً:" : "See also:"}{" "}
                    <Link href={`/${locale}/terms`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        {tf("terms_of_service")}
                    </Link>
                    {" · "}
                    <Link href={`/${locale}/privacy`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        {tf("privacy_policy")}
                    </Link>
                    {" · "}
                    <Link href={`/${locale}/community-guidelines`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                        {tf("community_guidelines")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
