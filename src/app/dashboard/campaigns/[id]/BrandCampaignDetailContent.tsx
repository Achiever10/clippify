"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, ExternalLink, Loader2, Pencil, RefreshCw } from "lucide-react";
import EmptyState from "@/components/dashboard/EmptyState";
import BudgetBar from "@/components/dashboard/BudgetBar";
import CampaignParticipants from "@/components/dashboard/CampaignParticipants";
import ParticipationRequestList from "@/components/dashboard/ParticipationRequestList";
import { btnPrimary, btnSecondary } from "@/lib/button-styles";
import {
  subscribeToCampaign,
  updateCampaignDetails,
  updateCampaignPayout,
  updateCampaignStatus,
  type Campaign,
  type CampaignStatus,
} from "@/lib/firebase-helpers";
import { setClipStatus, subscribeToClipsForCampaign, type Clip } from "@/lib/clips";
import { verifyFlutterwavePayment } from "@/lib/flutterwave";
import { verifyPaystackPayment } from "@/lib/paystack";
import {
  setParticipationStatus,
  subscribeToParticipationForCampaign,
  type ParticipationRequest,
} from "@/lib/participation";

const statusOptions: CampaignStatus[] = ["draft", "active", "completed", "cancelled"];

const statusStyle: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  awaiting_payment: "bg-amber-100 text-amber-700 dark:bg-yellow-400/10 dark:text-yellow-400",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  completed: "bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30 dark:border-white/10 dark:bg-white/5 dark:text-white";
const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-300";

