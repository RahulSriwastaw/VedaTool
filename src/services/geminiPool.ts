import { GoogleGenAI } from "@google/genai";

export interface KeyState {
  id: string;
  key: string;
  status: "idle" | "busy" | "cooldown" | "invalid";
  cooldownMs: number;
  consecutiveSuccesses: number;
  availableAt: number;
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GeminiError";
  }
}

// Memory pool of active api keys
const keyPool: KeyState[] = [];
let poolInitialized = false;

/**
 * Initialize Gemini Pool by scanning environment variables and loading fallback keys.
 */
export function initGeminiPool() {
  if (poolInitialized) return;

  keyPool.length = 0; // Reset list
  const env = (import.meta as any).env || {};

  console.log('=== GEMINI POOL DEBUG ===')
  console.log('All VITE env vars:', Object.keys(env).filter(k => k.startsWith('VITE')))
  console.log('import.meta.env:', env)
  console.log('=== END DEBUG ===')

  const possibleKeys: string[] = []
  
  // Try every known pattern
  const singleKeyPatterns = [
    env.VITE_GEMINI_API_KEY,
    env.VITE_GEMINI_KEY,
    env.VITE_GOOGLE_API_KEY,
    env.VITE_AI_API_KEY,
  ]
  singleKeyPatterns.forEach(k => { if (k && k.trim()) possibleKeys.push(k.trim()) })
  
  // Try numbered patterns up to 20
  for (let i = 1; i <= 20; i++) {
    const patterns = [
      env[`VITE_GEMINI_API_KEY_${i}`],
      env[`VITE_FREE_GEMINI_KEY_${i}`],
      env[`VITE_GEMINI_KEY_${i}`],
    ]
    patterns.forEach(k => { if (k && k.trim()) possibleKeys.push(k.trim()) })
  }

  // Backup fallback: USER local_storage key (highly robust user option)
  const userKey = localStorage.getItem("active_gemini_api_key");
  if (userKey && userKey.trim().length > 10) {
    possibleKeys.push(userKey.trim());
  }
  
  // Deduplicate
  const uniqueKeys = [...new Set(possibleKeys)]
  
  console.log('[GeminiPool] Found keys count:', uniqueKeys.length)
  
  if (uniqueKeys.length === 0) {
    console.log('[GeminiPool] Safe Mode: Initializing with server-backed routing.')
    console.log('[GeminiPool] Available client env vars:', Object.keys(env))
    console.log('[GeminiPool] Utilizing server-backed virtual pool of 15 slots.')
    
    // Populate with 15 server virtual slots to run backend API calls concurrently
    for (let i = 1; i <= 15; i++) {
      keyPool.push({
        id: `SERVER_BACKING_SLOT_${i}`,
        key: "", // Empty string means header x-user-api-key will be omitted, using server's backend keys
        status: "idle",
        cooldownMs: 1000,
        consecutiveSuccesses: 0,
        availableAt: 0,
      });
    }
  } else {
    // Populate verified keys in keyPool
    uniqueKeys.forEach((key, idx) => {
      keyPool.push({
        id: `KEY_${idx + 1}`,
        key: key,
        status: "idle",
        cooldownMs: 5000,
        consecutiveSuccesses: 0,
        availableAt: 0,
      });
    });
  }

  poolInitialized = true;
  console.log(`[GeminiPool] Initialized pool with ${keyPool.length} active keys.`);
}

/**
 * Helper to update keys that are done with their cooldown sleep
 */
function updateKeyStates() {
  const now = Date.now();
  for (const k of keyPool) {
    if (k.status === "cooldown" && now >= k.availableAt) {
      k.status = "idle";
    }
  }
}

/**
 * Acquires next available idle key, marking it busy
 */
export function acquireKey(): KeyState | null {
  updateKeyStates();
  const idleKeys = keyPool.filter((k) => k.status === "idle");
  if (idleKeys.length === 0) return null;
  const chosen = idleKeys[0];
  chosen.status = "busy";
  return chosen;
}

/**
 * Reset cooldown and manage self-healing on successful call
 */
export function releaseSuccess(keyId: string) {
  const k = keyPool.find((state) => state.id === keyId);
  if (!k) return;

  k.consecutiveSuccesses++;
  if (k.consecutiveSuccesses >= 5) {
    k.consecutiveSuccesses = 0;
    if (keyId.startsWith("SERVER_BACKING_SLOT_")) {
      k.cooldownMs = Math.max(1000, k.cooldownMs - 1000);
    } else {
      // Self-healing: decrease cooldown by 2s, floor is 1000ms (1s)
      k.cooldownMs = Math.max(1000, k.cooldownMs - 2000);
    }
  }

  k.status = "cooldown";
  // Paced steady stream spacing (1000ms) for server virtual slots to avoid rate-limit spikes
  k.availableAt = Date.now() + (keyId.startsWith("SERVER_BACKING_SLOT_") ? 1000 : k.cooldownMs);
}

