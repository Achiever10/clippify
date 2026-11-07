import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getInitials } from "@/lib/firebase-helpers";

// Creator-only platform XP — earned exclusively through campaign participation
// (there's no other creator action loop in this app to award XP for). Stored in its
// own top-level `leaderboard` collection, one doc per creator, rather than on
// `users/{uid}` directly: the leaderboard needs every creator to be able to read
// every *other* creator's name/xp, and `users/{uid}` is owner-only-readable (see
// firestore-rules-gotchas memory) — broadening that would leak email and other
// profile fields to any signed-in user. This collection carries only what's meant to
// be public.
//
// XP is a cosmetic leaderboard number with no real monetary value (unlike campaign
// budgets or payouts), so its Firestore rule is deliberately a bounded-increment check
// rather than full server-side validation tying every award to one specific real
// event — a proportionate tradeoff, not an oversight. See firestore.rules's
// `leaderboard` match block.
export const XP_REWARDS = {
  participationRequested: 5,
  participationApproved: 20,
  clipApproved: 75,
} as const;

export const XP_PER_LEVEL = 100;

export function levelForXp(xp: number) {
  return Math.floor(Math.max(xp, 0) / XP_PER_LEVEL) + 1;
}

export function xpProgress(xp: number) {
  const safeXp = Math.max(xp, 0);
  const xpIntoLevel = safeXp % XP_PER_LEVEL;
  return {
    level: levelForXp(safeXp),
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
    pct: (xpIntoLevel / XP_PER_LEVEL) * 100,
  };
}

export type LeaderboardEntry = {
  id: string;
  name: string;
  initials: string;
  xp: number;
};

// Meant to be called fire-and-forget (like createNotification elsewhere) — a failed
// XP award should never block the real action (requesting to participate, approving a
// request/clip) from succeeding. Still throws on a real failure so the caller's own
// .catch() logs it, same convention as createNotification; only the "doc doesn't
// exist yet" case is handled internally, since that's expected on a creator's first
// award, not an error.
export async function awardXp(uid: string, name: string, amount: number) {
  const ref = doc(db, "leaderboard", uid);
  // A failed update used to fall through to setDoc and replace the whole doc, which
  // reset a creator's XP to just this award whenever the failure was anything other
  // than "doc doesn't exist yet" (rules, offline, a concurrent write). The transaction
  // only creates on a real miss and otherwise increments, so those failures throw
  // instead of wiping the score. Rules still require create xp <= 100 and updates to
  // touch only `xp` by at most +100 — every XP_REWARDS value is inside that bound.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { name, initials: getInitials(name), xp: amount });
      return;
    }
    tx.update(ref, { xp: increment(amount) });
  });
}

export function subscribeToMyXp(uid: string, callback: (xp: number) => void) {
  return onSnapshot(
    doc(db, "leaderboard", uid),
    (snap) => callback(snap.exists() ? ((snap.data().xp as number) ?? 0) : 0),
    (error) => {
      console.error("XP listener error:", error);
      callback(0);
    },
  );
}

export function subscribeToLeaderboard(callback: (entries: LeaderboardEntry[]) => void, top = 50) {
  // A bare orderBy with no where clause needs no composite index — see
  // firestore-rules-gotchas memory.
  const q = query(collection(db, "leaderboard"), orderBy("xp", "desc"), limit(top));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LeaderboardEntry)),
    (error) => {
      console.error("Leaderboard listener error:", error);
      callback([]);
    },
  );
}
