"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import AppLoader from "@/components/AppLoader";
import {
  completeTikTokSignIn,
  loginWithFirebase,
  logoutFromFirebase,
  registerWithFirebase,
  requestPasswordReset,
  signInWithGoogleOAuth,
  subscribeToAuth,
  type AppUser,
} from "@/lib/firebase-helpers";
import type { AppRole } from "@/lib/firebase-helpers";

type LoginResult = { ok: true; user: AppUser } | { ok: false; error: string };

export function getDashboardRouteForRole(role?: AppRole | null) {
  if (role === "admin") return "/admin";
  if (role === "brand" || role === "both") return "/dashboard?view=brand";
  if (role === "creator") return "/dashboard?view=creator";
  return "/dashboard";
}

type AuthState = {
  user: AppUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (input: {
    name: string;
    username?: string;
    email: string;
    password: string;
    role: Exclude<AppRole, "admin">;
  }) => Promise<AppUser>;
  signInWithGoogle: (role?: Exclude<AppRole, "admin">) => Promise<LoginResult>;
  // Takes the Firebase custom token TikTok login hands back via a URL fragment (see
  // src/app/api/tiktok/callback's intent=login branch) — there's no popup step here,
  // unlike Google, since the OAuth round-trip already happened server-side.
  signInWithTikTok: (customToken: string, role?: Exclude<AppRole, "admin">) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getDashboardRoute: (role?: AppRole | null) => string;
  sendPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const AuthContext = createContext<AuthState | null>(null);

function shouldHoldForAuth(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname === "/signup"
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks the uid of the most recent profile we know for certain is real (read or
  // written directly against Firestore), so a late-arriving "no profile doc yet"
  // event from the background listener — expected right after signup, before its
  // write has landed — can't clobber it back to a default role. See subscribeToAuth().
  const realProfileUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((nextUser, firebaseUser, isSynthetic) => {
      // A late synthetic update after we've already confirmed the real profile for
      // this uid — ignore it outright (isLoading is already false by this point).
      if (isSynthetic && firebaseUser && realProfileUidRef.current === firebaseUser.uid) {
        return;
      }
      realProfileUidRef.current = !isSynthetic && firebaseUser ? firebaseUser.uid : null;
      setUser(nextUser);
      // Don't end the loading state on a synthetic (role defaults to "creator", not
      // yet confirmed against Firestore) profile — RequireAuth gates page access on
      // `user.role` the instant isLoading goes false, so ending it early here let a
      // real brand/creator user get redirected away from their own role's pages on a
      // cold load / hard refresh, before the real profile had a chance to arrive.
      if (!isSynthetic || !firebaseUser) {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const nextUser = await loginWithFirebase(email.trim(), password);
      if (!nextUser) {
        return { ok: false, error: "No account found for this email." };
      }
      realProfileUidRef.current = nextUser.id;
      setUser(nextUser);
      return { ok: true, user: nextUser };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid email or password.";
      return { ok: false, error: message };
    }
  }, []);

  const register: AuthState["register"] = useCallback(async ({ name, username, email, password, role }) => {
    const resolvedUsername = (username ?? name).trim() || name.trim() || "creator";
    try {
      const nextUser = await registerWithFirebase({
        name,
        username: resolvedUsername,
        email: email.trim(),
        password,
        role,
      });
      realProfileUidRef.current = nextUser.id;
      setUser(nextUser);
      return nextUser;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to create account.";
      throw new Error(message);
    }
  }, []);

  const signInWithGoogle = useCallback(async (role: Exclude<AppRole, "admin"> = "creator"): Promise<LoginResult> => {
    try {
      const nextUser = await signInWithGoogleOAuth(role);
      realProfileUidRef.current = nextUser.id;
      setUser(nextUser);
      return { ok: true, user: nextUser };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Google sign-in failed.";
      return { ok: false, error: message };
    }
  }, []);

  const signInWithTikTok = useCallback(async (
    customToken: string,
    role: Exclude<AppRole, "admin"> = "creator",
  ): Promise<LoginResult> => {
    try {
      const nextUser = await completeTikTokSignIn(customToken, role);
      realProfileUidRef.current = nextUser.id;
      setUser(nextUser);
      return { ok: true, user: nextUser };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "TikTok sign-in failed.";
      return { ok: false, error: message };
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutFromFirebase();
    realProfileUidRef.current = null;
    setUser(null);
  }, []);

  const getDashboardRoute = useCallback(
    (role?: AppRole | null) => getDashboardRouteForRole(role ?? user?.role ?? null),
    [user?.role],
  );

  const sendPasswordReset = useCallback(async (email: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      await requestPasswordReset(email.trim());
      return { ok: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Couldn't send reset email.";
      return { ok: false, error: message };
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      register,
      signInWithGoogle,
      signInWithTikTok,
      logout,
      getDashboardRoute,
      sendPasswordReset,
    }),
    [
      user,
      isLoading,
      login,
      register,
      signInWithGoogle,
      signInWithTikTok,
      logout,
      getDashboardRoute,
      sendPasswordReset,
    ],
  );

  // Public pages (landing, legal) paint immediately. Dashboard, admin, and the auth
  // screens still wait — RequireAuth keys off a confirmed role, and login/signup
  // redirect as soon as a session exists, so showing them early flashes the wrong UI.
  const hold = isLoading && shouldHoldForAuth(pathname);

  return (
    <AuthContext.Provider value={value}>
      {hold ? <AppLoader /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
