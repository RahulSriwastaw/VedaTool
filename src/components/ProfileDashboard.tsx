import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../services/firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  CheckCircle,
  Zap,
  Database,
  LogOut,
  CreditCard,
  ChevronRight,
  Coins,
  History,
  Trash2,
  Download,
  Copy,
  Check,
  Calendar,
  FileText,
} from "lucide-react";
import { motion } from "motion/react";
import { usePlanLimits } from "../hooks/usePlanLimits";
import { getCleanDisplayName, OptionArrangement } from "../types";
import { generateDocx } from "../services/docxService";
import ApiKeysSettingsModal from "./ApiKeysSettingsModal";

const ProfileDashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const { limits, usage, plan, tokens } = usePlanLimits();
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(
    user ? user.displayName || getCleanDisplayName("", user.email || "") : "",
  );

  // History list, loading, and dynamic actions state
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Enforce retention validity limits & Fetch user's actual conversion/extraction history
  useEffect(() => {
    const fetchAndCleanupHistory = async () => {
      if (!user) return;
      setLoadingHistory(true);
      try {
        // Evaluate user's active retention configuration
        // Free users default history validity: 1 week (7 Days)
        // Premium users: configured per subscription pack/plan (which contains historyValidityDays) or 30 days default
        const retentionDays = plan.id === "free" ? 7 : (plan.historyValidityDays || 30);
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;

        // 1. Fetch and prune standard conversions: users/{userId}/history
        const pdfCol = collection(db, "users", user.uid, "history");
        const pdfSnap = await getDocs(pdfCol);
        const pdfItems: any[] = [];

        for (const docSnap of pdfSnap.docs) {
          const data = docSnap.data();
          const timestamp = data.timestamp || 0;
          // If past validity retention period, automatically delete from Firestore
          if (timestamp < cutoffTime) {
            await deleteDoc(doc(db, "users", user.uid, "history", docSnap.id));
          } else {
            pdfItems.push({
              id: docSnap.id,
              type: "pdf_to_word",
              fileName: data.fileName || "document",
              timestamp,
              elements: data.elements || [],
              pagesCount: data.pagesCount ?? 0,
            });
          }
        }

        // 2. Fetch and prune MCQ extractions: users/{userId}/mcq_conversions
        const mcqCol = collection(db, "users", user.uid, "mcq_conversions");
        const mcqSnap = await getDocs(mcqCol);
        const mcqItems: any[] = [];

        for (const docSnap of mcqSnap.docs) {
          const data = docSnap.data();
          let timestamp = 0;
          if (data.timestamp) {
            timestamp = new Date(data.timestamp).getTime();
          }
          // If past validity retention period, automatically delete from Firestore
          if (timestamp < cutoffTime) {
            await deleteDoc(doc(db, "users", user.uid, "mcq_conversions", docSnap.id));
          } else {
            mcqItems.push({
              id: docSnap.id,
              type: "mcq_extraction",
              fileName: data.fileName || "mcq_extracted_set",
              timestamp,
              extractedText: data.extractedText || "",
              mcqCount: data.mcqCount ?? 0,
            });
          }
        }

        // Merge, sort newest first
        const merged = [...pdfItems, ...mcqItems].sort((a, b) => b.timestamp - a.timestamp);
        setHistoryItems(merged);
      } catch (err) {
        console.error("Error managing and fetching activity history:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    if (user && plan) {
      fetchAndCleanupHistory();
    }
  }, [user, plan]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let loadedName = user.displayName;
        if (userDoc.exists()) {
          const uData = userDoc.data();
          setUserData(uData);
          if (uData?.displayName) {
            loadedName = uData.displayName;
          }
        }
        setNewName(loadedName || getCleanDisplayName("", user.email || ""));
      } catch (err) {
        console.error("Error loading user profile data:", err);
      }
    };
    fetchUserData();
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    await setDoc(
      doc(db, "users", user.uid),
      { displayName: newName },
      { merge: true },
    );
    setIsEditing(false);
    window.location.reload(); // Quick refresh
  };

  if (!user) {
    return (
      <div className="pt-11 px-2 text-center text-[#EFEFEF]">
        <h2>Please log in to view your profile.</h2>
        <button
          onClick={() => navigate("/")}
          className="mt-1 text-[var(--accent)] hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  const handleLogout = () => {
    signOut(auth);
    navigate("/");
  };

  // Actions for history logs
  const handleDownloadPdfHistory = async (item: any) => {
    try {
      const blob = await generateDocx(item.elements, OptionArrangement.VERTICAL);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.fileName || "converted_document"}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF download regeneration failed:", e);
      alert("Failed to regenerate Word file.");
    }
  };

  const handleDownloadMcqTxt = (item: any) => {
    try {
      const blob = new Blob([item.extractedText], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.fileName || "mcq_extracted"}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("MCQ text download failed:", e);
      alert("Failed to download text file.");
    }
  };

  const handleCopyMcqText = (item: any) => {
    try {
      navigator.clipboard.writeText(item.extractedText);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleDeleteHistory = async (itemId: string, type: string) => {
    try {
      if (type === "pdf_to_word") {
        await deleteDoc(doc(db, "users", user.uid, "history", itemId));
      } else if (type === "mcq_extraction") {
        await deleteDoc(doc(db, "users", user.uid, "mcq_conversions", itemId));
      }
      setHistoryItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error("Error deleting history item:", err);
      alert("Failed to delete this item.");
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === Infinity) return 0;
    if (limit === 0) return 100;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  return (
    <div className="pt-[72px] min-h-[100dvh] pb-6 px-3 bg-[var(--bg-page)] text-[var(--text-primary)] relative">
      <div className="max-w-4xl mx-auto py-3">
        <button
          onClick={() => navigate("/hub")}
          className="mb-3 text-[var(--text-secondary)] text-[13px] font-semibold flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors w-fit bg-transparent border-0 cursor-pointer"
        >
          <ArrowLeft size={14} /> Back to Hub
        </button>

        <h1 className="text-[20px] font-bold text-[var(--text-primary)] mb-3 tracking-tight">
          Account <span className="text-[var(--accent)]">Settings</span>
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[12px]">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-3 flex flex-col hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-shadow duration-200"
          >
            <div className="flex flex-col items-center text-center pb-3 border-b border-[var(--divider)]">
              <div className="w-[84px] h-[84px] rounded-full border border-[var(--border-card)] bg-[var(--bg-body)] overflow-hidden mb-2">
                <img
                  src={
                    user.photoURL ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`
                  }
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2 w-full">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-[var(--input-bg)] text-[var(--text-primary)] border border-[var(--input-border)] px-2.5 py-1.5 rounded-[6px] text-[13px] text-center w-full focus:outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateProfile}
                      className="flex-1 bg-[var(--accent)] text-white hover:bg-[#E55A1A] rounded-[6px] text-[13px] font-medium py-1.5 transition-colors cursor-pointer"
                    >
                      SAVE
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 bg-transparent border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[6px] text-[13px] font-medium py-1.5 transition-colors cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-[15px] font-bold text-[var(--text-primary)] mb-0.5">
                    {userData?.displayName ||
                      user.displayName ||
                      getCleanDisplayName("", user.email || "")}
                  </h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-[var(--accent)] hover:text-[#E55A1A] text-[11px] font-semibold uppercase tracking-[0.8px] mb-1.5 cursor-pointer bg-transparent border-0"
                  >
                    Edit Name
                  </button>
                </>
              )}

              <p className="text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1 mt-1 mb-2">
                <Mail size={12} /> {user.email}
              </p>

              <div className="flex flex-col gap-1.5 items-center w-full">
                <div className={`px-2.5 py-0.5 rounded-[20px] text-[11px] font-semibold uppercase tracking-[0.8px] ${plan.id !== "free" ? "bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]" : "bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-card)]"}`}>
                  {plan.id !== "free" ? `${plan.name} Premium` : "Free User"}
                </div>

                <div className="mt-1 px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded-[20px] text-[11px] font-bold uppercase tracking-[0.8px] flex items-center gap-1.5">
                  <Coins size={12} /> {userData?.tokens || 0} Veda Tokens
                </div>
              </div>
            </div>

            <div className="mt-auto pt-3 flex flex-col gap-2">
              <button
                onClick={() => setShowApiKeys(true)}
                className="w-full h-[38px] px-3 bg-transparent border border-[var(--border-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-[6px] font-medium text-[13px] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  <Database size={14} className="text-[var(--accent)]" /> API Keys & Config
                </div>
                <ChevronRight
                  size={14}
                  className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors"
                />
              </button>

              <button
                onClick={handleLogout}
                className="w-full h-[38px] px-3 bg-[var(--error-bg)] hover:bg-[var(--error-bg)]/80 text-[var(--error-text)] border border-[var(--error-border)] rounded-[6px] font-medium text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut
                  size={14}
                />{" "}
                Sign Out
              </button>
            </div>
          </motion.div>

          {/* Subscriptions & Usage Data */}
          <div className="lg:col-span-2 flex flex-col gap-[12px]">
            {/* Current Plan block */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-shadow duration-200 relative overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-0.5">
                    <CreditCard size={16} className="text-[var(--accent)]" />{" "}
                    Subscription Plan
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Manage your active subscription and billing.
                  </p>
                </div>
                <div className="px-2 py-0.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] rounded-[20px] text-[11px] font-bold uppercase tracking-[0.8px] flex items-center gap-1 self-start sm:self-auto">
                  <CheckCircle size={12} /> {plan.name}
                </div>
              </div>

              <div className="p-2.5 bg-[var(--bg-body)] border border-[var(--border-card)] rounded-[8px] mb-2.5">
                <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                  You are currently using the{" "}
                  <strong className="text-[var(--text-primary)]">{plan.name} Plan</strong>.
                  {plan.id === "free"
                    ? " Upgrade to unlock higher limits, parallel processing, and premium features for your AI tools."
                    : ` Thank you for being a premium subscriber! You get priority fast-lane runs and complete queue-bypass benefit.`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/pricing")}
                  className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[#E55A1A] text-white rounded-[6px] font-medium text-[13px] transition-colors cursor-pointer"
                >
                  Upgrade Plan
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  className="px-3 py-1.5 bg-transparent border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[6px] font-medium text-[13px] transition-colors cursor-pointer"
                >
                  View All Plans
                </button>
              </div>
            </motion.div>

            {/* Veda Token Economics & System Info */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-shadow duration-200 relative overflow-hidden"
            >
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-2.5">
                <Coins size={16} className="text-yellow-500" />{" "}
                Veda Token & Usage Economy
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
                <div className="bg-[var(--bg-body)] border border-[var(--border-card)] p-3 rounded-[8px] flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.8px]">
                      Current Balance
                    </span>
                    <div className="text-[20px] font-bold text-[var(--text-primary)] mt-0.5 mb-1 flex items-baseline gap-1">
                      <span className="text-[var(--accent)] font-extrabold text-[24px]">
                        {userData?.tokens ?? tokens}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Tokens
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-1">
                      Tokens are consumed per page extraction or AI chat message processed on our lightning-fast high-end servers.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/pricing")}
                    className="w-full mt-2 py-1.5 px-3 bg-[var(--accent)] text-white hover:bg-[#E55A1A] rounded-[6px] text-[13px] font-medium cursor-pointer transition-colors text-center"
                  >
                    Buy Token Packs &rarr;
                  </button>
                </div>

                <div className="bg-[var(--bg-body)] border border-[var(--border-card)] p-3 rounded-[8px] flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.8px]">
                      System vs Custom Keys
                    </span>
                    <div className="mt-1.5 space-y-1.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[var(--text-secondary)] font-medium">
                          ✨ System API Runs (No Key)
                        </span>
                        <span className="text-[var(--text-primary)] font-bold">
                          Full Rate
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[var(--text-secondary)] font-medium">
                          ⚙️ Custom API Keys Used
                        </span>
                        <span className="text-[var(--success-text)] font-semibold bg-[var(--success-bg)] px-1.5 py-0.5 rounded-[6px]">
                          95%+ Discount
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-2">
                      We have completely removed daily run limits! You can run as many extractions, conversions, MCQs, or AI messages as you want as long as you have active Veda token balances.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Cloud-computed Activity History System */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-[12px] bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-shadow duration-200 relative overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--divider)] pb-2 mb-3">
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.8px] font-bold text-[var(--text-primary)] flex items-center gap-1.5 font-sans">
                <History size={14} className="text-[var(--accent)]" /> Activity History Logs
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Your past document conversions and MCQ extractions activity is saved securely.
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
              <div className="px-2.5 py-0.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] rounded-[20px] text-[11px] font-bold tracking-wider">
                {plan.id === "free" ? "Free Member: 7 Days Retention" : `Premium: ${plan.historyValidityDays || 30} Days Retention`}
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                Expired logs are automatically cleared as per plan validity guidelines.
              </span>
            </div>
          </div>

          {loadingHistory ? (
            <div className="p-6 text-center text-[11px] text-[var(--text-secondary)] font-mono">
              Fetching activity streams...
            </div>
          ) : historyItems.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-[var(--border-card)] bg-[var(--bg-body)] rounded-[8px] flex flex-col items-center justify-center gap-2">
              <FileText size={20} className="text-[var(--text-muted)]" />
              <span className="text-[13px] text-[var(--text-secondary)] font-medium">No active logs found.</span>
              <p className="text-[11px] text-[var(--text-muted)]">Convert files using the PDF to Word converter or extract questions in the Hub to see logs here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-[12px]">
              {historyItems.map((item, idx) => {
                const isPdf = item.type === "pdf_to_word";
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className="bg-[var(--bg-body)] hover:bg-[var(--bg-hover)] border border-[var(--border-card)] rounded-[8px] p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors"
                  >
                    <div className="flex gap-2.5 items-center min-w-0 max-w-full sm:max-w-[70%]">
                      <div className={`p-1.5 rounded-[8px] shrink-0 ${isPdf ? "bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)]" : "bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20"}`}>
                        {isPdf ? <FileText size={14} /> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-folder-open"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[13px] font-semibold text-[var(--text-primary)] truncate" title={item.fileName}>
                          {isPdf ? item.fileName : `📂 ${item.fileName}`}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[11px] text-[var(--text-secondary)]">
                          <span className={`px-1.5 py-0.5 rounded-[6px] text-[11px] font-bold uppercase tracking-[0.5px] ${isPdf ? "bg-[var(--error-bg)] text-[var(--error-text)]" : "bg-[var(--info-bg)] text-[var(--info-text)]"}`}>
                            {isPdf ? "PDF to Word" : "Question Extractor"}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5 text-[var(--text-secondary)] font-sans">
                            <Calendar size={11} /> {new Date(item.timestamp).toLocaleString()}
                          </span>
                          <span>•</span>
                          <span className="text-[var(--text-muted)] font-mono">
                            {isPdf ? `${item.pagesCount} Pages` : `${item.mcqCount} Questions`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick interactive actions on previous actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 border-[var(--border-card)] pt-2 sm:pt-0 shrink-0">
                      {isPdf ? (
                        <button
                          onClick={() => handleDownloadPdfHistory(item)}
                          className="px-2.5 py-1.5 bg-[var(--accent)] hover:bg-[#E55A1A] text-white text-[13px] font-medium rounded-[6px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Download size={12} /> Word (.docx)
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/tools/question-extractor?id=${item.id}`)}
                          className="px-2.5 py-1.5 bg-[var(--accent)] hover:bg-[#E55A1A] text-white text-[13px] font-medium rounded-[6px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          Open Collection
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteHistory(item.id, item.type)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error-text)] hover:bg-[var(--error-bg)] border border-transparent hover:border-[var(--error-border)] rounded-[6px] transition-colors ml-1 cursor-pointer animate-none"
                        title="Delete permanently"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {showApiKeys && (
        <ApiKeysSettingsModal
          user={user}
          onClose={() => setShowApiKeys(false)}
        />
      )}
    </div>
  );
};

export default ProfileDashboard;
