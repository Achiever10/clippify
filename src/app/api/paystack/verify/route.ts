import { NextRequest, NextResponse } from "next/server";
import { activatePaidCampaign } from "@/app/api/_lib/campaign-checkout";
import { adminAuth, adminDb } from "@/app/api/_lib/firebase-admin";
import { verifyPaystackReference } from "@/app/api/_lib/paystack";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return NextResponse.json({ error: "Missing campaignId." }, { status: 400 });

  const db = adminDb();
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const campaignSnap = await campaignRef.get();
  const campaign = campaignSnap.data();
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const userSnap = await db.collection("users").doc(uid).get();
  const isOwner = campaign.brandId === uid;
  const isAdmin = userSnap.data()?.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You don't have access to this campaign." }, { status: 403 });
  }

  if (campaign.status !== "awaiting_payment") {
    return NextResponse.json({ status: campaign.status, verified: campaign.status === "active" });
  }
  if (campaign.paymentProvider !== "paystack" || typeof campaign.paymentReference !== "string") {
    return NextResponse.json({ error: "This campaign wasn't paid for with Paystack." }, { status: 400 });
  }

  const payment = await verifyPaystackReference(campaign.paymentReference);
  if (!payment || payment.status !== "success") {
    return NextResponse.json({ status: "awaiting_payment", verified: false });
  }

  const result = await activatePaidCampaign({
    eventsCollection: "paystackEvents",
    eventId: String(payment.id),
    reference: campaignId,
    paymentReference: payment.reference,
    currency: payment.currency,
    amount: payment.amount,
    provider: "paystack",
  });

  if (!result.matched) {
    const after = await campaignRef.get();
    const status = after.data()?.status ?? "awaiting_payment";
    return NextResponse.json({ status, verified: status === "active" });
  }

  return NextResponse.json({ status: "active", verified: true });
}
