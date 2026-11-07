import { adminDb } from "@/app/api/_lib/firebase-admin";

export type PaystackVerifiedTransaction = {
  id: number;
  reference: string;
  status: string;
  amount: number;
  currency: string;
};

async function getPaystackSecret(): Promise<string | null> {
  const snap = await adminDb().collection("settings").doc("platform").get();
  const config = snap.data()?.paymentProviders?.paystack;
  const secretKey = config?.keys?.secretKey;
  return config?.enabled && typeof secretKey === "string" && secretKey ? secretKey : null;
}

export async function verifyPaystackReference(reference: string): Promise<PaystackVerifiedTransaction | null> {
  const secretKey = await getPaystackSecret();
  if (!secretKey) return null;

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store" },
  );
  const result = await response.json();
  const transaction = result?.data;
  if (
    !response.ok ||
    result?.status !== true ||
    !transaction ||
    typeof transaction.id !== "number" ||
    typeof transaction.reference !== "string" ||
    typeof transaction.status !== "string" ||
    typeof transaction.amount !== "number" ||
    typeof transaction.currency !== "string"
  ) {
    return null;
  }

  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    amount: transaction.amount / 100,
    currency: transaction.currency,
  };
}
