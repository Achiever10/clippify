// Thin wrapper around Paystack's Inline JS popup (https://js.paystack.co/v1/inline.js).
// The "key" used here is the PUBLIC key, which is safe to ship to the browser — this
// mirrors how Paystack's own client-side integration guide works. The callback is
// never trusted as proof of payment; the campaign is activated only after the server
// verifies the reference with Paystack's secret key.

import { auth } from "@/lib/firebase";

export type PaystackVerifyResult =
  | { ok: true; status: string; verified: boolean }
  | { ok: false; error: string };

type PaystackHandler = { openIframe: () => void };

type PaystackSetupOptions = {
  key: string;
  email: string;
  amount: number;
  currency?: string;
  ref?: string;
  onClose: () => void;
  callback: (response: { reference: string }) => void;
};

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackSetupOptions) => PaystackHandler;
    };
  }
}

const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";
let scriptPromise: Promise<void> | null = null;

function loadPaystackScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paystack checkout is only available in the browser."));
  }
  if (window.PaystackPop) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack.")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Paystack. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Opens the Paystack popup for a one-off charge. Resolves with the transaction
 * reference on success, or `null` if the shopper closes the popup without paying.
 * `amountNaira` is converted to kobo (Paystack's `amount` is always in the currency's
 * smallest unit — 1 Naira = 100 kobo) before being sent.
 */
export async function payWithPaystack({
  publicKey,
  email,
  amountNaira,
  reference,
  currency = "NGN",
}: {
  publicKey: string;
  email: string;
  amountNaira: number;
  reference: string;
  currency?: string;
}): Promise<{ reference: string } | null> {
  await loadPaystackScript();
  if (!window.PaystackPop) {
    throw new Error("Paystack failed to load. Please try again.");
  }

  return new Promise((resolve, reject) => {
    try {
      const handler = window.PaystackPop!.setup({
        key: publicKey,
        email,
        amount: Math.round(amountNaira * 100),
        currency,
        ref: reference,
        onClose: () => resolve(null),
        callback: (response) => resolve({ reference: response.reference }),
      });
      handler.openIframe();
    } catch {
      reject(new Error("Couldn't open Paystack. Check that the public key is valid."));
    }
  });
}

export async function verifyPaystackPayment(campaignId: string): Promise<PaystackVerifyResult> {
  if (!auth.currentUser) return { ok: false, error: "You're not signed in." };
  try {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch("/api/paystack/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ campaignId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data.error || "Couldn't check payment status. Try again." };
    return { ok: true, status: data.status, verified: !!data.verified };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Try again." };
  }
}
