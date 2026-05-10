import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Wallet, Gift, Receipt, ArrowUpRight, ArrowDownLeft, ChevronLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Wallet — Saha" };

type Tx = {
    id: string;
    amount_aed: number;
    reason: "booking_milestone" | "spend" | "refund" | "admin";
    booking_id: string | null;
    created_at: string;
};

export default async function WalletPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("wallet");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // SAH-125: wallet credit is a player loyalty feature. Owners and admins
    // are redirected to their own workspace.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRow } = await (supabase as any)
        .from("profiles").select("role").eq("id", user.id).single();
    if (roleRow?.role === "business") redirect(`/${locale}/dashboard`);
    if (roleRow?.role === "admin") redirect(`/${locale}/admin`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: walletRow } = await (supabase as any)
        .from("wallet_balances")
        .select("credit_aed, bookings_at_last_award")
        .eq("user_id", user.id)
        .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ledger } = await (supabase as any)
        .from("wallet_transactions")
        .select("id, amount_aed, reason, booking_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    const balance = Number(walletRow?.credit_aed ?? 0);
    const transactions = (ledger ?? []) as Tx[];

    // Count completed bookings to show "X / 10" progress to next reward.
    const { count: completedCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("player_id", user.id)
        .eq("status", "completed");

    const lastAwardCount = walletRow?.bookings_at_last_award ?? 0;
    const sinceLastAward = (completedCount ?? 0) - lastAwardCount;
    const progress = Math.min(10, Math.max(0, sinceLastAward));

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            <Link
                href={`/${locale}/account`}
                className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
                <ChevronLeft className="h-4 w-4" />
                {t("back_to_account")}
            </Link>

            {/* Balance hero */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-2 opacity-80">
                    <Wallet className="h-4 w-4" />
                    <p className="text-sm font-medium">{t("card_title")}</p>
                </div>
                <p className="text-4xl font-bold tabular-nums">
                    {formatPrice(balance, "AED", locale)}
                </p>
                <p className="text-sm opacity-90 mt-2">
                    {balance > 0 ? t("hero_hint_balance") : t("hero_hint_zero")}
                </p>
            </div>

            {/* Progress bar */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Gift className="h-4 w-4 text-emerald-500" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t("progress_title")}</p>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(progress / 10) * 100}%` }}
                    />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t("progress_text", { current: progress, target: 10 })}
                </p>
            </div>

            {/* How it works */}
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/50 rounded-xl p-4 text-sm text-emerald-900 dark:text-emerald-200 space-y-1">
                <p className="font-semibold">{t("how_it_works_title")}</p>
                <p className="text-emerald-800 dark:text-emerald-300 text-xs">{t("how_it_works_body")}</p>
            </div>

            {/* Ledger */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-gray-400" />
                    <h2 className="font-semibold text-gray-900 dark:text-white">{t("ledger_title")}</h2>
                </div>
                {transactions.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-center text-gray-500 dark:text-gray-400">
                        {t("ledger_empty")}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {transactions.map((tx) => {
                            const isCredit = tx.amount_aed > 0;
                            return (
                                <li key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                                            isCredit
                                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                                        }`}>
                                            {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                {t(`reason_${tx.reason}`)}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {format(new Date(tx.created_at), "MMM d, yyyy · HH:mm")}
                                            </p>
                                        </div>
                                    </div>
                                    <p className={`tabular-nums font-semibold text-sm shrink-0 ${
                                        isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white"
                                    }`}>
                                        {isCredit ? "+" : ""}{formatPrice(tx.amount_aed, "AED", locale)}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
