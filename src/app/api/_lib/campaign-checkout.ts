import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/api/_lib/firebase-admin";

// Shared by every "redirect to a hosted checkout" provider's checkout route (Bachs,
// Flutterwave, and any future one) — the auth check, request validation, and
// server-computed total are identical regardless of which provider ends up
// processing the payment; only the actual checkout-session creation call differs.
export type PendingCampaign = {
  campaignRef: DocumentReference;
  total: number;
  uid: string;
  brandName: string;
  brandEmail: string;
};

export async function createPendingCampaign(
  request: NextRequest,
  provider: string,
): Promise<{ ok: true; campaign: PendingCampaign } | { ok: false; response: NextResponse }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { ok: false, response: NextResponse.json({ error: "Sign in to post a campaign." }, { status: 401 }) };

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 }) };
  }

  const db = adminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.data();
  if (!user || (user.role !== "brand" && user.role !== "both")) {
    return { ok: false, response: NextResponse.json({ error: "Only brand accounts can post campaigns." }, { status: 403 }) };
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const channelLink = typeof body?.channelLink === "string" ? body.channelLink.trim() : "";
  const brief = typeof body?.brief === "string" ? body.brief : "";
  const deadline = typeof body?.deadline === "string" ? body.deadline : "";
  const flyerUrl = typeof body?.flyerUrl === "string" ? body.flyerUrl : "";
  const budget = Number(body?.budget);
  if (!title || !channelLink || !Number.isFinite(budget) || budget <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Fill in the campaign title, channel link, and budget." }, { status: 400 }),
    };
  }

  const settingsSnap = await db.collection("settings").doc("public").get();
  const settings = settingsSnap.data() ?? {};
  const feeRate = parseFloat(settings.campaignProcessingFee ?? "5") / 100;
  const minBudget = parseFloat(settings.minCampaignBudget ?? "1000");
  const liveProviders = settings.liveProviders;
  if (!Array.isArray(liveProviders) || !liveProviders.includes(provider)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "This payment method is currently unavailable." }, { status: 400 }),
    };
  }
  if (!Number.isFinite(feeRate) || feeRate < 0 || !Number.isFinite(minBudget) || minBudget <= 0 || budget < minBudget) {
    return {
      ok: false,
      response: NextResponse.json({ error: `Campaign budget must be at least ₦${minBudget}.` }, { status: 400 }),
    };
  }

  // Computed here, never trusted from the client — the webhook later checks the
  // amount actually collected against this exact figure.
  const total = Math.round((budget + budget * feeRate) * 100) / 100;

  const campaignRef = db.collection("campaigns").doc();
  await campaignRef.set({
    brandId: uid,
    brandName: user.name ?? "",
    title,
    channelLink,
    brief,
    budget,
    deadline,
    flyerUrl,
    status: "awaiting_payment",
    payoutPerClip: 0,
    spent: 0,
    amountDue: total,
    paymentProvider: provider,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, campaign: { campaignRef, total, uid, brandName: user.name ?? "", brandEmail: user.email ?? "" } };
}

/**
 * Shared by every provider's webhook route: dedup the event, confirm it matches a
 * payable campaign exactly (reference, the provider's own payment reference,
 * currency, and amount all have to agree with what was recorded at checkout
 * creation), then activate the campaign and write the transaction record. Nothing
 * here trusts the browser — only called after a route has already verified the
 * webhook's signature against the raw body.
 */
export async function activatePaidCampaign({
  eventsCollection,
  eventId,
  reference,
  paymentReference,
  currency,
  amount,
  provider,
}: {
  eventsCollection: string;
  eventId: string;
  reference: string | undefined;
  paymentReference: string | undefined;
  currency: string | undefined;
  amount: number;
  provider: string;
}): Promise<{ matched: boolean; duplicate?: boolean }> {
  const db = adminDb();
  const campaignRef = reference ? db.collection("campaigns").doc(reference) : null;
  if (!campaignRef || !eventId) return { matched: false };

  const eventRef = db.collection(eventsCollection).doc(eventId);
  const transactionRef = db.collection("transactions").doc();
  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const campaignSnap = await tx.get(campaignRef);
    const campaign = campaignSnap.data();
    const matches =
      !!campaign &&
      campaign.paymentProvider === provider &&
      campaign.paymentReference === paymentReference &&
      currency === "NGN" &&
      Number.isFinite(amount) &&
      Math.round(amount * 100) === Math.round(Number(campaign.amountDue) * 100);

    if (!campaign || !matches) return { matched: false, ...(eventSnap.exists ? { duplicate: true } : {}) };

    if (campaign.status !== "awaiting_payment") {
      if (campaign.status !== "active") return { matched: false };
      if (!eventSnap.exists) tx.create(eventRef, { receivedAt: FieldValue.serverTimestamp() });
      return { matched: false, duplicate: true };
    }

    tx.update(campaignRef, { status: "active", paidAt: FieldValue.serverTimestamp() });
    if (!eventSnap.exists) tx.create(eventRef, { receivedAt: FieldValue.serverTimestamp() });
    tx.create(transactionRef, {
      type: "campaign",
      status: "success",
      userId: campaign.brandId,
      userName: campaign.brandName,
      amount: campaign.amountDue,
      provider,
      reference: paymentReference,
      relatedTitle: campaign.title,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { matched: true };
  });
}
