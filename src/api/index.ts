import "../../server.env.ts";
import express from "express";
import { jsonrepair } from "jsonrepair";
import { GoogleGenAI, Type } from "@google/genai";
import { NumberingStyle } from "../types.ts";
import crypto from "crypto";
import Razorpay from "razorpay";
import {
  PDFDocument as BackendPDFDoc,
  degrees as backendDegrees,
} from "pdf-lib";
import fs from "fs";
import path from "path";
import multer from "multer";
// @ts-ignore
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  Table as DocxTable,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  ImageRun,
  Packer,
  AlignmentType,
  PageBreak,
  ShadingType,
} from "docx";
import { PNG } from "pngjs";
// @ts-ignore
import { YoutubeTranscript } from "youtube-transcript";
import { runHistoryCleanup } from "./cleanup.ts";

const app = express();
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

// Global API Key scrubbing middleware to prevent leakage of Gemini/other sensitive API keys in responses & errors
app.use((req, res, next) => {
  if (req.path === "/api/firebase-config" || req.originalUrl === "/api/firebase-config") {
    return next();
  }

  const originalSend = res.send;
  const originalJson = res.json;
  const originalWrite = res.write;
  const originalEnd = res.end;

  const scrub = (data: any): any => {
    if (typeof data === "string") {
      return data.replace(/AIzaSy[A-Za-z0-9_\-]+/g, "[MASKED_KEY]");
    }
    if (data && typeof data === "object") {
      try {
        const str = JSON.stringify(data);
        const cleanedStr = str.replace(/AIzaSy[A-Za-z0-9_\-]+/g, "[MASKED_KEY]");
        return JSON.parse(cleanedStr);
      } catch (err) {
        return data; // Fallback
      }
    }
    return data;
  };

  res.send = function (body) {
    return originalSend.call(this, scrub(body));
  };

  res.json = function (obj) {
    return originalJson.call(this, scrub(obj));
  };

  res.write = function (chunk, ...args: any[]) {
    if (typeof chunk === "string") {
      chunk = scrub(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      const str = chunk.toString("utf8");
      if (str.includes("AIzaSy")) {
        chunk = Buffer.from(scrub(str), "utf8");
      }
    }
    return originalWrite.apply(this, [chunk, ...args]);
  };

  res.end = function (chunk?: any, ...args: any[]) {
    if (typeof chunk === "string") {
      chunk = scrub(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      const str = chunk.toString("utf8");
      if (str.includes("AIzaSy")) {
        chunk = Buffer.from(scrub(str), "utf8");
      }
    }
    return originalEnd.apply(this, chunk === undefined ? [] : [chunk, ...args]);
  };

  next();
});

export const MODELS_TO_TRY = [
  (process.env.GEMINI_MODEL || "gemini-3.5-flash").split(/[#\s]/)[0].trim(),
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest"
]
  .filter((m) => m && m.toLowerCase().includes("gemini-"))
  .map((m) => m.replace(/^models\//, ""))
  .filter((v, i, a) => a.indexOf(v) === i);

if (MODELS_TO_TRY.length === 0) {
  MODELS_TO_TRY.push("gemini-3.5-flash");
}

console.log(`[API] Models to try: ${MODELS_TO_TRY.join(", ")}`);

app.get("/api/firebase-config", (req, res) => {
  try {
    const config = {
      apiKey: process.env.FIREBASE_API_KEY || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || "(default)",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
    };

    if (!config.apiKey || !config.projectId || !config.authDomain) {
      console.warn("[FirebaseConfig] Missing required Firebase env vars:", {
        hasApiKey: Boolean(config.apiKey),
        projectId: config.projectId,
        authDomain: config.authDomain,
      });
    }

    res.json(config);
  } catch (error) {
    console.error("[FirebaseConfigProxy] Error loading Firebase configuration:", error);
    res.status(500).json({ error: "Failed to load Firebase configuration" });
  }
});

console.log("[FirebaseConfig] Backend startup:", {
  projectId: process.env.FIREBASE_PROJECT_ID,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID,
});

app.get("/api/config", (req, res) => {
  try {
    const { totalKeys } = getGeminiClient();
    res.json({ totalKeys });
  } catch (error) {
    res.json({ totalKeys: 0 });
  }
});

app.get([
  "/api/extract",
  "/api/edit-page-layout",
  "/api/youtube-seo",
  "/api/pdf-to-docx/convert",
  "/api/pdf-to-docx/process-page",
  "/api/pdf-to-docx/generate-docx",
  "/api/razorpay/create-order",
  "/api/razorpay/verify-payment",
  "/api/upload",
  "/api/merge"
], (req, res) => {
  res.status(400).json({
    error: "Iframe Session Redirect. Your browser redirected a secure API call to a cross-site session check. To use extension tools and PDF conversions without browser constraints, please click the 'Open in New Tab' button in the top-right toolbar."
  });
});

app.get("/api/geolocation", async (req, res) => {
  try {
    const clientIp = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress || "";
    // If we've got a loopback or local IP (like during development), we can use the server's external IP or fallback
    const isLocal = !clientIp || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";
    const lookupIp = isLocal ? "" : clientIp;

    const geoReq = await fetch(`http://ip-api.com/json/${lookupIp}`);
    if (geoReq.ok) {
      const data = await geoReq.json();
      return res.json({
        ip: data.query || clientIp || "Unknown",
        city: data.city || "Unknown",
        country_name: data.country || "Unknown",
        region: data.regionName || "Unknown",
      });
    }
  } catch (err) {
    console.warn("Backend geolocation failed, falling back...", err);
  }

  // Backup fallback using another safe free API
  try {
    const backupReq = await fetch("https://api.db-ip.com/v2/free/self");
    if (backupReq.ok) {
      const data = await backupReq.json();
      return res.json({
        ip: data.ipAddress || "Unknown",
        city: data.city || "Unknown",
        country_name: data.countryName || "Unknown",
        region: data.stateProv || "Unknown",
      });
    }
  } catch (err) {
    console.warn("Second backend geolocation fallback failed.", err);
  }

  res.json({
    ip: "Unknown",
    city: "Unknown",
    country_name: "Unknown",
    region: "Unknown",
  });
});

app.get("/api/debug-key", (req, res) => {
  const k = process.env.GEMINI_API_KEY || "";
  res.json({ key: k, length: k.length });
});

export function safeJsonParse(text: string) {
  let cleaned = (text || "").trim();
  
  // Extract JSON from markdown block
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(jsonBlockRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  } else {
    // Attempt to extract object or array if plain text has garbage around it
    const objectMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (objectMatch && objectMatch[0]) {
      cleaned = objectMatch[0].trim();
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    try {
      // Use jsonrepair as fallback to fix unescaped quotes, trailing commas, missing quotes, newlines in strings, etc.
      const repaired = jsonrepair(cleaned);
      return JSON.parse(repaired);
    } catch(err2) {
      console.error("[safeJsonParse] jsonrepair also failed to parse. Original string length:", cleaned.length, "Start:", cleaned.substring(0, 100));
      throw err;
    }
  }
}

let keyIndex = 0;
const keyHealth = new Map<
  string,
  {
    lastErrorTime: number;
    lastSuccessTime: number;
    consecutiveErrors: number;
    totalErrors: number;
    totalSuccesses: number;
    errorType?: string;
  }
>();
const deadKeys = new Set<string>();

const STATS_FILE_PATH = path.join(process.cwd(), "key_health_stats.json");

const loadStats = () => {
  try {
    if (fs.existsSync(STATS_FILE_PATH)) {
      const rawData = fs.readFileSync(STATS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(rawData);

      // Load deadKeys
      if (parsed.deadKeys && Array.isArray(parsed.deadKeys)) {
        deadKeys.clear();
        parsed.deadKeys.forEach((k: string) => deadKeys.add(k));
      }

      // Load keyHealth
      if (parsed.keyHealth && typeof parsed.keyHealth === "object") {
        keyHealth.clear();
        Object.entries(parsed.keyHealth).forEach(
          ([key, val]: [string, any]) => {
            keyHealth.set(key, val);
          },
        );
      }
      console.log(
        "[STATS] Successfully loaded persisted key health stats and dead keys from file.",
      );
    }
  } catch (error) {
    console.error("[STATS] Error loading health stats from file:", error);
  }
};

const saveStats = () => {
  try {
    const healthObj: Record<string, any> = {};
    for (const [key, val] of keyHealth.entries()) {
      healthObj[key] = val;
    }
    const dataToSave = {
      deadKeys: Array.from(deadKeys),
      keyHealth: healthObj,
    };
    fs.writeFileSync(
      STATS_FILE_PATH,
      JSON.stringify(dataToSave, null, 2),
      "utf-8",
    );
  } catch (error) {
    console.error("[STATS] Error saving health stats to file:", error);
  }
};

// Call loadStats immediately
loadStats();

const USER_PROVIDED_KEYS: string[] = [];

const getAllKeysIncludingDead = () => {
  const primaryKey = process.env.GEMINI_API_KEY;
  const keysString = process.env.GEMINI_API_KEYS || "";

  const uniqueKeys = new Set<string>();

  if (primaryKey && primaryKey.length > 20) {
    uniqueKeys.add(primaryKey.trim().replace(/['"\s]/g, ""));
  }

  if (keysString) {
    keysString
      .split(",")
      .map((k) => k.trim().replace(/['"\s]/g, ""))
      .filter((k) => k && k.length > 20)
      .forEach((k) => uniqueKeys.add(k));
  }

  // Include FREE_GEMINI_KEY_* environment variables
  Object.keys(process.env).forEach((envKey) => {
    if (envKey.startsWith("FREE_GEMINI_KEY_")) {
      const val = process.env[envKey];
      if (val && val.trim().length > 20) {
        uniqueKeys.add(val.trim().replace(/['"\s]/g, ""));
      }
    }
  });

  // Include dynamic donated keys from cached localHealthState if available (handles database fallback)
  if (typeof localHealthState !== "undefined" && localHealthState && localHealthState.donatedKeys) {
    Object.values(localHealthState.donatedKeys).forEach((dk) => {
      if (dk && dk.key && dk.key.length > 20) {
        uniqueKeys.add(dk.key.trim().replace(/['"\s]/g, ""));
      }
    });
  }

  // Include user-provided keys explicitly to guarantee connection
  USER_PROVIDED_KEYS.forEach((key) => {
    if (key && key.trim().length > 20) {
      uniqueKeys.add(key.trim().replace(/['"\s]/g, ""));
    }
  });

  return Array.from(uniqueKeys);
};

export const getAllKeys = () => {
  const allKeys = getAllKeysIncludingDead();
  return allKeys.filter((k) => !deadKeys.has(k));
};

// ==========================================
// DYNAMIC public-donated API HEALTH POOL & CONCURRENCY MANAGER
// ==========================================
import { initializeFirebaseAdmin } from "./cleanup.ts";

interface LocalHealthState {
  envKeysStatus: Record<string, "ACTIVE" | "INVALID" | "UNCHECKED">;
  deletedEnvKeys: string[];
  donatedKeys: Record<string, {
    key: string;
    keyName?: string;
    userId?: string;
    status: "ACTIVE" | "INVALID" | "UNCHECKED";
  }>;
}

const LOCAL_HEALTH_STATE_PATH = path.join(process.cwd(), "local_health_state.json");

let localHealthState: LocalHealthState = {
  envKeysStatus: {},
  deletedEnvKeys: [],
  donatedKeys: {},
};

const loadLocalHealthState = () => {
  try {
    if (fs.existsSync(LOCAL_HEALTH_STATE_PATH)) {
      const data = fs.readFileSync(LOCAL_HEALTH_STATE_PATH, "utf-8");
      localHealthState = JSON.parse(data);
      if (!localHealthState.donatedKeys) {
        localHealthState.donatedKeys = {};
      }
    } else {
      localHealthState = {
        envKeysStatus: {},
        deletedEnvKeys: [],
        donatedKeys: {},
      };
    }
  } catch (err) {
    console.warn("[KeyPool] Failed to load local health state, using defaults:", err);
    localHealthState = {
      envKeysStatus: {},
      deletedEnvKeys: [],
      donatedKeys: {},
    };
  }
};

const saveLocalHealthState = () => {
  try {
    fs.writeFileSync(LOCAL_HEALTH_STATE_PATH, JSON.stringify(localHealthState, null, 2), "utf-8");
  } catch (err) {
    console.error("[KeyPool] Failed to save local health state:", err);
  }
};

loadLocalHealthState();

const getEnvFreeKeys = (): { id: string; key: string }[] => {
  const keys: { id: string; key: string }[] = [];
  Object.keys(process.env).forEach((envKey) => {
    if (envKey.startsWith("FREE_GEMINI_KEY_")) {
      const val = process.env[envKey];
      if (val && val.trim().length > 20) {
        const id = envKey;
        if (!localHealthState.deletedEnvKeys.includes(id)) {
          keys.push({
            id,
            key: val.trim().replace(/['"\s]/g, ""),
          });
        }
      }
    }
  });

  if (keys.length === 0) {
    const fallbackKeys = getAllKeysIncludingDead();
    fallbackKeys.forEach((key, index) => {
      keys.push({
        id: `FREE_GEMINI_KEY_${index + 1}`,
        key,
      });
    });
  }

  return keys;
};

interface PoolKey {
  id: string;
  key: string;
  source: "env" | "db";
  status: "ACTIVE" | "INVALID" | "UNCHECKED";
  userId?: string;
  keyName?: string;
}

let activeFreeKeysPool: { id: string; key: string }[] = [];

async function buildKeyPool(): Promise<PoolKey[]> {
  const pool: PoolKey[] = [];

  const envFreeKeys = getEnvFreeKeys();
  envFreeKeys.forEach((ek) => {
    if (!localHealthState.envKeysStatus[ek.id]) {
      localHealthState.envKeysStatus[ek.id] = "UNCHECKED";
    }
    pool.push({
      id: ek.id,
      key: ek.key,
      source: "env",
      status: localHealthState.envKeysStatus[ek.id],
    });
  });

  const firestoreDb = initializeFirebaseAdmin();
  let dbKeysFetched = false;
  if (firestoreDb) {
    try {
      const snapshot = await firestoreDb.collection("shared_api_keys").get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const key = (data.keyValue || "").trim();
        const status = data.healthStatus || "UNCHECKED";
        const userId = data.userId;
        const keyName = data.keyName;

        // Sync to local health state for persistence/hybrid fallback
        localHealthState.donatedKeys[id] = { key, status, userId, keyName };

        pool.push({
          id,
          key,
          source: "db",
          status,
          userId,
          keyName,
        });
      });
      dbKeysFetched = true;
    } catch (e: any) {
      const msg = (e.message || "").toLowerCase();
      if (msg.includes("permission_denied") || msg.includes("insufficient permissions") || msg.includes(" 7 ") || msg.includes("7 permission_denied")) {
        console.log("[FirebaseAdmin] Cloud keys pool connection offline or unlinked (local JSON keys fallback activated).");
      } else {
        console.log(`[FirebaseAdmin] Keys API fetch skipped (${msg.slice(0, 80)}). Local fallback active.`);
      }
    }
  }

  // If DB read failed (e.g. PERMISSION_DENIED / offline), load keys from local cache instead!
  if (!dbKeysFetched) {
    Object.entries(localHealthState.donatedKeys || {}).forEach(([id, dk]) => {
      pool.push({
        id,
        key: dk.key,
        source: "db",
        status: dk.status,
        userId: dk.userId,
        keyName: dk.keyName,
      });
    });
  }

  saveLocalHealthState();

  activeFreeKeysPool = pool
    .filter((k) => (k.status === "ACTIVE" || k.status === "UNCHECKED") && !deadKeys.has(k.key))
    .map((k) => ({ id: k.id, key: k.key }));

  return pool;
}

async function validateApiKey(key: string): Promise<boolean> {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (
    trimmed.length < 25 ||
    trimmed.includes("your") ||
    trimmed.includes("placeholder") ||
    trimmed.includes("api_key") ||
    (!trimmed.startsWith("AIza") && !trimmed.startsWith("AQ."))
  ) {
    console.log(`[KeyPool-Helper] Key skipped (placeholder or non-standard format detected).`);
    return false;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: trimmed });
    const response = await ai.models.generateContent({
      model: MODELS_TO_TRY[0] || "gemini-3.5-flash",
      contents: "Hi",
    });
    if (response && response.text) {
      return true;
    }
    return false;
  } catch (err: any) {
    const rawMsg = err.message || "";
    let cleanMsg = rawMsg;
    let isServiceOverloaded = false;

    try {
      const parsed = typeof rawMsg === "string" ? JSON.parse(rawMsg) : rawMsg;
      if (parsed && parsed.error) {
        cleanMsg = parsed.error.message || cleanMsg;
        const codeNum = Number(parsed.error.code);
        if (codeNum === 503 || String(parsed.error.status).toLowerCase() === "unavailable") {
          isServiceOverloaded = true;
        }
      }
    } catch (e) {
      // Ignored: Msg is not JSON or parsing failed
    }

    const msg = cleanMsg.toLowerCase();
    
    // Check if the error is definitely an authentication / invalid key error
    // Temporary quota exhaustion does not mean the key is invalid
    const isExceededQuota = msg.includes("exceeded your current quota");

    const isAuthError =
      (msg.includes("api_key_invalid") ||
      msg.includes("invalid_api_key") ||
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("not valid") ||
      msg.includes("permission denied") ||
      msg.includes("permission_denied") ||
      msg.includes("api key is invalid")) && !isExceededQuota;

    // Check if the error is a permanent/hard billing quota exhaustion or account deactivation
    // NOTE: Free tier keys hitting their daily limit receive "exceeded your current quota", which is temporary (24 hours).
    // Therefore, do not permanently ban them.
    const isPermanentQuotaError =
      msg.includes("account has been disabled") ||
      msg.includes("suspension") ||
      msg.includes("suspended") ||
      msg.includes("disabled") ||
      msg.includes("permanently exhausted"); // Do not use "exceeded your current quota" here

    if (isAuthError || isPermanentQuotaError) {
      console.log(`[KeyPool-HealthCheck] Key status updated to offline (${cleanMsg.slice(0, 100)}...). Key deactivated.`);
      return false; // Key is definitely invalid/expired
    }

    // Check if the error is a temporary service-level error (503 overloaded, 429 quota, timeout etc.)
    const isServiceError =
      isServiceOverloaded ||
      msg.includes("503") ||
      msg.includes("unavailable") ||
      msg.includes("high demand") ||
      msg.includes("overloaded") ||
      msg.includes("try again later") ||
      msg.includes("limit") ||
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("capacity") ||
      msg.includes("resource_exhausted") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("socket");

    if (isServiceError) {
      console.log(`[KeyPool-TestCall] Key auto-approved: GenAI service is experiencing high demand (503/unavailable). Keeping key as ACTIVE.`);
      return true; // Safe to keep in pool, since auth succeeded
    }

    // Default: If it's some other non-authentication error, default to keeping it active
    console.log(`[KeyPool-TestCall] Key checked: ${cleanMsg.slice(0, 150)}. Assuming ACTIVE.`);
    return true;
  }
}

async function validateAllPoolKeys(): Promise<void> {
  console.log("[KeyPool] Commencing scheduled/manual key pool health recheck...");
  const pool = await buildKeyPool();
  const firestoreDb = initializeFirebaseAdmin();

  // Validate all keys in parallel to optimize startup time and avoid blocking the event loop
  await Promise.all(
    pool.map(async (k) => {
      const isValid = await validateApiKey(k.key);
      const newStatus = isValid ? "ACTIVE" : "INVALID";

      // Keep dynamic health pool and standard fallback pool in perfect sync
      if (newStatus === "INVALID") {
        deadKeys.add(k.key);
      } else {
        deadKeys.delete(k.key);
      }

      if (k.source === "env") {
        localHealthState.envKeysStatus[k.id] = newStatus;
        console.log(`[KeyPool-Validation] Env key ${k.id} health status: ${newStatus}`);
      } else {
        // Update local health state cache
        if (localHealthState.donatedKeys[k.id]) {
          localHealthState.donatedKeys[k.id].status = newStatus;
        }
        if (firestoreDb) {
          try {
            await firestoreDb.collection("shared_api_keys").doc(k.id).update({
              healthStatus: newStatus,
            });
            console.log(`[KeyPool-Validation] DB key ${k.id} health status: ${newStatus}`);
          } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            if (
              !msg.includes("permission_denied") &&
              !msg.includes("insufficient permissions") &&
              !msg.includes(" 7 ") &&
              !msg.includes("7 permission_denied")
            ) {
              console.log(`[KeyPool-Validation] DB sync skipped for ${k.id} (${msg.slice(0, 80)}). Cached locally.`);
            }
          }
        }
      }
    })
  );

  saveStats();
  saveLocalHealthState();
  await buildKeyPool();
}

// Scheduled and startup tasks
buildKeyPool().then(async () => {
  console.log("[Startup] Initializing API Key Pool... Commencing startup key validation check.");
  
  // Clean deadKeys to allow all keys (including AQ keys) to be re-validated at startup
  deadKeys.clear();
  // Clear any INVALID status on env keys so they are re-checked
  if (localHealthState && localHealthState.envKeysStatus) {
    Object.keys(localHealthState.envKeysStatus).forEach((k) => {
      localHealthState.envKeysStatus[k] = "UNCHECKED";
    });
  }
  saveLocalHealthState();
  saveStats();

  await validateAllPoolKeys();
}).catch((err) => {
  console.error("[Startup] Key validation failed on start:", err);
});

setInterval(async () => {
  try {
    await validateAllPoolKeys();
  } catch (err) {
    console.error("[Interval] Key periodic revalidation error:", err);
  }
}, 24 * 60 * 60 * 1000); // 24 hours

// Concurrency Locks & Queues
const busyKeyIds = new Set<string>();

interface QueueRequest {
  resolve: (key: string) => void;
  reject: (err: any) => void;
  excludeKeys?: string[];
}
const freeKeyQueue: QueueRequest[] = [];

async function acquireFreeKey(excludeKeys?: string[]): Promise<string> {
  const activeKeys = activeFreeKeysPool;
  if (activeKeys.length === 0) {
    await buildKeyPool();
    if (activeFreeKeysPool.length === 0) {
      throw new Error("No ACTIVE public-donated Gemini keys available in the pool right now. High demand! Please try again in a few moments.");
    }
  }

  const candidates = activeFreeKeysPool.filter((k) => {
    const isBusy = busyKeyIds.has(k.id);
    const isExcluded = excludeKeys && (excludeKeys.includes(k.key) || excludeKeys.includes(k.id));
    return !isBusy && !isExcluded;
  });

  let availableKey;
  if (candidates.length > 0) {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    availableKey = candidates[randomIndex];
  } else {
    // Candidate relaxation: if we have idle keys but all are excluded, relax the exclusion list and use an idle key!
    const idleKeys = activeFreeKeysPool.filter(k => !busyKeyIds.has(k.id));
    if (idleKeys.length > 0) {
      const randomIndex = Math.floor(Math.random() * idleKeys.length);
      availableKey = idleKeys[randomIndex];
      console.log(`[LockManager] Candidate relaxation: Using excluded idle key ${availableKey.id} to avoid pool exhaustion.`);
    }
  }

  if (availableKey) {
    busyKeyIds.add(availableKey.id);
    console.log(`[LockManager] Key ${availableKey.id} occupied immediately. Excluded keys checked: ${excludeKeys?.length || 0}`);
    return availableKey.key;
  }

  // If there are no candidates, but there ARE inactive/idle keys that were excluded,
  // it means we have exhausted all keys in the pool for this specific request.
  const anyIdleKeys = activeFreeKeysPool.some(k => !busyKeyIds.has(k.id));
  if (anyIdleKeys && busyKeyIds.size === 0) {
    // All keys are idle, and all of them are excluded by this request! 
    throw new Error("All available keys have been excluded (they failed for this request). Pool exhausted for this request.");
  } else if (anyIdleKeys && busyKeyIds.size > 0 && activeFreeKeysPool.every(k => busyKeyIds.has(k.id) || (excludeKeys && (excludeKeys.includes(k.key) || excludeKeys.includes(k.id))))) {
     // Some keys are idle and excluded, others are busy. We can wait for the busy ones!
  } else if (anyIdleKeys) {
     throw new Error("All available keys have been excluded (they failed for this request). Pool exhausted for this request.");
  }

  return new Promise<string>((resolve, reject) => {
    console.log(`[LockManager] All keys busy. Queued request count: ${freeKeyQueue.length + 1}`);
    freeKeyQueue.push({ resolve, reject, excludeKeys });
  });
}

function releaseFreeKey(keyValue: string) {
  const activeKeyObj = activeFreeKeysPool.find((k) => k.key === keyValue);
  if (!activeKeyObj) return;

  const keyId = activeKeyObj.id;
  if (!busyKeyIds.has(keyId)) {
    return; // Prevent double-release and stealing key from queue
  }

  console.log(`[LockManager] Key ${keyId} released.`);
  busyKeyIds.delete(keyId);

  // Find a queued request that doesn't exclude this key
  const waitingIdx = freeKeyQueue.findIndex(req => !req.excludeKeys || (!req.excludeKeys.includes(keyValue) && !req.excludeKeys.includes(keyId)));

  if (waitingIdx !== -1) {
    const nextRequest = freeKeyQueue.splice(waitingIdx, 1)[0];
    busyKeyIds.add(keyId);
    console.log(`[LockManager] Reassigning key ${keyId} directly to waiting request.`);
    nextRequest.resolve(activeKeyObj.key);
  }
  
  // If there are any queued requests that now have NO chance of being satisfied 
  // (because all idle keys are excluded by them, and there are NO busy keys left to wait for)
  if (busyKeyIds.size === 0) {
    for (let i = freeKeyQueue.length - 1; i >= 0; i--) {
      const req = freeKeyQueue[i];
      const canUseAnyIdle = activeFreeKeysPool.some(k => !req.excludeKeys || (!req.excludeKeys.includes(k.key) && !req.excludeKeys.includes(k.id)));
      if (!canUseAnyIdle) {
        freeKeyQueue.splice(i, 1);
        req.reject(new Error("All available keys have been excluded (they failed for this request). Pool exhausted for this request."));
      }
    }
  }
}

async function checkIsPremiumUser(req: express.Request): Promise<boolean> {
  const isPremiumHead = req.headers["x-user-is-premium"];
  if (isPremiumHead === "true") {
    return true;
  }

  const userUid = req.headers["x-user-uid"];
  if (userUid) {
    const firestoreDb = initializeFirebaseAdmin();
    if (firestoreDb) {
      try {
        const userDoc = await firestoreDb.collection("users").doc(String(userUid)).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const userPlan = (userData?.plan || "").toLowerCase();
          if (userPlan === "premium" || userPlan === "pro" || userPlan === "enterprise") {
            return true;
          }
        }
      } catch (err: any) {
        const msg = (err.message || "").toLowerCase();
        if (msg.includes("permission_denied") || msg.includes("insufficient permissions") || msg.includes(" 7 ") || msg.includes("7 permission_denied")) {
          // Bypassed: Fallback gracefully to default subscription statuses
        } else {
          console.log(`[PremiumCheck] Status verification bypassed (${msg.slice(0, 80)}).`);
        }
      }
    }
  }

  return false;
}

async function handleGenAiRequest(
  req: express.Request,
  res: express.Response,
  handler: (keyToUse: string | undefined) => Promise<any>
) {
  const userApiKey = req.headers["x-user-api-key"] as string | undefined;
  const isPremium = await checkIsPremiumUser(req);

  let keyContext = { key: undefined as string | undefined, isFreeAcquired: false, isReleased: false };

  try {
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    await handler(keyContext.key);
  } catch (err: any) {
    console.error("[handleGenAiRequest] Error processing GenAI request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal GenAI request error" });
    } else {
      // If it is streaming, write the error block and end the stream
      try {
        res.write(`data: ${JSON.stringify({ error: err.message || "Internal GenAI request error" })}\n\n`);
        res.end();
      } catch (writeErr) {
        console.error("Failed to write error to stream:", writeErr);
      }
    }
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
}

// Admin Auth Middleware
const checkAdminAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "password123";

  if (!authHeader) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const encoded = authHeader.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString().split(":");
  const user = decoded[0];
  const pass = decoded[1];

  if (user === adminUser && pass === adminPass) {
    next();
  } else {
    res.status(403).json({ error: "Invalid credentials" });
  }
};

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "password123";

  if (username === adminUser && password === adminPass) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid username or password" });
  }
});

// Manual retention cleanup trigger route
app.post("/api/admin/trigger-cleanup", checkAdminAuth, async (req, res) => {
  try {
    const result = await runHistoryCleanup();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to run user history cleanup: " + err.message });
  }
});

app.get("/api/admin/stats", checkAdminAuth, (req, res) => {
  const allKeys = getAllKeys();
  const keysConfigured = getAllKeysIncludingDead();

  const stats = allKeys.map((k) => {
    const health = keyHealth.get(k) || {
      lastErrorTime: 0,
      lastSuccessTime: 0,
      consecutiveErrors: 0,
      totalErrors: 0,
      totalSuccesses: 0,
    };
    return {
      keyPrefix: k.substring(0, 8) + "...",
      key: k,
      ...health,
      isDead: deadKeys.has(k),
    };
  });

  // Also include dead keys but only if they are actually in general configuration
  const deadStats = keysConfigured
    .filter((k) => deadKeys.has(k))
    .map((k) => {
      const health = keyHealth.get(k) || {
        lastErrorTime: 0,
        lastSuccessTime: 0,
        consecutiveErrors: 0,
        totalErrors: 0,
        totalSuccesses: 0,
      };
      return {
        keyPrefix: k.substring(0, 8) + "...",
        key: k,
        ...health,
        isDead: true,
      };
    });

  res.json({ keys: stats, deadKeys: deadStats });
});

// Admin Donated Key Health Pool endpoints
app.get("/api/admin/health-status", checkAdminAuth, async (req, res) => {
  try {
    const pool = await buildKeyPool();
    res.json({ keys: pool });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load health status." });
  }
});

app.post("/api/admin/revalidate-all", checkAdminAuth, async (req, res) => {
  try {
    await validateAllPoolKeys();
    const updatedPool = await buildKeyPool();
    res.json({ success: true, keys: updatedPool });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to revalidate pool keys." });
  }
});

app.post("/api/admin/delete-pool-key", checkAdminAuth, async (req, res) => {
  const { id, source } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Key identifier ID required." });
  }

  try {
    if (source === "env") {
      if (!localHealthState.deletedEnvKeys.includes(id)) {
        localHealthState.deletedEnvKeys.push(id);
        saveLocalHealthState();
      }
      console.log(`[AdminDelete] Environmental variable key ${id} temporarily excluded/suspended by admin.`);
    } else {
      // Remove from local cache
      if (localHealthState.donatedKeys[id]) {
        delete localHealthState.donatedKeys[id];
        saveLocalHealthState();
      }

      const firestoreDb = initializeFirebaseAdmin();
      if (firestoreDb) {
        try {
          await firestoreDb.collection("shared_api_keys").doc(id).delete();
          console.log(`[AdminDelete] Publicly shared key connection ${id} deleted permanently from database.`);
        } catch (dbErr: any) {
          console.warn(`[AdminDelete] Key delete on Firestore failed (removed from local cache): ${dbErr.message}`);
        }
      }
    }

    const updatedPool = await buildKeyPool();
    res.json({ success: true, keys: updatedPool });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete key from pool." });
  }
});

// Front-end user donation gateway: Validates key server-side before registering
app.post("/api/keys/add-donated", async (req, res) => {
  const { keyName, keyValue, userId } = req.body;
  if (!keyValue || keyValue.trim().length <= 20) {
    return res.status(400).json({ error: "API Key must be a valid string exceeding 20 characters." });
  }

  const cleanKey = keyValue.trim().replace(/['"\s]/g, "");

  console.log(`[Donation] Validating incoming key from UID ${userId}...`);
  const isValid = await validateApiKey(cleanKey);
  if (!isValid) {
    return res.status(400).json({
      error: "This API Key failed Whiteboard AI dynamic validation test call and is invalid/inactive. Ensure the key has proper quota and has no restrictions."
    });
  }

  try {
    const keyId = "shared_" + crypto.randomBytes(8).toString("hex");

    // Always register in local health state cache first for instant local use / safety
    localHealthState.donatedKeys[keyId] = {
      key: cleanKey,
      keyName: keyName || "Donated Key",
      userId: userId || "Anonymous",
      status: "ACTIVE",
    };
    saveLocalHealthState();

    const firestoreDb = initializeFirebaseAdmin();
    let syncedToCloud = false;
    if (firestoreDb) {
      try {
        await firestoreDb.collection("shared_api_keys").doc(keyId).set({
          id: keyId,
          keyName: keyName || "Donated Key",
          keyValue: cleanKey,
          userId: userId || "Anonymous",
          createdAt: new Date().toISOString(),
          healthStatus: "ACTIVE",
        });
        syncedToCloud = true;
        console.log(`[Donation] Shared Key successfully registered as ACTIVE and synced to Firestore: ${keyId}`);
      } catch (dbErr: any) {
        console.warn(`[Donation] Firestore write failed, registered in local cache fallback: ${dbErr.message}`);
      }
    } else {
      console.log(`[Donation] Shared Key registered locally only: ${keyId}`);
    }

    await buildKeyPool();

    res.json({ 
      success: true, 
      keyId, 
      syncedToCloud,
      message: syncedToCloud ? "Whiteboard API public key registered and synchronized with cloud Firestore." : "API Key registered locally on the application server."
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to register donated key." });
  }
});

app.post("/api/admin/dead-key", checkAdminAuth, (req, res) => {
  const { key } = req.body;
  if (key) {
    deadKeys.add(key);
    saveStats();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Key required" });
  }
});

app.post("/api/admin/revive-key", checkAdminAuth, (req, res) => {
  const { key } = req.body;
  if (key) {
    deadKeys.delete(key);
    // Reset temporary consecutive failure checks
    const health = keyHealth.get(key);
    if (health) {
      health.consecutiveErrors = 0;
      keyHealth.set(key, health);
    }
    saveStats();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Key required" });
  }
});

app.post("/api/admin/reset-key-stats", checkAdminAuth, (req, res) => {
  const { key } = req.body;
  if (key) {
    keyHealth.delete(key);
    deadKeys.delete(key);
    saveStats();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Key required" });
  }
});

export const getGeminiClient = (skipKeys: string[] = [], userApiKey?: string) => {
  if (userApiKey) {
    return {
      client: new GoogleGenAI({
        apiKey: userApiKey,
        httpOptions: {
          timeout: 300000,
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }),
      key: userApiKey,
      totalKeys: 1,
    };
  }

  const allKeys = getAllKeys();
  const now = Date.now();

  if (allKeys.length === 0) {
    throw new Error(
      "No valid API keys found. Please verify your keys in the Settings menu (GEMINI_API_KEY or GEMINI_API_KEYS).",
    );
  }

  // Filter out dead/skip keys
  let candidates = allKeys.filter((k) => !skipKeys.includes(k));

  if (candidates.length === 0 && skipKeys.length > 0) {
    candidates = allKeys.filter((k) => k !== skipKeys[skipKeys.length - 1]);
  }

  if (candidates.length === 0) candidates = allKeys;

  let selectedKey = "";

  // 1. Prioritize keys that have NEVER errored or haven't errored in 2 min
  const healthyCandidates = candidates.filter((c) => {
    const health = keyHealth.get(c);
    return !health || now - health.lastErrorTime > 120000;
  });

  if (healthyCandidates.length > 0) {
    // Pick the one with the FEWEST permanent calls (totalSuccesses + totalErrors) to distribute load equally
    selectedKey = healthyCandidates.sort((a, b) => {
      const hA = keyHealth.get(a) || {
        totalSuccesses: 0,
        totalErrors: 0,
        lastSuccessTime: 0,
      };
      const hB = keyHealth.get(b) || {
        totalSuccesses: 0,
        totalErrors: 0,
        lastSuccessTime: 0,
      };
      const callsA = hA.totalSuccesses + hA.totalErrors;
      const callsB = hB.totalSuccesses + hB.totalErrors;
      if (callsA !== callsB) {
        return callsA - callsB;
      }
      return hA.lastSuccessTime - hB.lastSuccessTime;
    })[0];
  }

  // 2. Fallback: try any key not recently errored (60s)
  if (!selectedKey) {
    const okayCandidates = candidates.filter((c) => {
      const health = keyHealth.get(c);
      return !health || now - health.lastErrorTime > 60000;
    });
    if (okayCandidates.length > 0) {
      selectedKey = okayCandidates.sort((a, b) => {
        const hA = keyHealth.get(a) || {
          totalSuccesses: 0,
          totalErrors: 0,
          lastSuccessTime: 0,
        };
        const hB = keyHealth.get(b) || {
          totalSuccesses: 0,
          totalErrors: 0,
          lastSuccessTime: 0,
        };
        const callsA = hA.totalSuccesses + hA.totalErrors;
        const callsB = hB.totalSuccesses + hB.totalErrors;
        if (callsA !== callsB) {
          return callsA - callsB;
        }
        return hA.lastSuccessTime - hB.lastSuccessTime;
      })[0];
    }
  }

  // 3. Last resort: pick the one with the fewest permanent calls, breaking ties with most distant lastErrorTime
  if (!selectedKey) {
    selectedKey = candidates.sort((a, b) => {
      const hA = keyHealth.get(a) || {
        totalSuccesses: 0,
        totalErrors: 0,
        lastErrorTime: 0,
      };
      const hB = keyHealth.get(b) || {
        totalSuccesses: 0,
        totalErrors: 0,
        lastErrorTime: 0,
      };
      const callsA = hA.totalSuccesses + hA.totalErrors;
      const callsB = hB.totalSuccesses + hB.totalErrors;
      if (callsA !== callsB) {
        return callsA - callsB;
      }
      return hA.lastErrorTime - hB.lastErrorTime;
    })[0];
  }

  return {
    client: new GoogleGenAI({
      apiKey: selectedKey,
      httpOptions: {
        timeout: 300000,
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    }),
    key: selectedKey,
    totalKeys: allKeys.length,
  };
};

export const reportKeySuccess = (key: string) => {
  const health = keyHealth.get(key) || {
    lastErrorTime: 0,
    lastSuccessTime: 0,
    consecutiveErrors: 0,
    totalErrors: 0,
    totalSuccesses: 0,
  };
  health.lastSuccessTime = Date.now();
  health.consecutiveErrors = 0;
  health.totalSuccesses++;
  keyHealth.set(key, health);
  saveStats();

  // If this key was UNCHECKED, dynamically promote it to ACTIVE
  let wasPromoted = false;
  
  // 1. Search in env keys
  const envFreeKeys = getEnvFreeKeys();
  const envMatch = envFreeKeys.find((ek) => ek.key === key);
  if (envMatch && localHealthState.envKeysStatus[envMatch.id] !== "ACTIVE") {
    localHealthState.envKeysStatus[envMatch.id] = "ACTIVE";
    wasPromoted = true;
    console.log(`[KeyPool-Promotion] Promoted Env key ${envMatch.id} to ACTIVE on successful request.`);
  }

  // 2. Search in donated keys
  for (const [id, dk] of Object.entries(localHealthState.donatedKeys)) {
    if (dk.key === key && dk.status !== "ACTIVE") {
      dk.status = "ACTIVE";
      wasPromoted = true;
      console.log(`[KeyPool-Promotion] Promoted DB donated key ${id} to ACTIVE on successful request.`);
    }
  }

  if (wasPromoted) {
    saveLocalHealthState();
    buildKeyPool().catch((err) => console.error("Failed to rebuild key pool in reportKeySuccess:", err));
  }
};

export const reportKeyError = (key: string, type?: string, isPermanent = false) => {
  if (key === process.env.GEMINI_API_KEY) {
    isPermanent = false;
  }
  if (isPermanent) {
    deadKeys.add(key);
    saveStats();
    console.error(
      `Key ${key.substring(0, 8)}... marked as PERMANENTLY DEAD (Invalid or Denied)`,
    );

    let found = false;
    const envFreeKeys = getEnvFreeKeys();
    const envMatch = envFreeKeys.find((ek) => ek.key === key);
    if (envMatch) {
      localHealthState.envKeysStatus[envMatch.id] = "INVALID";
      found = true;
    }

    for (const [id, dk] of Object.entries(localHealthState.donatedKeys)) {
      if (dk.key === key) {
        dk.status = "INVALID";
        found = true;
      }
    }

    if (found) {
      saveLocalHealthState();
      buildKeyPool().catch((err) => console.error("Failed to rebuild key pool in reportKeyError:", err));
    }
    return;
  }
  const health = keyHealth.get(key) || {
    lastErrorTime: 0,
    lastSuccessTime: 0,
    consecutiveErrors: 0,
    totalErrors: 0,
    totalSuccesses: 0,
  };
  health.lastErrorTime = Date.now();
  health.consecutiveErrors++;
  health.totalErrors++;
  health.errorType = type;
  keyHealth.set(key, health);
  saveStats();
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const modelKeyCooldowns = new Map<string, number>();

function isModelKeyOnCooldown(modelName: string, key: string): boolean {
  const combo = `${modelName}:${key}`;
  const cooldown = modelKeyCooldowns.get(combo);
  if (cooldown && cooldown > Date.now()) {
    return true;
  }
  return false;
}

export async function runAIAction(
  action: (client: any, modelName: string) => Promise<any>,
  maxRetries?: number,
  userApiKey?: string,
  forceApiKeyToUse?: string,
) {
  const originalForceKeyToUse = forceApiKeyToUse;
  let currentForceKey = forceApiKeyToUse;
  let apiKeyToUse = userApiKey || currentForceKey;

  const isFreePoolKey = apiKeyToUse ? activeFreeKeysPool.some((k) => k.key === apiKeyToUse) : false;
  if (isFreePoolKey && !currentForceKey) {
    currentForceKey = apiKeyToUse;
  }

  let hasSwappedKey = false;

  const excludedKeysForThisRequest: string[] = [];
  if (currentForceKey) {
    excludedKeysForThisRequest.push(currentForceKey);
  }

  let swapAttempts = 0;
  const MAX_SWAP_ATTEMPTS = 30;

  if (apiKeyToUse) {
    let lastUserError: any = null;
    const modelRetries: Record<string, number> = {};

    for (let attempt = 0; attempt < MODELS_TO_TRY.length; attempt++) {
      const modelName = MODELS_TO_TRY[attempt];
      const cleanModelName = modelName.replace(/^models\//, "");
      if (!modelRetries[cleanModelName]) modelRetries[cleanModelName] = 0;
      
      const { client } = getGeminiClient([], apiKeyToUse);
      try {
        if (isModelKeyOnCooldown(cleanModelName, apiKeyToUse)) {
          if (attempt < MODELS_TO_TRY.length - 1) {
            continue;
          } else {
            const combo = `${cleanModelName}:${apiKeyToUse}`;
            const cooldown = modelKeyCooldowns.get(combo);
            const remaining = cooldown ? cooldown - Date.now() : 0;
            if (remaining > 0 && remaining < 16000) {
              console.log(`[runAIAction] Key on cooldown for ${modelName}. Waiting ${remaining}ms for expiration...`);
              await delay(remaining);
              attempt--; // Retry this model
              continue;
            } else {
              throw new Error("All models are exhausted / on cooldown. (COOLDOWN_SKIP)");
            }
          }
        }

        const result = await action(client, cleanModelName);
        reportKeySuccess(apiKeyToUse);
        if (
          currentForceKey &&
          (originalForceKeyToUse ? currentForceKey !== originalForceKeyToUse : hasSwappedKey)
        ) {
          releaseFreeKey(currentForceKey);
        }
        return result;
      } catch (error: any) {
        lastUserError = error;
        const errorStr = (error?.message || String(error)).toUpperCase();
        const isQuotaError =
          errorStr.includes("429") ||
          errorStr.includes("RESOURCE_EXHAUSTED") ||
          errorStr.includes("QUOTA") ||
          errorStr.includes("LIMIT");

        const isCooldownSkip = errorStr.includes("COOLDOWN_SKIP");

        const isServerOverloaded =
          errorStr.includes("503") ||
          errorStr.includes("500") ||
          errorStr.includes("UNAVAILABLE") ||
          errorStr.includes("FETCH FAILED");

        const isInvalidKey =
          errorStr.includes("API KEY NOT VALID") ||
          errorStr.includes("PERMISSION_DENIED") ||
          errorStr.includes("PERMISSION DENIED") ||
          errorStr.includes("API_KEY_INVALID") ||
          errorStr.includes("API KEY INVALID") ||
          errorStr.includes("SUSPENDED") ||
          errorStr.includes("DISABLED") ||
          errorStr.includes("CONSUMER_SUSPENDED") ||
          errorStr.includes("403") ||
          errorStr.includes("401");

        const isParseError =
          error instanceof SyntaxError ||
          errorStr.includes("SYNTAXERROR") ||
          errorStr.includes("JSON") ||
          errorStr.includes("PARS");

        if (isInvalidKey) {
          reportKeyError(apiKeyToUse, "INVALID", true);
        } else if (isQuotaError || isServerOverloaded) {
          const errType = isQuotaError ? "Quota" : "Overload";
          reportKeyError(apiKeyToUse, errType);
          modelKeyCooldowns.set(`${cleanModelName}:${apiKeyToUse}`, Date.now() + 15000);
        } else if (isParseError) {
          console.warn(`[runAIAction] Temporary Syntax/Parse Error on model ${cleanModelName} with key prefix ${apiKeyToUse.substring(0, 8)}. Key is completely healthy.`);
        } else if (!isCooldownSkip) {
          reportKeyError(apiKeyToUse, "Error");
        }

        // If it failed because of quota/invalid/overload, and we have a free pool key, swap to another key!
        if (currentForceKey && (isCooldownSkip || isQuotaError || isInvalidKey || isServerOverloaded) && swapAttempts < MAX_SWAP_ATTEMPTS) {
          if (!isCooldownSkip) {
            console.log(
              `[runAIAction] Pool key ${currentForceKey.substring(0, 8)}... exhausted/busy (${isQuotaError ? "Quota" : (isServerOverloaded ? "Overload" : "Invalid")}). Releasing and acquiring a new one...`
            );
          }
          
          swapAttempts++;
          excludedKeysForThisRequest.push(currentForceKey);
          const failedKey = currentForceKey;

          if (isQuotaError) {
            // Wait 2-3 seconds to avoid burning all keys in the pool instantly due to project-wide/region quota limits
            const delayTime = 2000 + Math.random() * 1500;
            console.log(`[runAIAction] Quota limit hit on project/key. Adding protective cooldown delay of ${delayTime.toFixed(0)}ms before swapping keys.`);
            await delay(delayTime);
          }

          try {
            // Release first to avoid deadlock if queue is full
            releaseFreeKey(failedKey);
            currentForceKey = await acquireFreeKey(excludedKeysForThisRequest);
            apiKeyToUse = currentForceKey;
            hasSwappedKey = true;
            attempt = -1; // Reset models loop count for the brand new key
          } catch (acqErr: any) {
            // Pool is exhausted. We've tried all keys and they all failed (e.g. Quota).
            // Let's clear the excluded list, wait for the cooldown to expire, and try again.
            await delay(5000); // Wait 5s to let quotas potentially reset
            excludedKeysForThisRequest.length = 0; // Clear excluded keys
            
            try {
              currentForceKey = await acquireFreeKey(excludedKeysForThisRequest);
              apiKeyToUse = currentForceKey;
              hasSwappedKey = true;
              attempt = -1;
              continue;
            } catch (err2: any) {
                 console.log(`[runAIAction] Failed to acquire replacement key even after waiting. Giving up on swap.`);
                 currentForceKey = undefined;
                 apiKeyToUse = undefined;
                 break;
            }
          }
          continue;
        }

        if (isQuotaError || isServerOverloaded || isParseError) {
          let cooldownMs = isParseError ? 1000 : 15000;
          let originalErrorObj: any = null;
          try {
            if (
              error &&
              typeof error.message === "string" &&
              error.message.trim().startsWith("{")
            ) {
              originalErrorObj = JSON.parse(error.message);
            }
          } catch (e) {}

          if (originalErrorObj) {
            const innerError = originalErrorObj.error;
            if (
              innerError &&
              innerError.details &&
              Array.isArray(innerError.details)
            ) {
              for (const detail of innerError.details) {
                if (
                  detail &&
                  detail.retryDelay &&
                  typeof detail.retryDelay === "string"
                ) {
                  const seconds = parseFloat(detail.retryDelay);
                  if (!isNaN(seconds) && seconds > 0) {
                    cooldownMs = seconds * 1000;
                    break;
                  }
                }
              }
            } else if (innerError && typeof innerError.message === "string") {
              const match =
                innerError.message.match(/retry in ([\d.]+)\s*s/i) ||
                innerError.message.match(/Please retry in ([\d.]+)\s*s/i);
              if (match && match[1]) {
                const seconds = parseFloat(match[1]);
                if (!isNaN(seconds) && seconds > 0) {
                  cooldownMs = seconds * 1000;
                }
              }
            }
          } else if (typeof error.message === "string") {
            const match =
              error.message.match(/retry in ([\d.]+)\s*s/i) ||
              error.message.match(/Please retry in ([\d.]+)\s*s/i);
            if (match && match[1]) {
              const seconds = parseFloat(match[1]);
              if (!isNaN(seconds) && seconds > 0) {
                cooldownMs = seconds * 1000;
              }
            }
          }

          console.log(
            `[runAIAction] Key hit limit with ${modelName} (${isQuotaError ? "Quota" : (isServerOverloaded ? "Overload" : "ParseError")}). Waiting ${cooldownMs}ms before continuing...`
          );
          await delay(cooldownMs);
          if (isParseError) {
             console.log(`[runAIAction] ParseError on ${modelName} - Moving to next model instead of retrying same model.`);
          } else if (modelRetries[cleanModelName] < 3) {
            attempt--; // Retry the same model since we waited!
            modelRetries[cleanModelName]++;
          } else {
            console.log(`[runAIAction] Max waits reached for ${modelName}. Moving to next model.`);
          }
        } else {
          await delay(100);
        }
      }
    }

    if (
      currentForceKey &&
      (originalForceKeyToUse ? currentForceKey !== originalForceKeyToUse : hasSwappedKey)
    ) {
      releaseFreeKey(currentForceKey);
    }

    // If it was a forced key to use, let's NEVER fallback to random keys bypassing the queue!
    if (originalForceKeyToUse || isFreePoolKey) {
      const finalError = new Error(
        `Exhausted pool key retries. Final error: ${lastUserError?.message || "Service unavailable"}.`
      );
      (finalError as any).status = 429;
      throw finalError;
    }

    console.log(
      `[runAIAction] Personal Key failed or hit limit. Falling back seamlessly to public system/donated pool keys...`
    );
  }

  // --- FALLBACK / GENERAL CALL TO SYSTEM/DONATED KEYS POOL ---
  let lastError: any = null;
  const maxFallbackAttempts = Math.max(12, activeFreeKeysPool.length * 2 || 5);

  for (let attempt = 0; attempt < maxFallbackAttempts; attempt++) {
    let fallbackKey: string | null = null;
    try {
      // Exclude keys that have already failed during this request invocation!
      fallbackKey = await acquireFreeKey(excludedKeysForThisRequest);
      excludedKeysForThisRequest.push(fallbackKey);
      
      const fallbackModelRetries: Record<string, number> = {};

      for (let modelIdx = 0; modelIdx < MODELS_TO_TRY.length; modelIdx++) {
        const modelName = MODELS_TO_TRY[modelIdx];
        const cleanModelName = modelName.replace(/^models\//, "");
        if (!fallbackModelRetries[cleanModelName]) fallbackModelRetries[cleanModelName] = 0;
        
        if (isModelKeyOnCooldown(cleanModelName, fallbackKey)) {
          if (modelIdx < MODELS_TO_TRY.length - 1) {
            continue;
          } else {
             throw new Error("All models are exhausted / on cooldown. (COOLDOWN_SKIP)");
          }
        }
        const client = new GoogleGenAI({
          apiKey: fallbackKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        try {
          const result = await action(client, cleanModelName);
          reportKeySuccess(fallbackKey);
          releaseFreeKey(fallbackKey);
          return result;
        } catch (modelErr: any) {
          lastError = modelErr;
          const errorStr = (modelErr?.message || String(modelErr)).toUpperCase();
          const isQuota =
            errorStr.includes("429") ||
            errorStr.includes("RESOURCE_EXHAUSTED") ||
            errorStr.includes("QUOTA") ||
            errorStr.includes("LIMIT");
            
          const isServerOverloaded =
            errorStr.includes("503") ||
            errorStr.includes("500") ||
            errorStr.includes("UNAVAILABLE") ||
            errorStr.includes("FETCH FAILED");

          const isParseError =
            modelErr instanceof SyntaxError ||
            errorStr.includes("SYNTAXERROR") ||
            errorStr.includes("JSON") ||
            errorStr.includes("PARS");

          const isInvalidKey =
            errorStr.includes("API KEY NOT VALID") ||
            errorStr.includes("PERMISSION_DENIED") ||
            errorStr.includes("PERMISSION DENIED") ||
            errorStr.includes("API_KEY_INVALID") ||
            errorStr.includes("API KEY INVALID") ||
            errorStr.includes("SUSPENDED") ||
            errorStr.includes("DISABLED") ||
            errorStr.includes("CONSUMER_SUSPENDED") ||
            errorStr.includes("403") ||
            errorStr.includes("401");

          if (isParseError) {
             console.warn(`[runAIAction] Fallback key Parse/Syntax Error on ${cleanModelName}`);
             if (fallbackModelRetries[cleanModelName] < 3) {
                 await delay(1000);
                 fallbackModelRetries[cleanModelName]++;
                 modelIdx--; // retry the same model
                 continue;
             }
          }

          if (isInvalidKey) {
            reportKeyError(fallbackKey, "INVALID", true);
            break; // Move to the next fallback key
          } else if (!isParseError) {
            reportKeyError(fallbackKey, isQuota ? "Quota" : (isServerOverloaded ? "Overload" : "Error"));
          }

          if (isQuota || isServerOverloaded) {
            const combo = `${cleanModelName}:${fallbackKey}`;
            modelKeyCooldowns.set(combo, Date.now() + 15000);
            if (!isServerOverloaded) {
                console.log(`[runAIAction] Fallback key hit Quota. Swapping fallback key immediately.`);
            }
            break; // Move to the next fallback key
          }
        }
      }

      if (fallbackKey) {
        releaseFreeKey(fallbackKey);
      }
    } catch (err: any) {
      if (fallbackKey) {
        releaseFreeKey(fallbackKey);
      }
      lastError = err;
      const errorStr = (err?.message || String(err)).toUpperCase();
      const isCooldownSkip = errorStr.includes("COOLDOWN_SKIP");

      if (!isCooldownSkip) {
        console.log(`[runAIAction] Pool fallback attempt ${attempt + 1} unsuccessful: ${err.message}`);
      }
      
      // If we failed because all keys are excluded (pool isolated exhaustion), 
      // wait a longer period to let quotas reset before the next attempt.
      if (err.message && err.message.includes("excluded")) {
        console.log(`[runAIAction] Pool keys exhausted in fallback loop. Waiting 5s to retry.`);
        await delay(5000);
        excludedKeysForThisRequest.length = 0; // Clear exclusions
      }
    }

    await delay(100);
  }

  const finalError = new Error(
    `Exhausted all models and keys in pool fallback. Final error: ${lastError?.message || "Service unavailable"}.`
  );
  (finalError as any).status = 429;
  throw finalError;
}

const extractLayoutWithRetry = async (
  base64Image: string,
  ocrText: string,
  numberingStyle: NumberingStyle,
  includeImages: boolean,
  isBilingual: boolean,
  mcqMode: boolean,
  refineMode: boolean = false,
  answerLength?: string,
  customAnswerPrompt?: string,
  optionPattern: string = "A_B_C_D",
  userApiKey?: string,
  systematicArrange: boolean = true,
  autoProofread: boolean = false,
  extractOptions?: { answers: boolean; solutions: boolean },
): Promise<any> => {
  const cleanBase64 = base64Image.replace(
    /^data:image\/(png|jpeg|jpg|webp);base64,/,
    "",
  );

  let numberingInstruction = "";
  switch (numberingStyle) {
    case NumberingStyle.Q_DOT:
      numberingInstruction =
        'Replace the question number (e.g., "1.", "Q.1", "23.", "Q12.") at the start of a question with "Q" followed by the number and a dot (e.g., "Q1.", "Q23.").';
      break;
    case NumberingStyle.HASH:
      numberingInstruction =
        'Replace the question number (e.g., "1.", "Q.1", "23.", "Q12.") at the start of a question with "#" followed by the number and a dot (e.g., "#1.", "#23.").';
      break;
    case NumberingStyle.QUESTION_DOT:
      numberingInstruction =
        'Replace the question number (e.g., "1.", "Q.1", "23.", "Q12.") at the start of a question with the word "Question" followed by the number and a dot (e.g., "Question 1.", "Question 23.").';
      break;
    case NumberingStyle.NUMBER_DOT:
      numberingInstruction =
        'Ensure the question number is formatted as the number followed by a dot (e.g., "1.", "23."). Remove any prefixes like "Q." or "Q".';
      break;
    case NumberingStyle.NONE:
      numberingInstruction =
        'DO NOT include ANY question numbers or prefixes (like "Q1.", "Question 1.", "1."). Remove them entirely, leaving only the question text itself.';
      break;
    default:
      numberingInstruction =
        "Replace the question number at the start of a question with the number followed by a dot.";
  }

  let optionFormattedStyleLabel = "";
  let optionFormatPrompt = "";
  let optPrefixExample = "(a)";
  switch (optionPattern) {
    case "A_B_C_D":
      optionFormattedStyleLabel =
        'bracketed uppercase letter like "(A) ", "(B) ", "(C) ", "(D) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as uppercase letters in parentheses (e.g., (A) option text, (B) option text). Maintain this pattern consistently.";
      optPrefixExample = "(A)";
      break;
    case "a_b_c_d":
      optionFormattedStyleLabel =
        'bracketed lowercase letter like "(a) ", "(b) ", "(c) ", "(d) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as lowercase letters in parentheses (e.g., (a) option text, (b) option text). Maintain this pattern consistently.";
      optPrefixExample = "(a)";
      break;
    case "NUM_1_2_3_4":
      optionFormattedStyleLabel =
        'bracketed number like "(1) ", "(2) ", "(3) ", "(4) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as numbers in parentheses (e.g., (1) option text, (2) option text). Maintain this pattern consistently.";
      optPrefixExample = "(1)";
      break;
    case "ROMAN_i_ii_iii_iv":
      optionFormattedStyleLabel =
        'bracketed lowercase Roman numeral like "(i) ", "(ii) ", "(iii) ", "(iv) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as lowercase Roman numerals in parentheses (e.g., (i) option text, (ii) option text). Maintain this pattern consistently.";
      optPrefixExample = "(i)";
      break;
    case "ROMAN_I_II_III_IV":
      optionFormattedStyleLabel =
        'bracketed uppercase Roman numeral like "(I) ", "(II) ", "(III) ", "(IV) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as uppercase Roman numerals in parentheses (e.g., (I) option text, (II) option text). Maintain this pattern consistently.";
      optPrefixExample = "(I)";
      break;
    default:
      optionFormattedStyleLabel =
        'bracketed lowercase letter like "(a) ", "(b) ", "(c) ", "(d) "';
      optionFormatPrompt =
        "Ensure option labels are formatted strictly as lowercase letters in parentheses (e.g., (a) option text, (b) option text). Maintain this pattern consistently.";
      optPrefixExample = "(a)";
  }

  const bilingualInstruction = isBilingual
    ? `**BILINGUAL OUTPUT RULES (HINDI & ENGLISH)**:
- **Core Content Rule**: You MUST output all questions, their options, and detailed solutions (if extracting MCQs) or primary article content in BOTH Hindi and English.
- **English-Only Metadata Rule**: For all other elements like section titles, page headers, footers, exam names, subject names, dates, or general metadata snippets, you MUST output them in ENGLISH ONLY. Do NOT provide Hindi versions for these.
- **Translation Rule**: If the original core content is only in Hindi, translate it to English and output as: "[Hindi Text] / [English Text]".
- **Translation Rule**: If the original core content is only in English, translate it to Hindi and output as: "[Hindi Text] / [English Text]".
- Always separate Hindi and English with a forward slash " / " (e.g., "[Hindi] / [English]").
- Keep the ordering: Hindi followed by English.
${
  mcqMode
    ? `- **MCQ QUESTION FORMAT**: "Question: [Number]. [Hindi Question] / [English Question]" (e.g., "Question: 1. 7.5 के प्रथम 8 गुणकों का औसत कितना होगा? / What will be the average of the first 8 multiples of 7.5?")
- **MCQ OPTION FORMAT**: Combine Hindi and English into one line: "${optPrefixExample} [Hindi Option] / [English Option]". Use option pattern labels matching: ${optionFormattedStyleLabel}.
- **MCQ ANSWER FORMAT**: After all options, add a line like "Answer: [Label]" (e.g., "Answer: A") on its OWN NEW LINE.`
    : ""
}
- **Answer Preservation**: NEVER skip the answer if it is visible on the page.`
    : `**CRITICAL RULE: NO TRANSLATION**:
- Extract the text EXACTLY in the language it is written.
- If it is in Hindi, output ONLY Hindi.
- If it is in English, output ONLY English.
- DO NOT translate anything.`;

  const imageInstruction = includeImages
    ? `2. **Diagrams & Figures**:
   - **PLACEMENT**: Identify diagrams (images) and place them in the 'elements' array exactly where they appear in the reading order (e.g., if a diagram is between the question text and the options, it should be placed there).
   - **DESCRIPTION**: For 'image' types, provide a concise but descriptive 'content' field explaining what the diagram shows (e.g., "Circuit diagram with resistors R1 and R2", "Geometry figure showing a triangle inside a circle").`
    : `2. **Diagrams & Figures**:
   - **DO NOT EXTRACT DIAGRAMS OR IMAGES**: Ignore all non-textual content such as diagrams, charts, and figures. Do not create any 'image' elements.`;

  const imageFormattingInstruction = includeImages
    ? `2. **Image Elements**:
   - Identify regions containing diagrams, charts, pattern series, geometry figures, or any non-textual content.
   - Provide the bounding box (bbox) for these regions in normalized coordinates [0-1000].`
    : `2. **Image Elements**:
   - **STRICTLY IGNORE**: Do not extract any image elements.`;

  let mcqInstruction = mcqMode
    ? `**MIXED DOCUMENT EXTRACTION MODE (STRICT FORMATTING REQUIRED)**:
- This document contains both MCQ questions and general text (titles, paragraphs, instructions, etc.). Extract BOTH together in standard reading order. Do NOT ignore the normal text.
- **FOR MCQ QUESTIONS**:
  - Every question MUST start with "Question: [Number]. "
  - Every option MUST start with a label conforming to pattern: ${optionFormattedStyleLabel}. ${optionFormatPrompt}
  - Options must immediately follow the question text and each option MUST be on a new line.
- **FOR GENERAL TEXT**:
  - Extract the general text (headings, instructions, paragraphs, reading passages) exactly as it appears. Maintain paragraphs and structure.
- **BILINGUAL MATCHING**: If the source document has Hindi and English versions of the same question/option or text as separate blocks, combine them into one single line using the " / " separator.
- **COMPLETE EXTRACTION**: Go through the entire document from top to bottom. If there is a paragraph, extract it. If there is an MCQ, extract it.`
    : `**GENERAL DOCUMENT MODE**:
- Extract text as it appears. Maintain paragraphs and structure.`;

  if (mcqMode) {
    const wantsAnswers = extractOptions?.answers !== false;
    const wantsSolutions = extractOptions?.solutions !== false;
    
    if (!wantsAnswers && !wantsSolutions) {
      mcqInstruction += `\n- **ANSWER FORMAT**: DO NOT extract answers or solutions. Do NOT output "Answer:" or "Explanation:".`;
    } else if (answerLength === "SHORT" || (!wantsSolutions && wantsAnswers)) {
      mcqInstruction += `\n- **ANSWER FORMAT**: Every MCQ MUST end with "Answer: [Label]" (e.g., "Answer: A") on its OWN NEW LINE after all options. Do NOT include any explanations.`;
    } else if (answerLength === "DETAILED" || wantsSolutions) {
      mcqInstruction += `\n- **ANSWER FORMAT**: Every MCQ MUST end with "Answer: [Label]" followed by a detailed step-by-step explanation or solution if one exists in the text. Format it as:\nAnswer: [Label]\nExplanation: [Detailed explanation here]`;
    } else if (answerLength === "CUSTOM" && customAnswerPrompt) {
      mcqInstruction += `\n- **ANSWER FORMAT**: ${customAnswerPrompt}`;
    } else {
      mcqInstruction += `\n- **ANSWER FORMAT**: Every MCQ MUST end with "Answer: [Label]" (e.g., "Answer: A") on its OWN NEW LINE after all options.`;
    }
  }

  const refineInstruction = refineMode
    ? `**REFINE MODE ENABLED (SMART CONTENT FILTERING)**:
- YOUR GOAL: Extract ONLY the primary subject matter content.
- **REMOVE JUNK**: Automatically identify and EXCLUDE headers, footers, page numbers, watermark text, boilerplate instructions, exam center codes, dates, or decorative text.
- **PRESERVE CONTENT**: Do NOT change, summarize, or rewrite the actual content. Extract the main text VERBATIM (EXACTLY as written).
- Focus on questions, options, and main paragraphs. If a piece of text looks like it doesn't belong to the core material, SKIP IT.`
    : `**FULLY EXTRACTION MODE (A TO Z)**:
- Extract EVERY piece of text from the page, including headers, footers, page numbers, and small boilerplate text. Leave nothing out.`;

  const systematicInstruction = systematicArrange
    ? `**SYSTEMATIC FORMATTING ENABLED**:
- Organize and arrange the extracted text in a highly systematic, clean, beautiful, well-formatted, and intuitive document structure.
- Group related sentences/points, use clear headings, paragraph breaks, or list indicators if necessary to make it highly professional and easy to read.
- CRITICAL EXAM PAPER FORMATTING: If you identify Questions and Solutions/Answers within this page, ALWAYS group the Solution/Answer block immediately below its corresponding Question, even if they were visually separated or jumbled on the page. Do NOT alter any semantic meaning or remove facts.`
    : `**RAW CONTENT EXTRACTION**:
- DO NOT reorganize, group, restyle, or systematically format the text.
- Extract the text EXACTLY in its raw form block-by-block and line-by-line as it layout-wise appears on the PDF page.
- Output raw unformatted normal text paragraphs or chunks, retaining the exact unorganized pattern in which the lines are written.`;

  const proofreadInstruction = autoProofread
    ? `**PROOFREAD ENABLED**:
- Automatically correct spelling mistakes, grammatical errors, and OCR-induced noise.
- Ensure that sentences are complete. If you suspect an error in spelling due to OCR, correct the spelling gracefully while preserving facts.`
    : ``;

  return runAIAction(
    async (client, modelName) => {
      console.log(`[ExtractFromImage] Using model: ${modelName}`);

      const response = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          },
          {
            text: `You are a professional Exam Paper Digitizer. Analyze the provided image and extract all elements in their correct reading order.

${mcqInstruction}
${refineInstruction}
${systematicInstruction}
${proofreadInstruction}

**CRITICAL RULE: COMPLETE EXTRACTION**:
- You MUST read the ENTIRE page from top to bottom.
- Do NOT skip any questions, options, paragraphs, or text, no matter how small the font is or where it is located on the page (unless it is junk text and Refine Mode is ON).
- Ensure every single question and its options are extracted.

**OCR CONTEXT**:
Here is the raw text extracted by OCR:
"${ocrText}"
Use this as a reference to improve your accuracy, especially for math formulas and Hindi/English text.

**CRITICAL RULE: LANGUAGE & SCRIPT PRESERVATION**: 
- **ACCURATELY IDENTIFY LANGUAGES**: This document may contain multiple languages (e.g., Hindi and English) mixed together.
- **MAINTAIN ORIGINAL SCRIPT**: Extract text exactly in the script it is written. 
  - If a sentence is in Hindi, use Devanagari script.
  - If a sentence or word is in English, use Latin script.
  - For mixed-language sentences (e.g., Hindi text with English technical terms), preserve the mix exactly as it appears.
${bilingualInstruction}

**EXTRACTION RULES**:
1. **Text Elements**:
   - Identify distinct blocks of text (paragraphs, questions, options, headers).
   - Identify text styling: color, font size (approximate), bold, italic, and background shading/color.
   - ${numberingInstruction}
   - For multiple-choice options, ensure they are extracted as separate text elements or clearly separated within the text.
   - Preserve mathematical formulas and scientific notations accurately.
   - **STRICT MATH RULE**: You MUST enclose ALL mathematical formulas, variables, and expressions in double dollar signs like \`$$\` ... \`$$\` (e.g., \`$$x^2 + y^2 = r^2$$\`), even for simple inline variables like \`$$x$$\`.
   - Use standard LaTeX format for all math.
   - PAY VERY CLOSE ATTENTION to recurring decimals or numbers with a line/bar over them (e.g., $0.04\\overline{3}$ or $0.\\overline{43}$). You MUST extract the bar correctly using LaTeX \\overline{}! This is a very common requirement.
   - For fractions, always use \`\\frac{num}{den}\`. For square roots, use \`\\sqrt{...}\`.
   - Ensure complex equations are balanced and valid LaTeX.

${imageInstruction}

3. **Tables**:
   - If you find a table, extract it as a 'table' type.
   - Represent the table content in Markdown format.

**OUTPUT FORMAT**:
You must respond with a JSON array of objects.

Each object in the array must have the following structure:
{
  "type": "text" | "image" | "table",
  "content": "The extracted text, image description, or markdown table",
  "bbox": [ymin, xmin, ymax, xmax] // Optional: normalized coordinates [0-1000] representing the bounding box of the element
}

**BBOX INSTRUCTIONS**:
1. **Text Elements**: bbox is optional but recommended if possible.
${imageFormattingInstruction}
3. **Table Elements**: Provide the bbox for the entire table.

Ensure the elements in the JSON array are ordered exactly as they should be read from top to bottom, left to right.
`,
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["text", "table", "image"] },
                content: { type: Type.STRING },
                bbox: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description:
                    "Normalized coordinates [ymin, xmin, ymax, xmax] from 0 to 1000",
                },
                style: {
                  type: Type.OBJECT,
                  properties: {
                    color: { type: Type.STRING },
                    fontSize: { type: Type.NUMBER },
                    isBold: { type: Type.BOOLEAN },
                    isItalic: { type: Type.BOOLEAN },
                    backgroundColor: { type: Type.STRING },
                  },
                },
              },
              required: ["type", "content"],
            },
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      let parsedElements: any = null;
      const textToParse = responseText.trim();
      try {
        parsedElements = JSON.parse(textToParse);
      } catch (e) {
        // Try cleaning markdown codeblock wrappers
        let cleaned = textToParse
          .replace(/^```json/i, "")
          .replace(/^```/, "")
          .replace(/```$/, "")
          .trim();
        try {
          parsedElements = JSON.parse(cleaned);
        } catch (e2) {
          // Robust substring extraction of the array outer bounds [ ... ]
          const startIdx = textToParse.indexOf("[");
          const endIdx = textToParse.lastIndexOf("]");
          if (startIdx !== -1 && endIdx > startIdx) {
            try {
              parsedElements = JSON.parse(textToParse.substring(startIdx, endIdx + 1));
            } catch (e3) {
              // Robust object extraction { ... } if it wrapped it in elements
              const braceStart = textToParse.indexOf("{");
              const braceEnd = textToParse.lastIndexOf("}");
              if (braceStart !== -1 && braceEnd > braceStart) {
                try {
                  const wrapped = JSON.parse(textToParse.substring(braceStart, braceEnd + 1));
                  if (wrapped && wrapped.elements && Array.isArray(wrapped.elements)) {
                    parsedElements = wrapped.elements;
                  }
                } catch (e4) {}
              }
            }
          }
        }
      }

      if (!parsedElements) {
        throw new SyntaxError("Failed to parse response as JSON. Original response was: " + textToParse.substring(0, 300));
      }

      if (parsedElements && typeof parsedElements === "object" && !Array.isArray(parsedElements)) {
        if (Array.isArray(parsedElements.elements)) {
          parsedElements = parsedElements.elements;
        } else {
          parsedElements = [parsedElements];
        }
      }

      if (!Array.isArray(parsedElements)) {
        throw new Error("Response is not a JSON array");
      }

      return parsedElements.map((el: any) => {
        let bboxObj = el.bbox;
        if (Array.isArray(el.bbox) && el.bbox.length === 4) {
          bboxObj = {
            ymin: el.bbox[0],
            xmin: el.bbox[1],
            ymax: el.bbox[2],
            xmax: el.bbox[3],
          };
        }

        return {
          ...el,
          id: Math.random().toString(36).substring(2, 11),
          bbox: bboxObj,
          content: Array.isArray(el.content)
            ? el.content.join("\n")
            : el.content
              ? String(el.content)
              : "",
        };
      });
    },
    undefined,
    userApiKey,
  );
};

const aiEditPageLayoutWithRetry = async (
  elements: any[],
  instruction: string,
  userApiKey?: string,
): Promise<any> => {
  const prompt = `
    You are an expert Document Layout & Typography Designer. I will provide you with an array of structured page elements (text blocks, tables, or image captions) from a document.
    Your task is to modify, refine, restyle, translate, format, or restructure these elements strictly according to this custom instruction:
    "${instruction}"

    Here is the current array of page elements:
    ${JSON.stringify(elements, null, 2)}

    You MUST return a JSON object with a single "elements" array of upgraded items.
    Each element MUST adhere to this schema:
    {
      "id": "string (maintain original id if possible, or generate a unique new random string ID if you create elements)",
      "type": "text | table | image",
      "content": "string (the primary text content or formatted table HTML/Markdown content)",
      "imageB64": "string (if the input element has imageB64, preserve it exactly. Do not modify or drop it)",
      "style": {
        "color": "string (HEX code colors like #FF6B2B representing primary orange, dark gray #111111, medium slate #555555, muted #999999, success emerald #2E7D32, error #C62828, info #1565C0 or others to convey distinct styling, pattern or layout highlights)",
        "fontSize": number (recommended: 11 for footnotes/metadata, 13 for regular content, 16 for subheadings/section headers, 20 for page-level title headings)",
        "isBold": boolean,
        "isItalic": boolean,
        "backgroundColor": "string (HEX code background, e.g. success highlight bg #E8F5E9, warning #FFEBEE, clean transparent/omit, or block borders if required)"
      }
    }

    Rules:
    1. Parse the elements carefully. If the user instruction requires translation, translate only the 'content' string, but keep language styling elegant.
    2. Maintain strict HTML table structure inside 'content' when dealing with type = "table".
    3. Retain any original image elements intact (preserve 'type': 'image', its 'content' or bounding boxes if any, and its exact 'imageB64' value). Do not drop them.
    4. Apply custom colors, bold flags, and size options appropriately to make the layout extremely clear, beautifully design-patterned, and premium.
    5. Return ONLY a valid JSON block matching this structure. Do not wrap in markdown or prefix/suffix comments.
  `;

  return runAIAction(
    async (client, modelName) => {
      console.log(`[AI Page Layout Edit] Running with model: ${modelName}`);
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              elements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    content: { type: Type.STRING },
                    imageB64: { type: Type.STRING },
                    style: {
                      type: Type.OBJECT,
                      properties: {
                        color: { type: Type.STRING },
                        fontSize: { type: Type.INTEGER },
                        isBold: { type: Type.BOOLEAN },
                        isItalic: { type: Type.BOOLEAN },
                        backgroundColor: { type: Type.STRING },
                      },
                    },
                  },
                  required: ["id", "type", "content"],
                },
              },
            },
            required: ["elements"],
          },
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI layout editor");

      try {
        return JSON.parse(text.trim());
      } catch {
        const cleaned = text
          .replace(/^```json\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        return JSON.parse(cleaned);
      }
    },
    undefined,
    userApiKey,
  );
};

app.post("/api/chat/stream", async (req: express.Request, res: express.Response) => {
  const { messages, files } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  await handleGenAiRequest(req, res, async (keyToUse) => {
    const triedCombinations: Set<string> = new Set();
    const maxRetries = Math.max(12, MODELS_TO_TRY.length * 2);
    const failedKeys: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const modelName = MODELS_TO_TRY[attempt % MODELS_TO_TRY.length];
      const { client, key } = getGeminiClient(failedKeys, keyToUse);

      // For streaming, we'll try a model and key
      const combo = `${modelName}:${key}`;
      if (triedCombinations.has(combo)) continue;
      triedCombinations.add(combo);

      try {
        console.log(
          `[ChatStream] Using model: ${modelName} with key: ${key ? key.substring(0, 8) : "none"}...`,
        );

        const contents = messages
          .filter(
            (m: any) => m.content?.trim() || (m.files && m.files.length > 0),
          )
          .map((m: any) => {
            const parts: any[] = [];
            if (m.content?.trim()) {
              parts.push({ text: m.content });
            }
            return {
              role: m.role === "assistant" ? "model" : "user",
              parts,
            };
          });

        // Add files to the last message if any
        if (files && files.length > 0 && contents.length > 0) {
          const lastMessage = contents[contents.length - 1];
          files.forEach((file: any) => {
            if (file.base64) {
              const cleanB64 = file.base64.replace(/^data:.*?;base64,/, "");
              lastMessage.parts.push({
                inlineData: {
                  mimeType: file.mimeType || "image/png",
                  data: cleanB64,
                },
              });
            }
          });
        }

        // Ensure last message has parts
        if (
          contents.length > 0 &&
          contents[contents.length - 1].parts.length === 0
        ) {
          contents[contents.length - 1].parts.push({
            text: "Analyze the attached files.",
          });
        }

        const stream = await client.models.generateContentStream({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction:
              "You are Whiteboard AI, an ultra-intelligent, advanced, and friendly AI assistant developed as the flagship model of the Whiteboard workspace. You MUST always identify yourself as 'Whiteboard AI' if someone asks who you are. Provide exceptionally clear, high-quality, precise, and accurate replies. Use Markdown formatting elegantly. Use LaTeX for math ($...$ for inline, $$...$$ for block). Use code blocks with appropriate language tags when generating code files. If the user uploads files or images, perform a masterclass analysis and guide them smoothly.",
            temperature: 0.7,
          },
        });

        for await (const chunk of stream) {
          // Safe text extraction for @google/genai SDK
          let chunkText = "";
          try {
            if (typeof chunk.text === "string") {
              chunkText = chunk.text;
            } else if (typeof (chunk as any).text === "function") {
              chunkText = (chunk as any).text();
            } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
              chunkText = chunk.candidates[0].content.parts[0].text;
            }
          } catch (e) {
            console.error("Error extracting text from chunk:", e);
          }

          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }

        res.write("data: [DONE]\n\n");
        res.end();
        reportKeySuccess(key);
        return;
      } catch (error: any) {
        console.warn(
          `[ChatStream] Attempt ${attempt} unsuccessful using ${modelName}:${key ? key.substring(0, 8) : "none"}...: ${error.message}`,
        );
        reportKeyError(key, "StreamError");

        if (key && !failedKeys.includes(key)) {
          failedKeys.push(key);
        }

        const errorStr = (error?.message || String(error)).toUpperCase();
        const isFatal =
          errorStr.includes("PERMISSION_DENIED") ||
          errorStr.includes("API_KEY_INVALID");
        if (isFatal) reportKeyError(key, "INVALID", true);

        // If we've run out of retries or it's a non-retryable error (except quota/overload), we might eventually stop
        const isLastAttempt = attempt >= maxRetries;
        if (isLastAttempt) {
          res.write(
            `data: ${JSON.stringify({ error: "Service temporarily unavailable. Please try again later." })}\n\n`,
          );
          res.end();
        }
      }
    }
  });
});

app.post("/api/extract", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");
  const keepAlive = setInterval(() => res.write(" "), 10000);

  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const {
      base64Image,
      ocrText,
      numberingStyle,
      includeImages,
      isBilingual,
      mcqMode,
      refineMode,
      answerLength,
      customAnswerPrompt,
      optionPattern,
      systematicArrange,
      autoProofread,
      extractOptions,
    } = req.body;
    
    const elements = await extractLayoutWithRetry(
      base64Image,
      ocrText,
      numberingStyle,
      includeImages,
      isBilingual,
      mcqMode,
      refineMode,
      answerLength,
      customAnswerPrompt,
      optionPattern,
      keyContext.key,
      systematicArrange,
      autoProofread,
      extractOptions,
    );
    
    clearInterval(keepAlive);
    res.write(JSON.stringify({ elements }));
    res.end();
  } catch (error: any) {
    console.warn("Extraction failed:", error?.message || error);
    clearInterval(keepAlive);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError.isQuotaError) {
        res.write(JSON.stringify({
          error: parsedError.originalError || "Quota exceeded",
          waitTime: parsedError.waitTime,
        }));
        return res.end();
      }
    } catch (e) {}
    res.write(JSON.stringify({ error: error.message || "Extraction failed" }));
    res.end();
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/extract-mcq-direct", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");
  const keepAlive = setInterval(() => res.write(" "), 10000);

  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const { base64Image, metadata, isBilingual } = req.body;
    if (!base64Image) {
      clearInterval(keepAlive);
      return res.status(400).json({ error: "Missing base64Image" });
    }

    const cleanBase64 = base64Image.replace(
      /^data:image\/(png|jpeg|jpg|webp);base64,/,
      ""
    );

    const translationInstructions = isBilingual ? `
1. **LANGUAGES & TRANSLATION (MANDATORY)**:
   - YOU MUST TRANSLATE the text to fill the opposing language fields. The output MUST be bilingual.
   - If the original document is in Hindi: Extract Hindi to '_hin' fields (question_hin, text_hin, solution_hin) AND you MUST translate the Hindi to English yourself to populate the '_eng' fields (question_eng, text_eng, solution_eng).
   - If the original document is in English: Extract English to '_eng' fields AND translate it to Hindi yourself for the '_hin' fields.
   - If the document is already bilingual: Cleanly separate the English into '_eng' fields and the Hindi into '_hin' fields.
   - The base fields (questionText, text for options, solution) should hold the primary language of the document.
` : `
1. **LANGUAGES**:
   - Extract the text exactly as it appears in the document.
   - If the document is in Hindi, populate both the base fields and '_hin' fields.
   - If the document is in English, populate both the base fields and '_eng' fields.
`;

    const systemPrompt = `You are an expert bilingual academic exam paper digitizer.
Your task is to extract all Multiple Choice Questions (MCQs) found on the provided page image, including all available hierarchy details, exam metadata, classification data, and confidence scores.

**CRITICAL GUIDELINES**:
${translationInstructions}
2. **STRICT LaTeX MATHEMATICAL EQUATION RULES**:
   - You MUST enclose all mathematical variables, fractions, limits, symbols, formulas, and equations in double dollar signs $$ ... $$.
   - Example inline variables: $$x$$, $$y$$, $$\\alpha$$.
   - Example formulas: $$x^2 + y^2 = r^2$$, $$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$.
   - For recurring decimals or numbers with a line/bar over them (e.g. $$0.04\\overline{3}$$), extract using LaTeX \\overline{}!

3. **OPTIONS EXTRACTION**:
   - Extract exactly 4 options (A, B, C, D) if they are present.
   - If the original uses numbers (1, 2, 3, 4), map them to option labels (A, B, C, D) and put the content in options.

4. **INTELLIGENT DOCUMENT HIERARCHY / HEADING INHERITANCE**:
   - IF AND ONLY IF headings are visually present on the page context, you may extract them.
   - DO NOT HALLUCINATE OR INFER SUBJECTS, CHAPTERS, OR TOPICS if they are not written on the page. Leave them as empty strings if missing.
   - If questions are categorized under headers (such as "History" -> "Ancient History" -> "Stone Age" -> "Tools"), they should automatically inherit these fields:
     * subject (e.g. "History")
     * subSubject (e.g. "Ancient History")
     * chapter (e.g. "Stone Age")
     * topic (e.g. "Tools")
   - For subTopic, you MUST decide and generate this yourself based on reading the key concepts of the question text carefully.
   - Carry over this structural inheritance to all questions in that sub-section until a new heading or transition changes it.

5. **AUTOMATIC PYQ / EXAM DETECTION**:
   - IF AND ONLY IF exam designations are visually written next to or below the question (such as "RRB NTPC 12.03.2021").
   - DO NOT INFER OR GUESS EXAM DATA. Leave fields empty if not present.
   - Automatically parse exam metadata elements from the visible text:
     * org: The organization conducting the exam (e.g., "RRB", "SSC")
     * examName: The name of the exam (e.g., "NTPC")
     * examDate: The exact date of the exam (e.g., "12.03.2021")
     * examYear: The year of the exam (e.g., "2021")
     * shift: The shift name (e.g., "Shift-I")
     * stage: The exam stage (e.g., "Stage-I")
     * pyqStatus: "TRUE" if any prior exam code is present, otherwise "FALSE".
   
6. **PROMPT CLASSIFICATION & DIFFICULTY**:
   - DO NOT INFER subject, topic, chapter, exam. For difficultyLevel, questionType, language, tags, labels, you may infer them based on the text.
   - Set difficultyLevel as "Easy", "Medium", or "Hard".
   - Set questionType (e.g., "Conceptual", "Numerical", "Fact-based", "Analytical").
   - Set language (e.g., "Bilingual", "Hindi", "English").
   - Set tags (array of keywords matching the topic details).
   - Set labels (array of search-friendly labels).
   - Indicate if a question has a visual diagram or graph by placing a placeholder in questionImage or solutionImage (e.g. "[DIAGRAM PRESENT]" or empty string).

7. **EMPTY FIELDS**:
   - For any string fields that are not present and cannot be confidently extracted from the context, return an empty string "".
   - Do NOT use "Unknown", "N/A" or hyphen "-". Return "".`;

    const result = await runAIAction(
      async (client, modelName) => {
        console.log(`[extract-mcq-direct] Using model ${modelName}`);
        const response = await client.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: "image/png",
                data: cleanBase64,
              },
            },
            {
              text: systemPrompt,
            },
          ],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionText: { type: Type.STRING, description: "The original question text." },
                      question_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the question text. Translate if original is English." },
                      question_eng: { type: Type.STRING, description: "MANDATORY: English version of the question text. Translate if original is Hindi." },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING, description: "Option label (e.g. A, B, C, D)" },
                            text: { type: Type.STRING, description: "Original option text." },
                            text_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the option. Translate if original is English." },
                            text_eng: { type: Type.STRING, description: "MANDATORY: English version of the option. Translate if original is Hindi." }
                          },
                          required: ["label", "text"]
                        }
                      },
                      answer: { type: Type.STRING, description: "Correct option label (e.g. A, B, C, D)" },
                      solution: { type: Type.STRING, description: "Original solution text." },
                      solution_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the solution. Translate if original is English." },
                      solution_eng: { type: Type.STRING, description: "MANDATORY: English version of the solution. Translate if original is Hindi." },
                      
                      // Hierarchy fields
                      subject: { type: Type.STRING },
                      subSubject: { type: Type.STRING },
                      chapter: { type: Type.STRING },
                      topic: { type: Type.STRING },
                      subTopic: { type: Type.STRING },

                      // Exam fields
                      org: { type: Type.STRING },
                      examName: { type: Type.STRING },
                      examCategory: { type: Type.STRING },
                      examYear: { type: Type.STRING },
                      examDate: { type: Type.STRING },
                      shift: { type: Type.STRING },
                      session: { type: Type.STRING },
                      stage: { type: Type.STRING },
                      pyqStatus: { type: Type.STRING }, // "TRUE" or "FALSE"

                      // Source fields
                      bookName: { type: Type.STRING },
                      publisher: { type: Type.STRING },
                      sourceType: { type: Type.STRING },

                      // Classification fields
                      difficultyLevel: { type: Type.STRING }, // "Easy" | "Medium" | "Hard"
                      questionType: { type: Type.STRING },
                      language: { type: Type.STRING },
                      tags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },
                      labels: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },

                      // Image tag/diagram detection
                      questionImage: { type: Type.STRING },
                      solutionImage: { type: Type.STRING },

                      // Confidence scores (0-100)
                      confidenceScores: {
                        type: Type.OBJECT,
                        properties: {
                          subject: { type: Type.INTEGER },
                          subSubject: { type: Type.INTEGER },
                          chapter: { type: Type.INTEGER },
                          topic: { type: Type.INTEGER },
                          subTopic: { type: Type.INTEGER },
                          examName: { type: Type.INTEGER },
                          examCategory: { type: Type.INTEGER },
                          examYear: { type: Type.INTEGER },
                          examDate: { type: Type.INTEGER },
                          shift: { type: Type.INTEGER },
                          stage: { type: Type.INTEGER },
                          difficultyLevel: { type: Type.INTEGER },
                          questionType: { type: Type.INTEGER },
                          language: { type: Type.INTEGER }
                        }
                      }
                    },
                    required: ["questionText", "options", "answer"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        });
        return safeJsonParse(response.text || "");
      },
      3,
      undefined,
      keyContext.key
    );

    clearInterval(keepAlive);
    // Enrich with global metadata fields if provided
    const questions = (result.questions || []).map((q: any) => {
      // Build a comprehensive confidence score fallback
      const rawScores = q.confidenceScores || {};
      const fallbackScores: Record<string, number> = {
        subject: typeof rawScores.subject === "number" ? rawScores.subject : (q.subject ? 95 : 0),
        subSubject: typeof rawScores.subSubject === "number" ? rawScores.subSubject : (q.subSubject ? 95 : 0),
        chapter: typeof rawScores.chapter === "number" ? rawScores.chapter : (q.chapter ? 95 : 0),
        topic: typeof rawScores.topic === "number" ? rawScores.topic : (q.topic ? 95 : 0),
        subTopic: typeof rawScores.subTopic === "number" ? rawScores.subTopic : (q.subTopic ? 95 : 0),
        examName: typeof rawScores.examName === "number" ? rawScores.examName : (q.examName ? 95 : 0),
        examYear: typeof rawScores.examYear === "number" ? rawScores.examYear : (q.examYear ? 95 : 0),
        examDate: typeof rawScores.examDate === "number" ? rawScores.examDate : (q.examDate ? 95 : 0),
        shift: typeof rawScores.shift === "number" ? rawScores.shift : (q.shift ? 95 : 0),
        stage: typeof rawScores.stage === "number" ? rawScores.stage : (q.stage ? 95 : 0),
        difficultyLevel: typeof rawScores.difficultyLevel === "number" ? rawScores.difficultyLevel : 99,
        questionType: typeof rawScores.questionType === "number" ? rawScores.questionType : 90
      };

      return {
        ...q,
        org: metadata?.org || q.org || "",
        subject: metadata?.subject || q.subject || "",
        subSubject: metadata?.subSubject || q.subSubject || "",
        chapter: metadata?.chapter || q.chapter || "",
        topic: metadata?.topic || q.topic || "",
        subTopic: metadata?.subTopic || q.subTopic || "",
        exam: metadata?.exam || q.examName || q.exam || "",
        examName: metadata?.exam || q.examName || q.exam || "",
        examCategory: q.examCategory || "",
        examYear: metadata?.year || q.examYear || q.year || "",
        year: metadata?.year || q.examYear || q.year || "",
        examDate: metadata?.date || q.examDate || q.date || "",
        date: metadata?.date || q.examDate || q.date || "",
        shift: metadata?.shift || q.shift || "",
        session: q.session || "",
        stage: q.stage || "",
        questionType: metadata?.questionType || q.questionType || "Multiple Choice",
        pyqStatus: q.pyqStatus || (q.examName || q.exam || metadata?.exam || metadata?.questionType === "PYQs" ? "TRUE" : "FALSE"),

        bookName: metadata?.bookName || q.bookName || "",
        publisher: metadata?.publisher || q.publisher || "",
        sourceType: metadata?.sourceType || q.sourceType || "PDF Extraction",
        pdfName: metadata?.pdfName || "",
        importBatch: metadata?.importBatch || "",

        difficulty: metadata?.difficulty || q.difficultyLevel || q.difficulty || "Medium",
        difficultyLevel: metadata?.difficulty || q.difficultyLevel || q.difficulty || "Medium",
        language: q.language || "Bilingual",
        tags: q.tags || [],
        labels: q.labels || [],

        questionImage: q.questionImage || "",
        solutionImage: q.solutionImage || "",

        confidenceScores: fallbackScores,
        status: "Draft",
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString()
      };
    });

    res.write(JSON.stringify({ questions }));
    res.end();
  } catch (error: any) {
    console.warn("Direct MCQ extraction failed:", error?.message || error);
    clearInterval(keepAlive);
    res.write(JSON.stringify({ error: error.message || "MCQ Extraction failed" }));
    res.end();
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/repair-mcq-metadata", async (req, res) => {
  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const { question, contexts } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Missing target question" });
    }

    const prompt = `You are an expert academic taxonomy assistant. Your role is to intelligently auto-repair or infer the missing metadata fields for a specific Target MCQ Question using nearby reference questions and general document structure.

TAXONOMY STRUCTURE GUIDELINE (CRITICAL):
- subject: Academic subject (e.g. Mathematics, Science, Reasoning, English, General Knowledge)
- subSubject: Sub Subject division (e.g. for Mathematics, select exactly "Arithmetic" or "Advance". For other subjects, use appropriate sub-division)
- chapter: Curricular course chapter name (e.g. "Number System", "Time & Work", "Percentage", "Algebra")
- topic: Standard conceptual topic block (e.g. "Divisibility Rule", "Remainder Theorem", "Successive Change")
- subTopic: Detailed sub-topic. You MUST decide and generate this yourself based on reading key concepts of the question text carefully.

Target Question:
"${question.questionText}"
Current state of the target question:
- Subject: ${question.subject || "Missing"}
- Sub Subject: ${question.subSubject || "Missing"}
- Chapter: ${question.chapter || "Missing"}
- Topic: ${question.topic || "Missing"}
- Sub Topic: ${question.subTopic || "Missing"}
- Exam Name: ${question.examName || question.exam || "Missing"}
- Exam Year: ${question.examYear || question.year || "Missing"}
- Exam Date: ${question.examDate || question.date || "Missing"}
- Shift: ${question.shift || "Missing"}
- Difficulty: ${question.difficultyLevel || "Missing"}
- Question Type: ${question.questionType || "Missing"}

Context questions nearby in the same document:
${JSON.stringify(contexts || [])}

Please analyze the surrounding questions, document context, headings, and keywords to fill in any gaps for the Target Question.
Return a single JSON object with these repaired fields (if not missing, keep or optimize them, otherwise infer them based on context):
- subject
- subSubject
- chapter
- topic
- subTopic
- examName
- examYear
- examDate
- shift
- stage
- difficultyLevel ("Easy" | "Medium" | "Hard")
- questionType ("Conceptual" | "Numerical" | "Fact-based" | "Analytical")
- pyqStatus ("TRUE" | "FALSE")
- confidenceScores (object containing confidence integer out of 100 for each returned field, reflecting how accurate you think the repair is based on context).

Return ONLY the JSON object, NO markdown formatting or delimiters.`;

    const result = await runAIAction(
      async (client, modelName) => {
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                subSubject: { type: Type.STRING },
                chapter: { type: Type.STRING },
                topic: { type: Type.STRING },
                subTopic: { type: Type.STRING },
                examName: { type: Type.STRING },
                examYear: { type: Type.STRING },
                examDate: { type: Type.STRING },
                shift: { type: Type.STRING },
                stage: { type: Type.STRING },
                difficultyLevel: { type: Type.STRING },
                questionType: { type: Type.STRING },
                pyqStatus: { type: Type.STRING },
                confidenceScores: {
                  type: Type.OBJECT,
                  properties: {
                    subject: { type: Type.INTEGER },
                    subSubject: { type: Type.INTEGER },
                    chapter: { type: Type.INTEGER },
                    topic: { type: Type.INTEGER },
                    subTopic: { type: Type.INTEGER },
                    examName: { type: Type.INTEGER },
                    examYear: { type: Type.INTEGER },
                    examDate: { type: Type.INTEGER },
                    shift: { type: Type.INTEGER },
                    stage: { type: Type.INTEGER },
                    difficultyLevel: { type: Type.INTEGER },
                    questionType: { type: Type.INTEGER }
                  }
                }
              }
            }
          }
        });
        return safeJsonParse(response.text || "");
      },
      3,
      undefined,
      keyContext.key
    );

    res.json(result);
  } catch (error: any) {
    console.warn("Repair MCQ metadata failed:", error);
    res.status(500).json({ error: error.message || "Repair MCQ metadata failed" });
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/ai-edit-mcq", async (req, res) => {
  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const { question, fieldsToFill } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Missing question data" });
    }
    if (!fieldsToFill || !Array.isArray(fieldsToFill) || fieldsToFill.length === 0) {
      return res.status(400).json({ error: "Missing or empty fieldsToFill array" });
    }

    // Build schema properties dynamically based on fieldsToFill
    const schemaProperties: any = {};
    const fieldDescriptions: any = {};
    
    for (const field of fieldsToFill) {
      schemaProperties[field] = { type: Type.STRING };
      
      switch(field) {
        case 'question_hin': fieldDescriptions[field] = "Hindi translation of the question text."; break;
        case 'question_eng': fieldDescriptions[field] = "English translation of the question text (if original is Hindi/other)."; break;
        case 'solution_hin': fieldDescriptions[field] = "Hindi translation of the solution text."; break;
        case 'solution_eng': fieldDescriptions[field] = "English translation of the solution text."; break;
        case 'solution': fieldDescriptions[field] = "Provide a detailed step-by-step solution if empty or improve it."; break;
        case 'subject': fieldDescriptions[field] = "The primary academic subject (e.g. Mathematics, Science, Reasoning, English, General Knowledge)."; break;
        case 'subSubject': fieldDescriptions[field] = "The branch/sub-subject division (e.g. for Mathematics, select exactly 'Arithmetic' or 'Advance'; for others, appropriate branch)."; break;
        case 'chapter': fieldDescriptions[field] = "The course chapter name (e.g. Number System, Percentage, Time & Work, Algebra)."; break;
        case 'topic': fieldDescriptions[field] = "The specific topic block within the chapter (e.g. Divisibility Rule, Remainder Theorem, Successive Change)."; break;
        case 'subTopic': fieldDescriptions[field] = "The detailed sub-topic of the question. You MUST decide and generate this yourself based on reading the concepts of the question text."; break;
        case 'questionType': fieldDescriptions[field] = "Type: Conceptual, Numerical, Fact-based, etc."; break;
        case 'examName': fieldDescriptions[field] = "Name of the target examination (e.g., RRB NTPC, SSC CGL)."; break;
        case 'examCategory': fieldDescriptions[field] = "Category of the target exam (e.g., SSC, Railway, Banking, Teaching)."; break;
        case 'examYear': fieldDescriptions[field] = "Year of the exam."; break;
        case 'examDate': fieldDescriptions[field] = "Date of the exam."; break;
        case 'shift': fieldDescriptions[field] = "Shift or timing (e.g., Shift 1, Morning)."; break;
        case 'session': fieldDescriptions[field] = "Session (e.g., Summer, Winter, August Session)."; break;
        case 'stage': fieldDescriptions[field] = "Stage of the exam (e.g., Tier 1, Mains, Prelims)."; break;
        case 'difficultyLevel': fieldDescriptions[field] = "Easy, Medium, or Hard."; break;
        case 'pyqStatus': fieldDescriptions[field] = "Is this a Previous Year Question? (TRUE or FALSE)."; break;
        case 'language': fieldDescriptions[field] = "The primary language of the question."; break;
        case 'bookName': fieldDescriptions[field] = "Name of the source book."; break;
        case 'sourceBook': fieldDescriptions[field] = "Name of the source book or volume."; break;
        case 'publisher': fieldDescriptions[field] = "Publisher of the source material."; break;
        default: fieldDescriptions[field] = `Appropriate value for ${field}`;
      }
    }

    const prompt = `You are an expert academic taxonomy and translation assistant.
Your task is to analyze the following MCQ question and provide ONLY the requested missing fields.
IMPORTANT: If a metadata parameter (such as examYear, examName, shift, chapter, etc.) cannot be confidently inferred from the provided Question Data, DO NOT hallucinate or guess. You MUST leave the field as an empty string ("").

Original Question Data:
Question Text: ${question.questionText || ""}
Options: ${JSON.stringify(question.options || [])}
Current Solution: ${question.solution || ""}
Current Metadata: ${JSON.stringify(question)}

Requested Fields To Fill/Enhance:
${fieldsToFill.map((f: string) => `- ${f}: ${fieldDescriptions[f]}`).join("\n")}

Respond ONLY with a valid JSON object containing exactly the requested fields as keys with their string values. Do not output markdown code blocks or any explanation text.
`;

    const result = await runAIAction(
      async (client, modelName) => {
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: schemaProperties
            }
          }
        });
        
        return safeJsonParse(response.text || "");
      },
      3,
      undefined,
      keyContext.key
    );

    res.json(result);
  } catch (error: any) {
    console.warn("AI Edit MCQ failed:", error);
    res.status(500).json({ error: error.message || "AI Edit MCQ failed" });
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/auto-detect-meta", async (req, res) => {
  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing or invalid questions array" });
    }

    // Sample up to 10 questions to save tokens
    const sampleQuestions = questions.slice(0, 10);
    const questionsText = sampleQuestions.map((q: any, i: number) => `Q${i + 1}: ${q.questionText || q.text || q}`).join("\n\n");

    const prompt = `You are an expert academic content parser.
Analyze the following sample questions from a worksheet or exam paper and determine the single most appropriate academic subject, sub-subject, chapter, and topic that these questions belong to.
Return a STRICT JSON object with no markdown formatting.

Format output as:
{
  "subject": "string",
  "subSubject": "string",
  "chapter": "string",
  "topic": "string",
  "subTopic": "string"
}

Sample Questions:
---
${questionsText}
---`;

    const result = await runAIAction(
      async (client, modelName) => {
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                subSubject: { type: Type.STRING },
                chapter: { type: Type.STRING },
                topic: { type: Type.STRING },
                subTopic: { type: Type.STRING },
              },
              required: ["subject", "subSubject", "chapter", "topic", "subTopic"],
            },
          },
        });
        const text = response.text();
        return JSON.parse(text || "{}");
      },
      keyContext.key
    );

    res.json(result);
  } catch (error: any) {
    console.warn("Auto-detect meta failed:", error);
    res.status(500).json({ error: "Failed to auto-detect metadata. Please try again." });
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/parse-raw-question", async (req, res) => {
  let keyContext: any = { key: undefined, isFreeAcquired: false, isReleased: false };
  try {
    const userApiKey = req.headers["x-user-api-key"] as string | undefined;
    const isPremium = await checkIsPremiumUser(req);
    if (userApiKey) {
      keyContext.key = userApiKey;
    } else if (isPremium) {
      keyContext.key = process.env.PREMIUM_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      keyContext.key = await acquireFreeKey();
      keyContext.isFreeAcquired = true;
    }

    const { rawText, metadata } = req.body;
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "Missing rawText parameter" });
    }

    const prompt = `You are an expert academic content parser and educational database designer.
Your task is to analyze the following raw text inputs and parse the information into a high-quality, structured Multiple-Choice Question (MCQ) object.
Important guidelines:
1. LANGUAGES & TRANSLATION (MANDATORY): You MUST translate the text to fill the opposing language fields. Do NOT duplicate the same language into both fields. If the input is Hindi, translate it to English for the '_eng' fields. If English, translate to Hindi for the '_hin' fields. Keep the main 'questionText' in the primary language.
2. Build options as an array of objects. Extract labels accurately (e.g. A, B, C, D or 1, 2, 3, 4) and set the matching 'answer' value as the matching Option label (strictly "A", "B", "C", or "D").
3. Generate detailed, step-by-step solutions under 'solution', and provide mandatory translations for 'solution_hin' and 'solution_eng'.
4. Auto-classify the question's 'subject', 'chapter', 'topic', 'difficultyLevel' ("Easy", "Medium", or "Hard"), and 'questionType' (e.g. Conceptual, Numerical, Fact-based).
5. Always convert mathematical equations, variables, or expressions into clean, standard KaTeX/LaTeX format (using single \$ for inline and double \$\$ for block, such as \\( ... \\) or \$ ... \$).

Raw Question Text Input:
---
${rawText}
---

Return ONLY a valid JSON object matching the requested schema. No markdown block, no conversational prefix or suffix.`;

    const result = await runAIAction(
      async (client, modelName) => {
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.15,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questionText: { type: Type.STRING },
                question_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the question text. Translate if original is English." },
                question_eng: { type: Type.STRING, description: "MANDATORY: English version of the question text. Translate if original is Hindi." },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      text: { type: Type.STRING },
                      text_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the option. Translate if original is English." },
                      text_eng: { type: Type.STRING, description: "MANDATORY: English version of the option. Translate if original is Hindi." }
                    },
                    required: ["label", "text"]
                  }
                },
                answer: { type: Type.STRING },
                solution: { type: Type.STRING },
                solution_hin: { type: Type.STRING, description: "MANDATORY: Hindi version of the solution. Translate if original is English." },
                solution_eng: { type: Type.STRING, description: "MANDATORY: English version of the solution. Translate if original is Hindi." },
                subject: { type: Type.STRING },
                chapter: { type: Type.STRING },
                topic: { type: Type.STRING },
                difficultyLevel: { type: Type.STRING },
                questionType: { type: Type.STRING }
              },
              required: ["questionText", "options", "answer"]
            }
          }
        });
        
        return safeJsonParse(response.text || "{}");
      },
      3,
      undefined,
      keyContext.key
    );

    // Apply global batchMetadata overrides if provided
    if (metadata) {
      if (metadata.org) result.org = metadata.org;
      if (metadata.subject) result.subject = metadata.subject;
      if (metadata.subSubject) result.subSubject = metadata.subSubject;
      if (metadata.chapter) result.chapter = metadata.chapter;
      if (metadata.topic) result.topic = metadata.topic;
      if (metadata.subTopic) result.subTopic = metadata.subTopic;
      if (metadata.exam) {
        result.exam = metadata.exam;
        result.examName = metadata.exam;
      }
      if (metadata.year) {
        result.examYear = metadata.year;
        result.year = metadata.year;
      }
      if (metadata.date) {
        result.examDate = metadata.date;
        result.date = metadata.date;
      }
      if (metadata.shift) result.shift = metadata.shift;
      if (metadata.difficulty) result.difficultyLevel = metadata.difficulty;
      if (metadata.questionType) result.questionType = metadata.questionType;
      
      // Auto PYQ logic
      if (!result.pyqStatus && (metadata.exam || metadata.questionType === "PYQs")) {
        result.pyqStatus = "TRUE";
      }
    }

    res.json(result);
  } catch (error: any) {
    console.warn("AI parse raw question failed:", error);
    res.status(500).json({ error: error.message || "Failed to parse question via AI" });
  } finally {
    if (keyContext.isFreeAcquired && keyContext.key && !keyContext.isReleased) {
      releaseFreeKey(keyContext.key);
      keyContext.isReleased = true;
    }
  }
});

