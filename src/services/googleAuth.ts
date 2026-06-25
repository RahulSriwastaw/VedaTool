import {
  signInWithRedirect,
  getRedirectResult,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import { getCleanDisplayName } from "../types";

export async function provisionGoogleUser(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  const payload: Record<string, unknown> = {
    uid: user.uid,
    email: user.email || "",
    displayName:
      user.displayName || getCleanDisplayName("", user.email || ""),
    photoURL: user.photoURL || "",
  };

  if (!userSnap.exists() || userSnap.data().tokens === undefined) {
    payload.tokens = 50;
    payload.lastMonthlyCreditMonth = new Date().toISOString().substring(0, 7);
  }

  await setDoc(userRef, payload, { merge: true });
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;

    await provisionGoogleUser(result.user);
    return result.user;
  } catch (err) {
    console.error("[GoogleAuth] Redirect sign-in failed:", err);
    throw err;
  }
}
