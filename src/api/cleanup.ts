import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import fs from "fs";

const projectId = process.env.FIREBASE_PROJECT_ID || "vedatool";
const databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";

let db: Firestore | null = null;

export function initializeFirebaseAdmin(): Firestore | null {
  if (db) return db;
  try {
    let app;
    if (getApps().length === 0) {
      const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const options: any = { projectId };
      if (saKey) {
        try {
          const saConfig = saKey.trim().startsWith("{") ? JSON.parse(saKey) : JSON.parse(fs.readFileSync(saKey, "utf-8"));
          options.credential = cert(saConfig);
          console.log("[Cleanup] Loaded Firebase Service Account from environment config.");
        } catch (credErr: any) {
          console.warn("[Cleanup] Failed to parse/load service account config:", credErr.message);
        }
      }
      app = initializeApp(options);
    } else {
      app = getApp();
    }
    db = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
    console.log(`[Cleanup] Firebase Admin initialized for project ${projectId} and database ${databaseId}`);
    return db;
  } catch (e) {
    console.error("[Cleanup] Firebase Admin initialization failed (credentials might be missing locally):", e);
    return null;
  }
}

export interface CleanupResult {
  completed: boolean;
  timestamp: string;
  processedUsers: number;
  deletedHistoryItems: number;
  deletedMcqConversions: number;
  logs: string[];
}