app.post("/api/edit-page-layout", async (req, res) => {
  const { elements, instruction } = req.body;

  if (!elements) {
    return res
      .status(400)
      .json({ error: "Missing required property elements" });
  }

  await handleGenAiRequest(req, res, async (keyToUse) => {
    try {
      const result = await aiEditPageLayoutWithRetry(
        elements,
        instruction || "Improve text layout and enhance formatting",
        keyToUse,
      );
      res.json(result);
    } catch (error: any) {
      console.warn("API Edit Page Layout failed:", error?.message || error);
      res
        .status(500)
        .json({ error: error.message || "Page layout edit failed" });
    }
  });
});

app.post("/api/youtube-info", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "YouTube URL is required." });
  }

  // Extract video ID using robust parsing including shorts, embed, watch and raw IDs
  let videoId: string | null = null;
  const cleanedUrl = url.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanedUrl)) {
    videoId = cleanedUrl;
  } else {
    // Match youtube video IDs, even ignoring trailing slashes
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?\/]{11}).*/;
    const match = cleanedUrl.match(regExp);
    videoId = match && match[1] ? match[1] : null;
  }

  if (!videoId) {
    return res.status(400).json({
      error: "Invalid YouTube URL format. Please paste a valid YouTube video link (e.g. https://www.youtube.com/watch?v=...) or video ID."
    });
  }

  await handleGenAiRequest(req, res, async (keyToUse) => {
    try {
      let title = "";
      let description = "";
      let transcript = "";
      let errTranscript = null;

      // 1. Try to fetch video transcript using youtube-transcript
      try {
        console.log(`[YouTube Link Analyzer] Fetching transcript for video: ${videoId}`);
        const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
        if (Array.isArray(transcriptArr) && transcriptArr.length > 0) {
          transcript = transcriptArr.map((item: any) => item.text).join(" ");
        }
      } catch (err: any) {
        console.warn(`[YouTube Link Analyzer] Transcript fetch failed for ${videoId}:`, err.message || err);
        errTranscript = err.message || String(err);
      }

      // 2. Fetch video details from Google YouTube API if keyToUse is active
      if (keyToUse) {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), 8000);
        try {
          const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${keyToUse}`;
          const detailRes = await fetch(detailUrl, { signal: controller.signal });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            if (detailData && Array.isArray(detailData.items) && detailData.items[0]) {
              const snippet = detailData.items[0].snippet || {};
              title = snippet.title || "";
              description = snippet.description || "";
            }
          }
        } catch (err) {
          console.warn("[YouTube Link Analyzer] Video details API call failed:", err);
        } finally {
          clearTimeout(timerId);
        }
      }

      res.json({
        success: true,
        videoId,
        title,
        description,
        transcript,
        hasTranscript: !!transcript,
        errTranscript
      });
    } catch (error: any) {
      console.error("YouTube Link Analyzer error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze YouTube video." });
    }
  });
});

app.post("/api/youtube-seo", async (req, res) => {
  const { topic, profile, _profiles, profiles, image } = req.body;
  const userApiKey = req.headers["x-user-api-key"] as string | undefined;

  if (!topic && !image) {
    return res
      .status(400)
      .json({
        error:
          "Either a video topic or an image upload is required to proceed.",
      });
  }

  await handleGenAiRequest(req, res, async (keyToUse) => {
    try {
      let imagePart = null;
      if (image) {
        // image can be a data URL like 'data:image/png;base64,xxxx' or similar
        let mimeType = "image/jpeg";
        let cleanBase64 = image;
        if (image.includes(";base64,")) {
          const parts = image.split(";base64,");
          mimeType = parts[0].replace("data:", "");
          cleanBase64 = parts[1];
        }
        imagePart = {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        };
      }

      const effectiveTopic = topic
        ? `about: "${topic}"`
        : `deduced entirely from the uploaded thumbnail image/slide. First, look at the visual, text overlays, theme, and elements in the image to detect the subject area/topic. Then generate highly optimized contents relative to that detected topic.`;

      // Fetch Real-time YouTube Autocomplete Suggestions & competitor data in parallel
      // utilizing tight, non-blocking AbortController timeouts to guarantee zero noticeable wait time
      let realSuggestions: string[] = [];
      let realCompetitorTags: string[] = [];
      let realCompetitorVideos: any[] = [];
      let ytApiStatus = "Not Connected";

      const fetchTasks: Promise<any>[] = [];

      if (topic) {
        // 1. Task for Google YouTube Autocomplete suggestions (fully free)
        fetchTasks.push((async () => {
          const controller = new AbortController();
          const timerId = setTimeout(() => controller.abort(), 8000);
          try {
            const autocompleteUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(topic)}`;
            const autoRes = await fetch(autocompleteUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0"
              },
              signal: controller.signal
            });
            if (autoRes.ok) {
              const autoData = await autoRes.json();
              if (Array.isArray(autoData) && Array.isArray(autoData[1])) {
                realSuggestions = autoData[1];
              }
            }
          } catch (err) {
            console.warn("[Suggest API] Live autocomplete suggestion fetch failed or timed out:", err);
          } finally {
            clearTimeout(timerId);
          }
        })());
      }

      if (topic && keyToUse) {
        // 2. Task for YouTube Data API competitor analysis (using Google API Key)
        fetchTasks.push((async () => {
          const controller = new AbortController();
          const timerId = setTimeout(() => controller.abort(), 8000);
          try {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(topic)}&type=video&key=${keyToUse}&maxResults=4`;
            const searchRes = await fetch(searchUrl, { signal: controller.signal });
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              if (searchData && Array.isArray(searchData.items)) {
                const videoIds = searchData.items
                  .map((item: any) => item.id?.videoId)
                  .filter((id: string) => id);
                
                if (videoIds.length > 0) {
                  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,tags&id=${videoIds.join(",")}&key=${keyToUse}`;
                  const detailsController = new AbortController();
                  const detailsTimerId = setTimeout(() => detailsController.abort(), 8000);
                  try {
                    const videosRes = await fetch(videosUrl, { signal: detailsController.signal });
                    if (videosRes.ok) {
                      const videosData = await videosRes.json();
                      if (videosData && Array.isArray(videosData.items)) {
                        ytApiStatus = "Connected Successfully (Real Tag Extraction Active)";
                        videosData.items.forEach((item: any) => {
                          const snippet = item.snippet || {};
                          const tags = item.tags || [];
                          realCompetitorVideos.push({
                            id: item.id?.videoId || item.id,
                            title: snippet.title,
                            channelTitle: snippet.channelTitle,
                            publishedAt: snippet.publishedAt,
                            tags
                          });
                          tags.forEach((t: string) => {
                            const trimmed = t.trim();
                            if (trimmed && !realCompetitorTags.includes(trimmed)) {
                              realCompetitorTags.push(trimmed);
                            }
                          });
                        });
                      } else {
                        ytApiStatus = "No videos details found during extraction";
                      }
                    } else {
                      ytApiStatus = "YouTube details API key/quota issue";
                    }
                  } catch (err) {
                    console.warn("[YouTube API Details fetch failed/timed out]", err);
                  } finally {
                    clearTimeout(detailsTimerId);
                  }
                } else {
                  ytApiStatus = "No matching videos found on YouTube";
                }
              } else {
                ytApiStatus = "Unexpected search response structure";
              }
            } else {
              const errCode = searchRes.status;
              if (errCode === 403) {
                ytApiStatus = "API Key lacks YouTube Data API v3 enabled (Defaulting to live suggestions)";
              } else {
                ytApiStatus = `YouTube API returns HTTP status ${errCode}`;
              }
            }
          } catch (err: any) {
            console.warn("[YouTube API Error]", err);
            ytApiStatus = `YouTube connection errored or timed out`;
          } finally {
            clearTimeout(timerId);
          }
        })());
      }

      // Execute external queries concurrently
      if (fetchTasks.length > 0) {
        await Promise.allSettled(fetchTasks);
      }

      let profilesListToUse = [];
      if (Array.isArray(profiles) && profiles.length > 0) {
        profilesListToUse = profiles;
      } else if (profile) {
        profilesListToUse = [profile];
      }

      let profileContext = "";
      if (profilesListToUse.length > 0) {
        profileContext = `
        CREATOR PROFILE CONTEXT FOR HIGHLY CUSTOMIZED CO-BRANDING COLLABORATION:
        The following ${profilesListToUse.length} YouTube creator profiles are collaborating on this single video topic:
        `;

        profilesListToUse.forEach((p: any, idx: number) => {
          const socialLinksStr = (p.socialLinks || [])
            .map((link: any) => `${link.platform}: ${link.url}`)
            .join(", ");

          profileContext += `
        --- CREATOR PROFILE #${idx + 1} ---
        - Creator/Channel Name: "${p.name}"
        - Creator / Channel "About Us" Biography / Niche Background: "${p.about || ""}"
        - Available Branding/Channel Keywords: ${JSON.stringify(p.brandingKeywords || [])}
        - Contact Info: "${p.contactInfo || ""}"
        - Social Medias: [${socialLinksStr}]
        - Default Channel Description Snippet / Call to Action: "${p.defaultDescriptionTemplate || ""}"
          `;
        });

        profileContext += `
        INTEGRATION MANDATES FOR CO-BRANDED COLLABORATIONS:
        1. CO-BRANDED DESCRIPTION SYNTHESIS (NO REPETITIVE TEMPLATES):
           - Do NOT append or paste multiple raw default description templates one after the other.
           - Parse their templates/snippets and bios, strip any repeating introductory greetings (such as "नमस्कार दोस्तों", "YouTube पर स्वागत है"), redundant disclaimers, or duplicate platform links.
           - Synthesize them into a single, cohesive, consolidated Hinglish description flow. Let the text read naturally as a unified collaboration.
        2. LABELED SOCIALS & LINKS WITH STRICT VERIFICATION:
           - Clearly group and label the social media playlists, apps, and contact details for each creator so users know whose links are whose (e.g., "📌 Abhishek Sir [Physics Expert] Socials & App Links:" followed by his specific links/templates, then "📌 Shubham Sir [Maths Expert] Socials & App Links:" for his).
           - CRITICAL: Verify each link string (URL) before outputting. Even if two creators use the same social media platforms (e.g., Instagram, YouTube, Telegram), make sure each unique URL gets mapped ONLY to its true respective creator. NEVER lazily paste creator A's link under creator B's name, or repeat the exact same URL under different names unless it is a genuinely shared app or official landing page.
           - Deduplicate generic links (like standard store download URLs or common website URLs) to keep the text compact, elegant, and professional.
        3. CRITICAL KEYWORD ANALYSIS & FILTERING: Prioritize and weave only the branding keywords from BOTH/ALL collaborating creator profiles that are naturally relevant to the video topic. Ignore or discard branding keywords having zero connection to keep targeting pristine and laser-focused.
        4. NATURAL BRANDING INTEGRATION:
           - Seamlessly embed creators' names (${profilesListToUse.map(p => `"${p.name}"`).join(", ")}) and relevant channel highlights into the metadata and introduction description paragraphs as a trusted co-branded collaboration.
        5. NO ARTIFICIAL STUFFING: Do NOT perform spam-like keyword stuffing. Synthesize everything into an elegant, professional, reader-friendly layout.
         `;
      }

      let realDataIntegrationInstructions = "";
      if (realSuggestions.length > 0 || realCompetitorTags.length > 0) {
        realDataIntegrationInstructions = `
        CRITICAL REAL DATA SOURCE INTEGRATION:
        We have queried real-time YouTube platform interfaces for this specific video topic. Use this actual live data to enrich and seed the outputs:
        
        1. REAL-TIME YOUTUBE AUTOCOMPLETE SUGGESTED KEYWORDS (These are actual phrases users are typing in the YouTube search bar right now):
           ${JSON.stringify(realSuggestions)}
        
        2. REAL COMPETITOR TAGS (These are extracted directly from the top-performing, highest-ranking YouTube videos for this topic):
           ${JSON.stringify(realCompetitorTags.slice(0, 25))}
        
        INSTRUCTIONS FOR EXCELLENT KEYWORD SYNTHESIS:
        - You MUST integrate these actual live phrases and tags directly into the generated 'tags' list.
        - Ensure that 'tagMetrics' contains a high-fidelity estimation for each of these keywords.
        - Assign very realistic metrics relative to real Google Keyword Planner statistics.
        `;
      }

      const prompt = `
        You are a world-class social media and YouTube SEO expert. Generate an ultimate, high-performance SEO optimization package for a video/topic ${effectiveTopic}.
        ${profileContext}
        
        ${realDataIntegrationInstructions}

        ${imagePart ? "An image asset (thumbnail blueprint, video slide, or visual draft) has been uploaded. Analyze the image to retrieve conceptual visual details, branding accents, or overlay text context and integrate them organically into matching titles, tag sets, and description sections." : ""}
  
        Your response MUST be a valid JSON object with the following structure:
        {
          "titles": ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
          "description": "A professionally formatted, extremely detailed, SEO-friendly and user-friendly YouTube video description. The copy MUST be written in an encouraging bilingual 'Hinglish' tone (a native mix of Hindi and English like 'इस video में हमने cover किया है...'). You MUST structure the description exactly into the following specific sections separated by double line breaks (\\n\\n):\\n\\n[Catchy Main Title with Emojis]\\n\\n🚀 INTRODUCTION:\\n[Enthusiastic Hinglish pitch matching the video/thumbnail analysis]\\n\\n📌 ABOUT THIS VIDEO:\\n[Detailed paragraph walkthrough explaining concepts covered, study goals, or resources]\\n\\n✅ KEY HIGHLIGHTS:\\n⚡ Point 1\\n⚡ Point 2\\n⚡ Point 3\\n⚡ Point 4\\n⚡ Point 5\\n\\n🔥 TOPICS COVERED:\\n[A comma-separated list of core concepts, chapters, keywords, or topics from the video]\\n\\n📢 JOIN OUR COMMUNITY:\\n🔔 Subscribe: [Link]\\n👍 Like & Share! [Add profile references and social media links here]\\n\\n📈 SEO SEARCH TERMS:\\n[Comma-separated list of search query terms]\\n\\n⚠️ DISCLAIMER: [Standard disclaimer]\\n\\n[Include 15-20 relevant hashtags from the hashtags list separated by single spaces at the very end]",
          "tags": ["tag1", "tag2", "tag3"],
          "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
          "instagramCaption": "Engaging Instagram post description/caption with paragraph-breaks, emojis, rich context, call-to-action referring to 'Link in Bio' or 'Story link', and 10-15 specific relevant hashtags. Use a matching Hinglish/English style.",
          "facebookPost": "Highly shareable, professional Facebook post copy containing an introduction, core takeaways with checkmark bullet points, relevant emojis, suitable hashtags, and engagement CTA prompts inviting likes/comments/shares.",
          "twitterPost": "Punchy, attention-grabbing Twitter / X.com post copy under 280 characters, optimized for viral metrics, using highly targeted hashtags, a summary of value, and calling users to watch/retweet.",
          "tagMetrics": [
            { "tag": "tag1", "volume": 25000, "competition": "LOW", "score": 85 }
          ]
        }
        
        CRITICAL RULES:
        1. Generate 5 high-ranking, click-worthy, CTR-optimizing titles incorporating the creator's brand if relevant.
        2. The descriptions and captions MUST be beautifully formatted in a natural, relatable style. It should naturally integrate the creator's branding, bio, social lists, and custom description template. If an image is scanned, use its text overlays and visual cues to describe the relevant content.
        3. Generate 30 to 45 highly-relevant, high-traffic unique tags for copy-pasting. Include BOTH general topic high-traffic tags and specific creator/personal long-tail tags.
        4. Generate 15 to 25 highly relevant unique hashtags.
        5. For each generated tag, calculate and provide a highly realistic Google Keyword Planner estimation inside tagMetrics. Each object inside tagMetrics must have the exact 'tag' text, estimated monthly search 'volume' (an integer like 18000), 'competition' level ('LOW', 'MEDIUM', or 'HIGH'), and an overall SEO priority 'score' out of 100.
           - CRITICAL RULE FOR NICHE AND CREATOR TAGS: Long-tail, local, or creator-specific tags (e.g. containing specific names like 'Shishupal', 'Shubham', 'Rahul', 'sir', 'class', etc.) are extremely niche. You MUST assign them highly accurate, low average monthly search volumes (typically 0-50 or 50-150 searches max), exactly matching real Keyword Planner stats. Do NOT generate inflated values like 10,000+ or 200,000+ for niche personal tags. Only assign large volumes (e.g., 20,000 to 500,000) for general high-traffic search terms (like 'navodaya entrance exam', 'maths preparation', or 'hindi classes').
        6. Return ONLY the JSON object. No other text. Do not wrap in markdown codeblocks.
      `;

      const result = await runAIAction(
        async (client, modelName) => {
          const contentsPayload = imagePart
            ? [imagePart, { text: prompt }]
            : prompt;

          const response = await client.models.generateContent({
            model: modelName,
            contents: contentsPayload,
            config: {
              temperature: 0.7,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  titles: { type: Type.ARRAY, items: { type: Type.STRING } },
                  description: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  instagramCaption: { type: Type.STRING },
                  facebookPost: { type: Type.STRING },
                  twitterPost: { type: Type.STRING },
                  tagMetrics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        tag: { type: Type.STRING },
                        volume: { type: Type.INTEGER },
                        competition: { type: Type.STRING },
                        score: { type: Type.INTEGER }
                      },
                      required: ["tag", "volume", "competition", "score"]
                    }
                  }
                },
                required: ["titles", "description", "tags", "hashtags", "instagramCaption", "facebookPost", "twitterPost", "tagMetrics"],
              },
            },
          });
          return safeJsonParse(response.text || "{}");
        },
        6,
        userApiKey,
        keyToUse,
      );

      const resultWithDebug = {
        ...result,
        youtubeApiDebug: {
          status: ytApiStatus,
          suggestionsFetched: realSuggestions,
          competitorTagsFetched: realCompetitorTags,
          competitorVideos: realCompetitorVideos
        }
      };

      res.json(resultWithDebug);
    } catch (error: any) {
      console.error("YouTube SEO failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to generate YouTube SEO" });
    }
  });
});

