"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, ExternalLink, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import RequireAuth from "@/components/dashboard/RequireAuth";
import { useAuth } from "@/lib/auth/auth-context";
import EmptyState from "@/components/dashboard/EmptyState";
import BudgetBar from "@/components/dashboard/BudgetBar";
import ClipApprovalList from "@/components/dashboard/ClipApprovalList";
import { btnPrimary } from "@/lib/button-styles";
import {
  subscribeToCampaignsForUser,
  updateCampaignPayout,
  updateCampaignStatus,
  type Campaign,
  type CampaignStatus,
} from "@/lib/firebase-helpers";
import { setClipStatus, subscribeToClipsForCampaigns, type Clip } from "@/lib/clips";
import { verifyFlutterwavePayment } from "@/lib/flutterwave";
import { verifyPaystackPayment } from "@/lib/paystack";

const statusOptions: CampaignStatus[] = ["draft", "active", "completed", "cancelled"];
const filterOptions: Array<CampaignStatus | "all"> = ["all", "draft", "awaiting_payment", "active", "completed", "cancelled"];
type SortOption = "newest" | "budget-desc" | "budget-asc" | "title";

const statusStyle: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  awaiting_payment: "bg-amber-100 text-amber-700 dark:bg-yellow-400/10 dark:text-yellow-400",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  completed: "bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30 dark:border-white/10 dark:bg-white/5 dark:text-white";

export default function MyCampaignsPage() {
  return (
    <RequireAuth area="brand">
      <Suspense fallback={null}>
        <MyCampaignsContent />
      </Suspense>
    </RequireAuth>
  );
}

function MyCampaignsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [entries, setEntries] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [payoutDrafts, setPayoutDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [verifyingPaymentFor, setVerifyingPaymentFor] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToCampaignsForUser(user.id, (next) => {
      setCampaigns(next);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Flutterwave's redirect back from checkout carries ?paid=<campaignId> — the
  // dashboard webhook (see src/app/api/flutterwave/webhook) is what's *supposed* to
  // activate the campaign, but its delivery depends on a Flutterwave dashboard setting
  // this app can't guarantee is configured. Checking directly against Flutterwave's
  // own records the moment the brand lands back here means a paid campaign doesn't
  // depend solely on that webhook ever arriving.
  useEffect(() => {
    const paidId = searchParams.get("paid");
    if (!paidId) return;
    router.replace("/dashboard/campaigns");
    checkFlutterwavePayment(paidId, "Payment confirmed — your campaign is live.");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the id present on first render
  }, []);

  const checkFlutterwavePayment = async (campaignId: string, successMessage: string) => {
    setVerifyingPaymentFor(campaignId);
    setPaymentMessage("");
    try {
      const result = await verifyFlutterwavePayment(campaignId);
      if (!result.ok) {
        setPaymentMessage(result.error);
      } else if (result.verified) {
        setPaymentMessage(successMessage);
      } else {
        setPaymentMessage("No successful payment found yet for that campaign. If you just paid, this can take a minute — try again shortly.");
      }
    } finally {
      setVerifyingPaymentFor(null);
    }
  };

  const checkPaystackPayment = async (campaignId: string) => {
    setVerifyingPaymentFor(campaignId);
    setPaymentMessage("");
    try {
      const result = await verifyPaystackPayment(campaignId);
      if (!result.ok) {
        setPaymentMessage(result.error);
      } else if (result.verified) {
        setPaymentMessage("Payment confirmed — your campaign is live.");
      } else {
        setPaymentMessage("No successful payment found yet. If you just paid, try again shortly.");
      }
    } finally {
      setVerifyingPaymentFor(null);
    }
  };

  // One `in` query per 30 campaigns (not one listener per campaign, and not "all
  // clips, filter client-side") so this only reads clips on this brand's campaigns.
  const campaignIds = campaigns.map((c) => c.id).sort().join(",");
  useEffect(() => {
    const ids = campaignIds ? campaignIds.split(",") : [];
    return subscribeToClipsForCampaigns(ids, setEntries);
  }, [campaignIds]);

  const visibleCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = campaigns;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (term) list = list.filter((c) => c.title.toLowerCase().includes(term));
    const sorted = [...list];
    if (sort === "budget-desc") sorted.sort((a, b) => b.budget - a.budget);
    else if (sort === "budget-asc") sorted.sort((a, b) => a.budget - b.budget);
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [campaigns, search, statusFilter, sort]);

  const changeStatus = async (campaign: Campaign, status: CampaignStatus) => {
    if (status === campaign.status) return;
    setRowBusy((b) => ({ ...b, [campaign.id]: true }));
    try {
      await updateCampaignStatus(campaign.id, status);
    } finally {
      setRowBusy((b) => ({ ...b, [campaign.id]: false }));
    }
  };

  const savePayout = async (campaign: Campaign) => {
    const draft = payoutDrafts[campaign.id];
    if (draft === undefined) return;
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount === campaign.payoutPerClip) return;
    setRowBusy((b) => ({ ...b, [campaign.id]: true }));
    try {
      await updateCampaignPayout(campaign.id, amount);
    } finally {
      setRowBusy((b) => ({ ...b, [campaign.id]: false }));
    }
  };

  const resolveClip = async (clip: Clip, status: "approved" | "rejected") => {
    setRowBusy((b) => ({ ...b, [clip.id]: true }));
    setRowError((e) => ({ ...e, [clip.campaignId ?? clip.id]: "" }));
    try {
      await setClipStatus(clip, status);
    } catch (error) {
      setRowError((e) => ({
        ...e,
        [clip.campaignId ?? clip.id]: error instanceof Error ? error.message : "Couldn't resolve that clip.",
      }));
    } finally {
      setRowBusy((b) => ({ ...b, [clip.id]: false }));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">My Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your campaigns and approve or reject the clips streamers submit to each one.
          </p>
        </div>
        <Link
          href="/dashboard/post-job"
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm ${btnPrimary}`}
        >
          <Plus className="h-4 w-4" />
          Post a Campaign
        </Link>
      </div>

      {paymentMessage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-yellow-400/10 dark:text-yellow-400">
          {paymentMessage}
        </p>
      )}

      {campaigns.length > 0 && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your campaigns…"
              className={`${inputClass} pl-10`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "all")}
            className={`${inputClass} sm:w-40`}
          >
            {filterOptions.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s === "all" ? "All statuses" : s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className={`${inputClass} sm:w-44`}>
            <option value="newest">Newest first</option>
            <option value="budget-desc">Budget: high to low</option>
            <option value="budget-asc">Budget: low to high</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500 dark:border-white/10 dark:border-t-yellow-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardList}
            title="No campaigns yet"
            text="Once you post a campaign, it'll show up here with its status and details."
          />
        </div>
      ) : visibleCampaigns.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Search} title="No matching campaigns" text="Try a different search or filter." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCampaigns.map((c) => (
            <div
              key={c.id}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-100 dark:border-white/10 dark:bg-[#111] dark:shadow-none"
            >
              <Link href={`/dashboard/campaigns/${c.id}`}>
                {c.flyerUrl ? (
                  <div className="relative h-36 w-full bg-slate-100 dark:bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.flyerUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-36 w-full items-center justify-center bg-slate-100 dark:bg-white/5">
                    <ClipboardList className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
              </Link>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/dashboard/campaigns/${c.id}`} className="hover:underline">
                    <p className="font-semibold text-slate-900 dark:text-white">{c.title}</p>
                  </Link>
                  <select
                    value={c.status}
                    onChange={(e) => changeStatus(c, e.target.value as CampaignStatus)}
                    disabled={rowBusy[c.id] || c.status === "awaiting_payment"}
                    className={`shrink-0 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium capitalize disabled:opacity-60 ${statusStyle[c.status]}`}
                  >
                    {c.status === "awaiting_payment" && (
                      <option value="awaiting_payment">awaiting payment</option>
                    )}
                    {statusOptions.map((s) => (
                      <option key={s} value={s} className="bg-white text-slate-900 dark:bg-[#111] dark:text-white">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <a
                  href={c.channelLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-amber-600 hover:underline dark:text-yellow-400"
                >
                  <span className="max-w-[220px] truncate">{c.channelLink}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>

                <BudgetBar campaign={c} className="mt-3" />
                {c.deadline && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{c.deadline}</p>}

                {c.status === "awaiting_payment" &&
                  (c.paymentProvider === "flutterwave" || c.paymentProvider === "paystack") && (
                  <button
                    onClick={() =>
                      c.paymentProvider === "paystack"
                        ? checkPaystackPayment(c.id)
                        : checkFlutterwavePayment(c.id, "Payment confirmed — campaign is now live.")
                    }
                    disabled={verifyingPaymentFor === c.id}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline disabled:opacity-60 dark:text-yellow-400"
                  >
                    {verifyingPaymentFor === c.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Check payment status
                  </button>
                )}

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-white/10">
                  <span className="text-slate-500 dark:text-slate-400">Payout per approved clip</span>
                  <div className="flex items-center gap-1 text-slate-900 dark:text-white">
                    <span>₦</span>
                    <input
                      value={payoutDrafts[c.id] ?? String(c.payoutPerClip)}
                      onChange={(e) => setPayoutDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      onBlur={() => savePayout(c)}
                      disabled={rowBusy[c.id]}
                      placeholder="0"
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                    />
                  </div>
                </div>

                {(() => {
                  const clipEntries = entries.filter((entry) => entry.campaignId === c.id);
                  if (clipEntries.length === 0) return null;
                  return (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-white/10">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {clipEntries.length} {clipEntries.length === 1 ? "clip" : "clips"} submitted
                      </p>
                      <ClipApprovalList
                        clips={clipEntries}
                        busy={rowBusy}
                        error={rowError[c.id]}
                        onResolve={resolveClip}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
