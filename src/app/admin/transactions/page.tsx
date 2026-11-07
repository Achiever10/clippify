"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, DollarSign, ShieldAlert, Wallet, XCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { subscribeToAllTransactions, type Transaction, type TransactionStatus } from "@/lib/transactions";

const statusStyle: Record<TransactionStatus, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const typeLabel: Record<Transaction["type"], string> = {
  campaign: "Campaign",
  clip_license: "Clip license",
};

const filters: { label: string; value: "all" | TransactionStatus }[] = [
  { label: "All", value: "all" },
  { label: "Successful", value: "success" },
  { label: "Failed", value: "failed" },
];

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<"all" | TransactionStatus>("all");

  useEffect(() => {
    const unsubscribe = subscribeToAllTransactions((next) => {
      setTransactions(next);
      setLoading(false);
      setLoadError("");
    }, (error) => {
      setLoading(false);
      setLoadError(error.message || "Couldn't load transactions.");
    });
    return () => unsubscribe();
  }, []);

  const successful = useMemo(() => transactions.filter((t) => t.status === "success"), [transactions]);
  const failed = useMemo(() => transactions.filter((t) => t.status === "failed"), [transactions]);
  const totalVolume = useMemo(() => successful.reduce((sum, t) => sum + t.amount, 0), [successful]);

  const visible = filter === "all" ? transactions : transactions.filter((t) => t.status === filter);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Payment records platform-wide — campaigns and clip licenses, successful and failed.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Total Volume" value={`₦${totalVolume.toFixed(2)}`} />
        <StatCard icon={CheckCircle2} label="Successful" value={String(successful.length)} />
        <StatCard icon={XCircle} label="Failed" value={String(failed.length)} />
        <StatCard icon={DollarSign} label="Total Records" value={String(transactions.length)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.value
                ? "bg-amber-500 text-black"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500 dark:border-white/10 dark:border-t-yellow-400" />
        </div>
      ) : loadError ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          Couldn&apos;t load transactions: {loadError}
        </p>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ShieldAlert}
            title="No transactions yet"
            text="Payment records for campaigns and clip licenses will show up here."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100 bg-white dark:border-white/10 dark:bg-[#111]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/10">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {t.userName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                    {typeLabel[t.type]}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-500 dark:text-slate-400">
                    {t.relatedTitle ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                    {t.provider}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                    ₦{t.amount.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyle[t.status]}`}>
                      {t.status}
                    </span>
                    {t.status === "failed" && t.failureReason && (
                      <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400">{t.failureReason}</p>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400 sm:table-cell">
                    {t.createdAt ? t.createdAt.toDate().toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