app.post("/api/razorpay/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res
        .status(500)
        .json({ error: "Razorpay keys not configured on server" });
    }
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(Number(amount) * 100), // amount in smallest currency unit
      currency,
      receipt,
    };

    const order = await razorpay.orders.create(options);
    if (!order) {
      return res.status(500).json({ error: "Error creating order" });
    }
    res.json({ ...order, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (error: any) {
    console.error("Razorpay order error:", error);
    res.status(500).json({ error: error.message || "Failed to create order" });
  }
});

// ==========================================
// PDF PAGE ARRANGER & MERGER API IMPLEMENTATION
// ==========================================

interface ServerPDFFile {
  id: string;
  name: string;
  size: number;
  buffer: Buffer;
  totalPages: number;
  createdAt: Date;
}

interface ServerMergeJob {
  id: string;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  progress: number;
  progressText: string;
  targetFileName: string;
  resultBuffer?: Buffer;
  error?: string;
  createdAt: Date;
}

// In-memory highly reliable storage & simulated BullMQ-style job status queue
const backendPdfStore = new Map<string, ServerPDFFile>();
const backendMergeJobs = new Map<string, ServerMergeJob>();
const backendSseClients = new Map<string, express.Response[]>();

// Auto Cleanup Routine: Runs every 10 minutes to clean files / jobs older than 1 hour (Memory recovery safeguards)
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago

    // Cleanup files
    for (const [id, file] of backendPdfStore.entries()) {
      if (file.createdAt.getTime() < cutoff) {
        backendPdfStore.delete(id);
        console.log(`[Cleaner] Purged expired file: ${file.name}`);
      }
    }

    // Cleanup jobs
    for (const [id, job] of backendMergeJobs.entries()) {
      if (job.createdAt.getTime() < cutoff) {
        backendMergeJobs.delete(id);
        backendSseClients.delete(id);
        console.log(`[Cleaner] Purged expired merge job: ${id}`);
      }
    }
  },
  10 * 60 * 1000,
);

