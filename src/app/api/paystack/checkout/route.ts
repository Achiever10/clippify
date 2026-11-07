import { NextRequest, NextResponse } from "next/server";
import { createPendingCampaign } from "@/app/api/_lib/campaign-checkout";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const pending = await createPendingCampaign(request, "paystack");
    if (!pending.ok) return pending.response;

    const { campaignRef, total } = pending.campaign;
    await campaignRef.update({ paymentReference: campaignRef.id });
    return NextResponse.json({
      campaignId: campaignRef.id,
      reference: campaignRef.id,
      amount: total,
    });
  } catch (error) {
    console.error("Paystack checkout failed:", error);
    const message = error instanceof Error ? error.message : "Couldn't start checkout. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