/**
 * Multiplies key cooldown factor on overload/limitation (429)
 */
export function releaseRateLimited(keyId: string) {
  const k = keyPool.find((state) => state.id === keyId);
  if (!k) return;

  k.consecutiveSuccesses = 0;
  if (keyId.startsWith("SERVER_BACKING_SLOT_")) {
    // Adaptive dynamic cooldown: start at 5s, double to 10s -> 20s -> max 30s
    if (k.cooldownMs < 5000) k.cooldownMs = 5000;
    k.cooldownMs = Math.min(30000, k.cooldownMs * 2);
  } else {
    // Double cooldown: 5s -> 10s -> 20s -> 40s -> 60s max
    k.cooldownMs = Math.min(60000, k.cooldownMs * 2);
  }
  k.status = "cooldown";
  k.availableAt = Date.now() + k.cooldownMs;
}

/**
 * Banes invalid authentication keys forever
 */
export function releaseInvalid(keyId: string) {
  const k = keyPool.find((state) => state.id === keyId);
  if (!k) return;
  k.status = "invalid";
}

/**
 * Returns remaining cooldown wait in milliseconds for shortest wait key
 */
export function timeUntilNextAvailable(): number {
  updateKeyStates();
  const idle = keyPool.filter((k) => k.status === "idle");
  if (idle.length > 0) return 0;

  const valid = keyPool.filter((k) => k.status !== "invalid");
  if (valid.length === 0) return Infinity; // Everything's dead!

  const inCooldown = valid.filter((k) => k.status === "cooldown");
  if (inCooldown.length > 0) {
    const times = inCooldown.map((k) => Math.max(0, k.availableAt - Date.now()));
    return Math.min(...times);
  }

  return 1000; // All currently busy, wait a secondary standard timer interval
}

/**
 * Counts currently idle and ready processors
 */
export function idleCount(): number {
  updateKeyStates();
  return keyPool.filter((k) => k.status === "idle").length;
}

/**
 * Determines balanced parallel worker capacity based on user traffic
 */
export function calculateParallelism(activeUserCount: number = 1, currentUsage: number = 0): number {
  const hasServerBacking = keyPool.some((k) => k.id.startsWith("SERVER_BACKING_SLOT_"));
  const idleKeys = idleCount() + currentUsage;
  if (hasServerBacking) {
    // Dynamic adaptive throttling for server slots. Reduces parallelism down to 1 when slots go into cooldown
    const calculated = Math.floor(idleKeys / Math.max(activeUserCount, 1));
    return Math.min(15, Math.max(1, calculated)); // Keep a safe max of 15 parallel workers on backend routing
  }
  const calculated = Math.floor(idleKeys / Math.max(activeUserCount, 1));
  return Math.min(15, Math.max(1, calculated)); // Safe floor-ceiling to avoid 429 exhaustion on single standard keys
}

/**
 * Universal Gemini API call handler executing through @google/genai
 */
export async function callGemini(
  apiKey: string,
  payload:
    | { type: "image"; imageBase64: string; mimeType: string; prompt: string }
    | { type: "text"; prompt: string }
): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30000, // Strict 30s timeout
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  try {
    let response;
    if (payload.type === "image") {
      const imagePart = {
        inlineData: {
          mimeType: payload.mimeType,
          data: payload.imageBase64,
        },
      };
      const textPart = {
        text: payload.prompt,
      };
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
      });
    } else {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: payload.prompt,
      });
    }

    if (!response || !response.text) {
      throw new Error("Empty response received from Gemini.");
    }
    return response.text;
  } catch (err: any) {
    const rawMsg = err.message || String(err);
    console.error(`[callGemini] API error details: ${rawMsg}`);

    let status = 500;
    const msgUpper = rawMsg.toUpperCase();
    if (
      msgUpper.includes("429") ||
      msgUpper.includes("LIMIT") ||
      msgUpper.includes("QUOTA") ||
      msgUpper.includes("RESOURCE_EXHAUSTED")
    ) {
      status = 429;
    } else if (
      msgUpper.includes("401") ||
      msgUpper.includes("403") ||
      msgUpper.includes("APIKEY") ||
      msgUpper.includes("INVALID") ||
      msgUpper.includes("UNAUTHORIZED")
    ) {
      status = 401;
    } else if (
      msgUpper.includes("TIMEOUT") ||
      msgUpper.includes("ABORT") ||
      msgUpper.includes("DEADLINE")
    ) {
      status = 408;
    } else if (msgUpper.includes("503") || msgUpper.includes("UNAVAILABLE")) {
      status = 503;
    }

    throw new GeminiError(rawMsg, status);
  }
}

export interface BatchConfig<T, R> {
  items: T[];
  processItem: (item: T, index: number, apiKey: string) => Promise<R>;
  onProgress?: (progress: {
    completed: number;
    total: number;
    lastResult?: R;
    message: string;
    allocatedWorkers: number;
    itemStatuses: ("pending" | "processing" | "complete" | "failed" | "retrying")[];
  }) => void;
  onError?: (item: T, index: number, error: any) => void;
  signal?: AbortSignal;
  maxWorkers?: number;
}