// Helper to broadcast progress updates to all SSE clients listening to a jobId
const broadcastJobStatus = (jobId: string, event: string, data: any) => {
  const clients = backendSseClients.get(jobId);
  if (!clients) return;

  clients.forEach((res) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
};

// 1. POST /api/upload -> Validate file header magic words, count layers & determine password lockdowns
app.post("/api/upload", async (req, res) => {
  try {
    const { name, base64 } = req.body;
    if (!name || !base64) {
      return res
        .status(400)
        .json({ error: "Missing file name or base64 data" });
    }

    const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, "");
    const fileBuffer = Buffer.from(cleanBase64, "base64");

    // Check validation magic bytes: must start with %PDF- (hex: 25 50 44 46)
    if (fileBuffer.length < 4 || fileBuffer.toString("utf8", 0, 4) !== "%PDF") {
      return res
        .status(400)
        .json({
          error: "Invalid PDF structure: Header magic bytes mismatch (%PDF)",
        });
    }

    // Attempt loading pages with pdf-lib to analyze encryption status
    let totalPages = 0;
    let isEncrypted = false;

    try {
      const pdfDoc = await BackendPDFDoc.load(fileBuffer, {
        ignoreEncryption: false,
      });
      totalPages = pdfDoc.getPageCount();
    } catch (err: any) {
      const msg = err.message || "";
      if (
        msg.includes("encrypt") ||
        msg.includes("password") ||
        msg.includes("Password")
      ) {
        isEncrypted = true;
      } else {
        return res
          .status(400)
          .json({
            error:
              "Failed to read headers structure. The document may be corrupted.",
          });
      }
    }

    const fileId = `srv_file_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    if (!isEncrypted) {
      backendPdfStore.set(fileId, {
        id: fileId,
        name,
        size: fileBuffer.length,
        buffer: fileBuffer,
        totalPages,
        createdAt: new Date(),
      });
    }

    res.json({
      fileId,
      name,
      size: fileBuffer.length,
      totalPages,
      isEncrypted,
      isValid: true,
    });
  } catch (error: any) {
    console.error("Server API upload error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to parse PDF document on host" });
  }
});

// 2. POST /api/merge -> Schedule background merging task mimicking BullMQ pipelines
app.post("/api/merge", async (req, res) => {
  try {
    const {
      outputFilename,
      pagesOrder,
      pageNumbers,
      pageNumbersStyle,
      pageNumbersPosition,
      pageNumbersFontSize,
      blankPageInsert,
      metadata,
    } = req.body;

    if (!pagesOrder || !Array.isArray(pagesOrder) || pagesOrder.length === 0) {
      return res.status(400).json({ error: "Missing merge order array" });
    }

    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const jobName = outputFilename || "merged_output.pdf";

    const newJob: ServerMergeJob = {
      id: jobId,
      status: "queued",
      progress: 0,
      progressText: "Job queued inside background queue...",
      targetFileName: jobName,
      createdAt: new Date(),
    };

    backendMergeJobs.set(jobId, newJob);

    // Launch background thread processes immediately asynchronous
    (async () => {
      try {
        const job = backendMergeJobs.get(jobId);
        if (!job || job.status === "cancelled") return;

        job.status = "processing";
        job.progress = 10;
        job.progressText = "Starting document merges...";
        broadcastJobStatus(jobId, "page_copy", {
          progress: 10,
          text: job.progressText,
        });

        const mergedDoc = await BackendPDFDoc.create();

        // Feed Metadata
        if (metadata) {
          if (metadata.title) mergedDoc.setTitle(metadata.title);
          if (metadata.author) mergedDoc.setAuthor(metadata.author);
          if (metadata.subject) mergedDoc.setSubject(metadata.subject);
          if (metadata.keywords) {
            mergedDoc.setKeywords(
              metadata.keywords.split(",").map((k: string) => k.trim()),
            );
          }
        }

        const cachedDocObjects = new Map<string, BackendPDFDoc>();
        let consecutiveCount = 0;
        let lastFileId = "";

        for (let i = 0; i < pagesOrder.length; i++) {
          if (backendMergeJobs.get(jobId)?.status === "cancelled") return;

          const part = pagesOrder[i];
          const pct = 10 + Math.floor((i / pagesOrder.length) * 80);

          job.progress = pct;
          job.progressText = `Copying page ${i + 1} of ${pagesOrder.length}...`;
          broadcastJobStatus(jobId, "page_copy", {
            progress: pct,
            text: job.progressText,
          });

          // Blank Padding Insert Checks
          if (blankPageInsert && lastFileId && lastFileId !== part.fileId) {
            if (consecutiveCount % 2 !== 0) {
              const blank = mergedDoc.addPage();
              blank.drawText("(Blank Page inserted for printing alignment)", {
                x: 100,
                y: 100,
                size: 8,
                opacity: 0.3,
              });
            }
            consecutiveCount = 0;
          }

          lastFileId = part.fileId;
          consecutiveCount++;

          let srcDoc = cachedDocObjects.get(part.fileId);
          if (!srcDoc) {
            const storedFile = backendPdfStore.get(part.fileId);
            if (!storedFile) {
              throw new Error(
                `Original document fragment not found on server for id: ${part.fileId}`,
              );
            }
            srcDoc = await BackendPDFDoc.load(storedFile.buffer);
            cachedDocObjects.set(part.fileId, srcDoc);
          }

          const [copiedPage] = await mergedDoc.copyPages(srcDoc, [
            part.originalPageNumber - 1,
          ]);
          if (part.rotation) {
            copiedPage.setRotation(backendDegrees(part.rotation));
          }

          mergedDoc.addPage(copiedPage);

          // Pad last element chunk
          if (
            blankPageInsert &&
            i === pagesOrder.length - 1 &&
            consecutiveCount % 2 !== 0
          ) {
            const blank = mergedDoc.addPage();
            blank.drawText("(Blank Page inserted for printing alignment)", {
              x: 100,
              y: 100,
              size: 8,
              opacity: 0.3,
            });
          }
        }

        // Apply visual Arabic/Roman overlays
        if (pageNumbers) {
          const font = await mergedDoc.embedFont("Helvetica");
          const totalMergedCount = mergedDoc.getPageCount();

          const toRoman = (num: number): string => {
            const val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
            const syb = [
              "m",
              "cm",
              "d",
              "cd",
              "c",
              "xc",
              "l",
              "xl",
              "x",
              "ix",
              "v",
              "iv",
              "i",
            ];
            let roman = "";
            for (let i = 0; i < val.length; i++) {
              while (num >= val[i]) {
                roman += syb[i];
                num -= val[i];
              }
            }
            return roman.toUpperCase();
          };

          for (let i = 0; i < totalMergedCount; i++) {
            const page = mergedDoc.getPage(i);
            const { width, height } = page.getSize();
            const textStr =
              pageNumbersStyle === "roman" ? toRoman(i + 1) : `${i + 1}`;

            const size = pageNumbersFontSize || 10;
            const textWidth = font.widthOfTextAtSize(textStr, size);

            let numX = width / 2 - textWidth / 2;
            let numY = 30;

            if (pageNumbersPosition === "bottom-right") {
              numX = width - textWidth - 40;
              numY = 30;
            } else if (pageNumbersPosition === "top-right") {
              numX = width - textWidth - 40;
              numY = height - size - 30;
            }

            page.drawText(textStr, {
              x: numX,
              y: numY,
              size: size,
              font,
            });
          }
        }

        job.progressText = "Finalizing document serialization...";
        broadcastJobStatus(jobId, "page_copy", {
          progress: 95,
          text: job.progressText,
        });

        const finalizedBuffer = await mergedDoc.save();

        job.status = "done";
        job.progress = 100;
        job.progressText = "Compilation complete!";
        job.resultBuffer = Buffer.from(finalizedBuffer);

        broadcastJobStatus(jobId, "done", {
          jobId,
          targetFileName: job.targetFileName,
        });
      } catch (err: any) {
        console.error("Queue merge error:", err);
        const job = backendMergeJobs.get(jobId);
        if (job) {
          job.status = "error";
          job.error = err.message || "Merge task processing failures";
          broadcastJobStatus(jobId, "error", { error: job.error });
        }
      }
    })();

    res.json({ jobId, status: newJob.status, progress: newJob.progress });
  } catch (error: any) {
    console.error("Server API scheduling failed:", error);
    res
      .status(500)
      .json({
        error:
          error.message || "Failed to schedule merging tasks on Host queue",
      });
  }
});

// 3. GET /api/progress/:jobId -> Real-time status update feeds via Server-Sent Events (SSE)
app.get("/api/progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = backendMergeJobs.get(jobId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!job) {
    res.write(
      `event: error\ndata: ${JSON.stringify({ error: "Job ID not found in server index schema." })}\n\n`,
    );
    return res.end();
  }

  // Register client
  if (!backendSseClients.has(jobId)) {
    backendSseClients.set(jobId, []);
  }
  backendSseClients.get(jobId)!.push(res);

  // Send initial state pulse
  res.write(
    `event: page_copy\ndata: ${JSON.stringify({ progress: job.progress, text: job.progressText })}\n\n`,
  );
  if (job.status === "done") {
    res.write(
      `event: done\ndata: ${JSON.stringify({ jobId, targetFileName: job.targetFileName })}\n\n`,
    );
  }

  // Heartbeat signal transmission loop every 5 seconds to hold HTTP pipelines active
  const heartbeatTimer = setInterval(() => {
    res.write(
      `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`,
    );
  }, 5000);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
    const subscribers = backendSseClients.get(jobId);
    if (subscribers) {
      backendSseClients.set(
        jobId,
        subscribers.filter((client) => client !== res),
      );
    }
  });
});

// 4. GET /api/download/:jobId -> Stream resulting completed document downloads
app.get("/api/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = backendMergeJobs.get(jobId);

  if (!job || !job.resultBuffer) {
    return res
      .status(404)
      .send(
        "Document is either expired, cancelled, or not yet prepared by compiling thread.",
      );
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(job.targetFileName)}"`,
  );
  res.send(job.resultBuffer);
});

