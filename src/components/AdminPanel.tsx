import React, { useState, useEffect } from "react";
import {
  Shield,
  Key,
  Database,
  Users,
  Trash2,
  ShieldCheck,
  Globe,
  Lock,
  Search,
  RefreshCw,
  Edit,
  Activity,
  Calendar,
  Eye,
  Coins,
  FileText,
  AlertTriangle,
  Power,
  Check,
  User,
  Terminal,
  LogOut,
  CheckCircle,
  Flame,
  Download,
  EyeOff,
  Copy,
  IndianRupee,
  History,
} from "lucide-react";
import { db, auth } from "../services/firebase";
import {
  collection,
  getDocs,
  getDoc,
  query,
  deleteDoc,
  doc,
  setDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";

import { SubscriptionPlan, PlanLimits, getCleanDisplayName } from "../types";

type AdminTab =
  | "keys"
  | "users"
  | "conversions"
  | "diagnostics"
  | "plans"
  | "analytics"
  | "payments";

const AdminPanel: React.FC = () => {
  const [user, userLoading] = useAuthState(auth);

  // Login credentials and auth state for Admin Gate
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return sessionStorage.getItem("admin_session_auth_token");
  });

  // Main system datasets
  const [activeTab, setActiveTab] = useState<AdminTab>("keys");
  const [sharedKeys, setSharedKeys] = useState<any[]>([]);
  const [selectedDonatedKeys, setSelectedDonatedKeys] = useState<string[]>([]);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>(
    {},
  );
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [serverKeysStats, setServerKeysStats] = useState<any[]>([]);
  const [serverDeadKeys, setServerDeadKeys] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [globalConversions, setGlobalConversions] = useState<any[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isEditingPlan, setIsEditingPlan] = useState<SubscriptionPlan | null>(
    null,
  );
  const [rates, setRates] = useState<any>({
    pdfConverter: { system: 50, custom: 2 },
    mcqExtractor: { system: 50, custom: 2 },
    youtubeSeo: { system: 40, custom: 2 },
    chatApp: { system: 15, custom: 1 },
  });
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [analyticsVisits, setAnalyticsVisits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [gaConfig, setGaConfig] = useState<string>("");
  const [isSavingGa, setIsSavingGa] = useState(false);
  const [freeRetentionDays, setFreeRetentionDays] = useState<number>(7);
  const [premiumRetentionDays, setPremiumRetentionDays] = useState<number>(30);
  const [isSavingRetention, setIsSavingRetention] = useState<boolean>(false);
  const [isTriggeringCleanup, setIsTriggeringCleanup] = useState<boolean>(false);
  const [cleanupConsoleLogs, setCleanupConsoleLogs] = useState<string[]>([]);
  const [cleanupSummary, setCleanupSummary] = useState<any | null>(null);

  const [healthPoolKeys, setHealthPoolKeys] = useState<any[]>([]);
  const [isValidatingAll, setIsValidatingAll] = useState(false);

  // Selected User Detail Modal / Console
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<any[]>([]);
  const [selectedUserPersonalKeys, setSelectedUserPersonalKeys] = useState<
    any[]
  >([]);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isEditingTokens, setIsEditingTokens] = useState(false);
  const [editingTokensValue, setEditingTokensValue] = useState(0);

  // Auto-refresh timer
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load basic admin token on start
  useEffect(() => {
    if (adminToken && user) {
      loadAllStats();
    } else {
      setLoading(false);
    }
  }, [user, adminToken]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError("Please fill in both admin username and password.");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error("Invalid administrative credentials.");
      }

      const rawToken = btoa(`${username}:${password}`);
      sessionStorage.setItem("admin_session_auth_token", rawToken);
      setAdminToken(rawToken);
    } catch (err: any) {
      setLoginError(
        err.message || "Failed to log in to administrative gateway.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("admin_session_auth_token");
    setAdminToken(null);
  };

  const loadAllStats = async () => {
    if (!adminToken) return;
    setIsRefreshing(true);
    try {
      // 1. Fetch Server Rotation Stats
      await fetchServerKeysInfo();
      // 1b. Fetch Unified Key Pool Health Statuses
      await fetchHealthPoolKeys();
      // 2. Fetch Shared Keys from Firestore
      await fetchSharedKeys();
      // 3. Fetch Registered Users from Firestore
      await fetchRegisteredUsers();
      // 4. Fetch Global Conversions from Sub-collection of Users
      await fetchGlobalAnalysisLogs();
      // 5. Fetch Plans
      await fetchPlans();
      // 5b. Fetch Tool Rates
      await fetchRates();
      // 6. Fetch Analytics Config & Basic Logs
      await fetchAnalyticsTracking();
      // 7. Fetch Payments
      await fetchPayments();

      setLastRefreshedAt(new Date());
    } catch (e) {
      console.error("Failed to load systems stats:", e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchRates = async () => {
    try {
      const ratesSnap = await getDoc(doc(db, "settings", "rates"));
      if (ratesSnap.exists()) {
        setRates(ratesSnap.data());
      }
    } catch (e) {
      console.error("Failed to fetch rates:", e);
    }
  };

  const saveRates = async (newRates: any) => {
    setIsSavingRates(true);
    try {
      await setDoc(doc(db, "settings", "rates"), newRates);
      setRates(newRates);
      alert("Tool Token Rates saved successfully!");
    } catch (e) {
      console.error("Failed to save rates:", e);
      alert("Failed to save rates: " + e);
    } finally {
      setIsSavingRates(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const q = query(collection(db, "plans"));
      const snapshot = await getDocs(q);
      const plansList: SubscriptionPlan[] = [];
      snapshot.forEach((doc) => {
        plansList.push({ id: doc.id, ...doc.data() } as SubscriptionPlan);
      });
      setPlans(plansList);
    } catch (e) {
      console.error("Plans fetch error", e);
    }
  };

  const fetchPayments = async () => {
    try {
      const q = query(
        collection(db, "payments"),
        orderBy("createdAt", "desc"),
        limit(100),
      );
      const paySnap = await getDocs(q);
      const payList: any[] = [];
      paySnap.forEach((d) => payList.push({ id: d.id, ...d.data() }));
      setPayments(payList);
    } catch (e) {
      console.warn("Could not fetch payments. Check firestore indexing.", e);
      try {
        // Fallback without orderBy
        const q2 = query(collection(db, "payments"), limit(100));
        const paySnap2 = await getDocs(q2);
        const payList2: any[] = [];
        paySnap2.forEach((d) => payList2.push({ id: d.id, ...d.data() }));
        setPayments(
          payList2.sort(
            (a, b) =>
              (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
          ),
        );
      } catch (err) {}
    }
  };

  const fetchAnalyticsTracking = async () => {
    try {
      // Get Analytics Settings (GA)
      const { getDoc } = await import("firebase/firestore");
      const settingsRef = doc(db, "settings", "analytics");
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        setGaConfig(settingsSnap.data().googleAnalyticsId || "");
      }

      // Get History Retention settings
      const retentionRef = doc(db, "settings", "history_retention");
      const retentionSnap = await getDoc(retentionRef);
      if (retentionSnap.exists()) {
        const rData = retentionSnap.data();
        setFreeRetentionDays(rData.freeRetentionDays ?? 7);
        setPremiumRetentionDays(rData.premiumRetentionDays ?? 30);
      }

      // Get internal visit logs
      const q = query(collection(db, "analytics"));
      const visitSnap = await getDocs(q);
      const visits: any[] = [];
      visitSnap.forEach((d) => {
        visits.push({ id: d.id, ...d.data() });
      });
      // sort desc by timestamp
      visits.sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
      });
      setAnalyticsVisits(visits);
    } catch (e) {
      console.error("Analytics fetch error", e);
    }
  };

  const saveHistoryRetention = async () => {
    setIsSavingRetention(true);
    try {
      await setDoc(doc(db, "settings", "history_retention"), {
        freeRetentionDays: Number(freeRetentionDays),
        premiumRetentionDays: Number(premiumRetentionDays),
        updatedAt: Date.now(),
      });
      alert("Global History Retention settings saved successfully!");
    } catch (e: any) {
      alert("Failed to save history retention parameters: " + e.message);
    } finally {
      setIsSavingRetention(false);
    }
  };

  const runClientSideHistoryCleanup = async (freeDays: number, premiumDays: number, initialLogs: string[]) => {
    const logs: string[] = [...initialLogs, "Executing secure client-side UI-assisted pruning cleanup sweep..."];
    const summary = {
      processedUsers: 0,
      deletedHistoryItems: 0,
      deletedMcqConversions: 0,
      timestamp: new Date().toISOString(),
    };

    const addLog = (msg: string) => {
      logs.push(msg);
      setCleanupConsoleLogs([...logs]);
    };

    try {
      addLog(`Enforcing active retention policies: Free = ${freeDays} days, Premium = ${premiumDays} days.`);

      // 1. Fetch plans
      addLog("Fetching metadata for subscription plans...");
      const plansMap: Record<string, number> = {};
      const plansSnap = await getDocs(collection(db, "plans"));
      plansSnap.forEach((pDoc) => {
        const data = pDoc.data();
        if (data && typeof data.historyValidityDays === "number") {
          plansMap[pDoc.id] = data.historyValidityDays;
        }
      });
      addLog(`Loaded custom retention limits for ${plansSnap.size} subscription plans.`);

      // 2. Fetch all users
      addLog("Scanning active user profiles...");
      const usersSnap = await getDocs(collection(db, "users"));
      addLog(`Found ${usersSnap.size} user profiles to inspect.`);

      const now = Date.now();

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data() || {};
        let isPremium = false;
        let planRetentionDays = freeDays;

        if (userData.subscription && userData.subscription.isActive) {
          const { planId, expiresAt } = userData.subscription;
          if (!expiresAt || expiresAt > now) {
            isPremium = true;
            if (planId && typeof plansMap[planId] === "number") {
              planRetentionDays = plansMap[planId];
            } else {
              planRetentionDays = premiumDays;
            }
          }
        }

        const retentionMs = planRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = now - retentionMs;

        // Clean standard conversions: users/{userId}/history
        const historySnap = await getDocs(collection(db, `users/${userId}/history`));
        let userDeletedHistory = 0;
        for (const historyDoc of historySnap.docs) {
          const data = historyDoc.data();
          if (data && typeof data.timestamp === "number" && data.timestamp < cutoffTime) {
            await deleteDoc(historyDoc.ref);
            userDeletedHistory++;
            summary.deletedHistoryItems++;
          }
        }

        // Clean MCQ conversions: users/{userId}/mcq_conversions
        const mcqSnap = await getDocs(collection(db, `users/${userId}/mcq_conversions`));
        let userDeletedMcqs = 0;
        for (const mcqDoc of mcqSnap.docs) {
          const data = mcqDoc.data();
          let recordTime = 0;
          if (data) {
            if (typeof data.timestamp === "number") {
              recordTime = data.timestamp;
            } else if (typeof data.timestamp === "string") {
              recordTime = new Date(data.timestamp).getTime();
            }
          }

          if (recordTime && recordTime < cutoffTime) {
            await deleteDoc(mcqDoc.ref);
            userDeletedMcqs++;
            summary.deletedMcqConversions++;
          }
        }

        summary.processedUsers++;
        if (userDeletedHistory > 0 || userDeletedMcqs > 0) {
          addLog(`User ${userId} (${isPremium ? "Premium" : "Free"}): Purged ${userDeletedHistory} standard & ${userDeletedMcqs} MCQ items (threshold ${planRetentionDays} days).`);
        }
      }

      addLog(`Completed client-assisted cleanup sweep securely! Processed ${summary.processedUsers} users. Purged: ${summary.deletedHistoryItems} standard files, ${summary.deletedMcqConversions} MCQ sets.`);
      setCleanupSummary({
        processedUsers: summary.processedUsers,
        deletedHistoryItems: summary.deletedHistoryItems,
        deletedMcqConversions: summary.deletedMcqConversions,
        timestamp: summary.timestamp,
      });
      alert("Database client-assisted cleanup job completed successfully!");
    } catch (err: any) {
      addLog(`[FATAL ERROR] Client-Side Sweep Failed: ${err.message}`);
      alert("Client-assisted cleanup sweep failed: " + err.message);
    }
  };

  const runManualHistoryCleanup = async () => {
    if (!window.confirm("Are you sure you want to run the database history validity cleanup right now? This will scan all users and permanently purge logs exceeding retention config lines.")) return;
    setIsTriggeringCleanup(true);
    setCleanupConsoleLogs(["Initializing server connect...", "Triggering backend pruning helper..."]);
    setCleanupSummary(null);
    try {
      const res = await fetch("/api/admin/trigger-cleanup", {
        method: "POST",
        headers: {
          Authorization: `Basic ${adminToken}`,
        },
      });

      let serverRunResult: any = null;
      let hasPermissionError = false;

      if (res.ok) {
        serverRunResult = await res.json();
        if (serverRunResult && serverRunResult.logs) {
          hasPermissionError = serverRunResult.logs.some((l: string) => 
            l.toLowerCase().includes("permission_denied") || 
            l.toLowerCase().includes("insufficient permissions") ||
            l.toLowerCase().includes("warning/fallback")
          );
        }
      } else {
        const errorText = await res.text().catch(() => "");
        hasPermissionError = errorText.toLowerCase().includes("permission_denied") || 
                             errorText.toLowerCase().includes("insufficient permissions") ||
                             res.status === 500;
      }

      if (hasPermissionError) {
        const fallbackLogs = [
          "[SERVER NOTICE] Server-side Firebase Admin credentials/permissions are not configured on this Cloud instance.",
          "[FALLBACK STATE] Switching to browser client-assisted administrative mode to execute prune operations securely...",
        ];
        setCleanupConsoleLogs(fallbackLogs);
        await runClientSideHistoryCleanup(Number(freeRetentionDays), Number(premiumRetentionDays), fallbackLogs);
      } else if (res.ok && serverRunResult) {
        setCleanupConsoleLogs(serverRunResult.logs || ["Done."]);
        setCleanupSummary({
          processedUsers: serverRunResult.processedUsers,
          deletedHistoryItems: serverRunResult.deletedHistoryItems,
          deletedMcqConversions: serverRunResult.deletedMcqConversions,
          timestamp: serverRunResult.timestamp,
        });
        alert("Database cleanup job completed successfully!");
      } else {
        const fallbackLogs = [
          "[SERVER ERROR] Server trigger failed. Falling back to secure browser-assisted administrative sweep...",
        ];
        setCleanupConsoleLogs(fallbackLogs);
        await runClientSideHistoryCleanup(Number(freeRetentionDays), Number(premiumRetentionDays), fallbackLogs);
      }
    } catch (e: any) {
      const fallbackLogs = [
        `[NOTICE] Server-side connect helper returned notice: ${e.message}`,
        "[FALLBACK STATE] Switching directly to browser-assisted administrative sweep...",
      ];
      setCleanupConsoleLogs(fallbackLogs);
      await runClientSideHistoryCleanup(Number(freeRetentionDays), Number(premiumRetentionDays), fallbackLogs);
    } finally {
      setIsTriggeringCleanup(false);
    }
  };

  const saveAnalyticsConfig = async () => {
    setIsSavingGa(true);
    try {
      await setDoc(
        doc(db, "settings", "analytics"),
        {
          googleAnalyticsId: gaConfig,
        },
        { merge: true },
      );
      alert("Google Analytics ID Saved successfully.");
    } catch (e) {
      alert("Failed to save Analytics configuration: " + e);
    } finally {
      setIsSavingGa(false);
    }
  };

  const savePlan = async (plan: SubscriptionPlan) => {
    try {
      if (!plan.id) {
        plan.id = doc(collection(db, "plans")).id;
      }
      await setDoc(doc(db, "plans", plan.id), plan);
      fetchPlans();
      setIsEditingPlan(null);
    } catch (e) {
      alert("Failed to save plan: " + e);
    }
  };

  const deletePlan = async (planId: string) => {
    if (!window.confirm("Are you sure you want to delete this plan?")) return;
    try {
      await deleteDoc(doc(db, "plans", planId));
      fetchPlans();
    } catch (e) {
      alert("Failed to delete plan: " + e);
    }
  };

  const fetchServerKeysInfo = async () => {
    try {
      const res = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Basic ${adminToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setServerKeysStats(data.keys || []);
        setServerDeadKeys(data.deadKeys || []);
      }
    } catch (err) {
      console.error("Error pulling server key stats:", err);
    }
  };

  const fetchHealthPoolKeys = async () => {
    try {
      const res = await fetch("/api/admin/health-status", {
        headers: {
          Authorization: `Basic ${adminToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setHealthPoolKeys(data.keys || []);
      }
    } catch (err) {
      console.error("Error pulling health pool keys:", err);
    }
  };

  const handleRevalidateAllKeys = async () => {
    setIsValidatingAll(true);
    try {
      const res = await fetch("/api/admin/revalidate-all", {
        method: "POST",
        headers: {
          Authorization: `Basic ${adminToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setHealthPoolKeys(data.keys || []);
        alert("Re-validation completed successfully!");
      } else {
        alert("Re-validation of keys failed.");
      }
    } catch (err) {
      console.error("Revalidate keys error:", err);
      alert("Error triggering re-validation.");
    } finally {
      setIsValidatingAll(false);
    }
  };

  const handleDeletePoolKey = async (id: string, source: string) => {
    if (!window.confirm("Are you sure you want to delete this key? This will permanently remove its pool access.")) return;
    try {
      const res = await fetch("/api/admin/delete-pool-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${adminToken}`,
        },
        body: JSON.stringify({ id, source }),
      });
      if (res.ok) {
        const data = await res.json();
        setHealthPoolKeys(data.keys || []);
        alert("Key successfully removed from the pool.");
      } else {
        alert("Failed to delete key.");
      }
    } catch (err) {
      console.error("Delete pool key error:", err);
      alert("Error deleting key.");
    }
  };

  const fetchSharedKeys = async () => {
    try {
      const q = query(collection(db, "shared_api_keys"));
      const snapshot = await getDocs(q);
      const keys: any[] = [];
      snapshot.forEach((doc) => {
        keys.push({ id: doc.id, ...doc.data() });
      });
      setSharedKeys(keys);
    } catch (e) {
      console.error("Shared keys fetch error:", e);
    }
  };

  const fetchRegisteredUsers = async () => {
    try {
      const q = query(collection(db, "users"));
      const snapshot = await getDocs(q);
      const users: any[] = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      setAllUsers(users);
    } catch (e) {
      console.error("Users list fetch error:", e);
    }
  };

  const fetchGlobalAnalysisLogs = async () => {
    try {
      // Since history is a subcollection of users, we'll query past history items from each page.
      // Alternatively, we look up for each fetched user's history and merge them for administrative tracking.
      const q = query(collection(db, "users"));
      const snapshot = await getDocs(q);
      const allHistories: any[] = [];

      const promises = snapshot.docs.map(async (userDoc) => {
        const uId = userDoc.id;
        const hSnap = await getDocs(collection(db, `users/${uId}/history`));
        hSnap.forEach((hDoc) => {
          allHistories.push({
            id: hDoc.id,
            userId: uId,
            userEmail: userDoc.data().email || "Unknown User",
            userDisplayName: getCleanDisplayName(
              userDoc.data().displayName,
              userDoc.data().email || "Unknown User",
            ),
            ...hDoc.data(),
          });
        });
      });

      await Promise.all(promises);
      allHistories.sort((a, b) => b.timestamp - a.timestamp);
      setGlobalConversions(allHistories);
    } catch (err) {
      console.error("Failed to compile global history logs:", err);
    }
  };

  // Administrative Actions on API Keys
  const handleSetKeyAsDeadValue = async (keyVal: string) => {
    if (
      !window.confirm(
        "Are you sure you want to manually DEACTIVATE/KILL this API key?",
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/dead-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${adminToken}`,
        },
        body: JSON.stringify({ key: keyVal }),
      });
      if (res.ok) {
        fetchServerKeysInfo();
      }
    } catch (e) {
      alert("Action failed to set dead key");
    }
  };

  const handleReviveKeyVal = async (keyVal: string) => {
    if (
      !window.confirm(
        "Are you sure you want to REVIVE this API key and restore its traffic eligibility?",
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/revive-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${adminToken}`,
        },
        body: JSON.stringify({ key: keyVal }),
      });
      if (res.ok) {
        fetchServerKeysInfo();
      }
    } catch (e) {
      alert("Action failed to revive key");
    }
  };

  const handleResetKeyCounters = async (keyVal: string) => {
    if (
      !window.confirm(
        "This will reset all success/failure counts and logs for this key. Proceed?",
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/reset-key-stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${adminToken}`,
        },
        body: JSON.stringify({ key: keyVal }),
      });
      if (res.ok) {
        fetchServerKeysInfo();
      }
    } catch (e) {
      alert("Action failed to reset stats");
    }
  };

  const removeSharedKey = async (keyId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to remove this key from the shared pool?",
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "shared_api_keys", keyId));
      fetchSharedKeys();
    } catch (err) {
      alert("Failed to delete key: " + err);
    }
  };

  const handleCopyKey = (keyText: string, keyId: string) => {
    navigator.clipboard.writeText(keyText);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleToggleRevealKey = (keyId: string) => {
    setRevealedKeyIds((prev) => ({
      ...prev,
      [keyId]: !prev[keyId],
    }));
  };

  const handleToggleSelectKey = (keyId: string) => {
    setSelectedDonatedKeys((prev) => {
      if (prev.includes(keyId)) {
        return prev.filter((id) => id !== keyId);
      } else {
        return [...prev, keyId];
      }
    });
  };

  const handleToggleAllSelection = () => {
    if (selectedDonatedKeys.length === sharedKeys.length) {
      setSelectedDonatedKeys([]);
    } else {
      setSelectedDonatedKeys(sharedKeys.map((k) => k.id));
    }
  };

  const handleDownloadSelected = () => {
    if (selectedDonatedKeys.length === 0) return;
    const selectedObjects = sharedKeys.filter((k) =>
      selectedDonatedKeys.includes(k.id),
    );

    let textContent = "PUBLICLY SHARED / DONATED GEMINI API KEYS EXPORT\n";
    textContent += `Generated on: ${new Date().toLocaleString()}\n`;
    textContent +=
      "=======================================================================\n\n";

    selectedObjects.forEach((k, idx) => {
      const matchingUser = allUsers.find((u) => u.id === k.userId);
      const userEmail = matchingUser ? matchingUser.email : "N/A";
      const userName = matchingUser
        ? getCleanDisplayName(matchingUser.displayName, matchingUser.email)
        : "N/A";

      textContent += `[KEY #${idx + 1}]\n`;
      textContent += `Name/Label : ${k.keyName || "Unnamed"}\n`;
      textContent += `Key Value  : ${k.keyValue}\n`;
      textContent += `Created At : ${k.createdAt ? new Date(k.createdAt).toLocaleString() : "N/A"}\n`;
      textContent += `Donor Name : ${userName}\n`;
      textContent += `Donor Email: ${userEmail}\n`;
      textContent += `Donor UID  : ${k.userId}\n`;
      textContent +=
        "-----------------------------------------------------------------------\n\n";
    });

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Donated_Gemini_Keys_Export_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // User Administration
  const handleViewUserProfile = async (userObj: any) => {
    setSelectedUser(userObj);
    setSelectedUserLoading(true);
    setIsEditingName(false);
    setEditingNameValue(userObj.displayName || "");
    setIsEditingTokens(false);
    setEditingTokensValue(userObj.tokens || 0);
    try {
      // Fetch user sub-data
      const historySnapshot = await getDocs(
        collection(db, `users/${userObj.id}/history`),
      );
      const histList: any[] = [];
      historySnapshot.forEach((doc) => {
        histList.push({ id: doc.id, ...doc.data() });
      });
      setSelectedUserHistory(histList);

      const keysSnapshot = await getDocs(
        collection(db, `users/${userObj.id}/apiKeys`),
      );
      const keyList: any[] = [];
      keysSnapshot.forEach((doc) => {
        keyList.push({ id: doc.id, ...doc.data() });
      });
      setSelectedUserPersonalKeys(keyList);
    } catch (err) {
      console.error(err);
    } finally {
      setSelectedUserLoading(false);
    }
  };

  const handleSaveEditedName = async () => {
    if (!selectedUser || !editingNameValue.trim()) return;
    try {
      await setDoc(
        doc(db, "users", selectedUser.id),
        {
          displayName: editingNameValue.trim(),
        },
        { merge: true },
      );

      // Update local state arrays
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, displayName: editingNameValue.trim() }
            : u,
        ),
      );
      setSelectedUser((prev) => ({
        ...prev,
        displayName: editingNameValue.trim(),
      }));
      setIsEditingName(false);
    } catch (err: any) {
      alert("Failed to update profile name: " + err.message);
    }
  };

  const handleSaveEditedTokens = async () => {
    if (!selectedUser) return;
    try {
      await setDoc(
        doc(db, "users", selectedUser.id),
        {
          tokens: Number(editingTokensValue),
        },
        { merge: true },
      );

      // Update local state arrays
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, tokens: Number(editingTokensValue) }
            : u,
        ),
      );
      setSelectedUser((prev) => ({
        ...prev,
        tokens: Number(editingTokensValue),
      }));
      setIsEditingTokens(false);
    } catch (err: any) {
      alert("Failed to update tokens: " + err.message);
    }
  };

  const updateUserSubscription = async (planId: string) => {
    if (!selectedUser) return;
    try {
      if (planId === "") {
        // Remove subscription
        await setDoc(
          doc(db, "users", selectedUser.id),
          {
            subscription: null,
          },
          { merge: true },
        );
        setSelectedUser((prev: any) => ({ ...prev, subscription: null }));
        setAllUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id ? { ...u, subscription: null } : u,
          ),
        );
      } else {
        const plan = plans.find((p) => p.id === planId);
        if (!plan) return;
        const sub = {
          planId: plan.id,
          planName: plan.name,
          startedAt: Date.now(),
          expiresAt: Date.now() + plan.durationDays * 24 * 60 * 60 * 1000,
          isActive: true,
        };
        await setDoc(
          doc(db, "users", selectedUser.id),
          {
            subscription: sub,
          },
          { merge: true },
        );
        setSelectedUser((prev: any) => ({ ...prev, subscription: sub }));
        setAllUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id ? { ...u, subscription: sub } : u,
          ),
        );
      }
      alert("User subscription updated successfully.");
    } catch (e) {
      alert("Failed to update user subscription.");
    }
  };

  const handleDeleteUserProfile = async (uId: string, email: string) => {
    if (
      !window.confirm(
        `⚠️ EXTREME SECURITY WARNING ⚠️\n\nAre you sure you want to DELETE the user profile ${email}? This action is irreversible and deletes their documents, key connections, and chats.`,
      )
    )
      return;

    try {
      await deleteDoc(doc(db, "users", uId));
      setAllUsers((prev) => prev.filter((u) => u.id !== uId));
      if (selectedUser?.id === uId) {
        setSelectedUser(null);
      }
      alert("User profile deleted successfully.");
    } catch (err: any) {
      alert("Deletions rejected: " + err.message);
    }
  };

  // Filter lists based on search
  const filteredUsersList = allUsers.filter(
    (u) =>
      (u.displayName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.id || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredConversionsList = globalConversions.filter(
    (c) =>
      (c.fileName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.userEmail || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.id || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalPagesConverted = globalConversions.reduce(
    (acc, curr) => acc + (curr.pagesCount || 0),
    0,
  );

  // Authentication validation logic
  if (userLoading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center text-[#555555]">
        <RefreshCw className="animate-spin text-[#FF6B2B] w-8 h-8 mb-1" />
        <span className="text-[13px] font-medium tracking-widest">
          VALIDATING PRIVILEGES
        </span>
      </div>
    );
  }

  // Mandatory Admin Check - require specific signed in account or email override
  const activeFirebaseEmail = user?.email || "";
  const isSuperUser = activeFirebaseEmail === "rahulsriwastaw7643@gmail.com";

  if (!user || !isSuperUser) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center p-2 text-center">
        <div className="w-16 h-16 bg-[#251212] border border-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-2">
          <Shield size={32} />
        </div>
        <h1 className="text-[20px] font-bold text-[#EFEFEF] mb-1">
          Private Secure Portal
        </h1>
        <p className="text-[#888888] text-[13px] max-w-md mb-2 leading-relaxed">
          This URL matches the administrative endpoint, but your login account
          credentials lack privileges. Only approved system managers can log in
          and view configuration analytics.
        </p>
        <div className="bg-[#141414] border border-[#252525] p-1 rounded-lg text-left text-[11px] mb-3 w-full max-w-sm">
          <p className="text-[#555555] font-bold uppercase mb-1">
            Authenticated Account:
          </p>
          <span className="text-[#FF6B2B] font-mono">
            {user ? user.email : "Signed-out Guest"}
          </span>
        </div>
        <p className="text-[11px] text-slate-600">
          Ensure you are logged in to the platform with proper admin email
          address.
        </p>
      </div>
    );
  }

  // If user is valid, but adminToken (username/password gateway) is missing, show admin portal login
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-1">
        <div className="w-full max-w-md bg-[#141414] border border-[#262626] rounded-xl p-3  relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]   ] " />

          <div className="flex flex-col items-center gap-3 mb-2 text-center">
            <div className="w-12 h-12 bg-[#FF6B2B]/10 rounded-lg flex items-center justify-center text-[#FF6B2B] border border-[#FF6B2B]/20">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-[15px] font-black text-[#EFEFEF] uppercase tracking-wider">
                SYSTEM ADMINISTRATION
              </h1>
              <span className="text-[10px] text-[#555555] font-mono tracking-widest uppercase">
                Double-Tier Authorized Entry
              </span>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
            {loginError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded p-1 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#888888] tracking-wider uppercase">
                Admin Username
              </label>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="administrator"
                className="bg-[#1F1F1F] border border-[#333] rounded px-1 py-1 text-[13px] text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#888888] tracking-wider uppercase">
                Admin Private Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="bg-[#1F1F1F] border border-[#333] rounded px-1 py-1 text-[13px] text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="mt-1 w-full bg-[#FF6B2B] hover:bg-[#E55A1A] text-[#EFEFEF] font-bold text-[13px] py-1 px-1 rounded transition-all duration-200  flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  AUTHENTICATING...
                </>
              ) : (
                <>
                  <Terminal size={14} />
                  UNLOCK CONSOLE
                </>
              )}
            </button>
          </form>

          <p className="mt-2 text-center text-[11px] text-slate-600 font-mono">
            SECURE PORTAL PATH ACTIVATED
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col font-sans">
      {/* Admin Topbar */}
      <header className="h-16 bg-[var(--bg-card)] border-b border-[var(--border-default)] px-2 flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#FF6B2B] flex items-center justify-center text-[#EFEFEF] font-bold ">
            <Shield size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[#EFEFEF] font-black text-[13px] uppercase tracking-widest leading-none">
                COMMAND PORTAL
              </span>
              <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-mono uppercase font-bold tracking-widest px-1 py-1 rounded">
                LIVE ADMIN
              </span>
            </div>
            <span className="text-[11px] text-[#555555] uppercase tracking-widest font-mono">
              ROLE: rahulsriwastaw7643@gmail.com
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] text-[#555555] hidden md:inline">
            Last Sync: {lastRefreshedAt.toLocaleTimeString()}
          </span>

          <button
            onClick={loadAllStats}
            disabled={isRefreshing}
            className="p-1 bg-[#1C1C1C] hover:bg-[#252525] border border-[#2D2D2D] rounded text-[#888888] hover:text-[#EFEFEF] transition-all disabled:opacity-50"
            title="Reload Data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>

          <button
            onClick={handleAdminLogout}
            className="flex items-center gap-1.5 px-1 py-1 bg-[#251212] hover:bg-red-950 border border-red-900/45 text-red-400 rounded text-[11px] font-bold transition-all"
          >
            <LogOut size={13} />
            LOGOUT
          </button>
        </div>
      </header>

      {/* Main Admin Dashboard */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-[var(--bg-surface)] border-r border-[var(--border-default)] p-1 flex flex-col gap-1 shrink-0">
          <p className="text-[9px] font-bold text-[#555555] tracking-wider uppercase mb-1 px-1">
            Console Subsystems
          </p>

          <button
            onClick={() => {
              setActiveTab("keys");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "keys"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Key size={16} />
              <span>Rotational Keys & Failures</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1 py-1 rounded leading-none ${activeTab === "keys" ? "bg-transparent/20" : "bg-[#1D1D1D] text-[#888888]"}`}
            >
              {serverKeysStats.length + serverDeadKeys.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("users");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "users"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users size={16} />
              <span>User Profile Directory</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1 py-1 rounded leading-none ${activeTab === "users" ? "bg-transparent/20" : "bg-[#1D1D1D] text-[#888888]"}`}
            >
              {allUsers.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("conversions");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "conversions"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText size={16} />
              <span>Conversions Analysis Logs</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1 py-1 rounded leading-none ${activeTab === "conversions" ? "bg-transparent/20" : "bg-[#1D1D1D] text-[#888888]"}`}
            >
              {globalConversions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`flex items-center gap-2.5 p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "diagnostics"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <Activity size={16} />
            <span>Diagnostics & Security</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("plans");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "plans"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Calendar size={16} />
              <span>Subscription Plans</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1 py-1 rounded leading-none ${activeTab === "plans" ? "bg-transparent/20" : "bg-[#1D1D1D] text-[#888888]"}`}
            >
              {plans.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("analytics");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "analytics"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Globe size={16} />
              <span>Analytics & Tracking</span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab("payments");
              setSearchQuery("");
            }}
            className={`flex items-center justify-between p-1 rounded-lg text-left text-[11px] font-bold transition-all ${
              activeTab === "payments"
                ? "bg-[#FF6B2B] text-[#EFEFEF]  shadow-[#FF6B2B]/10"
                : "text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle size={16} />
              <span>Payments & Users</span>
            </div>
          </button>

          <div className="mt-3 border-t border-[var(--border-default)] pt-2 px-1">
            <h4 className="text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase">
              Platform Stat Overview
            </h4>
            <div className="flex flex-col gap-2">
              <div className="bg-[var(--bg-card)] p-1 rounded border border-[var(--border-default)]">
                <span className="text-[9px] text-[var(--text-muted)] uppercase block">
                  Total Document Pages
                </span>
                <span className="text-[15px] font-black text-[var(--text-primary)] font-mono">
                  {totalPagesConverted}
                </span>
              </div>
              <div className="bg-[var(--bg-card)] p-1 rounded border border-[var(--border-default)]">
                <span className="text-[9px] text-[var(--text-muted)] uppercase block">
                  All Active API Keys
                </span>
                <span className="text-[15px] font-black text-[var(--brand-primary)] font-mono">
                  {serverKeysStats.filter((k) => !k.isDead).length}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 p-2 overflow-y-auto bg-[var(--bg-page)] text-[var(--text-primary)]">
          {/* Upper Metrics Grid on Home Tabs */}
          {activeTab !== "diagnostics" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
              <div className="p-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">
                    Completed Conversions
                  </span>
                  <p className="text-[20px] font-black mt-1 font-mono text-[var(--text-primary)]">
                    {globalConversions.length}
                  </p>
                </div>
                <div className="bg-[var(--success-bg)] text-[var(--success-text)] p-1 rounded-lg border border-[var(--success-border)]">
                  <CheckCircle size={20} />
                </div>
              </div>
              <div className="p-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">
                    Registered Profiles
                  </span>
                  <p className="text-[20px] font-black mt-1 font-mono text-[var(--text-primary)]">
                    {allUsers.length}
                  </p>
                </div>
                <div className="bg-[var(--info-bg)] text-[var(--info-text)] p-1 rounded-lg border border-[var(--info-border)]">
                  <Users size={20} />
                </div>
              </div>
              <div className="p-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">
                    Failed API Calls
                  </span>
                  <p className="text-[20px] font-black mt-1 font-mono text-[var(--error-text)]">
                    {serverKeysStats.reduce(
                      (sum, k) => sum + (k.totalErrors || 0),
                      0,
                    ) +
                      serverDeadKeys.reduce(
                        (sum, k) => sum + (k.totalErrors || 0),
                        0,
                      )}
                  </p>
                </div>
                <div className="bg-[var(--error-bg)] text-[var(--error-text)] p-1 rounded-lg border border-[var(--error-border)]">
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="p-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">
                    Donated Shared Keys
                  </span>
                  <p className="text-[20px] font-black mt-1 font-mono text-[var(--warning-text)]">
                    {sharedKeys.length}
                  </p>
                </div>
                <div className="bg-[var(--warning-bg)] text-[var(--warning-text)] p-1 rounded-lg border border-[var(--warning-border)]">
                  <Globe size={20} />
                </div>
              </div>
            </div>
          )}

          {/* Search Header for directories */}
          {(activeTab === "users" || activeTab === "conversions") && (
            <div className="mb-2 relative">
              <Search className="absolute left-3.5 top-3.5 text-[#555555] w-4.5 h-4.5" />
              <input
                type="text"
                placeholder={
                  activeTab === "users"
                    ? "Search users by display name, email ID, or user UID..."
                    : "Search document name or user email ID..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111] border border-[#222] rounded-lg pl-4 pr-1 py-1 text-[11px] focus:outline-none focus:border-[#FF6B2B] placeholder-slate-500 transition-colors"
              />
            </div>
          )}

          {/* TAB 1: ROTATIONAL KEYS */}
          {activeTab === "keys" && (
            <div className="flex flex-col gap-[12px]">
              {/* SERVER ROTATION MATRIX */}
              <div>
                <h2 className="text-md font-bold text-[#EFEFEF] mb-1 flex items-center gap-2">
                  <Key size={18} className="text-[#FF6B2B]" />
                  Internal Pool Key Rotation & Fails
                </h2>

                <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl overflow-hidden ">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
                        <th className="p-1 text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                          Key Indicator
                        </th>
                        <th className="p-1 text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                          Successes
                        </th>
                        <th className="p-1 text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                          Fails (Total)
                        </th>
                        <th className="p-1 text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                          Consecutive Fails
                        </th>
                        <th className="p-1 text-[#888888] uppercase tracking-wider font-bold">
                          Last Error Reason
                        </th>
                        <th className="p-1 text-[#888888] uppercase tracking-wider font-bold">
                          Status Badge
                        </th>
                        <th className="p-1 text-[#888888] uppercase tracking-wider font-bold text-right">
                          Emergency Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverKeysStats.length === 0 &&
                      serverDeadKeys.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-2 text-center text-[#555555]"
                          >
                            No active keys registered on backend rotation yet.
                            Ensure GEMINI_API_KEY environment variables are
                            populated.
                          </td>
                        </tr>
                      ) : (
                        [...serverKeysStats, ...serverDeadKeys].map(
                          (k, idx) => {
                            const isDead =
                              k.isDead ||
                              serverDeadKeys.some((dk) => dk.key === k.key);
                            return (
                              <tr
                                key={idx}
                                className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors"
                              >
                                <td className="p-1 font-mono font-bold text-[11px]">
                                  <span className="text-[var(--success-text)] font-semibold">
                                    GEMINI_KEY_{idx + 1}:
                                  </span>{" "}
                                  {k.keyPrefix}
                                </td>
                                <td className="p-1 font-bold text-[var(--success-text)] font-mono">
                                  {k.totalSuccesses || 0}
                                </td>
                                <td className="p-1 font-bold text-red-400 font-mono">
                                  {k.totalErrors || 0}
                                </td>
                                <td className="p-1 font-mono">
                                  <span
                                    className={`px-1 py-1 rounded font-bold ${k.consecutiveErrors > 2 ? "bg-red-500/10 text-red-400" : "text-[#888888]"}`}
                                  >
                                    {k.consecutiveErrors || 0}
                                  </span>
                                </td>
                                <td className="p-1 font-mono text-[10px] text-[#555555] max-w-xs truncate">
                                  {k.errorType || (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="p-1">
                                  {isDead ? (
                                    <span className="inline-flex gap-1 items-center px-1 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] uppercase font-bold tracking-wider">
                                      ● DEAD / DEACTIVATED
                                    </span>
                                  ) : (
                                    <span className="inline-flex gap-1 items-center px-1 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold tracking-wider">
                                      ● HEALTHY / ACTIVE
                                    </span>
                                  )}
                                </td>
                                <td className="p-1 text-right">
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    {isDead ? (
                                      <button
                                        onClick={() =>
                                          handleReviveKeyVal(k.key)
                                        }
                                        className="px-1 py-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/25 text-[10px] font-bold rounded tracking-wide uppercase transition-colors"
                                      >
                                        REVIVE
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          handleSetKeyAsDeadValue(k.key)
                                        }
                                        className="px-1 py-1 bg-red-650/10 hover:bg-red-650/20 text-red-400 border border-red-500/25 text-[10px] font-bold rounded tracking-wide uppercase transition-colors"
                                        title="Manually de-activate key"
                                      >
                                        DEACTIVATE
                                      </button>
                                    )}

                                    <button
                                      onClick={() =>
                                        handleResetKeyCounters(k.key)
                                      }
                                      className="px-1 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] font-bold rounded text-center transition-all"
                                      title="Reset fail statistics"
                                    >
                                      RESET STATS
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          },
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DONATED API KEYS — HEALTH STATUS SECTION */}
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2 border-b border-[var(--border-strong)] pb-1">
                  <div className="flex flex-col">
                    <h2 className="text-[13px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Globe size={16} className="text-[#FF6B2B]" />
                      Donated API Keys — Health Status
                    </h2>
                    <p className="text-[10px] text-[#888888]">
                      Combined free API pool from Environment (FREE_GEMINI_KEY_*) and user donations (DB).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRevalidateAllKeys}
                      disabled={isValidatingAll}
                      className="px-2 py-1 bg-[#FF6B2B] hover:bg-[#E55A1A] text-white rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={isValidatingAll ? "animate-spin" : ""} />
                      {isValidatingAll ? "Re-validating..." : "Re-validate All Keys"}
                    </button>
                  </div>
                </div>

                {/* WARNING BANNER FOR INVALID KEYS */}
                {healthPoolKeys.some((k) => k.status === "INVALID") && (
                  <div className="bg-[#3A1A1A] border border-red-500/30 text-[#F44336] p-2 rounded-lg flex items-start gap-2.5 mb-2">
                    <AlertTriangle size={15} className="mt-0.5 text-[#F44336] flex-shrink-0" />
                    <div className="flex-1 text-[11px] font-sans">
                      <strong className="font-bold block text-red-300 uppercase tracking-wide text-[10px]">Suspended Key Failure Alert!</strong>
                      One or more API keys in your active rotation pool failed verification and are suspended. Remove or fix them immediately.
                    </div>
                  </div>
                )}

                <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616]">
                        <th className="p-2 text-[#888888] uppercase tracking-wider font-bold">
                          Source / Donor Owner
                        </th>
                        <th className="p-2 text-[#888888] uppercase tracking-wider font-bold">
                          Key ID / Name
                        </th>
                        <th className="p-2 text-[#888888] uppercase tracking-wider font-bold">
                          Masked Key Value
                        </th>
                        <th className="p-2 text-[#888888] uppercase tracking-wider font-bold">
                          Health Status Check
                        </th>
                        <th className="p-2 text-[#888888] uppercase tracking-wider font-bold text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {healthPoolKeys.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-3 text-center text-[#555555] font-medium"
                          >
                            No free Gemini keys currently configured or donated in the health pool.
                          </td>
                        </tr>
                      ) : (
                        [...healthPoolKeys]
                          .sort((a, b) => {
                            if (a.status === "INVALID" && b.status !== "INVALID") return -1;
                            if (a.status !== "INVALID" && b.status === "INVALID") return 1;
                            return 0;
                          })
                          .map((key, idx) => {
                            const isKeyRevealed = !!revealedKeyIds[key.id];
                            const isInvalid = key.status === "INVALID";

                            return (
                              <tr
                                key={`${key.id}-${idx}`}
                                className={`border-b border-[#222] transition-all ${
                                  isInvalid
                                    ? "bg-red-500/5 hover:bg-red-500/10 border-l-4 border-l-red-500"
                                    : "hover:bg-[#1A1A1A]/10"
                                }`}
                              >
                                {/* Source / Donor Profile */}
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    {key.source === "env" ? (
                                      <div className="flex flex-col">
                                        <span className="text-[#EFEFEF] font-bold font-mono">
                                          [ENV VAR]
                                        </span>
                                        <span className="text-[9px] text-[#555555] uppercase tracking-wider">
                                          {key.id}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col">
                                        <span className="text-[#EFEFEF] font-bold">
                                          User Donated (DB)
                                        </span>
                                        <span className="text-[10px] text-[#888888] font-mono truncate max-w-[150px]">
                                          UID: {key.userId ? key.userId.substring(0, 10) + "..." : "Anonymous"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* Label Column */}
                                <td className="p-2 text-[#888888] font-medium font-sans">
                                  {key.source === "env" ? (
                                    <span className="bg-[#1A2A3A] text-[#2196F3] text-[9px] uppercase px-1 py-0.5 rounded font-bold">
                                      System Environment
                                    </span>
                                  ) : (
                                    key.keyName || "Donated Key"
                                  )}
                                </td>

                                {/* Mask / Value Column */}
                                <td className="p-2 font-mono border-none">
                                  <div className="flex items-center gap-1.5 bg-[#1A1A1A]/40 border border-[#222] px-1.5 py-0.5 rounded-lg w-fit">
                                    <span className={`text-[10.5px] max-w-[180px] truncate ${isKeyRevealed ? "text-[#EFEFEF] font-semibold" : "text-[#FF6B2B]"}`}>
                                      {isKeyRevealed
                                        ? key.key
                                        : `AIza...${key.key.substr(-4)}`}
                                    </span>
                                    <div className="flex items-center gap-1 border-l border-[#222] pl-1">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRevealKey(key.id)}
                                        className="p-0.5 text-[#888888] hover:text-[#EFEFEF] transition-all"
                                        title={isKeyRevealed ? "Hide key" : "Show key"}
                                      >
                                        {isKeyRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyKey(key.key, key.id)}
                                        className="p-0.5 text-[#888888] hover:text-green-500 transition-all font-bold"
                                        title="Copy key"
                                      >
                                        {copiedKeyId === key.id ? (
                                          <Check size={11} className="text-green-400" />
                                        ) : (
                                          <Copy size={11} />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                {/* Health Badge */}
                                <td className="p-2">
                                  {key.status === "ACTIVE" && (
                                    <span className="bg-[#1A3A1A] text-[#4CAF50] text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-emerald-500/20">
                                      Active
                                    </span>
                                  )}
                                  {key.status === "INVALID" && (
                                    <span className="bg-[#3A1A1A] text-[#F44336] text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-red-500/20">
                                      Invalid
                                    </span>
                                  )}
                                  {key.status === "UNCHECKED" && (
                                    <span className="bg-[#1A2A3A] text-[#2196F3] text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-[#2196F3]/20">
                                      Unchecked
                                    </span>
                                  )}
                                </td>

                                {/* Actions Column */}
                                <td className="p-2 text-right">
                                  <button
                                    onClick={() => handleDeletePoolKey(key.id, key.source)}
                                    className="p-1 bg-[#3A1A1A] hover:bg-red-900/40 text-red-400 border border-red-500/25 rounded-lg transition-colors cursor-pointer"
                                    title="Permanently delete and remove from pool"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER PROFILE DIRECTORY */}
          {activeTab === "users" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[12px]">
              {/* Users list (Left 2 columns) */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden ">
                  <div className="p-1 border-b border-[#222] flex items-center justify-between bg-[#141414]">
                    <span className="text-[#EFEFEF] font-bold text-[11px] uppercase tracking-wider">
                      Registered System Profiles
                    </span>
                    <span className="bg-[#FF6B2B]/10 text-[#FF6B2B] text-[10px] font-mono px-1 py-1 rounded-full font-bold">
                      {filteredUsersList.length} shown
                    </span>
                  </div>

                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616]">
                        <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                          Identity Details
                        </th>
                        <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                          Authentication UID
                        </th>
                        <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                          System Role
                        </th>
                        <th className="p-1 text-[#888888] font-bold uppercase tracking-wider text-right">
                          Console Operations
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsersList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-2 text-center text-[#555555]"
                          >
                            No profiles matching query terms found.
                          </td>
                        </tr>
                      ) : (
                        filteredUsersList.map((u, idx) => (
                          <tr
                            key={`${u.id}-${idx}`}
                            onClick={() => handleViewUserProfile(u)}
                            className={`border-b border-[#222] cursor-pointer hover:bg-[#1A1A1A]/20 transition-all ${
                              selectedUser?.id === u.id
                                ? "bg-[#FF6B2B]/5 border-l-2 border-l-[#FF6B2B]"
                                : ""
                            }`}
                          >
                            <td className="p-1">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={
                                    u.photoURL ||
                                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid || u.id}`
                                  }
                                  alt="Avatar"
                                  className="w-8 h-8 rounded-full border border-[#222] bg-[#1A1A1A]"
                                />
                                <div className="flex flex-col">
                                  <span className="text-[#EFEFEF] font-bold">
                                    {getCleanDisplayName(
                                      u.displayName,
                                      u.email,
                                    )}
                                  </span>
                                  <span className="text-[#888888] font-medium text-[11px]">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="p-1 font-mono text-[11px] text-[#888888] select-all">
                              {u.uid || u.id}
                            </td>
                            <td className="p-1">
                              {u.email === "rahulsriwastaw7643@gmail.com" ? (
                                <span className="px-1 py-1 rounded-full bg-red-500/15 border border-red-500/20 text-red-400 text-[9px] uppercase font-bold font-mono">
                                  OWNER / ADMIN
                                </span>
                              ) : (
                                <span className="px-1 py-1 rounded-full bg-[#181818] border border-[#2A2A2A] text-[#888888] text-[9px] uppercase font-bold font-mono">
                                  REGULAR
                                </span>
                              )}
                            </td>
                            <td
                              className="p-1 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1.5 justify-end">
                                <button
                                  onClick={() => handleViewUserProfile(u)}
                                  className="p-1 px-1 bg-[#1A1A1A] hover:bg-slate-700 text-[#EFEFEF] rounded text-[10px] font-bold transition-colors"
                                >
                                  MANAGE
                                </button>
                                {u.email !== "rahulsriwastaw7643@gmail.com" && (
                                  <button
                                    onClick={() =>
                                      handleDeleteUserProfile(u.id, u.email)
                                    }
                                    className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/10 rounded transition-colors"
                                    title="Delete account profile completely"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User management Details Panel (Right 1 column) */}
              <div className="lg:col-span-1">
                {selectedUser ? (
                  <div className="bg-[#111] border border-[#222] rounded-xl p-2  relative">
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="absolute top-4 right-4 text-[#555555] hover:text-[#EFEFEF] text-[11px] font-bold font-mono"
                    >
                      CLOSE [X]
                    </button>

                    <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase tracking-wide border-b border-[#222] pb-1 mb-1">
                      Control Desk: Profile Detail
                    </h3>

                    <div className="flex flex-col items-center gap-3 text-center mb-2 py-1 border-b border-[#222]">
                      <img
                        src={
                          selectedUser.photoURL ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.uid || selectedUser.id}`
                        }
                        alt="Profile"
                        className="w-16 h-16 rounded-full border border-[#222]"
                      />

                      <div className="w-full">
                        {isEditingName ? (
                          <div className="flex items-center gap-2 max-w-xs mx-auto">
                            <input
                              type="text"
                              value={editingNameValue}
                              onChange={(e) =>
                                setEditingNameValue(e.target.value)
                              }
                              className="bg-[#1E1E1E] border border-[#333] rounded px-1 py-1 text-[11px] text-[#EFEFEF] focus:outline-none w-full"
                            />
                            <button
                              onClick={handleSaveEditedName}
                              className="px-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-[#EFEFEF] rounded text-[11px] font-bold transition-colors"
                            >
                              SAVE
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 group">
                            <h4 className="text-[#EFEFEF] font-bold text-md leading-none">
                              {getCleanDisplayName(
                                selectedUser.displayName,
                                selectedUser.email,
                              )}
                            </h4>
                            <button
                              onClick={() => setIsEditingName(true)}
                              className="text-[#555555] hover:text-[#FF6B2B] transition-colors"
                              title="Edit user name"
                            >
                              <Edit size={12} />
                            </button>
                          </div>
                        )}
                        <span className="text-[#888888] text-[11px] mt-1 block font-mono">
                          {selectedUser.email}
                        </span>

                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <span className="text-[11px] text-[#888888]">
                            Tokens:
                          </span>
                          {isEditingTokens ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editingTokensValue}
                                onChange={(e) =>
                                  setEditingTokensValue(Number(e.target.value))
                                }
                                className="bg-[#1E1E1E] border border-[#333] rounded px-1 py-1 text-[11px] text-[#EFEFEF] w-20"
                              />
                              <button
                                onClick={handleSaveEditedTokens}
                                className="px-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-[#EFEFEF] rounded text-[11px] font-bold"
                              >
                                SAVE
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-400 font-bold text-[11px]">
                                {selectedUser.tokens || 0}
                              </span>
                              <button
                                onClick={() => setIsEditingTokens(true)}
                                className="text-[#555555] hover:text-[#FF6B2B]"
                                title="Edit token balance directly"
                              >
                                <Edit size={12} />
                              </button>
                              <div className="flex gap-1 ml-1">
                                <button
                                  onClick={async () => {
                                    const newTotal =
                                      (selectedUser.tokens || 0) + 100;
                                    setEditingTokensValue(newTotal);
                                    await setDoc(
                                      doc(db, "users", selectedUser.id),
                                      { tokens: newTotal },
                                      { merge: true },
                                    );
                                    setAllUsers((prev) =>
                                      prev.map((u) =>
                                        u.id === selectedUser.id
                                          ? { ...u, tokens: newTotal }
                                          : u,
                                      ),
                                    );
                                    setSelectedUser((prev: any) => ({
                                      ...prev,
                                      tokens: newTotal,
                                    }));
                                  }}
                                  className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-1 rounded hover:bg-emerald-500/30"
                                >
                                  +100
                                </button>
                                <button
                                  onClick={async () => {
                                    const newTotal = Math.max(
                                      0,
                                      (selectedUser.tokens || 0) - 100,
                                    );
                                    setEditingTokensValue(newTotal);
                                    await setDoc(
                                      doc(db, "users", selectedUser.id),
                                      { tokens: newTotal },
                                      { merge: true },
                                    );
                                    setAllUsers((prev) =>
                                      prev.map((u) =>
                                        u.id === selectedUser.id
                                          ? { ...u, tokens: newTotal }
                                          : u,
                                      ),
                                    );
                                    setSelectedUser((prev: any) => ({
                                      ...prev,
                                      tokens: newTotal,
                                    }));
                                  }}
                                  className="text-[9px] bg-red-500/20 text-red-400 px-1 py-1 rounded hover:bg-red-500/30"
                                >
                                  -100
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedUserLoading ? (
                      <div className="py-2 text-center text-[11px] text-[#555555]">
                        <RefreshCw className="animate-spin text-[#FF6B2B] w-4 h-4 mx-auto mb-1" />
                        Fetching associated subcollections...
                      </div>
                    ) : (
                      <div className="flex flex-col gap-5">
                        {/* Subscription Override Area */}
                        <div>
                          <p className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-1 block">
                            Active Subscription Plan
                          </p>
                          <select
                            value={
                              selectedUser.subscription
                                ? selectedUser.subscription.planId
                                : ""
                            }
                            onChange={(e) =>
                              updateUserSubscription(e.target.value)
                            }
                            className="w-full bg-[#1A1A1A] border border-[#333] p-1 rounded text-[11px] text-[#EFEFEF] uppercase font-bold"
                          >
                            <option value="">FREE DEFAULT PLAN</option>
                            {plans.map((p, pIdx) => (
                              <option key={`${p.id}-${pIdx}`} value={p.id}>
                                {p.name} (${p.price})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Users Personal API keys */}
                        <div>
                          <p className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-1 block">
                            Saved API Keys ({selectedUserPersonalKeys.length})
                          </p>
                          {selectedUserPersonalKeys.length === 0 ? (
                            <span className="text-slate-600 text-[11px] font-mono block bg-[#1A1A1A]/40 p-1 rounded border border-[#222]">
                              No personal key registered for API fallback.
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {selectedUserPersonalKeys.map((pk, idx) => (
                                <div
                                  key={`${pk.id}-${idx}`}
                                  className="bg-[#1A1A1A] p-1 rounded border border-[#2A2A2A] text-[11px] flex justify-between items-center font-mono"
                                >
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[#EFEFEF] text-[11px] font-bold">
                                      {pk.keyName}
                                    </span>
                                    <span className="text-[#FF6B2B] text-[10px]">
                                      {pk.keyValue.substring(0, 8)}...
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[9px] uppercase font-bold rounded px-1 ${
                                      pk.isShared
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-blue-500/10 text-blue-400"
                                    }`}
                                  >
                                    {pk.isShared ? "Shared" : "Private"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-1 block">
                            Recharge History
                          </p>
                          {payments.filter((p) => p.userId === selectedUser.id)
                            .length === 0 ? (
                            <span className="text-slate-600 text-[11px] font-mono block bg-[#1A1A1A]/40 p-1 rounded border border-[#222]">
                              No past recharges for this user.
                            </span>
                          ) : (
                            <div className="max-h-32 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar">
                              {payments
                                .filter((p) => p.userId === selectedUser.id)
                                .map((p, idx) => (
                                  <div
                                    key={`${p.id}-${idx}`}
                                    className="bg-[#181818] p-1 rounded border border-[#222] text-[11px] flex justify-between items-center"
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[#EFEFEF] font-medium text-[11px]">
                                        {p.planName || p.id}
                                      </span>
                                      <span className="text-[#555555] text-[10px]">
                                        {p.createdAt
                                          ? new Date(
                                              p.createdAt.toMillis
                                                ? p.createdAt.toMillis()
                                                : p.createdAt,
                                            ).toLocaleString()
                                          : "N/A"}
                                      </span>
                                    </div>
                                    <span className="bg-emerald-500/10 text-emerald-400 font-bold text-[9px] px-1 py-1 rounded flex items-center gap-0.5">
                                      {p.amount ? (
                                        <>
                                          <IndianRupee
                                            size={9}
                                            className="shrink-0 inline-block text-emerald-400"
                                          />
                                          <span>{p.amount}</span>
                                        </>
                                      ) : (
                                        "FREE"
                                      )}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>

                        {/* User past Conversions */}
                        <div>
                          <p className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-1 block">
                            Document History ({selectedUserHistory.length})
                          </p>
                          {selectedUserHistory.length === 0 ? (
                            <span className="text-slate-600 text-[11px] font-mono block bg-[#1A1A1A]/40 p-1 rounded border border-[#222]">
                              No past document conversions found.
                            </span>
                          ) : (
                            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar">
                              {selectedUserHistory.map((h, idx) => (
                                <div
                                  key={`${h.id}-${idx}`}
                                  className="bg-[#181818] p-1 rounded border border-[#222] text-[11px] flex justify-between items-start"
                                >
                                  <div className="flex flex-col gap-0.5 truncate pr-1">
                                    <span className="text-[#EFEFEF] font-medium text-[11px] truncate">
                                      {h.fileName}
                                    </span>
                                    <span className="text-[#555555] text-[10px]">
                                      {h.timestamp
                                        ? new Date(
                                            h.timestamp,
                                          ).toLocaleDateString()
                                        : "—"}{" "}
                                      • {h.pagesCount || 0} Pages
                                    </span>
                                  </div>
                                  <span className="bg-[#FF6B2B]/10 text-[#FF6B2B] font-bold text-[9px] px-1 py-1 rounded leading-none">
                                    DOCX
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#111] border border-[#222] border-dashed rounded-xl p-3 text-center text-[#555555]">
                    <Users size={28} className="mx-auto text-slate-600 mb-1" />
                    <p className="text-[11px] font-bold text-[#888888] uppercase tracking-wide">
                      Identity Inspector
                    </p>
                    <p className="text-[11px] text-[#555555] mt-1 leading-relaxed">
                      Select a user from the directory table to inspect their
                      personal backup API keys, conversion histories, edit
                      display properties, and perform service management.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CONVERSIONS LOGS */}
          {activeTab === "conversions" && (
            <div>
              <h2 className="text-md font-bold text-[#EFEFEF] mb-1 flex items-center gap-2">
                <FileText size={18} className="text-[#FF6B2B]" />
                Analysis Logs (Global Conversions)
              </h2>

              <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden ">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#222] bg-[#161616]">
                      <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                        Document Target
                      </th>
                      <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                        Pages
                      </th>
                      <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                        Converted By User
                      </th>
                      <th className="p-1 text-[#888888] font-bold uppercase tracking-wider">
                        Conversion Timestamp
                      </th>
                      <th className="p-1 text-[#888888] font-bold uppercase tracking-wider text-right">
                        Reference ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConversionsList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-2 text-center text-[#555555]"
                        >
                          No document conversion histories matched terms.
                        </td>
                      </tr>
                    ) : (
                      filteredConversionsList.map((h, idx) => (
                        <tr
                          key={`${h.id}-${idx}`}
                          className="border-b border-[#222] hover:bg-[#1A1A1A]/20 transition-all font-sans"
                        >
                          <td className="p-1">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 bg-[#FF6B2B]/10 rounded border border-[#FF6B2B]/20 flex items-center justify-center text-[#FF6B2B] shrink-0">
                                <FileText size={14} />
                              </div>
                              <span className="text-[#EFEFEF] font-bold max-w-sm truncate select-all">
                                {h.fileName}
                              </span>
                            </div>
                          </td>
                          <td className="p-1 font-mono font-bold text-slate-100">
                            {h.pagesCount ? `${h.pagesCount} pgs` : "—"}
                          </td>
                          <td className="p-1">
                            <div className="flex flex-col">
                              <span className="text-[#EFEFEF] font-medium">
                                {h.userDisplayName}
                              </span>
                              <span className="text-[#888888] text-[10px]">
                                {h.userEmail}
                              </span>
                            </div>
                          </td>
                          <td className="p-1 text-[#888888] font-mono text-[11px]">
                            {h.timestamp
                              ? new Date(h.timestamp).toLocaleString()
                              : "—"}
                          </td>
                          <td className="p-1 text-right font-mono text-slate-600 text-[10px]">
                            {h.id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: DIAGNOSTICS */}
          {activeTab === "diagnostics" && (
            <div className="flex flex-col gap-[12px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
                {/* Environment checks */}
                <div className="bg-[#111] p-2 border border-[#222] rounded-xl flex flex-col gap-4">
                  <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase tracking-wide border-b border-[#222] pb-1 flex items-center gap-2">
                    <Activity size={16} className="text-blue-400" />
                    Administrative Environment Status
                  </h3>

                  <div className="flex flex-col gap-3 font-mono text-[11px]">
                    <div className="flex justify-between p-1 bg-[#1A1A1A]/40 rounded border border-[#222]">
                      <span className="text-[#555555] font-bold uppercase">
                        Multi-Tenant Database:
                      </span>
                      <span className="text-[#FF6B2B] font-bold">
                        Cloud Firestore
                      </span>
                    </div>

                    <div className="flex justify-between p-1 bg-[#1A1A1A]/40 rounded border border-[#222]">
                      <span className="text-[#555555] font-bold uppercase">
                        System Credentials:
                      </span>
                      <span className="text-emerald-400">
                        ACTIVE SESSION (AES-256 equivalent)
                      </span>
                    </div>

                    <div className="flex justify-between p-1 bg-[#1A1A1A]/40 rounded border border-[#222]">
                      <span className="text-[#555555] font-bold uppercase">
                        V1 Security rules:
                      </span>
                      <span className="text-teal-400">
                        HARDENED EMAIL-GATED ABAC
                      </span>
                    </div>

                    <div className="flex justify-between p-1 bg-[#1A1A1A]/40 rounded border border-[#222]">
                      <span className="text-[#555555] font-bold uppercase">
                        Client Local Engine:
                      </span>
                      <span className="text-emerald-400">
                        Verified Firebase Admin Suite Connection
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#FF6B2B]/5 border border-[#FF6B2B]/20 p-1 rounded-lg flex gap-3 text-[11px] mt-1">
                    <Terminal className="text-[#FF6B2B] shrink-0" size={16} />
                    <div className="text-[#888888]">
                      <p className="font-bold mb-1">
                        Administrative Privileges Enforced
                      </p>
                      Any transaction, extraction rotation tweak, user update, or
                      profile wipe made inside this dashboard transmits real-time
                      mutations directly down to your production Firestore
                      cluster. Proceed with operational mindfulness.
                    </div>
                  </div>
                </div>

                {/* Developer credentials warning */}
                <div className="bg-[#111] p-2 border border-[#222] rounded-xl flex flex-col gap-4">
                  <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase tracking-wide border-b border-[#222] pb-1 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-yellow-500" />
                    Credentials & Secrets Audit
                  </h3>

                  <p className="text-[11px] text-[#888888] leading-relaxed">
                    The backend relies on keys retrieved in sequence. You can
                    specify multiple Gemini API keys in the platform settings
                    using commas:
                  </p>

                  <div className="bg-[#1F1F1F] text-[#FF6B2B] font-mono text-[11px] p-1 rounded-md border border-[#333] select-all">
                    GEMINI_API_KEYS=key1,key2,key3
                  </div>

                  <p className="text-[11px] text-[#888888] leading-relaxed mt-1">
                    When users share a key with the pool, it registers in{" "}
                    <code className="bg-[#1A1A1A] px-1 rounded">
                      shared_api_keys
                    </code>{" "}
                    collection, letting the server fetch them immediately for
                    rotational redundancy. All transactions are proxied safely to
                    prevent private key exposed risk.
                  </p>

                  <div className="mt-1 p-1 border border-blue-500/20 bg-blue-500/5 rounded-lg text-[11px] flex gap-2.5 text-blue-300">
                    <CheckCircle className="shrink-0 w-4 h-4" />
                    <span>
                      No API keys ever hit the web browser (unless they belong to
                      client custom overrides). The full rotation is safely
                      performed server-side inside `server.ts`.
                    </span>
                  </div>
                </div>
              </div>

              {/* Maintenance & Manual Pruning System Section */}
              <div className="bg-[#111] p-3 border border-[#222] rounded-xl flex flex-col gap-3">
                <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase tracking-wide border-b border-[#222] pb-1.5 flex items-center gap-2">
                  <History size={16} className="text-[#FF6B2B]" />
                  Database History Validity & Pruning Engine
                </h3>
                <p className="text-[#888888] text-[11px] leading-relaxed">
                  Trigger the standard cloud-computed retention validity sweep to automatically inspect and purge history logs
                  and MCQ conversion snapshots exceeding their respective free/premium validity window from the database.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <button
                    onClick={runManualHistoryCleanup}
                    disabled={isTriggeringCleanup}
                    className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 font-bold rounded text-[11px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-w-[220px]"
                  >
                    <Terminal size={14} />
                    {isTriggeringCleanup ? "EXECUTING RETENTION SWEEP..." : "TRIGGER HISTORY RETENTION CLEANUP"}
                  </button>

                  <div className="text-[10px] bg-[#1A1A1A] text-yellow-500/80 p-2 rounded border border-yellow-500/10 flex-1 leading-normal">
                    This directly invokes the server endpoint <code className="bg-black/40 px-1 text-white font-mono">/api/admin/trigger-cleanup</code> to execute structural cleanup processing across all tenant accounts.
                  </div>
                </div>

                {cleanupConsoleLogs.length > 0 && (
                  <div className="mt-1">
                    <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider block mb-1">
                      Operation System Logs
                    </span>
                    <div className="bg-[#0b0c10]/95 text-[#c5c6c7] p-2.5 rounded border border-[#222] text-[10.5px] font-mono max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col gap-1 select-all">
                      {cleanupConsoleLogs.map((log, lIdx) => (
                        <div key={lIdx} className="leading-relaxed whitespace-pre-wrap">
                          <span className="text-emerald-500 font-bold">&gt;</span> {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {cleanupSummary && (
                  <div className="mt-1 bg-emerald-500/5 border border-emerald-500/15 p-2.5 rounded-lg text-[11.5px] flex flex-col gap-2 font-sans">
                    <span className="text-emerald-400 font-bold uppercase tracking-wide text-[10px] block">
                      Pruning Operation Summary
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-sans">
                      <div className="bg-[#1c1c1f] p-1.5 rounded border border-[#2c2c30] text-center">
                        <div className="text-[#EFEFEF] font-bold font-mono text-[13px]">{cleanupSummary.processedUsers}</div>
                        <div className="text-[#888888] text-[11px]">Profiles Scanned</div>
                      </div>
                      <div className="bg-[#1c1c1f] p-1.5 rounded border border-[#2c2c30] text-center">
                        <div className="text-red-400 font-bold font-mono text-[13px]">{cleanupSummary.deletedHistoryItems}</div>
                        <div className="text-[#888888] text-[11px]">PDF Logs Cleared</div>
                      </div>
                      <div className="bg-[#1c1c1f] p-1.5 rounded border border-[#2c2c30] text-center">
                        <div className="text-blue-400 font-bold font-mono text-[13px]">{cleanupSummary.deletedMcqConversions}</div>
                        <div className="text-[#888888] text-[11px]">MCQ Logs Cleared</div>
                      </div>
                      <div className="bg-[#1c1c1f] p-1.5 rounded border border-[#2c2c30] text-center flex flex-col justify-center">
                        <div className="text-[#EFEFEF] text-[9.5px] font-mono leading-none truncate">{new Date(cleanupSummary.timestamp).toLocaleTimeString()}</div>
                        <div className="text-[#888888] text-[11px] mt-1">Finished At</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PLANS (REPURPOSED TO TOKEN PACKS & RATES) */}
          {activeTab === "plans" && (
            <div className="flex flex-col gap-[12px]">
              {/* SECTION A: TOOL DEDUCTION RATES */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-2 ">
                <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase mb-1 border-b border-[#222] pb-1 flex items-center gap-2">
                  <Coins size={16} className="text-[#FF6B2B]" />
                  Tool Token Deductions (Dynamic Rates)
                </h3>
                <p className="text-[#888888] text-[11px] mb-1 leading-relaxed font-sans">
                  Configure token deduction rates when users execute any
                  ecosystem tool. If the user links their private Gemini API key
                  (Custom API), the Custom API rate applies. Otherwise, the
                  System API rate applies.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-[11px]">
                  {/* PDF Converter */}
                  <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-1 flex flex-col gap-3">
                    <h4 className="text-[#EFEFEF] font-bold uppercase tracking-wider text-[11px] border-b border-[#222] pb-1">
                      PDF Layout Extractor
                    </h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        System API (per page)
                      </label>
                      <input
                        type="number"
                        value={rates.pdfConverter?.system ?? 50}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            pdfConverter: {
                              ...rates.pdfConverter,
                              system: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        Custom API (per page)
                      </label>
                      <input
                        type="number"
                        value={rates.pdfConverter?.custom ?? 2}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            pdfConverter: {
                              ...rates.pdfConverter,
                              custom: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                  </div>

                  {/* Question Extractor */}
                  <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-1 flex flex-col gap-3">
                    <h4 className="text-[#EFEFEF] font-bold uppercase tracking-wider text-[11px] border-b border-[#222] pb-1">
                      Question Extractor
                    </h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        System API (per page)
                      </label>
                      <input
                        type="number"
                        value={rates.mcqExtractor?.system ?? 50}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            mcqExtractor: {
                              ...rates.mcqExtractor,
                              system: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        Custom API (per page)
                      </label>
                      <input
                        type="number"
                        value={rates.mcqExtractor?.custom ?? 2}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            mcqExtractor: {
                              ...rates.mcqExtractor,
                              custom: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                  </div>

                  {/* Youtube SEO */}
                  <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-1 flex flex-col gap-3">
                    <h4 className="text-[#EFEFEF] font-bold uppercase tracking-wider text-[11px] border-b border-[#222] pb-1">
                      YouTube SEO Tool
                    </h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        System API (per use)
                      </label>
                      <input
                        type="number"
                        value={rates.youtubeSeo?.system ?? 40}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            youtubeSeo: {
                              ...rates.youtubeSeo,
                              system: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        Custom API (per use)
                      </label>
                      <input
                        type="number"
                        value={rates.youtubeSeo?.custom ?? 2}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            youtubeSeo: {
                              ...rates.youtubeSeo,
                              custom: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                  </div>

                  {/* Chat Assistant */}
                  <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-1 flex flex-col gap-3">
                    <h4 className="text-[#EFEFEF] font-bold uppercase tracking-wider text-[11px] border-b border-[#222] pb-1">
                      AI Chat Assistant
                    </h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        System API (per msg)
                      </label>
                      <input
                        type="number"
                        value={rates.chatApp?.system ?? 15}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            chatApp: {
                              ...rates.chatApp,
                              system: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[#888888] font-medium">
                        Custom API (per msg)
                      </label>
                      <input
                        type="number"
                        value={rates.chatApp?.custom ?? 1}
                        onChange={(e) =>
                          setRates({
                            ...rates,
                            chatApp: {
                              ...rates.chatApp,
                              custom: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-[#222] border border-[#333] p-1 rounded text-[#EFEFEF] font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end mt-1">
                  <button
                    disabled={isSavingRates}
                    onClick={() => saveRates(rates)}
                    className="px-2 py-1 bg-[#FF6B2B] hover:bg-[#E55A1A]"
                  >
                    {isSavingRates ? "Saving Rates..." : "Save Rates"}
                  </button>
                </div>
              </div>

              {/* SECTION B: TOKEN PACKS DETAILS */}
              <div className="flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <h2 className="text-md font-bold text-[#EFEFEF] flex items-center gap-2">
                    <Coins size={18} className="text-[#FF6B2B]" />
                    Token Packages Configuration
                  </h2>
                  <button
                    onClick={() =>
                      setIsEditingPlan({
                        id: "",
                        name: "",
                        description: "",
                        price: 199,
                        durationDays: 365, // long defaults matching token pack expectations
                        isActive: true,
                        createdAt: Date.now(),
                        tokensCount: 5000,
                        historyValidityDays: 30,
                        limits: {
                          pdfDailySystemApi: 0,
                          pdfDailyPersonalApi: 0,
                          chatDailySystemApi: 0,
                          chatDailyPersonalApi: 0,
                        },
                      })
                    }
                    className="px-1 py-1 bg-[#FF6B2B] hover:bg-[#E55A1A] text-[#EFEFEF] text-[11px] font-bold rounded shadow transition-colors"
                  >
                    + CREATE NEW TOKEN PACK
                  </button>
                </div>

                {isEditingPlan && (
                  <div className="bg-[#111] border border-[#222] rounded-xl p-2  relative">
                    <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase mb-1 border-b border-[#222] pb-1">
                      {isEditingPlan.id
                        ? "Edit Token Pack Definition"
                        : "New Token Pack Definition"}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-bold text-[#888888]">
                          Pack Name
                        </label>
                        <input
                          type="text"
                          value={isEditingPlan.name}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              name: e.target.value,
                            })
                          }
                          className="bg-[#1A1A1A] border-[#333] p-1 text-[#EFEFEF] border-2 pl-[6px] h-[35px] w-[297.172px] rounded-[3px]"
                          placeholder="e.g. Standard Surge"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-bold text-[#888888]">
                          Price in INR (₹)
                        </label>
                        <input
                          type="number"
                          value={isEditingPlan.price}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              price: Number(e.target.value),
                            })
                          }
                          className="bg-[#1A1A1A] border-[#333] p-1 text-[#EFEFEF] border-2 pl-[6px] h-[35px] rounded-[3px]"
                          placeholder="e.g. 199 (use 0 for FREE packs)"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 font-sans">
                        <label className="font-bold text-[#888888]">
                          Tokens Granted
                        </label>
                        <input
                          type="number"
                          value={isEditingPlan.tokensCount ?? 1000}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              tokensCount: Number(e.target.value),
                            })
                          }
                          className="bg-[#1A1A1A] border-[#333] p-1 text-[#EFEFEF] border-2 pl-[6px] h-[35px] w-[297.172px] rounded-[3px]"
                          placeholder="e.g. 5000"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 font-sans">
                        <label className="font-bold text-[#888888]">
                          Validity / Duration (Days)
                        </label>
                        <input
                          type="number"
                          value={isEditingPlan.durationDays ?? 365}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              durationDays: Number(e.target.value),
                            })
                          }
                          className="bg-[#1A1A1A] border-[#333] p-1 text-[#EFEFEF] border-2 pl-[6px] h-[35px] rounded-[3px]"
                          placeholder="e.g. 365"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 font-sans">
                        <label className="font-bold text-[#888888]">
                          History Validity / Retention (Days)
                        </label>
                        <input
                          type="number"
                          value={isEditingPlan.historyValidityDays ?? 30}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              historyValidityDays: Number(e.target.value),
                            })
                          }
                          className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[#EFEFEF]"
                          placeholder="e.g. 30"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 font-sans">
                        <label className="font-bold text-[#888888]">
                          Is Active
                        </label>
                        <select
                          value={isEditingPlan.isActive ? "true" : "false"}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              isActive: e.target.value === "true",
                            })
                          }
                          className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[#EFEFEF]"
                        >
                          <option value="true">Active (Visible)</option>
                          <option value="false">Inactive (Hidden)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="font-bold text-[#888888]">
                          Description
                        </label>
                        <textarea
                          value={isEditingPlan.description}
                          onChange={(e) =>
                            setIsEditingPlan({
                              ...isEditingPlan,
                              description: e.target.value,
                            })
                          }
                          className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[#EFEFEF]"
                          rows={2}
                          placeholder="Describe the pack benefits..."
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => savePlan(isEditingPlan)}
                        className="px-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-[#EFEFEF] font-bold rounded text-[11px] transition-colors"
                      >
                        SAVE PACK
                      </button>
                      <button
                        onClick={() => setIsEditingPlan(null)}
                        className="px-1 py-1 bg-[#222] hover:bg-[#333] text-[#888888] font-bold rounded text-[11px] transition-colors"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[12px]">
                  {plans.map((plan, idx) => (
                    <div
                      key={`${plan.id}-${idx}`}
                      className="bg-[#111] border border-[#222] rounded-xl p-2  flex flex-col gap-4 relative justify-between"
                    >
                      {!plan.isActive && (
                        <div className="absolute top-4 right-4 bg-red-500/10 text-red-400 font-mono text-[9px] px-1 py-1 rounded font-bold uppercase">
                          Inactive
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <h3 className="text-[20px] font-black text-[#EFEFEF]">
                          {plan.name}
                        </h3>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-[#FF6B2B] text-[20px] font-bold flex items-center gap-0.5">
                            {Number(plan.price) === 0 ? (
                              "FREE"
                            ) : (
                              <>
                                <IndianRupee
                                  size={16}
                                  className="shrink-0 inline-block text-[#FF6B2B]"
                                />
                                <span>{plan.price}</span>
                              </>
                            )}
                          </span>
                          {Number(plan.price) > 0 && (
                            <span className="text-[10px] text-[#555555] font-bold uppercase">
                              INR
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap mt-1">
                          <div className="bg-[#1A1A1A] py-1 px-1 rounded border border-[#2A2A2A] w-fit">
                            <span className="text-emerald-400 font-mono text-[11px] font-bold">
                              +{(plan.tokensCount ?? 1000).toLocaleString()}{" "}
                              Whiteboard Tokens
                            </span>
                          </div>
                          {(plan.durationDays ?? 365) && (
                            <div className="bg-[#1A1A1A] py-1 px-1 rounded border border-[#2A2A2A] w-fit">
                              <span className="text-amber-400 font-mono text-[11px] font-bold font-sans">
                                {plan.durationDays ?? 365} Days Validity
                              </span>
                            </div>
                          )}
                          <div className="bg-[#1A1A1A] py-1 px-1 rounded border border-[#2A2A2A] w-fit">
                            <span className="text-blue-400 font-mono text-[11px] font-bold font-sans">
                              {plan.historyValidityDays ?? 30} Days History Retention
                            </span>
                          </div>
                        </div>
                        <p className="text-[#888888] text-[11px] mt-1 min-h-[40px] leading-relaxed">
                          {plan.description || "No description loaded."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-[#222]">
                        <button
                          onClick={() => setIsEditingPlan({ ...plan })}
                          className="flex-1 px-1 py-1 bg-[#252525] border border-[#333] text-[#888888] font-bold rounded text-[11px] hover:bg-[#333]"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => deletePlan(plan.id)}
                          className="px-1 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[11px] hover:bg-red-500/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="flex flex-col gap-[12px]">
              <div className="flex items-center justify-between">
                <h2 className="text-md font-bold text-[#EFEFEF] flex items-center gap-2">
                  <Globe size={18} className="text-[#FF6B2B]" />
                  Global Analytics & Settings
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
                <div className="flex flex-col gap-[12px]">
                  <div className="bg-[#111] p-2 rounded-xl border border-[#222]">
                    <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase mb-1 border-b border-[#222] pb-1">
                      Google Analytics Configuration
                    </h3>
                    <p className="text-[#888888] text-[11px] mb-1">
                      Connect Google Analytics to track user retention,
                      demographics, and behavior on the platform.
                    </p>

                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                        GA Measurement Id (e.g. G-XXXXXXXXXX)
                      </label>
                      <input
                        type="text"
                        placeholder="G-..."
                        value={gaConfig}
                        onChange={(e) => setGaConfig(e.target.value)}
                        className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[13px] text-[#EFEFEF] font-mono"
                      />
                    </div>

                    <button
                      onClick={saveAnalyticsConfig}
                      disabled={isSavingGa}
                      className="mt-1 px-1 py-1 bg-[#FF6B2B] hover:bg-[#E55A1A] text-[#EFEFEF] font-bold rounded text-[11px] transition-colors disabled:opacity-50"
                    >
                      {isSavingGa ? "SAVING..." : "SAVE ANALYTICS ID"}
                    </button>
                  </div>

                  {/* SUBSECTION: Global History Retention Configuration */}
                  <div className="bg-[#111] p-2 rounded-xl border border-[#222]">
                    <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase mb-1 border-b border-[#222] pb-1 flex items-center gap-1.5 font-sans">
                      <History size={15} className="text-[#FF6B2B]" />
                      Global History Retention & Validity
                    </h3>
                    <p className="text-[#888888] text-[11px] mb-2 leading-relaxed">
                      Configure retention thresholds (validity) after which user activity logs
                      (converted PDFs, MCQ sets) are automatically deleted by the server cleanup job.
                    </p>

                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                          Free Users History Retention (Days)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={freeRetentionDays}
                          onChange={(e) => setFreeRetentionDays(Math.max(1, Number(e.target.value)))}
                          className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[13px] text-[#EFEFEF] font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                          Premium Default History Retention (Days)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={premiumRetentionDays}
                          onChange={(e) => setPremiumRetentionDays(Math.max(1, Number(e.target.value)))}
                          className="bg-[#1A1A1A] border border-[#333] p-1 rounded text-[13px] text-[#EFEFEF] font-mono"
                        />
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] bg-[#1A1A1A] text-yellow-500/80 p-1.5 rounded border border-yellow-500/10 leading-normal">
                      Note: You can override premium retention per subscription pack inside the <strong>Plans</strong> configuration tab. If a pack has no custom retention set, it falls back to this premium default.
                    </div>

                    <button
                      onClick={saveHistoryRetention}
                      disabled={isSavingRetention}
                      className="mt-2 w-full px-1 py-1.5 bg-[#FF6B2B] hover:bg-[#E55A1A] text-white font-bold rounded text-[11px] transition-colors disabled:opacity-50"
                    >
                      {isSavingRetention ? "SAVING PARAMETERS..." : "SAVE RETENTION DAYS"}
                    </button>
                  </div>
                </div>

                <div className="bg-[#111] p-2 rounded-xl border border-[#222]">
                  <h3 className="text-[#EFEFEF] font-bold text-[13px] uppercase mb-1 border-b border-[#222] pb-1 flex items-center gap-2">
                    <Activity size={16} className="text-emerald-500" />
                    Internal App Visits (Last 100)
                  </h3>
                  <div className="overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                    {analyticsVisits.length === 0 ? (
                      <div className="text-center text-[#555555] py-4 text-[11px]">
                        No local visits logged yet.
                      </div>
                    ) : (
                      <table className="w-full text-[11px] text-left text-[#888888]">
                        <thead className="text-[10px] uppercase text-[#555555] bg-[#1A1A1A] sticky top-0">
                          <tr>
                            <th className="px-1 py-1 font-bold">Country</th>
                            <th className="px-1 py-1 font-bold">City</th>
                            <th className="px-1 py-1 font-bold">Time</th>
                            <th className="px-1 py-1 font-bold">IP/Locale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsVisits.map((v, i) => (
                            <tr
                              key={i}
                              className="border-b border-[#222] hover:bg-[#1A1A1A]/50"
                            >
                              <td className="px-1 py-1">{v.country}</td>
                              <td className="px-1 py-1">{v.city}</td>
                              <td className="px-1 py-1 text-[#888888]">
                                {v.timestamp
                                  ? new Date(
                                      v.timestamp.toDate(),
                                    ).toLocaleString()
                                  : "N/A"}
                              </td>
                              <td className="px-1 py-1 font-mono text-[10px] text-[#555555] truncate max-w-[100px]">
                                {v.ip} / {v.browserLocale}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="flex flex-col gap-[12px] w-full max-w-[1000px] overflow-hidden">
              <div className="flex items-center justify-between">
                <h2 className="text-md font-bold text-[#EFEFEF] flex items-center gap-2">
                  <CheckCircle size={18} className="text-[#FF6B2B]" />
                  Global Payment Transactions
                </h2>
              </div>

              <div className="bg-[#111] p-1 lg:p-2 rounded-xl border border-[#222]">
                <div className="overflow-x-auto w-full custom-scrollbar">
                  <table className="w-full text-left text-[#888888] whitespace-nowrap">
                    <thead className="text-[10px] uppercase text-[#555555] bg-[#1A1A1A] sticky top-0 font-bold tracking-wider">
                      <tr>
                        <th className="px-1 py-1">Date</th>
                        <th className="px-1 py-1">User</th>
                        <th className="px-1 py-1">Plan</th>
                        <th className="px-1 py-1">Amount</th>
                        <th className="px-1 py-1">Order ID</th>
                        <th className="px-1 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="text-center py-4 text-[#555555] text-[13px]"
                          >
                            <div className="flex flex-col items-center justify-center gap-2">
                              <CheckCircle size={24} className="opacity-20" />
                              <p>No transactions found.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        payments.map((p, idx) => (
                          <tr
                            key={`${p.id}-${idx}`}
                            className="border-b border-[#222] hover:bg-[#1A1A1A] transition-colors"
                          >
                            <td className="px-1 py-1 text-[11px] text-[#888888]">
                              {p.createdAt
                                ? new Date(
                                    p.createdAt.toDate(),
                                  ).toLocaleString()
                                : "N/A"}
                            </td>
                            <td className="px-1 py-1 text-[13px] font-medium text-[#EFEFEF]">
                              {p.userEmail}
                            </td>
                            <td className="px-1 py-1 text-[11px] font-bold text-amber-500">
                              {p.planName}
                            </td>
                            <td className="px-1 py-1 text-[13px] font-bold text-emerald-400">
                              {Number(p.amount) === 0 ? (
                                <span className="text-amber-400 font-bold uppercase text-[11px]">
                                  FREE
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-emerald-400">
                                  <IndianRupee
                                    size={12}
                                    className="shrink-0 inline-block text-emerald-400"
                                  />
                                  <span>{p.amount}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-1 py-1 text-[10px] font-mono text-[#555555]">
                              {p.orderId}
                            </td>
                            <td className="px-1 py-1 text-[11px]">
                              <span className="bg-emerald-500/10 text-emerald-500 px-1 py-1 rounded inline-flex items-center gap-1 font-bold">
                                <CheckCircle size={10} />{" "}
                                {p.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