/**
 * Universal Batch Processor implementing Smart Rolling Workers
 */
export async function processBatch<T, R>(config: BatchConfig<T, R>): Promise<R[]> {
  const { items, processItem, onProgress, onError, signal, maxWorkers = 15 } = config;
  const total = items.length;
  if (total === 0) return [];

  // Re-init pool states to flush any stales
  if (keyPool.length === 0) {
    initGeminiPool();
  }

  const results: R[] = Array(total);
  const itemStatuses: ("pending" | "processing" | "complete" | "failed" | "retrying")[] = Array(total).fill("pending");
  const queue = items.map((item, index) => ({ item, index }));

  let completed = 0;
  let activeWorkers = 0;
  let targetWorkers = Math.max(1, Math.min(maxWorkers, calculateParallelism(1, activeWorkers)));

  const updateProgress = (message: string) => {
    if (onProgress) {
      onProgress({
        completed,
        total,
        message,
        allocatedWorkers: activeWorkers,
        itemStatuses: [...itemStatuses],
      });
    }
  };

  updateProgress("Starting up dynamic processing...");

  const runWorker = async () => {
    activeWorkers++;
    while (queue.length > 0) {
      if (signal?.aborted) break;

      // Scale down check
      if (activeWorkers > targetWorkers) break;

      const next = queue.shift();
      if (!next) break;

      const { item, index } = next;
      itemStatuses[index] = "processing";
      updateProgress(`Processing item ${index + 1} of ${total}...`);

      let success = false;
      let attempt = 0;

      while (attempt < 4) {
        if (signal?.aborted) break;

        let keyState = acquireKey();
        while (!keyState) {
          // If all keys are marked invalid, stop and error out
          const validKeys = keyPool.filter((k) => k.status !== "invalid");
          if (validKeys.length === 0) {
            console.error("[GeminiPool] All pool processors are invalid. Please check your API key configuration.", keyPool);
            throw new Error("API not configured. Please contact support.");
          }

          const waitTime = Math.max(100, timeUntilNextAvailable());
          updateProgress("🔄 All processors resting — resuming in a few seconds. Everything is fine!");
          await new Promise((r) => setTimeout(r, waitTime));
          keyState = acquireKey();
        }

        try {
          // Call original processor
          const res = await processItem(item, index, keyState.key);
          results[index] = res;
          releaseSuccess(keyState.id);
          itemStatuses[index] = "complete";
          completed++;
          success = true;
          updateProgress(`Processed item ${index + 1}!`);
          break;
        } catch (err: any) {
          attempt++;
          const errStatus = err instanceof GeminiError ? err.status : 500;
          let statusText = "Switching processor...";

          if (errStatus === 429) {
            releaseRateLimited(keyState.id);
            statusText = "Processor busy, retrying automatically...";
          } else if (errStatus === 401 || errStatus === 403) {
            releaseInvalid(keyState.id);
            statusText = "Switching processor...";
          } else if (errStatus === 408) {
            releaseRateLimited(keyState.id);
            statusText = "Processor slow, retrying...";
          } else {
            releaseSuccess(keyState.id);
            statusText = "Processor slow, retrying...";
          }

          if (attempt < 4) {
            itemStatuses[index] = "retrying";
            updateProgress(statusText);
            // Staggered sleep
            await new Promise((r) => setTimeout(r, attempt * 1000));
          } else {
            itemStatuses[index] = "failed";
            updateProgress(`This item could not be processed. [Retry]`);
            if (onError) {
              try {
                onError(item, index, err);
              } catch (handlerErr) {
                console.error("Error handler threw exception:", handlerErr);
              }
            }
          }
        }
      }

      if (!success) {
        results[index] = null as any;
      }
    }
    activeWorkers--;
  };

  // Start initial pool workers
  const workerPromises: Promise<void>[] = [];
  for (let i = 0; i < targetWorkers; i++) {
    workerPromises.push(runWorker());
  }

  // Monitor and scale dynamically every 5 seconds
  const monitorInterval = setInterval(() => {
    if (signal?.aborted || queue.length === 0) {
      clearInterval(monitorInterval);
      return;
    }

    const calculated = calculateParallelism(1, activeWorkers);
    const newTarget = Math.max(1, Math.min(maxWorkers, calculated));

    if (newTarget > targetWorkers) {
      const diff = newTarget - targetWorkers;
      targetWorkers = newTarget;
      updateProgress(`⚡ Processing speed increased to ${newTarget} processors!`);
      for (let i = 0; i < diff; i++) {
        runWorker();
      }
    } else {
      targetWorkers = newTarget;
    }
  }, 5000);

  try {
    await Promise.all(workerPromises);
  } finally {
    clearInterval(monitorInterval);
  }

  if (signal?.aborted) {
    throw new Error("Task cancelled.");
  }

  return results;
}
