import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";

// Dynamically read/fetch properties for secure initialization
let firebaseConfig: any = (window as any).__FIREBASE_CONFIG__;

if (!firebaseConfig) {
  try {
    console.warn("[Firebase] Global config window.__FIREBASE_CONFIG__ not set. Fetching synchronously...");
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/firebase-config", false);
    xhr.send(null);
    if (xhr.status === 200) {
      const text = xhr.responseText.trim();
      if (text.startsWith("<")) {
        throw new Error("Received HTML fallback from config endpoint instead of valid JSON.");
      }
      firebaseConfig = JSON.parse(text);
      (window as any).__FIREBASE_CONFIG__ = firebaseConfig;
    } else {
      throw new Error(`XHR returned status: ${xhr.status}`);
    }
  } catch (err) {
    console.error("[Firebase] Error loading remote configuration:", err);
    firebaseConfig = {
      apiKey: "AIzaSyCcQ5i4liAx3SJjprQjahooAuWozmKizZU",
      authDomain: "vedatool.firebaseapp.com",
      projectId: "vedatool",
      storageBucket: "vedatool.firebasestorage.app",
      messagingSenderId: "226720860057",
      appId: "1:226720860057:web:c8345c1cbb472813f83508",
      measurementId: "G-X570F0Y9JJ",
      firestoreDatabaseId: "(default)",
    };
  }
}

console.log("[Firebase] Client config:", firebaseConfig);

const app = initializeApp(firebaseConfig);
setLogLevel("error");

const databaseId = firebaseConfig.firestoreDatabaseId;
export const db =
  databaseId && databaseId !== "(default)"
    ? getFirestore(app, databaseId)
    : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

console.log("[Firebase] Auth app options:", auth.app.options);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  const msgLower = errMsg.toLowerCase();
  const isPermissionError =
    msgLower.includes("permission") ||
    msgLower.includes("insufficient") ||
    msgLower.includes("unauthorized") ||
    msgLower.includes("denied");

  if (isPermissionError) {
    console.warn("Firestore Permission Warning (Suppressed crash): ", JSON.stringify(errInfo));
    return;
  }

  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
