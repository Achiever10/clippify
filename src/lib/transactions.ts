import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TransactionType = "campaign" | "clip_license";
export type TransactionStatus = "success" | "failed";

export type Transaction = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  userId: string;
  userName: string;
  amount: number;
  provider: string;
  reference?: string;
  failureReason?: string;
  relatedTitle?: string;
  createdAt: Timestamp | null;
};

export function subscribeToAllTransactions(
  callback: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)),
    (error) => {
      console.error("Transactions listener error:", error);
      onError?.(error);
    },
  );
}