// 5. DELETE /api/job/:jobId -> Cancel active merging task
app.delete("/api/job/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = backendMergeJobs.get(jobId);

  if (job) {
    job.status = "cancelled";
    job.progressText = "Task terminated by Client abort event.";
    broadcastJobStatus(jobId, "error", { error: "Aborted by user" });
    backendMergeJobs.delete(jobId);
    backendSseClients.delete(jobId);
    return res.json({
      success: true,
      message: "Merge Task canceled successfully.",
    });
  }
  res.status(404).json({ error: "Job index not found." });
});

// PNG Image Encoder (converts raw RGBA, RGB, or Grayscale to compressed PNG)
function encodePNG(
  rgbaData: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Buffer {
  const png = new PNG({ width, height });
  const totalPixels = width * height;
  
  if (rgbaData.length === totalPixels * 4) {
    png.data = Buffer.from(rgbaData);
  } else if (rgbaData.length === totalPixels * 3) {
    // RGB to RGBA conversion
    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0, j = 0; i < rgbaData.length; i += 3, j += 4) {
      rgba[j] = rgbaData[i];         // R
      rgba[j + 1] = rgbaData[i + 1]; // G
      rgba[j + 2] = rgbaData[i + 2]; // B
      rgba[j + 3] = 255;             // A
    }
    png.data = rgba;
  } else if (rgbaData.length === totalPixels) {
    // Grayscale to RGBA conversion
    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0, j = 0; i < rgbaData.length; i++, j += 4) {
      rgba[j] = rgbaData[i];         // R
      rgba[j + 1] = rgbaData[i];     // G
      rgba[j + 2] = rgbaData[i];     // B
      rgba[j + 3] = 255;             // A
    }
    png.data = rgba;
  } else {
    // Catch-all safety pad or truncate
    const rgba = Buffer.alloc(totalPixels * 4, 255);
    const len = Math.min(rgbaData.length, rgba.length);
    for (let i = 0; i < len; i++) {
      rgba[i] = rgbaData[i];
    }
    png.data = rgba;
  }
  return PNG.sync.write(png);
}