export async function runHistoryCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    completed: false,
    timestamp: new Date().toISOString(),
    processedUsers: 0,
    deletedHistoryItems: 0,
    deletedMcqConversions: 0,
    logs: [],
  };

  const firestoreDb = initializeFirebaseAdmin();
  if (!firestoreDb) {
    result.logs.push("Firebase Admin Firestore is not initialized/accessible (No valid credentials/ADC configured).");
    return result;
  }

  try {
    result.logs.push("Starting background history retention cleanup job...");

    // 1. Fetch Global Settings for History Retention
    let freeRetentionDays = 7;
    let premiumRetentionDays = 30;

    const retentionDocRef = firestoreDb.doc("settings/history_retention");
    const retentionDoc = await retentionDocRef.get();
    if (retentionDoc.exists) {
      const data = retentionDoc.data();
      if (data) {
        if (typeof data.freeRetentionDays === "number") freeRetentionDays = data.freeRetentionDays;
        if (typeof data.premiumRetentionDays === "number") premiumRetentionDays = data.premiumRetentionDays;
      }
    }
    result.logs.push(`Loaded global retention policies: Free = ${freeRetentionDays} days, Premium = ${premiumRetentionDays} days.`);

    // 2. Fetch all Plans to map individual plans' custom retention periods
    const plansMap: Record<string, number> = {};
    const plansSnap = await firestoreDb.collection("plans").get();
    plansSnap.forEach((doc) => {
      const data = doc.data();
      if (data && typeof data.historyValidityDays === "number") {
        plansMap[doc.id] = data.historyValidityDays;
      }
    });
    result.logs.push(`Loaded metadata for ${plansSnap.size} plans.`);

    // 3. Fetch All Users
    const usersSnap = await firestoreDb.collection("users").get();
    result.logs.push(`Processing retention for ${usersSnap.size} active user profiles...`);

    const now = Date.now();

    for (const userDoc of usersSnap.docs) {
      try {
        const userId = userDoc.id;
        const userData = userDoc.data() || {};
        let isPremium = false;
        let planRetentionDays = freeRetentionDays;

        // Check if user has active subscription
        if (userData.subscription && userData.subscription.isActive) {
          const { planId, expiresAt } = userData.subscription;
          if (!expiresAt || expiresAt > now) {
            isPremium = true;
            // Check if plan has custom historyValidityDays set
            if (planId && typeof plansMap[planId] === "number") {
              planRetentionDays = plansMap[planId];
            } else {
              planRetentionDays = premiumRetentionDays;
            }
          }
        }

        const retentionMs = planRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = now - retentionMs;

        // Clean up: 1. standard conversions history: users/{userId}/history
        const historyCollRef = firestoreDb.collection(`users/${userId}/history`);
        const oldHistorySnap = await historyCollRef.where("timestamp", "<", cutoffTime).get();
        
        let localDeletedHistory = 0;
        if (!oldHistorySnap.empty) {
          const batch = firestoreDb.batch();
          oldHistorySnap.forEach((doc) => {
            batch.delete(doc.ref);
            localDeletedHistory++;
            result.deletedHistoryItems++;
          });
          await batch.commit();
        }

        // Clean up: 2. MCQ extracted conversions: users/{userId}/mcq_conversions
        const mcqCollRef = firestoreDb.collection(`users/${userId}/mcq_conversions`);
        const mcqSnap = await mcqCollRef.get();
        let localDeletedMcqs = 0;

        if (!mcqSnap.empty) {
          const batch = firestoreDb.batch();
          let count = 0;
          mcqSnap.forEach((doc) => {
            const data = doc.data();
            let recordTime = 0;
            if (typeof data.timestamp === "number") {
              recordTime = data.timestamp;
            } else if (typeof data.timestamp === "string") {
              recordTime = new Date(data.timestamp).getTime();
            }
            
            if (recordTime && recordTime < cutoffTime) {
              batch.delete(doc.ref);
              localDeletedMcqs++;
              result.deletedMcqConversions++;
              count++;
            }
          });
          if (count > 0) {
            await batch.commit();
          }
        }

        result.processedUsers++;
        if (localDeletedHistory > 0 || localDeletedMcqs > 0) {
          result.logs.push(`User ${userId} (${isPremium ? "Premium" : "Free"}): Purged ${localDeletedHistory} standard & ${localDeletedMcqs} MCQ items (retention threshold was ${planRetentionDays} days).`);
        }
      } catch (userErr: any) {
        result.logs.push(`Error cleaning history for user ${userDoc.id}: ${userErr.message}`);
      }
    }

    result.logs.push(`Completed cleanup! Processed: ${result.processedUsers} users. Purged: ${result.deletedHistoryItems} standard files, ${result.deletedMcqConversions} MCQ sets.`);
    result.completed = true;
  } catch (error: any) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("permission_denied") || msg.includes("insufficient permissions") || msg.includes(" 7 ")) {
      console.log("[Cleanup] Active background history retention skipped (cloud credentials offline or unlinked). Database connection will resume when config is active.");
      result.logs.push("Cleanup job offline: Firestore connection not initialized or authorized.");
    } else {
      console.log(`[Cleanup] Background job skipped (${msg.slice(0, 80)}).`);
      result.logs.push(`History retention check skipped: ${msg.slice(0, 80)}`);
    }
  }

  return result;
}

// Scheduled Interval Setup function
export function startScheduledCleanupJob(intervalHours: number = 12) {
  const msInterval = intervalHours * 60 * 60 * 1000;
  console.log(`[Cleanup] Scheduled background retention cleanup helper configured to run every ${intervalHours} hours.`);
  
  // Also run initially on startup after 1 minute of server launch to keep resources free immediately on boot
  setTimeout(() => {
    runHistoryCleanup().then((res) => {
      console.log(`[Cleanup] Initial startup pruning result: Deleted ${res.deletedHistoryItems} standard and ${res.deletedMcqConversions} MCQ logs.`);
    }).catch((e) => {
      console.error("[Cleanup] Initial startup pruning failure:", e);
    });
  }, 60000);

  setInterval(() => {
    runHistoryCleanup().then((res) => {
      console.log(`[Cleanup] Background task completed. Deleted ${res.deletedHistoryItems} standard and ${res.deletedMcqConversions} MCQ logs.`);
    }).catch((e) => {
      console.error("[Cleanup] Periodic background task failure:", e);
    });
  }, msInterval);
}