export default function BrandCampaignDetailContent() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [clips, setClips] = useState<Clip[]>([]);
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [clipError, setClipError] = useState("");
  const [requestBusy, setRequestBusy] = useState<Record<string, boolean>>({});
  const [requestError, setRequestError] = useState("");
  const [payoutDraft, setPayoutDraft] = useState<string | null>(null);
  const [savingPayout, setSavingPayout] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [channelLink, setChannelLink] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return subscribeToCampaign(id, setCampaign);
  }, [id]);

  useEffect(() => {
    return subscribeToClipsForCampaign(id, setClips);
  }, [id]);

  useEffect(() => {
    return subscribeToParticipationForCampaign(id, setRequests);
  }, [id]);

  const startEditing = () => {
    if (!campaign) return;
    setTitle(campaign.title);
    setBrief(campaign.brief);
    setDeadline(campaign.deadline);
    setChannelLink(campaign.channelLink);
    setEditing(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    setDetailError("");
    try {
      await updateCampaignDetails(id, {
        title: title.trim(),
        brief,
        deadline,
        channelLink: channelLink.trim(),
      });
      setEditing(false);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Couldn't save those changes.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: CampaignStatus) => {
    if (!campaign || status === campaign.status) return;
    setSavingStatus(true);
    setDetailError("");
    try {
      await updateCampaignStatus(id, status);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Couldn't update the campaign status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const checkPayment = async () => {
    setCheckingPayment(true);
    setPaymentMessage("");
    try {
      const result = campaign?.paymentProvider === "paystack"
        ? await verifyPaystackPayment(id)
        : await verifyFlutterwavePayment(id);
      if (!result.ok) setPaymentMessage(result.error);
      else if (result.verified) setPaymentMessage("Payment confirmed — campaign is now live.");
      else setPaymentMessage("No successful payment found yet. If you just paid, this can take a minute — try again shortly.");
    } finally {
      setCheckingPayment(false);
    }
  };

  const savePayout = async () => {
    if (!campaign || payoutDraft === null || payoutDraft === "") return;
    const amount = Number(payoutDraft);
    if (!Number.isFinite(amount) || amount === campaign.payoutPerClip) {
      setPayoutDraft(null);
      return;
    }
    setSavingPayout(true);
    setDetailError("");
    try {
      await updateCampaignPayout(id, amount);
      setPayoutDraft(null);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Couldn't update the payout.");
    } finally {
      setSavingPayout(false);
    }
  };

  const resolveClip = async (clip: Clip, status: "approved" | "rejected") => {
    setRowBusy((b) => ({ ...b, [clip.id]: true }));
    setClipError("");
    try {
      await setClipStatus(clip, status);
    } catch (error) {
      setClipError(error instanceof Error ? error.message : "Couldn't resolve that clip.");
    } finally {
      setRowBusy((b) => ({ ...b, [clip.id]: false }));
    }
  };

  const resolveRequest = async (participationRequest: ParticipationRequest, status: "approved" | "rejected") => {
    setRequestBusy((b) => ({ ...b, [participationRequest.id]: true }));
    setRequestError("");
    try {
      await setParticipationStatus(participationRequest, status);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Couldn't resolve that request.");
    } finally {
      setRequestBusy((b) => ({ ...b, [participationRequest.id]: false }));
    }
  };

  if (campaign === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500 dark:border-white/10 dark:border-t-yellow-400" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={ClipboardList} title="Campaign not found" text="It may have been removed." />
        <Link href="/dashboard/campaigns" className="mt-4 flex items-center gap-1.5 text-sm text-amber-600 hover:underline dark:text-yellow-400">
          <ArrowLeft className="h-4 w-4" /> Back to My Campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/campaigns" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to My Campaigns
      </Link>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-white/10 dark:bg-[#111]">
        {campaign.flyerUrl ? (
          <div className="relative h-48 w-full bg-slate-100 dark:bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.flyerUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-slate-100 dark:bg-white/5">
            <ClipboardList className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            {editing ? (
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-0 text-lg font-bold`} />
            ) : (
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{campaign.title}</h1>
            )}
            <select
              value={campaign.status}
              onChange={(e) => changeStatus(e.target.value as CampaignStatus)}
              disabled={campaign.status === "awaiting_payment" || savingStatus}
              className={`shrink-0 rounded-full border-0 px-2.5 py-1 text-xs font-medium capitalize disabled:opacity-60 ${statusStyle[campaign.status]}`}
            >
              {campaign.status === "awaiting_payment" && <option value="awaiting_payment">awaiting payment</option>}
              {statusOptions.map((s) => (
                <option key={s} value={s} className="bg-white text-slate-900 dark:bg-[#111] dark:text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {campaign.status === "awaiting_payment" &&
            (campaign.paymentProvider === "flutterwave" || campaign.paymentProvider === "paystack") && (
            <button
              onClick={checkPayment}
              disabled={checkingPayment}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline disabled:opacity-60 dark:text-yellow-400"
            >
              {checkingPayment ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Check payment status
            </button>
          )}
          {paymentMessage && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{paymentMessage}</p>
          )}

          {detailError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {detailError}
            </p>
          )}

          {editing ? (
            <div>
              <label className={labelClass}>Channel link</label>
              <input value={channelLink} onChange={(e) => setChannelLink(e.target.value)} className={inputClass} />
            </div>
          ) : (
            campaign.channelLink && (
              <a
                href={campaign.channelLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1.5 text-sm text-amber-600 hover:underline dark:text-yellow-400"
              >
                {campaign.channelLink}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )
          )}

          {editing ? (
            <div className="mt-4">
              <label className={labelClass}>Brief</label>
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} className={`${inputClass} resize-none`} />
            </div>
          ) : (
            campaign.brief && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{campaign.brief}</p>
          )}

          {editing ? (
            <div className="mt-4">
              <label className={labelClass}>Deadline</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
            </div>
          ) : (
            campaign.deadline && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Deadline: {campaign.deadline}</p>
          )}

          <div className="mt-4 flex gap-2">
            {editing ? (
              <>
                <button onClick={saveEdits} disabled={saving} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${btnPrimary}`}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
                <button onClick={() => setEditing(false)} disabled={saving} className={`rounded-lg px-4 py-2 text-sm ${btnSecondary}`}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={startEditing} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm ${btnSecondary}`}>
                <Pencil className="h-3.5 w-3.5" />
                Edit details
              </button>
            )}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
            <BudgetBar campaign={campaign} />
            <p className="mt-2 text-xs text-slate-400">
              Budget can&apos;t be changed after posting — it was already charged at checkout.
            </p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Payout per approved clip</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-900 dark:text-white">₦</span>
                <input
                  value={payoutDraft ?? String(campaign.payoutPerClip)}
                  onChange={(e) => setPayoutDraft(e.target.value)}
                  onBlur={savePayout}
                  disabled={savingPayout}
                  className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
            </div>
          </div>

          {(() => {
            const pendingRequests = requests.filter((r) => r.status === "pending");
            return (
              <div className="mt-6 border-t border-slate-100 pt-4 dark:border-white/10">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {requests.length === 0
                    ? "Participation requests"
                    : `${requests.length} participation ${requests.length === 1 ? "request" : "requests"}`}
                  {pendingRequests.length > 0 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-yellow-400/10 dark:text-yellow-400">
                      {pendingRequests.length} pending
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  A creator can&apos;t submit a clip until you approve their request here.
                </p>
                <div className="mt-3">
                  {requests.length === 0 ? (
                    <p className="text-sm text-slate-400">No one has asked to join this campaign yet.</p>
                  ) : (
                    <ParticipationRequestList
                      requests={requests}
                      busy={requestBusy}
                      error={requestError}
                      onResolve={resolveRequest}
                    />
                  )}
                </div>
              </div>
            );
          })()}

          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-white/10">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {clips.length} {clips.length === 1 ? "participant" : "participants"}
            </p>
            <div className="mt-3">
              {clips.length === 0 ? (
                <p className="text-sm text-slate-400">No one has submitted a clip to this campaign yet.</p>
              ) : (
                <CampaignParticipants clips={clips} busy={rowBusy} error={clipError} onResolve={resolveClip} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