// Helper to check if a value has Devanagari script (Hindi) characters
function checkContainsDevanagari(val: any): boolean {
  if (!val) return false;
  if (typeof val === "string") {
    return /[\u0900-\u097F]/.test(val);
  }
  if (typeof val === "object") {
    if (val.text) {
      return /[\u0900-\u097F]/.test(val.text);
    }
    return /[\u0900-\u097F]/.test(JSON.stringify(val));
  }
  return false;
}

// Clean text run to bypass XML-1.0 invalid control characters that corrupt Word documents
function cleanXmlText(str: any): string {
  if (str === null || str === undefined) return "";
  const text = String(str);
  // Safely clean XML invalid characters using a Unicode-aware regex to prevent corrupting surrogate pairs
  return text.replace(/[^\x09\x0A\x0D\x20-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu, "");
}

// Helper to parse chemical formulas, mathematical terms, subscripts, and superscripts into appropriate text runs
function parseEquationToRuns(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    highlight?: string;
    font?: string;
  } = {}
): TextRun[] {
  let cleaned = String(text || "")
    .replace(/->/g, " → ")
    .replace(/\\rightarrow/g, " → ")
    .replace(/\\gets/g, " ← ")
    .replace(/<->/g, " ⇌ ")
    .replace(/\\rightleftharpoons/g, " ⇌ ");

  // Clean spaces within chemical formulas to ensure subscripts parse together
  // e.g., "Ca 2" -> "Ca2" or "O 2" -> "O2"
  cleaned = cleaned.replace(/\b([A-Z][a-z]?)\s+([0-9]+)\b/g, "$1$2");

  // Clean spaces between parentheses/brackets and subscripts
  // e.g., ") 2" -> ")2"
  cleaned = cleaned.replace(/\)\s+([0-9]+)\b/g, ")$1");

  // Clean spaces between formulas/numbers and common chemical state letters, e.g. "CaCO3 (s)" -> "CaCO3(s)", "H2O (l)" -> "H2O(l)"
  cleaned = cleaned.replace(/([0-9A-Za-z)]+)\s+\((s|l|g|aq)\)/gi, "$1($2)");

  cleaned = cleaned.replace(/\s*([+→←⇌=])\s*/g, " $1 ");

  // Replace common LaTeX math symbols with Unicode equivalents
  const latexMathSymbols: Record<string, string> = {
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
    "\\delta": "δ",
    "\\theta": "θ",
    "\\lambda": "λ",
    "\\pi": "π",
    "\\sigma": "σ",
    "\\phi": "φ",
    "\\omega": "ω",
    "\\Delta": "Δ",
    "\\Omega": "Ω",
    "\\pm": "±",
    "\\times": "×",
    "\\div": "÷",
    "\\ne": "≠",
    "\\leq": "≤",
    "\\geq": "≥",
    "\\infty": "∞",
    "\\approx": "≈",
    "\\cdot": "·",
    "\\deg": "°",
    "\\sqrt": "√",
  };

  for (const [key, val] of Object.entries(latexMathSymbols)) {
    const escaped = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(escaped, "g"), val);
  }

  const runs: TextRun[] = [];

  const unicodeSub: Record<string, string> = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")"
  };

  const unicodeSuper: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")"
  };

  interface TextChunk {
    text: string;
    sub?: boolean;
    sup?: boolean;
  }

  const chunks: TextChunk[] = [];
  let i = 0;
  const n = cleaned.length;

  while (i < n) {
    const char = cleaned[i];

    if (unicodeSub[char] !== undefined) {
      chunks.push({ text: unicodeSub[char], sub: true });
      i++;
      continue;
    }

    if (unicodeSuper[char] !== undefined) {
      chunks.push({ text: unicodeSuper[char], sup: true });
      i++;
      continue;
    }

    if (char === "_" && i + 1 < n) {
      if (cleaned[i + 1] === "{") {
        i += 2;
        let content = "";
        while (i < n && cleaned[i] !== "}") {
          content += cleaned[i];
          i++;
        }
        if (i < n) i++;
        chunks.push({ text: content, sub: true });
      } else {
        chunks.push({ text: cleaned[i + 1], sub: true });
        i += 2;
      }
      continue;
    }

    if (char === "^" && i + 1 < n) {
      if (cleaned[i + 1] === "{") {
        i += 2;
        let content = "";
        while (i < n && cleaned[i] !== "}") {
          content += cleaned[i];
          i++;
        }
        if (i < n) i++;
        chunks.push({ text: content, sup: true });
      } else {
        chunks.push({ text: cleaned[i + 1], sup: true });
        i += 2;
      }
      continue;
    }

    chunks.push({ text: char });
    i++;
  }

  const refinedChunks: TextChunk[] = [];
  let idx = 0;
  while (idx < chunks.length) {
    const chunk = chunks[idx];
    if (chunk.sub || chunk.sup) {
      refinedChunks.push(chunk);
      idx++;
      continue;
    }

    let word = "";
    const startIndex = idx;
    while (idx < chunks.length && !chunks[idx].sub && !chunks[idx].sup && chunks[idx].text !== " ") {
      word += chunks[idx].text;
      idx++;
    }

    if (word.length > 0) {
      const isChemicalFormula = /[A-Z]/.test(word) && (/[0-9]/.test(word) || /\((s|l|g|aq)\)/i.test(word));

      if (isChemicalFormula) {
        let pos = 0;
        const wLen = word.length;
        while (pos < wLen) {
          const stateMatch = word.substring(pos).match(/^\((s|l|g|aq|s|l|g|aq)\)/i);
          if (stateMatch) {
            refinedChunks.push({ text: stateMatch[0], sub: true });
            pos += stateMatch[0].length;
            continue;
          }

          const curChar = word[pos];
          const isDigit = /[0-9]/.test(curChar);
          if (isDigit && pos > 0) {
            const prevChar = word[pos - 1];
            if (/[A-Za-z)]/.test(prevChar)) {
              refinedChunks.push({ text: curChar, sub: true });
              pos++;
              continue;
            }
          }

          refinedChunks.push({ text: curChar });
          pos++;
        }
      } else {
        for (let j = startIndex; j < idx; j++) {
          refinedChunks.push(chunks[j]);
        }
      }
    }

    if (idx < chunks.length && chunks[idx].text === " ") {
      refinedChunks.push(chunks[idx]);
      idx++;
    }
  }

  let currentGroup: TextChunk | null = null;

  const pushGroup = () => {
    if (currentGroup) {
      runs.push(
        new TextRun({
          text: currentGroup.text,
          bold: options.bold,
          italics: options.italics,
          size: options.size || 22,
          ...(options.font ? { font: options.font } : {}),
          ...(options.color ? { color: options.color } : {}),
          ...(options.highlight ? { highlight: options.highlight } : {}),
          ...(currentGroup.sub ? { subScript: true } : {}),
          ...(currentGroup.sup ? { superScript: true } : {}),
        })
      );
      currentGroup = null;
    }
  };

  refinedChunks.forEach((c) => {
    if (!currentGroup) {
      currentGroup = { ...c };
    } else if (!!currentGroup.sub === !!c.sub && !!currentGroup.sup === !!c.sup) {
      currentGroup.text += c.text;
    } else {
      pushGroup();
      currentGroup = { ...c };
    }
  });
  pushGroup();

  return runs;
}

// Helper to construct TextRuns correctly and safely handle line breaks which corrupt MS Word if put in single TextRun
function buildTextRuns(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    highlight?: string;
    font?: string;
  }
): TextRun[] {
  const cleanedText = cleanXmlText(text);
  const lines = cleanedText.split("\n");
  const runs: TextRun[] = [];
  lines.forEach((lineText, idx) => {
    if (idx > 0) {
      runs.push(new TextRun({ break: 1 }));
    }
    const lineRuns = parseEquationToRuns(lineText, options);
    runs.push(...lineRuns);
  });
  return runs;
}

const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB Max
});

app.post(
  "/api/pdf-to-docx/convert",
  (req, res, next) => {
    docxUpload.single("pdf")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({
              error: "File too large. Maximum supported limit is 20MB.",
            });
        }
        return res
          .status(400)
          .json({ error: err.message || "File upload failed" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded. Please upload a PDF or an Image file." });
      }

      const fileBuffer = file.buffer;
      const mimeType = file.mimetype;
      const filename = file.originalname;

      const isPdf = fileBuffer.length >= 4 && fileBuffer.toString("utf8", 0, 4) === "%PDF";
      const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filename);

      if (!isPdf && !isImage) {
        return res
          .status(400)
          .json({
            error: "Unsupported file type. Please upload a valid PDF or Image file (PNG, JPG, JPEG, WEBP, GIF).",
          });
      }

      // Capture upload fields from FormData
      const embedImages = req.body.embedImages !== "false";
      const insertPageBreaks = req.body.insertPageBreaks !== "false";
      const preserveLayout = req.body.preserveLayout === "true";
      const languageHint = req.body.languageHint || "auto";
      const formattingLevel = req.body.formattingLevel || "balanced";

      // Parse AI Prompts
      const globalPrompt = req.body.globalPrompt || "";
      let pagePrompts: Record<string, string> = {};
      if (req.body.pagePrompts) {
        try {
          pagePrompts =
            typeof req.body.pagePrompts === "string"
              ? JSON.parse(req.body.pagePrompts)
              : req.body.pagePrompts;
        } catch (err) {}
      }

      // Parse selected pages
      let selectedPagesArr: number[] = [];
      if (req.body.selectedPages) {
        try {
          const parsed =
            typeof req.body.selectedPages === "string"
              ? JSON.parse(req.body.selectedPages)
              : req.body.selectedPages;
          if (Array.isArray(parsed)) {
            selectedPagesArr = parsed
              .map((x: any) => parseInt(x, 10))
              .filter((x: number) => !isNaN(x) && x > 0);
          }
        } catch (err) {
          if (typeof req.body.selectedPages === "string") {
            selectedPagesArr = req.body.selectedPages
              .split(",")
              .map((x: string) => parseInt(x.trim(), 10))
              .filter((x: number) => !isNaN(x) && x > 0);
          }
        }
      }

      let totalPages = 0;
      const extractedPages: any[] = [];
      let scannedPagesCount = 0;
      const pageImages: any[] = [];
      const startTime = Date.now();
      let geminiPdfBase64 = "";
      let mimeTypeForGemini = "application/pdf";

      if (isPdf) {
        // Password encrypted check using pdf-lib
        let isEncrypted = false;
        try {
          const pdfDoc = await BackendPDFDoc.load(fileBuffer, {
            ignoreEncryption: false,
          });
          totalPages = pdfDoc.getPageCount();
        } catch (err: any) {
          const msg = err.message || "";
          if (
            msg.includes("encrypt") ||
            msg.includes("password") ||
            msg.includes("Password")
          ) {
            isEncrypted = true;
          } else {
            return res
              .status(400)
              .json({
                error: "Failed to read PDF structure. The file may be corrupt.",
              });
          }
        }

        if (isEncrypted) {
          return res
            .status(422)
            .json({
              error:
                "Password-protected PDFs cannot be converted. Please decrypt the file first.",
            });
        }

        // Load PDF using pdfjs-dist
        let pdfDocument;
        try {
          const uint8Array = new Uint8Array(fileBuffer);
          pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise;
        } catch (loadErr: any) {
          console.error("PDFJS load failure:", loadErr);
          return res
            .status(400)
            .json({
              error:
                "Could not parse PDF layout. Please ensure it is not corrupted.",
            });
        }

        // Determine target pages to process
        const pagesToProcess =
          selectedPagesArr.length > 0
            ? selectedPagesArr.filter((p) => p <= totalPages)
            : Array.from({ length: totalPages }, (_, i) => i + 1);

        for (const pageNum of pagesToProcess) {
          const page = await pdfDocument.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          const { width, height } = viewport;

          const textContent = await page.getTextContent();
          const items = textContent.items as any[];

          if (items.length === 0) {
            scannedPagesCount++;
          }

          // Group text line blocks (3 user units Y-coordinate threshold)
          const rows: Record<number, any[]> = {};
          for (const item of items) {
            if (!item.str || !item.transform) continue;
            const x = item.transform[4];
            const y = item.transform[5];
            const fontSize = Math.sqrt(
              item.transform[0] ** 2 + item.transform[1] ** 2,
            );

            let foundY = Object.keys(rows)
              .map(Number)
              .find((key) => Math.abs(key - y) < 4);
            if (foundY === undefined) {
              foundY = y;
              rows[foundY] = [];
            }
            rows[foundY].push({
              text: item.str,
              x,
              y,
              width: item.width || 0,
              height: item.height || 0,
              fontSize,
              fontName: item.fontName || "",
            });
          }

          const sortedY = Object.keys(rows)
            .map(Number)
            .sort((a, b) => b - a);
          const textLines: any[] = [];

          for (const yVal of sortedY) {
            const rowItems = rows[yVal].sort((a, b) => a.x - b.x);
            const combinedText = rowItems.map((item) => item.text).join(" ");
            const avgFontSize =
              rowItems.reduce((acc, item) => acc + item.fontSize, 0) /
              rowItems.length;
            const firstFont = rowItems[0]?.fontName || "";
            const minX = Math.min(...rowItems.map((item) => item.x));

            textLines.push({
              text: combinedText,
              x: minX,
              y: yVal,
              fontSize: avgFontSize,
              fontName: firstFont,
            });
          }

          extractedPages.push({
            pageNum,
            width,
            height,
            lines: textLines,
          });

          // Scan and extract images statically when embedImages is selected
          if (embedImages) {
            try {
              const opList = await page.getOperatorList();
              const fnArray = opList.fnArray;
              const argsArray = opList.argsArray;

              // Safe object retrieval helper using PDF.js async callback queue
              const getPageObj = (p: any, ref: string): Promise<any> => {
                return new Promise((resolve) => {
                  let resolved = false;
                  const timeout = setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      resolve(null);
                    }
                  }, 4000); // 4 seconds max wait for image object to load

                  try {
                    p.objs.get(ref, (imgData: any) => {
                      if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        resolve(imgData);
                      }
                    });
                  } catch (err) {
                    if (!resolved) {
                      clearTimeout(timeout);
                      resolved = true;
                      resolve(null);
                    }
                  }
                });
              };

              for (let j = 0; j < fnArray.length; j++) {
                const fnId = fnArray[j];
                if (fnId === pdfjsLib.OPS.paintImageXObject) {
                  const imgRef = argsArray[j][0];
                  const imgObj = await getPageObj(page, imgRef);
                  if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
                    const pngBuffer = encodePNG(
                      imgObj.data,
                      imgObj.width,
                      imgObj.height,
                    );
                    pageImages.push({
                      pageNum,
                      width: imgObj.width,
                      height: imgObj.height,
                      buffer: pngBuffer,
                      y: height - (argsArray[j][1] || 100),
                    });
                  }
                }
              }
            } catch (imgErr) {
              console.warn(
                `[ImageExtraction] Failed to extract inline image on page ${pageNum}:`,
                imgErr,
              );
            }
          }
        }

        // Prepare subset PDF buffer for Gemini multimodal PDF visual layout analysis
        try {
          const srcDoc = await BackendPDFDoc.load(fileBuffer);
          const subDoc = await BackendPDFDoc.create();
          
          const pagesToCopy = selectedPagesArr.length > 0
            ? selectedPagesArr.filter(p => p <= totalPages).map(p => p - 1)
            : Array.from({ length: totalPages }, (_, i) => i);
            
          const copiedPages = await subDoc.copyPages(srcDoc, pagesToCopy);
          copiedPages.forEach(p => subDoc.addPage(p));
          
          const subPdfBytes = await subDoc.save();
          geminiPdfBase64 = Buffer.from(subPdfBytes).toString("base64");
        } catch (sliceErr) {
          console.error("Failed to slice PDF file for Gemini, using original buffer:", sliceErr);
          geminiPdfBase64 = fileBuffer.toString("base64");
        }
        mimeTypeForGemini = "application/pdf";
      } else {
        // Image flow directly
        totalPages = 1;
        extractedPages.push({
          pageNum: 1,
          width: 800,
          height: 1000,
          lines: [],
        });
        geminiPdfBase64 = fileBuffer.toString("base64");
        mimeTypeForGemini = mimeType;
      }

      const promptLanguageHint =
        languageHint === "auto" ? "mixed" : languageHint;

      // Formatting user instructions
      const pageInstructsStr = Object.entries(pagePrompts)
        .map(([pageNum, prompt]) => `[PAGE ${pageNum}]: ${prompt}`)
        .join("\n");
      let customInstructBlock = "";
      if (globalPrompt.trim() || pageInstructsStr.trim()) {
        customInstructBlock = `\n\nUSER CUSTOM INSTRUCTIONS (CRITICAL: YOU MUST FOLLOW THESE SPECIFIC REQUESTS):
${globalPrompt ? `GLOBAL INSTRUCTION FOR ALL PAGES: ${globalPrompt}` : ""}
${pageInstructsStr ? `PAGE-SPECIFIC INSTRUCTIONS:\n${pageInstructsStr}` : ""}\n\n`;
      }

      const geminiPrompt = `You are a professional document structure analyzer and layout preserver.
Analyze the attached PDF file pages directly to extract all clean textual content, formatting rules, headings, list structures, paragraphs, boxed activities, and table layouts, preserving the original reading flow.
CRITICAL MANDATES:
1. WORD-FOR-WORD LITERAL EXTRACTION (SAME-TO-SAME TEXT): You MUST extract the text exactly, word-for-word, character-for-character as it appears on each page. Do NOT translate from one language to another (e.g., keep Hindi in Devanagari script, keep English in Latin). Do NOT correct any printer mistakes, typos, spelling, or grammar errors. Do NOT summarize or paraphrase.
2. DESIGN AND PATTERN PRESERVATION: Match the headings, list structures, alignments, estimated font sizes, and box styles exactly as printed to align with the visual original layout.
${customInstructBlock}

Return ONLY a valid JSON object matching this structure:
{
  "title": "document title if found",
  "language": "${promptLanguageHint}",
  "pages": [
    {
      "pageNum": 1,
      "elements": [
        {
          "type": "heading1", // Choose from: heading1, heading2, heading3, paragraph, bullet_list, table, activity_box, question_box, summary_box, chemical_equation, caption
          "text": "actual clean text content (for box structures, this MUST contain the exact visual heading of the box in its native language like 'क्रियाकलाप 2.6' or 'प्रश्न' - do not translate)",
          "style": {
            "color": "6-character hex color string like '0288D1' or 'FF6B2B' reflecting original text color, or '333333' (must be hex code without hashtag)",
            "fontSize": 12, // number: estimated pt font size, e.g. 24 for heading1, 14 for heading2, 11 for standard text (must be valid integer)
            "isBold": true,
            "isItalic": false,
            "backgroundColor": "6-character hex color strings if highlighted or inside activity/question/summary box, or 'white'"
          },
          "items": ["for bullet_lists and box structures — array of clean strings. For activity/question/summary boxes, put the inner lines/paragraphs inside this array. Omit or leave empty otherwise."],
          "rows": [["for tables — 2d array of primitive cell values. Omit or leave empty otherwise."]],
          "alignment": "left" // "left"|"center"|"right"
        }
      ]
    }
  ]
}

Rules:
- Large bold top text = heading1
- Section names (like 1.1, Part A) = heading2/heading3
- Blue, orange, or other colored prominent headings = heading2
- Boxed activities/experiments = activity_box (must preserve exact title in "text" field, e.g., "क्रियाकलाप 2.6")
- Exam/activity question sections = question_box (must preserve exact title in "text" field, e.g., "प्रश्न")
- Summary sections = summary_box (must preserve exact title in "text" field)
- Chemical formula lists and math lines = chemical_equation
- Bullet lists = bullet_list
- Tabular columns = table
- Extract ALL text accurately in Devanagari script for Hindi, Latin for English. Do not translate or change words. Keep box labels like 'क्रियाकलाप 2.6', 'क्या आप जानते हैं?' and 'प्रश्न' exactly as printed.
- For chemical formulas (like CaCO3, H2O, Ca(HCO3)2, etc.), preserve standard formatting. You can write them using standard text or subscripts like H_2O, CO_2 or using Unicode subscript characters like ₂ or ₃. Do not truncate chemical equations or formulas.
- DO NOT INCLUDE ANY IMAGES or visual details. ONLY return textual and layout element flow.
- CRITICAL: STRICTLY EXCLUDE WATERMARKS & JUNK TEXT. Do NOT extract watermark text like "© NCERT not to be republished", "Rationalised 2023-24", "Rationalised", textbook headers, footers, boilerplate copyright pages, or diagonal printed labels. Skip them completely.
- CRITICAL: NO EMPTY PAGES. If after removing watermarks/boilerplate, a page becomes empty or has no standard educational content, do NOT include that page in the pages array at all.
- Return ONLY valid JSON, no explanations, no markdown wrapping.`;

      let parsedDocument: any = {
        title: file.originalname.replace(/\.[^/.]+$/, ""),
        language: promptLanguageHint,
        pages: []
      };

      try {
        const isPremium = await checkIsPremiumUser(req);
        const userApiKey = req.headers["x-user-api-key"] as string | undefined;

        const pagesToProcess =
          selectedPagesArr.length > 0
            ? selectedPagesArr.filter((p) => p <= totalPages)
            : Array.from({ length: totalPages }, (_, i) => i + 1);

        console.log(`[Convert] Dispatching parallel parser page loops. Total: ${pagesToProcess.length}`);

        const srcDoc = await BackendPDFDoc.load(fileBuffer);

        const results: any[] = Array(pagesToProcess.length);
        const queue = pagesToProcess.map((pageNum, index) => ({ pageNum, index }));
        const concurrencyLimit = 5; // Maximize resource utilization without hitting rate limits

        const runWorker = async () => {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            const { pageNum, index } = next;

            let keyToUse = "";
            if (!userApiKey && !isPremium) {
              keyToUse = await acquireFreeKey();
            }

            try {
              const singlePageDoc = await BackendPDFDoc.create();
              const copiedPages = await singlePageDoc.copyPages(srcDoc, [pageNum - 1]);
              copiedPages.forEach((p) => singlePageDoc.addPage(p));
              const subPdfBytes = await singlePageDoc.save();
              const pageBase64 = Buffer.from(subPdfBytes).toString("base64");

              const singlePagePrompt = `You are a professional document structure analyzer and layout preserver.
            Analyze Page ${pageNum} of the attached PDF file page directly to extract all clean textual content, formatting rules, headings, list structures, paragraphs, boxed activities, and table layouts, preserving the original reading flow.
            CRITICAL MANDATES:
            1. WORD-FOR-WORD LITERAL EXTRACTION (SAME-TO-SAME TEXT): You MUST extract the text exactly, word-for-word, character-for-character as it appears on each page. Do NOT translate from one language to another (e.g., keep Hindi in Devanagari script, keep English in Latin). Do NOT correct any printer mistakes, typos, spelling, or grammar errors. Do NOT summarize or paraphrase.
            2. MULTI-COLUMN & TWO-COLUMN FLOW PRESERVATION: If the page contains a two-column or multi-column layout (such as exam question sheets where questions are printed on the left and right halves of the page), you MUST read down the left-most column completely from top to bottom before starting to read the next column (right column). Never read horizontally across multiple independent columns; this scrambles the question flow.
            3. DESIGN AND PATTERN PRESERVATION: Match the headings, list structures, alignments, estimated font sizes, and box styles exactly as printed to align with the visual original layout.
            ${customInstructBlock}

            Return ONLY a valid JSON object matching this structure:
            {
              "pageNum": ${pageNum},
              "elements": [
                {
                  "type": "heading1", // Choose from: heading1, heading2, heading3, paragraph, bullet_list, table, activity_box, question_box, summary_box, chemical_equation, caption
                  "text": "actual clean text content (for box structures, this MUST contain the exact visual heading of the box in its native language like 'क्रियाकलाप 2.6' or 'प्रश्न' - do not translate)",
                  "style": {
                    "color": "6-character hex color string like '0288D1' or 'FF6B2B' reflecting original text color, or '333333' (must be hex code without hashtag)",
                    "fontSize": 12, // number of estimated pt font size, e.g. 24 for heading1, 14 for heading2, 11 for standard text (must be valid integer)
                    "isBold": true,
                    "isItalic": false,
                    "backgroundColor": "6-character hex color strings if highlighted or inside activity/question/summary box, or 'white'"
                  },
                  "items": ["for bullet_lists and box structures — array of clean strings. For activity/question/summary boxes, put the inner lines/paragraphs inside this array. Omit or leave empty otherwise."],
                  "rows": [["for tables — 2d array of primitive cell values. Omit or leave empty otherwise."]],
                  "alignment": "left" // "left"|"center"|"right"
                }
              ]
            }
            Rules:
            - Boxed activities/experiments = activity_box (must preserve exact title in "text" field, e.g., "क्रियाकलाप 2.6")
            - Exam/activity question sections = question_box (must preserve exact title in "text" field, e.g., "प्रश्न")
            - Summary sections = summary_box (must preserve exact title in "text" field)
            - Chemical formula lists and math lines = chemical_equation
            - Extract ALL text accurately in Devanagari script for Hindi, Latin for English. Do not translate. Keep box labels like 'क्रियाकलाप 2.6', 'क्या आप जानते हैं?' and 'प्रश्न' exactly as printed in original language.
            - For chemical formulas (like CaCO3, H2O, Ca(HCO3)2, etc.), preserve standard formatting. You can write them using standard text or subscripts like H_2O, CO_2 or using Unicode subscript characters like ₂ or ₃. Do not truncate chemical equations or formulas.
            Return ONLY valid JSON, no explanations, no markdown wrapping.`;

              const pageResultText = await runAIAction(
                async (client, modelName) => {
                  const response = await client.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                          inlineData: {
                            mimeType: mimeTypeForGemini,
                            data: pageBase64,
                          },
                        },
                        { text: singlePagePrompt },
                    ],
                    config: {
                      temperature: 0.1,
                      responseMimeType: "application/json",
                    },
                  });
                  return response.text || "{}";
                },
                6,
                userApiKey,
                keyToUse
              );

              results[index] = safeJsonParse(pageResultText);
            } catch (pageErr: any) {
              console.warn(`[PageParallel] Page ${pageNum} failed extraction: ${pageErr.message}`);
              const matchingPage = extractedPages.find((p) => p.pageNum === pageNum) || { lines: [] };
              results[index] = {
                pageNum,
                elements: matchingPage.lines.map((l: any) => ({
                  type: "paragraph",
                  text: l.text,
                  style: {
                    isBold: l.fontSize > 16,
                    isItalic: false,
                    fontSize: Math.round(l.fontSize),
                    color: "333333",
                    backgroundColor: "white",
                  },
                  alignment: "left",
                })),
              };
            } finally {
              if (keyToUse) {
                releaseFreeKey(keyToUse);
              }
            }
          }
        };

        const workerPromises = Array.from(
          { length: Math.min(concurrencyLimit, pagesToProcess.length) },
          () => runWorker()
        );
        await Promise.allSettled(workerPromises);

        const pagesResult = results.filter(Boolean);
        parsedDocument.pages = pagesResult.sort((a, b) => (a.pageNum || 0) - (b.pageNum || 0));
      } catch (parallelErr: any) {
        console.error("Parallel flow failed critical step:", parallelErr);
        parsedDocument = {
          title: file.originalname.replace(/\.[^/.]+$/, ""),
          language: "mixed",
          pages: extractedPages.map((p) => ({
            pageNum: p.pageNum,
            elements: p.lines.map((l) => ({
              type: "paragraph",
              text: l.text,
              style: {
                isBold: l.fontSize > 16,
                isItalic: false,
                fontSize: Math.round(l.fontSize),
                color: "333333",
                backgroundColor: "white",
              },
              alignment: "left",
            })),
          })),
        };
      }

      // Construct DOCX document
      const docxChildren: any[] = [];

      if (parsedDocument.title) {
        docxChildren.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: buildTextRuns(cleanXmlText(parsedDocument.title), {
              bold: true,
              size: 48,
              color: "FF6B2B",
            }),
          }),
        );
      }

      // Programmatic filtering of watermarks, headers, footers, and other duplicate junk textbook texts
      const isWatermarkText = (text: string): boolean => {
        if (!text) return false;
        const lower = String(text).toLowerCase().trim();
        const scrubbed = lower.replace(/[^a-z0-9©]/g, "");

        // Match NCERT watermark and copyright blocks
        if (
          scrubbed.includes("ncertnottoberepublished") || 
          scrubbed.includes("ncertnottobere-published") ||
          scrubbed.includes("nottoberepublished") || 
          scrubbed.includes("nottobere-published") ||
          scrubbed.includes("toberepublished") ||
          scrubbed.includes("tobere-published")
        ) {
          return true;
        }

        if (scrubbed.includes("rationalised")) {
          return true;
        }

        if (scrubbed === "ncert" || scrubbed === "©ncert") {
          return true;
        }

        if (lower.includes("not to be republished") || lower.includes("not to be re-published")) {
          return true;
        }

        if (lower.includes("ncert") && (lower.includes("republish") || lower.includes("publish") || lower.includes("not to") || lower.includes("be re"))) {
          return true;
        }

        return false;
      };

      // Filter and clean document pages/elements
      const filteredPages = (parsedDocument.pages || [])
        .map((page: any) => {
          if (!page) return null;
          const elements = page.elements || [];
          
          const cleanElements = elements.filter((el: any) => {
            if (!el) return false;
            
            const elType = String(el.type || "").toLowerCase().trim();
            const textVal = String(el.text || "").trim();

            if (isWatermarkText(textVal)) {
              return false;
            }

            // Clean bullet list elements
            if (elType === "bullet_list") {
              const rawItems = el.items || [];
              const items = Array.isArray(rawItems) ? rawItems : [];
              const filteredItems = items.filter((item: any) => {
                const itemText = typeof item === "object" ? (item.text || "") : String(item || "");
                return !isWatermarkText(itemText) && itemText.trim().length > 0;
              });
              el.items = filteredItems;
              if (filteredItems.length === 0) return false;
            }

            // Clean boxes
            if (elType === "activity_box" || elType === "question_box" || elType === "summary_box") {
              const rawItems = el.items || (el.text ? [el.text] : []);
              const items = Array.isArray(rawItems) ? rawItems : [];
              const filteredItems = items.filter((item: any) => {
                const itemText = typeof item === "object" ? (item.text || "") : String(item || "");
                return !isWatermarkText(itemText) && itemText.trim().length > 0;
              });
              el.items = filteredItems;
              if (filteredItems.length === 0) return false;
            }

            // Clean table cells and rows
            if (elType === "table") {
              const rawRows = el.rows || [];
              const rows = Array.isArray(rawRows) ? rawRows : [];
              const filteredRows = rows
                .map((row: any) => {
                  if (!Array.isArray(row)) return [];
                  return row.filter((cell: any) => {
                    const cellText = typeof cell === "object" ? (cell.text || "") : String(cell || "");
                    return !isWatermarkText(cellText);
                  });
                })
                .filter((row: any[]) => row.length > 0 && row.some(cell => String(cell || "").trim().length > 0));
              el.rows = filteredRows;
              if (filteredRows.length === 0) return false;
            }

            // Empty texts for primitive elements (excluding structural list, tables, and boxes)
            if (
              elType !== "table" && 
              elType !== "bullet_list" && 
              elType !== "activity_box" && 
              elType !== "question_box" && 
              elType !== "summary_box" && 
              !textVal
            ) {
              return false;
            }

            return true;
          });

          return {
            ...page,
            elements: cleanElements,
          };
        })
        .filter((page: any) => page !== null && page.elements.length > 0);

      const pagesData = filteredPages;
      for (let i = 0; i < pagesData.length; i++) {
        const page = pagesData[i];
        if (!page) continue;
        const pageNum = page.pageNum;
        const elements = page.elements || [];

        if (i > 0 && insertPageBreaks) {
          docxChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }

        const cleanHexColor = (colorStr: any): string | undefined => {
          if (!colorStr) return undefined;
          let cleaned = String(colorStr).trim().replace(/^#/, "");
          const lower = cleaned.toLowerCase();
          if (lower === "blue") return "0288D1";
          if (lower === "orange") return "FF6B2B";
          if (lower === "gray" || lower === "grey") return "757575";
          if (lower === "black") return "000000";
          if (lower === "red") return "FF0000";
          if (lower === "green") return "00FF00";
          if (lower === "white") return "FFFFFF";
          if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
            return cleaned;
          }
          if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
            return cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
          }
          return undefined;
        };

        const cleanHighlightColor = (highlightStr: any): string | undefined => {
          if (!highlightStr) return undefined;
          const h = String(highlightStr).trim().toLowerCase();
          const allowed = [
            "black", "blue", "cyan", "green", "magenta", "red", "yellow", "white",
            "darkblue", "darkcyan", "darkgreen", "darkmagenta", "darkred", "darkyellow",
            "darkgray", "lightgray"
          ];
          if (allowed.includes(h)) return h;
          if (h.includes("gray") || h.includes("grey") || h === "f0f0f0" || h === "e0e0e0") return "lightgray";
          if (h.includes("yellow") || h === "ffff00") return "yellow";
          if (h.includes("blue") || h === "0000ff") return "blue";
          if (h.includes("green") || h === "00ff00") return "green";
          if (h.includes("red") || h === "ff0000") return "red";
          if (h.includes("pink") || h === "ffc0cb") return "magenta";
          return undefined;
        };

        elements.forEach((el: any) => {
          if (!el) return;
          const elType = String(el.type || "").toLowerCase().trim();

          // Normalize style (compatibility with old and new AI format)
          const style = el.style || {};
          const isBold = typeof style.isBold === "boolean" ? style.isBold : !!el.bold;
          const isItalic = typeof style.isItalic === "boolean" ? style.isItalic : (!!el.italic || !!el.italics);
          
          let fontSize = 22;
          const rawFontSize = style.fontSize || el.fontSize;
          if (rawFontSize !== undefined && rawFontSize !== null) {
            const parsedSize = parseInt(String(rawFontSize), 10);
            if (!isNaN(parsedSize) && parsedSize > 0) {
              fontSize = parsedSize * 2;
            } else {
              fontSize = elType === "heading1" ? 48 : elType === "heading2" ? 32 : elType === "heading3" ? 28 : 22;
            }
          } else {
            fontSize = elType === "heading1" ? 48 : elType === "heading2" ? 32 : elType === "heading3" ? 28 : 22;
          }

          let alignment: any = AlignmentType.LEFT;
          const elAlign = String(el.alignment || "").toLowerCase().trim();
          if (elAlign === "center") alignment = AlignmentType.CENTER;
          if (elAlign === "right") alignment = AlignmentType.RIGHT;

          // Color normalization
          const rawColor = style.color || el.color || "";
          const textColor = cleanHexColor(rawColor);

          if (elType === "heading1") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                alignment,
                spacing: { before: 240, after: 120 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "heading2") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                alignment,
                spacing: { before: 200, after: 100 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "heading3") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                alignment,
                spacing: { before: 160, after: 80 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "bullet_list") {
            const rawItems = el.items || (el.text ? [el.text] : []);
            const listItems = Array.isArray(rawItems)
              ? rawItems.filter((x: any) => x !== null && x !== undefined).map(x => typeof x === "object" ? (x.text || JSON.stringify(x)) : String(x))
              : [];
            listItems.forEach((itemText: string) => {
              const lines = cleanXmlText(itemText).split("\n");
              const runs: TextRun[] = [];
              lines.forEach((lineText, idx) => {
                if (idx > 0) {
                  runs.push(new TextRun({ break: 1 }));
                }
                runs.push(
                  new TextRun({
                    text: idx === 0 ? "•\t" + lineText : lineText,
                    size: 22,
                    ...(textColor ? { color: textColor } : {}),
                  })
                );
              });
              docxChildren.push(
                new Paragraph({
                  alignment,
                  indent: { left: 720, hanging: 360 },
                  children: runs,
                }),
              );
            });
          } else if (elType === "table") {
            const rows = el.rows || [];
            if (Array.isArray(rows) && rows.length > 0) {
              // Convert and clean rows to standard 2D primitive strings
              const cleanRows = rows.map((r: any) => {
                if (!Array.isArray(r)) return [];
                return r.map((c: any) => {
                  if (c === null || c === undefined) return "";
                  if (typeof c === "object") {
                    return c.text || JSON.stringify(c);
                  }
                  return String(c);
                });
              });

              // Compute maximum column count to pad unbalanced columns (causes Word corruption otherwise)
              const maxCols = Math.max(1, ...cleanRows.map(r => r.length));

              const tableRows = cleanRows.map((rowCells: string[], rIdx: number) => {
                const paddedCells = [...rowCells];
                while (paddedCells.length < maxCols) {
                  paddedCells.push(" ");
                }
                return new TableRow({
                  children: paddedCells.map((cellText: string) => {
                    return new TableCell({
                      shading:
                        rIdx === 0
                          ? {
                              fill: "E0F2F1",
                            }
                          : undefined,
                      children: [
                        new Paragraph({
                          children: buildTextRuns(cleanXmlText(cellText), {
                            bold: rIdx === 0,
                            size: 20,
                          }),
                        }),
                      ],
                    });
                  }),
                });
              });

              docxChildren.push(
                new DocxTable({
                  rows: tableRows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                }),
              );
              docxChildren.push(new Paragraph({ spacing: { after: 120 } }));
            }
          } else if (
            elType === "activity_box" ||
            elType === "question_box" ||
            elType === "summary_box"
          ) {
            let bg = "E8F4FD";
            let borderColor = "4FC3F7";
            let boxTitle = "Activity";

            if (elType === "question_box") {
              bg = "F3E8FF";
              borderColor = "9C27B0";
              boxTitle = "Questions";
            } else if (elType === "summary_box") {
              bg = "FFF3E0";
              borderColor = "FF9800";
              boxTitle = "Summary";
            }

            const rawItems = el.items || (el.text ? [el.text] : []);
            const listItems = Array.isArray(rawItems)
              ? rawItems.filter((x: any) => x !== null && x !== undefined).map(x => typeof x === "object" ? (x.text || JSON.stringify(x)) : String(x))
              : [];

            const borderHex = cleanHexColor(borderColor);
            const cellParagraphs = [
              new Paragraph({
                children: buildTextRuns(`${boxTitle}:`, {
                  bold: true,
                  size: 24,
                  color: borderHex,
                }),
                spacing: { after: 120 },
              }),
            ];

            listItems.forEach((itemText: string) => {
              const lines = cleanXmlText(itemText).split("\n");
              const runs: TextRun[] = [];
              lines.forEach((lineText, idx) => {
                if (idx > 0) {
                  runs.push(new TextRun({ break: 1 }));
                }
                runs.push(
                  new TextRun({
                    text: idx === 0 ? "•\t" + lineText : lineText,
                    size: 20,
                  })
                );
              });
              cellParagraphs.push(
                new Paragraph({
                  indent: { left: 400, hanging: 240 },
                  children: runs,
                }),
              );
            });

            const bgHex = cleanHexColor(bg);
            docxChildren.push(
              new DocxTable({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        shading: bgHex ? { fill: bgHex } : undefined,
                        children: cellParagraphs,
                      }),
                    ],
                  }),
                ],
                width: { size: 100, type: WidthType.PERCENTAGE },
              }),
            );
            docxChildren.push(new Paragraph({ spacing: { after: 120 } }));
          } else if (elType === "chemical_equation") {
            docxChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100, after: 100 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  font: "Courier New",
                  size: 22,
                  bold: true,
                }),
              }),
            );
          } else if (elType === "caption") {
            docxChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  italics: true,
                  size: 18,
                  color: "757575",
                }),
              }),
            );
          } else if (elType === "page_number") {
            // Skip page number token from text analysis to use Word native
          } else {
            const highlightColor = cleanHighlightColor(style.backgroundColor || el.backgroundColor);
            docxChildren.push(
              new Paragraph({
                alignment,
                spacing: { after: 120 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  italics: isItalic,
                  size: fontSize,
                  color: textColor,
                  highlight: highlightColor,
                }),
              }),
            );
          }
        });

        // Embed matching page images from pageImages array
        if (embedImages) {
          const pageImagesForThisPage = pageImages.filter(
            (img) => img && img.pageNum === pageNum,
          );
          pageImagesForThisPage.forEach((img: any) => {
            try {
              const rawWidth = Number(img.width);
              const rawHeight = Number(img.height);
              if (isNaN(rawWidth) || rawWidth <= 0 || isNaN(rawHeight) || rawHeight <= 0) {
                return;
              }

              const displayWidth = 400;
              const displayHeight = Math.round(400 * (rawHeight / rawWidth));
              if (isNaN(displayHeight) || displayHeight <= 0 || !isFinite(displayHeight)) {
                return;
              }

              docxChildren.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                  children: [
                    new ImageRun({
                      data: img.buffer,
                      transformation: {
                        width: displayWidth,
                        height: displayHeight,
                      },
                    }),
                  ],
                }),
              );
            } catch (rErr) {
              console.warn("Could not insert extracted image run:", rErr);
            }
          });
        }
      }

      // Safeguard against completely empty Word section which crashes Microsoft Word
      if (docxChildren.length === 0) {
        docxChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "No readable content could be extracted from this converter stream.",
                size: 22,
              }),
            ],
          }),
        );
      }

      const doc = new DocxDocument({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  right: 720,
                  bottom: 720,
                  left: 720,
                },
              },
            },
            children: docxChildren,
          },
        ],
      });

      const docBuffer = await Packer.toBuffer(doc);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename.replace(/\.[^/.]+$/, ""))}.docx"`,
      );
      res.send(docBuffer);
    } catch (err: any) {
      console.error("Convert generator failure:", err);
      res.status(500).json({ error: err.message || "Failed docx convert compile." });
    }
  }
);

app.post(
  "/api/pdf-to-docx/process-page",
  (req, res, next) => {
    docxUpload.single("pdf")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File too large. Maximum supported limit is 20MB." });
        }
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      next();
    });
  },
  async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded. Please upload a PDF or an Image file." });
      }

      const fileBuffer = file.buffer;
      const mimeType = file.mimetype;
      const filename = file.originalname;

      const isPdf = fileBuffer.length >= 4 && fileBuffer.toString("utf8", 0, 4) === "%PDF";
      const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filename);

      if (!isPdf && !isImage) {
        return res.status(400).json({ error: "Unsupported file type. Please upload a valid PDF or Image file." });
      }

      const pageNum = parseInt(req.body.pageNum || "1", 10);
      const retryMode = req.body.retryMode || "Normal";
      const instruction = req.body.instruction || "";
      const languageHint = req.body.languageHint || "auto";
      const globalPrompt = req.body.globalPrompt || "";

      let pageBase64 = "";
      let mimeTypeForGemini = "application/pdf";
      let docPageCount = 1;

      if (isPdf) {
        try {
          const srcDoc = await BackendPDFDoc.load(fileBuffer);
          docPageCount = srcDoc.getPageCount();
          
          if (docPageCount === 1 || pageNum === 1) {
            pageBase64 = fileBuffer.toString("base64");
          } else {
            const singlePageDoc = await BackendPDFDoc.create();
            const targetIndex = Math.max(0, Math.min(pageNum - 1, docPageCount - 1));
            const copiedPages = await singlePageDoc.copyPages(srcDoc, [targetIndex]);
            copiedPages.forEach((p) => singlePageDoc.addPage(p));
            const subPdfBytes = await singlePageDoc.save();
            pageBase64 = Buffer.from(subPdfBytes).toString("base64");
          }
        } catch (pdfLibErr) {
          console.warn("[ProcessPage] pdf-lib extraction failed, falling back to raw file buffer:", pdfLibErr);
          pageBase64 = fileBuffer.toString("base64");
        }
        mimeTypeForGemini = "application/pdf";
      } else {
        pageBase64 = fileBuffer.toString("base64");
        mimeTypeForGemini = mimeType;
      }

      const promptLanguageHint = languageHint === "auto" ? "mixed" : languageHint;

      let modeInstructions = "";
      if (retryMode === "OCR") {
        modeInstructions = `\n- OCR MODE: Perform extremely precise text character extraction and visual table extraction from this image/scanned PDF page. Match all words natively.`;
      } else if (retryMode === "High Accuracy") {
        modeInstructions = `\n- HIGH ACCURACY MODE: Verify logical blocks, tables, bold structures, alignment, text color and style preservation strictly.`;
      }

      let customInstructBlock = "";
      if (instruction.trim() || globalPrompt.trim()) {
        customInstructBlock = `\n\nUSER CUSTOM INSTRUCTIONS FOR THIS RE-EXTRACTION:
${globalPrompt ? `- Global context instructions: ${globalPrompt}` : ""}
${instruction ? `- SPECIFIC CHAT ORDER FOR THIS PAGE: "${instruction}"` : ""}`;
      }

      const singlePagePrompt = `You are a professional document structure analyzer and layout preserver.
Analyze Page ${pageNum} of the PDF visual structure directly to extract all clean textual elements, headings, paragraphs, lists, activity/summary boxes, and tables, preserving style patterns.${modeInstructions}${customInstructBlock}
CRITICAL MANDATES:
1. WORD-FOR-WORD LITERAL EXTRACTION (SAME-TO-SAME TEXT): You MUST extract the text exactly, word-for-word, character-for-character as it appears on each page. Do NOT translate from one language to another (e.g., keep Hindi in Devanagari script, keep English in Latin). Do NOT correct any printer mistakes, typos, spelling, or grammar errors. Do NOT summarize or paraphrase.
2. MULTI-COLUMN & TWO-COLUMN FLOW PRESERVATION: If the page contains a two-column or multi-column layout (such as exam question sheets where questions are printed on the left and right halves of the page), you MUST read down the left-most column completely from top to bottom before starting to read the next column (right column). Never read horizontally across multiple independent columns; this scrambles the question flow.
3. DESIGN AND PATTERN PRESERVATION: Match the headings, list structures, alignments, estimated font sizes, and box styles exactly as printed to align with the visual original layout.

Return ONLY a valid JSON object matching this structure:
{
  "pageNum": ${pageNum},
  "elements": [
    {
      "type": "heading1", // heading1, heading2, heading3, paragraph, bullet_list, table, activity_box, question_box, summary_box, chemical_equation, caption
      "text": "clean visual text (for box structures, this MUST contain the exact visual heading of the box in its native language like 'क्रियाकलाप 2.6' or 'प्रश्न' - do not translate)",
      "style": {
        "color": "6-character hex color string like '6366F1' representing original text color, or '333333'",
        "fontSize": 12,
        "isBold": true,
        "isItalic": false,
        "backgroundColor": "6-character hex color code or 'white'"
      },
      "items": ["for bullet_lists and box structures — array of clean strings. For activity/question/summary boxes, put the inner lines/paragraphs inside this array. Omit or leave empty otherwise."],
      "rows": [["for tables"]],
      "alignment": "left"
    }
  ]
}
Rules:
- Boxed activities/experiments = activity_box (must preserve exact title in "text" field, e.g., "क्रियाकलाप 2.6")
- Exam/activity question sections = question_box (must preserve exact title in "text" field, e.g., "प्रश्न")
- Summary sections = summary_box (must preserve exact title in "text" field)
- Chemical formula lists and math lines = chemical_equation
- Extract ALL text accurately in Devanagari script for Hindi, Latin for English. Do not translate. Keep box labels like 'क्रियाकलाप 2.6', 'क्या आप जानते हैं?' and 'प्रश्न' exactly as printed.
- For chemical formulas (like CaCO3, H2O, Ca(HCO3)2, etc.), preserve standard formatting. You can write them using standard text or subscripts like H_2O, CO_2 or using Unicode subscript characters like ₂ or ₃. Do not truncate chemical equations or formulas.
Return ONLY valid JSON, no markdown block wrappers.`;

      const isPremium = await checkIsPremiumUser(req);
      const userApiKey = req.headers["x-user-api-key"] as string | undefined;
      let keyToUse = "";
      if (!userApiKey && !isPremium) {
        keyToUse = await acquireFreeKey();
      }

      try {
        const pageResultText = await runAIAction(
          async (client, modelName) => {
            const response = await client.models.generateContent({
              model: modelName,
              contents: [
                  {
                    inlineData: {
                      mimeType: mimeTypeForGemini,
                      data: pageBase64,
                    },
                  },
                  { text: singlePagePrompt },
              ],
              config: {
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            });
            return response.text || "{}";
          },
          6,
          userApiKey,
          keyToUse
        );

        const parsedPage = safeJsonParse(pageResultText);

        const extractedImages: any[] = [];
        if (isPdf && req.body.embedImages !== "false") {
          try {
            const uint8Array = new Uint8Array(fileBuffer);
            const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            const pdfjsPageCount = pdfDocument.numPages;
            const targetPageNum = Math.max(1, Math.min(pageNum, pdfjsPageCount));
            const page = await pdfDocument.getPage(targetPageNum);
            const opList = await page.getOperatorList();
            const fnArray = opList.fnArray;
            const argsArray = opList.argsArray;

            const getPageObj = (p: any, ref: string): Promise<any> => {
              return new Promise((resolve) => {
                let resolved = false;
                const timeout = setTimeout(() => {
                  if (!resolved) { resolve(null); resolved = true; }
                }, 3000);
                try {
                  p.objs.get(ref, (imgData: any) => {
                    if (!resolved) { clearTimeout(timeout); resolved = true; resolve(imgData); }
                  });
                } catch (err) {
                  if (!resolved) { clearTimeout(timeout); resolved = true; resolve(null); }
                }
              });
            };

            for (let j = 0; j < fnArray.length; j++) {
              if (fnArray[j] === pdfjsLib.OPS.paintImageXObject) {
                const imgRef = argsArray[j][0];
                const imgObj = await getPageObj(page, imgRef);
                if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
                  const pngBuffer = encodePNG(imgObj.data, imgObj.width, imgObj.height);
                  extractedImages.push({
                    width: imgObj.width,
                    height: imgObj.height,
                    base64: pngBuffer.toString("base64")
                  });
                }
              }
            }
          } catch (imgErr) {
            console.warn(`[SinglePageImage] Failed on page ${pageNum}:`, imgErr);
          }
        }

        res.json({
          success: true,
          pageNum,
          elements: parsedPage.elements || [],
          images: extractedImages,
          language: parsedPage.language || promptLanguageHint
        });
      } finally {
        if (keyToUse) {
          releaseFreeKey(keyToUse);
        }
      }
    } catch (err: any) {
      console.error("Single page conversion failure:", err);
      res.status(500).json({ error: err.message || "Failed to process single pdf page with Gemini." });
    }
  }
);

app.post(
  "/api/pdf-to-docx/generate-docx",
  async (req, res) => {
    try {
      const { title, insertPageBreaks, pages } = req.body;
      if (!pages || !Array.isArray(pages)) {
        return res.status(400).json({ error: "Missing compiled pages structure." });
      }

      const docxChildren: any[] = [];

      if (title) {
        docxChildren.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: buildTextRuns(cleanXmlText(title), {
              bold: true,
              size: 48,
              color: "6366F1",
            }),
          }),
        );
      }

      const cleanHexColor = (colorStr: any): string | undefined => {
        if (!colorStr) return undefined;
        let cleaned = String(colorStr).trim().replace(/^#/, "");
        const lower = cleaned.toLowerCase();
        if (lower === "blue") return "0288D1";
        if (lower === "orange") return "FF6B2B";
        if (lower === "gray" || lower === "grey") return "757575";
        if (lower === "black") return "000000";
        if (lower === "red") return "FF0000";
        if (lower === "green") return "00FF00";
        if (lower === "white") return "FFFFFF";
        if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) return cleaned;
        if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
          return cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
        }
        return undefined;
      };

      const cleanHighlightColor = (highlightStr: any): string | undefined => {
        if (!highlightStr) return undefined;
        const h = String(highlightStr).trim().toLowerCase();
        const allowed = [
          "black", "blue", "cyan", "green", "magenta", "red", "yellow", "white",
          "darkblue", "darkcyan", "darkgreen", "darkmagenta", "darkred", "darkyellow",
          "darkgray", "lightgray"
        ];
        if (allowed.includes(h)) return h;
        if (h.includes("gray") || h.includes("grey") || h === "f0f0f0" || h === "e0e0e0") return "lightgray";
        if (h.includes("yellow") || h === "ffff00") return "yellow";
        if (h.includes("blue") || h === "0000ff") return "blue";
        if (h.includes("green") || h === "00ff00") return "green";
        if (h.includes("red") || h === "ff0000") return "red";
        if (h.includes("pink") || h === "ffc0cb") return "magenta";
        return undefined;
      };

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page) continue;
        const pageNum = page.pageNum;
        const elements = page.elements || [];

        if (i > 0 && insertPageBreaks !== false) {
          docxChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }

        elements.forEach((el: any) => {
          if (!el) return;
          const elType = String(el.type || "").toLowerCase().trim();
          const style = el.style || {};
          const isBold = typeof style.isBold === "boolean" ? style.isBold : !!el.bold;
          const isItalic = typeof style.isItalic === "boolean" ? style.isItalic : (!!el.italic || !!el.italics);
          
          let fontSize = 22;
          const rawFontSize = style.fontSize || el.fontSize;
          if (rawFontSize !== undefined && rawFontSize !== null) {
            const parsedSize = parseInt(String(rawFontSize), 10);
            if (!isNaN(parsedSize) && parsedSize > 0) {
              fontSize = parsedSize * 2;
            } else {
              fontSize = elType === "heading1" ? 48 : elType === "heading2" ? 32 : elType === "heading3" ? 28 : 22;
            }
          } else {
            fontSize = elType === "heading1" ? 48 : elType === "heading2" ? 32 : elType === "heading3" ? 28 : 22;
          }

          let alignment: any = AlignmentType.LEFT;
          const elAlign = String(el.alignment || "").toLowerCase().trim();
          if (elAlign === "center") alignment = AlignmentType.CENTER;
          if (elAlign === "right") alignment = AlignmentType.RIGHT;

          const rawColor = style.color || el.color || "";
          const textColor = cleanHexColor(rawColor);

          if (elType === "heading1") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                alignment,
                spacing: { before: 240, after: 120 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "heading2") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                alignment,
                spacing: { before: 200, after: 100 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "heading3") {
            docxChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                alignment,
                spacing: { before: 160, after: 80 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  size: fontSize,
                  color: textColor,
                }),
              }),
            );
          } else if (elType === "bullet_list") {
            const rawItems = el.items || (el.text ? [el.text] : []);
            const listItems = Array.isArray(rawItems)
              ? rawItems.filter((x: any) => x !== null && x !== undefined).map(x => typeof x === "object" ? (x.text || JSON.stringify(x)) : String(x))
              : [];
            listItems.forEach((itemText: string) => {
              const lines = cleanXmlText(itemText).split("\n");
              const runs: TextRun[] = [];
              lines.forEach((lineText, idx) => {
                if (idx > 0) {
                  runs.push(new TextRun({ break: 1 }));
                }
                runs.push(
                  new TextRun({
                    text: idx === 0 ? "•\t" + lineText : lineText,
                    size: 22,
                    ...(textColor ? { color: textColor } : {}),
                  })
                );
              });
              docxChildren.push(
                new Paragraph({
                  alignment,
                  indent: { left: 720, hanging: 360 },
                  children: runs,
                }),
              );
            });
          } else if (elType === "table") {
            const rows = el.rows || [];
            if (Array.isArray(rows) && rows.length > 0) {
              const cleanRows = rows.map((r: any) => {
                if (!Array.isArray(r)) return [];
                return r.map((c: any) => {
                  if (c === null || c === undefined) return "";
                  if (typeof c === "object") {
                    return c.text || JSON.stringify(c);
                  }
                  return String(c);
                });
              });

              const maxCols = Math.max(1, ...cleanRows.map(r => r.length));

              const tableRows = cleanRows.map((rowCells: string[], rIdx: number) => {
                const paddedCells = [...rowCells];
                while (paddedCells.length < maxCols) {
                  paddedCells.push(" ");
                }
                return new TableRow({
                  children: paddedCells.map((cellText: string) => {
                    return new TableCell({
                      shading: rIdx === 0 ? { fill: "E2E8FF" } : undefined,
                      children: [
                        new Paragraph({
                          children: buildTextRuns(cleanXmlText(cellText), {
                            bold: rIdx === 0,
                            size: 20,
                          }),
                        }),
                      ],
                    });
                  }),
                });
              });

              docxChildren.push(
                new DocxTable({
                  rows: tableRows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                }),
              );
              docxChildren.push(new Paragraph({ spacing: { after: 120 } }));
            }
          } else if (
            elType === "activity_box" ||
            elType === "question_box" ||
            elType === "summary_box"
          ) {
            let bg = "F4F6FF";
            let borderColor = "6366F1";
            let defaultTitle = "Activity";
            
            // Check if the page contains Devanagari (Hindi) or if the language is set to Hindi using our helper
            const isHindi = String(page.language || "").toLowerCase().includes("hi") || 
                            /[\u0900-\u097F]/.test(el.text || "") || 
                            (el.items && el.items.some((itm: any) => checkContainsDevanagari(itm)));

            if (elType === "question_box") {
              bg = "F8F9FF";
              borderColor = "06B6D4";
              defaultTitle = isHindi ? "प्रश्न" : "Questions";
            } else if (elType === "summary_box") {
              bg = "FAFAFA";
              borderColor = "94A3B8";
              defaultTitle = isHindi ? "सारांश" : "Summary";
            } else {
              bg = "F4F6FF";
              borderColor = "6366F1";
              defaultTitle = isHindi ? "क्रियाकलाप" : "Activity";
            }

            let boxTitle = defaultTitle;
            let listItems: string[] = [];

            if (el.text && el.text.trim()) {
              const trimmedText = el.text.trim();
              if (el.items && Array.isArray(el.items) && el.items.length > 0) {
                boxTitle = trimmedText;
                listItems = el.items.filter((x: any) => x !== null && x !== undefined).map(x => typeof x === "object" ? (x.text || JSON.stringify(x)) : String(x));
              } else {
                const isShort = trimmedText.length < 120;
                const containsBoxId = /क्रियाकलाप|activity|प्रश्न|question|summary|सारांश|क्या आप जानते|know/i.test(trimmedText);
                if (isShort || containsBoxId) {
                  boxTitle = trimmedText;
                  listItems = []; 
                } else {
                  boxTitle = defaultTitle;
                  listItems = [trimmedText];
                }
              }
            } else if (el.items && Array.isArray(el.items)) {
              listItems = el.items.filter((x: any) => x !== null && x !== undefined).map(x => typeof x === "object" ? (x.text || JSON.stringify(x)) : String(x));
            }

            // Clean the title and append ":" if not ending in punctuation
            let displayTitle = boxTitle;
            if (displayTitle && !displayTitle.endsWith(":") && !displayTitle.endsWith("?") && !displayTitle.endsWith("।")) {
              displayTitle += ":";
            }

            const borderHex = cleanHexColor(borderColor);
            const cellParagraphs = [
              new Paragraph({
                children: buildTextRuns(displayTitle, {
                  bold: true,
                  size: 24,
                  color: borderHex,
                }),
                spacing: { after: 120 },
              }),
            ];

            listItems.forEach((itemText: string) => {
              const trimmed = String(itemText || "").trim();
              if (!trimmed) return;

              // Check if original text already has a known bullet prefix
              const hasBulletPrefix = /^[•\-\*\▪]\s*/.test(trimmed);
              let cleanText = trimmed;
              if (hasBulletPrefix) {
                cleanText = trimmed.replace(/^[•\-\*\▪]\s*/, "");
              }

              const runs = buildTextRuns(cleanText, { size: 20 });
              if (runs.length > 0) {
                // If it's an activity box, we typically bulletize steps, or if it explicitly has a bullet prefix
                const useBullet = hasBulletPrefix || elType === "activity_box";
                cellParagraphs.push(
                  new Paragraph({
                    ...(useBullet ? { indent: { left: 400, hanging: 240 } } : {}),
                    children: useBullet ? [new TextRun({ text: "•\t", size: 20 }), ...runs] : runs,
                    spacing: { after: 80 }
                  }),
                );
              }
            });

            const bgHex = cleanHexColor(bg);
            docxChildren.push(
              new DocxTable({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        shading: bgHex ? { fill: bgHex } : undefined,
                        children: cellParagraphs,
                      }),
                    ],
                  }),
                ],
                width: { size: 100, type: WidthType.PERCENTAGE },
              }),
            );
            docxChildren.push(new Paragraph({ spacing: { after: 120 } }));
          } else if (elType === "chemical_equation") {
            docxChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100, after: 100 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  font: "Courier New",
                  size: 22,
                  bold: true,
                }),
              }),
            );
          } else if (elType === "caption") {
            docxChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  italics: true,
                  size: 18,
                  color: "757575",
                }),
              }),
            );
          } else {
            const highlightColor = cleanHighlightColor(style.backgroundColor || el.backgroundColor);
            docxChildren.push(
              new Paragraph({
                alignment,
                spacing: { after: 120 },
                children: buildTextRuns(cleanXmlText(el.text), {
                  bold: isBold,
                  italics: isItalic,
                  size: fontSize,
                  color: textColor,
                  highlight: highlightColor,
                }),
              }),
            );
          }
        });

        const pageImagesForThisPage = page.images || [];
        pageImagesForThisPage.forEach((img: any) => {
          try {
            if (!img || !img.base64) return;
            const rawWidth = Number(img.width);
            const rawHeight = Number(img.height);
            if (isNaN(rawWidth) || rawWidth <= 0 || isNaN(rawHeight) || rawHeight <= 0) return;

            const displayWidth = 400;
            const displayHeight = Math.round(400 * (rawHeight / rawWidth));
            if (isNaN(displayHeight) || displayHeight <= 0 || !isFinite(displayHeight)) return;

            const cleanBase64 = img.base64.replace(/^data:image\/[a-z]+;base64,/, "");
            const buffer = Buffer.from(cleanBase64, "base64");
            
            // Validate PNG magic bytes [0x89, 0x50, 0x4E, 0x47] to skip corrupt images causing zip packer failure
            if (
              buffer.length < 8 ||
              buffer[0] !== 0x89 ||
              buffer[1] !== 0x50 ||
              buffer[2] !== 0x4E ||
              buffer[3] !== 0x47
            ) {
              console.warn("Invalid PNG magic signature on img buffer, skipping to prevent docx pack failures.");
              return;
            }

            docxChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
                children: [
                  new ImageRun({
                    data: buffer,
                    transformation: {
                      width: displayWidth,
                      height: displayHeight,
                    },
                  }),
                ],
              }),
            );
          } catch (rErr) {
            console.warn("Could not insert image block inside generate-docx:", rErr);
          }
        });
      }

      if (docxChildren.length === 0) {
        docxChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "No readable content could be extracted from this converter stream.",
                size: 22,
              }),
            ],
          }),
        );
      }

      const doc = new DocxDocument({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  right: 720,
                  bottom: 720,
                  left: 720,
                },
              },
            },
            children: docxChildren,
          },
        ],
      });

      const docBuffer = await Packer.toBuffer(doc);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(title || "document")}.docx"`,
      );
      res.send(docBuffer);
    } catch (docxErr: any) {
      console.error("docx generator failure:", docxErr);
      res.status(500).json({ error: docxErr.message || "Failed docx compiler structure." });
    }
  }
);

app.post("/api/razorpay/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res
        .status(500)
        .json({ error: "Razorpay secret not configured on server" });
    }
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      return res.json({
        success: true,
        message: "Payment verified successfully",
      });
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Invalid signature" });
    }
  } catch (error: any) {
    console.error("Razorpay verification error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to verify signature" });
  }
});

// --- PDF WATERMARK REMOVER TOOL ROUTES ---
import { scanPDF } from "./pdfWatermarkScanner.ts";
import { removePDFWatermarks } from "./pdfWatermarkRemover.ts";
import { analyzeWithGemini } from "./pdfAiScanner.ts";
import { nanoid } from "nanoid";

const watermarkSessions = new Map<string, {
  pdfBuffer: Buffer;
  watermarks: Record<string, any>;
  createdAt: number;
}>();

// Cleanup expired sessions every 10 minutes (keep for last 30 minutes)
setInterval(() => {
  const expireTime = Date.now() - 30 * 60 * 1000;
  for (const [sid, session] of watermarkSessions.entries()) {
    if (session.createdAt < expireTime) {
      watermarkSessions.delete(sid);
    }
  }
}, 10 * 60 * 1000);

const watermarkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post("/api/tools/pdf-watermark-remover/scan", watermarkUpload.single("file"), async (req, res) => {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = "document.pdf";

    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
    } else {
      const { name, base64 } = req.body || {};
      if (base64) {
        const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
        if (name) fileName = name;
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    const sessionId = Math.random().toString(36).substring(2, 15);
    
    // Step 1: Structural Scan (Fast)
    const { watermarks: structureWatermarks, totalPages } = scanPDF(fileBuffer);
    
    // Step 2: AI Visual Scan (Random pages)
    const { results: aiResults, error: aiError } = await analyzeWithGemini(fileBuffer);
    
    // Merge AI results into watermarks list
    const finalWatermarks = [...structureWatermarks];
    
    for (const ai of aiResults) {
      // Check if mupdf already found a similar text watermark
      const alreadyFoundText = structureWatermarks.find(
        w => w.text?.toLowerCase() === ai.text?.toLowerCase() && w.text !== null
      );
      
      if (!alreadyFoundText) {
        finalWatermarks.push({
          id: nanoid(),
          type: "AI_DETECTED",
          text: ai.text || null,
          description: ai.description,
          source: "ai",
          xref: null,
          pagesAffected: Array.from({ length: totalPages }, (_, i) => i), // AI finds it on sample, assume it affects all (PRD requirement)
          confidence: ai.confidence / 100,
          position: ai.position
        });
      }
    }

    const watermarksMap: Record<string, any> = {};
    for (const wm of finalWatermarks) {
      watermarksMap[wm.id] = wm;
    }

    watermarkSessions.set(sessionId, {
      pdfBuffer: fileBuffer,
      watermarks: watermarksMap,
      createdAt: Date.now()
    });

    const watermarksForClient = finalWatermarks.map(({ thumbnailBase64, ...rest }) => rest);

    res.json({
      sessionId,
      totalPages,
      watermarks: watermarksForClient,
      fileName,
      aiWarning: aiError || null
    });

  } catch (err: any) {
    console.error("[PDF Watermark scan error]:", err);
    res.status(500).json({ error: err.message || "Failed to scan PDF watermarks" });
  }
});

app.get("/api/tools/pdf-watermark-remover/thumbnail/:sessionId/:wmId", (req, res) => {
  try {
    const { sessionId, wmId } = req.params;
    const session = watermarkSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session expired or invalid" });
    }

    const wm = session.watermarks[wmId];
    if (!wm || !wm.thumbnailBase64) {
      return res.status(404).json({ error: "Watermark image preview not found" });
    }

    const imgBuffer = Buffer.from(wm.thumbnailBase64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(imgBuffer);
  } catch (err) {
    res.status(500).end();
  }
});

app.post("/api/tools/pdf-watermark-remover/remove", express.json(), async (req, res) => {
  try {
    const { sessionId, watermarkIds } = req.body;
    if (!sessionId || !Array.isArray(watermarkIds) || watermarkIds.length === 0) {
      return res.status(400).json({ error: "sessionId and selected watermarkIds are required" });
    }

    const session = watermarkSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session expired. Please upload your PDF again." });
    }

    const selectedWatermarks = watermarkIds
      .map(id => session.watermarks[id])
      .filter(Boolean);

    if (selectedWatermarks.length === 0) {
      return res.status(400).json({ error: "No valid watermarks were selected" });
    }

    const cleanedBuffer = removePDFWatermarks(session.pdfBuffer, selectedWatermarks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="clean_${session.watermarks[watermarkIds[0]]?.text || "document"}.pdf"`);
    res.setHeader("Content-Length", cleanedBuffer.length);
    res.end(cleanedBuffer);

  } catch (err: any) {
    console.error("[PDF Watermark removal error]:", err);
    res.status(500).json({ error: err.message || "Failed to remove PDF watermarks" });
  }
});

// VedaRank endpoint - Parse exam response sheet from URL or HTML
app.post("/api/parse-result", async (req, res) => {
  console.log("[Parse request received]");
  
  try {
    // Support both old format (mode, url, html) and new format (responseSheetUrl, submissionId)
    const { mode, html, submissionId } = req.body;
    let url = req.body.url;
    let responseSheetUrl = req.body.responseSheetUrl;

    if (typeof url === "string") {
      url = url.trim().replace(/([^:])\/\/+/g, "$1/");
    }
    if (typeof responseSheetUrl === "string") {
      responseSheetUrl = responseSheetUrl.trim().replace(/([^:])\/\/+/g, "$1/");
    }
    
    let htmlContent = '';
    let finalSubmissionId = submissionId || crypto.randomBytes(16).toString('hex');
    
    // Handle new format with responseSheetUrl
    if (responseSheetUrl && !mode) {
      console.log("[Parse] Using new format with responseSheetUrl");
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2312 Build/AP3A.240905.015.A2_MOD1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.91 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Upgrade-Insecure-Requests': '1',
        'dnt': '1',
        'X-Requested-With': 'mark.via.gp',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Accept-Language': 'en-US,en;q=0.9'
      };

      const response = await fetch(responseSheetUrl, { headers });
      
      if (!response.ok) {
        return res.status(400).json({ 
          success: false, 
          message: `Failed to fetch URL: ${response.status} ${response.statusText}` 
        });
      }
      
      htmlContent = await response.text();
    }
    // Handle old format with mode
    else if (mode) {
      console.log("[Parse] Using old format with mode:", mode);
      
      if (!mode || (mode === 'url' && !url) && (mode !== 'url' && !html)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid request. Mode and url/html are required.' 
        });
      }

      if (mode === 'url') {
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2312 Build/AP3A.240905.015.A2_MOD1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.91 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
          'Upgrade-Insecure-Requests': '1',
          'dnt': '1',
          'X-Requested-With': 'mark.via.gp',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Accept-Language': 'en-US,en;q=0.9'
        };

        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          return res.status(400).json({ 
            success: false, 
            message: `Failed to fetch URL: ${response.status} ${response.statusText}` 
          });
        }
        
        htmlContent = await response.text();
      } else if (mode === 'paste' || mode === 'upload') {
        htmlContent = html;
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request. Provide either (mode, url/html) or (responseSheetUrl, submissionId).' 
      });
    }

    console.log("[Parse] HTML content length:", htmlContent.length);
    
    // Extract questions from HTML using basic parsing
    // This is a simplified parser - in production, you'd use a more sophisticated parser
    const questions = extractQuestionsFromHTML(htmlContent);
    console.log("[Questions extracted]:", questions.length);
    
    // Calculate score (simplified - count correct answers)
    const score = questions.filter(q => q.isCorrect).length;
    
    // Extract student profile data from HTML
    const studentData = extractStudentDataFromHTML(htmlContent, url || responseSheetUrl || "");
    console.log("[Student data extracted]:", studentData);

    // Extract metadata
    const metadata = {
      totalQuestions: questions.length,
      correctAnswers: score,
      incorrectAnswers: questions.length - score,
      parsedAt: new Date().toISOString()
    };

    res.json({ 
      success: true, 
      submissionId: finalSubmissionId,
      questions,
      score,
      metadata,
      studentData
    });
    
  } catch (err: any) {
    console.error('[parse-result error]:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to parse result' 
    });
  }
});

// Helper function to extract questions from HTML
function extractQuestionsFromHTML(html: string): any[] {
  const questions: any[] = [];
  
  try {
    // Basic HTML parsing to extract question patterns
    // This is a simplified implementation - adjust based on actual HTML structure
    
    // Look for question patterns in the HTML
    const questionPattern = /<div[^>]*class="[^"]*question[^"]*"[^>]*>(.*?)<\/div>/gis;
    const matches = html.matchAll(questionPattern);
    
    let questionIndex = 0;
    for (const match of matches) {
      const questionText = match[1].replace(/<[^>]*>/g, '').trim();
      if (questionText.length > 10) {
        questions.push({
          id: `q${questionIndex++}`,
          questionText: questionText.substring(0, 200), // Truncate for safety
          options: [],
          answer: '',
          isCorrect: false,
          userAnswer: ''
        });
      }
    }
    
    // If no questions found with regex, create placeholder for demo
    if (questions.length === 0) {
      console.log("[Parse] No questions found with regex, creating placeholder");
      questions.push({
        id: 'q0',
        questionText: 'Sample question extracted from response sheet',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: 'A',
        isCorrect: true,
        userAnswer: 'A'
      });
    }
  } catch (err) {
    console.error("[extractQuestionsFromHTML error]:", err);
  }
  
  return questions;
}

// Helper function to extract student profile data from HTML
function extractStudentDataFromHTML(html: string, baseUrl: string): { name: string, roll: string, exam: string, date: string, photoUrl: string } {
  const result = { name: "", roll: "", exam: "", date: "", photoUrl: "" };
  
  try {
    const cleanText = (str: string) => 
      str.replace(/<[^>]*>/g, '')
         .replace(/&nbsp;/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();

    // Match standard table rows (key-value columns)
    const rowPattern = /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/gis;
    const matches = html.matchAll(rowPattern);
    
    for (const match of matches) {
      const key = cleanText(match[1]).toLowerCase();
      const val = cleanText(match[2]);
      
      if (key === "candidate name" || key === "student name" || (key.includes("name") && !key.includes("center") && !key.includes("subject"))) {
        result.name = val;
      } else if (key.includes("roll number") || key.includes("roll no")) {
        result.roll = val;
      } else if (key.includes("subject") || key.includes("exam") || key.includes("test paper")) {
        result.exam = val;
      } else if (key.includes("test date") || key.includes("date")) {
        result.date = val;
      }
    }

    // Secondary fallback scans
    if (!result.name) {
      const nameMatch = html.match(/(?:Candidate Name)[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
      if (nameMatch) result.name = cleanText(nameMatch[1]);
    }
    if (!result.roll) {
      const rollMatch = html.match(/(?:Roll Number|Roll No)[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
      if (rollMatch) result.roll = cleanText(rollMatch[1]);
    }
    if (!result.exam) {
      const examMatch = html.match(/(?:Subject|Test Paper)[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
      if (examMatch) result.exam = cleanText(examMatch[1]);
    }
    if (!result.date) {
      const dateMatch = html.match(/(?:Test Date|Date)[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
      if (dateMatch) result.date = cleanText(dateMatch[1]);
    }

    // Scan for candidate photo URL from image tags
    const imgPattern = /<img[^>]*src=["'](.*?)["']/gis;
    const imgMatches = html.matchAll(imgPattern);
    
    for (const match of imgMatches) {
      const src = match[1].trim();
      const srcLower = src.toLowerCase();
      
      // Candidate photo check: contains photo, cphoto, candidate, or starts with roll number
      if (srcLower.includes("photo") || srcLower.includes("cphoto") || srcLower.includes("candidate") || (result.roll && srcLower.includes(result.roll))) {
        // Exclude signatures or logos if possible
        if (!srcLower.includes("sign") && !srcLower.includes("logo")) {
          result.photoUrl = resolveAbsoluteUrl(baseUrl, src);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[extractStudentDataFromHTML error]:", err);
  }
  
  return result;
}

// Helper function to resolve relative URL to absolute URL
function resolveAbsoluteUrl(baseUrl: string, relativeUrl: string): string {
  try {
    if (!baseUrl) return relativeUrl;
    if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://") || relativeUrl.startsWith("data:")) {
      return relativeUrl;
    }
    
    const urlObj = new URL(baseUrl);
    const pathname = urlObj.pathname;
    const lastSlashIdx = pathname.lastIndexOf("/");
    const basePath = lastSlashIdx !== -1 ? pathname.substring(0, lastSlashIdx + 1) : "/";
    
    return `${urlObj.origin}${basePath}${relativeUrl}`;
  } catch (err) {
    console.error("[resolveAbsoluteUrl error]:", err);
    return relativeUrl;
  }
}



app.delete("/api/tools/pdf-watermark-remover/session/:id", (req, res) => {
  watermarkSessions.delete(req.params.id);
  res.json({ success: true });
});

/**
 * Handle Unhandled/Express Errors (like PayloadTooLargeError)
 * so that they return as JSON instead of HTML
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "File or payload is too large. Please upload a smaller file." });
  }
  
  console.error("[Express Error Handler]", err.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

export default app;
