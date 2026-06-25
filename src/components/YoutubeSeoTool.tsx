import React, { useState, useEffect, useRef } from "react";
import {
  Youtube,
  Copy,
  Check,
  Wand2,
  RefreshCw,
  AlertCircle,
  Hash,
  Tag,
  Type,
  User,
  Plus,
  Trash2,
  Edit3,
  CopyPlus,
  Download,
  Upload,
  Search,
  CheckCircle2,
  X,
  Save,
  RefreshCcw,
  Instagram,
  Facebook,
  Twitter,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { processBatch } from "../services/geminiPool";
import { usePlanLimits } from "../hooks/usePlanLimits";
import SystemMessageModal from "./SystemMessageModal";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from "../services/firebase";

interface SocialLink {
  platform: string;
  url: string;
}

interface CreatorProfile {
  id: string;
  name: string;
  brandingKeywords: string[];
  socialLinks: SocialLink[];
  contactInfo: string;
  about?: string;
  defaultDescriptionTemplate: string;
}

interface YoutubeSeoResult {
  titles: string[];
  description: string;
  tags: string[];
  hashtags: string[];
  instagramCaption?: string;
  facebookPost?: string;
  twitterPost?: string;
}

const DEFAULT_PROFILES: CreatorProfile[] = [
  {
    id: "tech-guru-default-id",
    name: "TechGuru Guides",
    brandingKeywords: ["tech tutorials", "software engineering", "how to code", "web development"],
    socialLinks: [{ platform: "Twitter", url: "https://twitter.com/techguruguides" }],
    contactInfo: "collabs@techguruguides.com",
    about: "High-quality software engineering tutorials, web development walkthroughs, and deep dives.",
    defaultDescriptionTemplate: "Welcome to TechGuru Guides! Subscribe for weekly guides.",
  },
];

export const SYSTEM_GENERAL_PROFILE: CreatorProfile = {
  id: "system-general-empty-profile",
  name: "General / Fresh Start",
  brandingKeywords: [],
  socialLinks: [],
  contactInfo: "",
  about: "Start fresh with no templates/brands. Fully custom generation.",
  defaultDescriptionTemplate: "",
};

const YoutubeSeoTool: React.FC = () => {
  const [profiles, setProfiles] = useState<CreatorProfile[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([
    "system-general-empty-profile",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CreatorProfile | null>(null);
  const [showInsufficientTokensModal, setShowInsufficientTokensModal] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ tokens: 0, neededTokens: 0 });
  const [isConfirmDeleteId, setIsConfirmDeleteId] = useState<string | null>(null);
  const [isSelectorDropdownOpen, setIsSelectorDropdownOpen] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [pendingImports, setPendingImports] = useState<CreatorProfile[]>([]);
  const [activeCollision, setActiveCollision] = useState<{
    incoming: CreatorProfile;
    existing: CreatorProfile;
  } | null>(null);

  const [notification, setNotification] = useState<{
    type: "error" | "success" | "warning";
    message: string;
  } | null>(null);

  const [topic, setTopic] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<YoutubeSeoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [activeSocialTab, setActiveSocialTab] = useState<"instagram" | "facebook" | "twitter">("instagram");

  const [newKeywordInput, setNewKeywordInput] = useState("");

  const { checkLimit, consumeLimit, tokens, consumeTokens, rates } = usePlanLimits();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const [user, userLoading] = useAuthState(auth);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Initialize and synchronize profiles with Firestore
  useEffect(() => {
    if (userLoading) return;

    const loadProfiles = async () => {
      setLoadingProfiles(true);
      if (user) {
        const path = `users/${user.uid}/creator_profiles`;
        try {
          const snapshot = await getDocs(
            collection(db, "users", user.uid, "creator_profiles"),
          );
          if (!snapshot.empty) {
            const list: CreatorProfile[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              list.push({
                id: data.id || docSnap.id,
                name: data.name || "Unnamed Creator",
                brandingKeywords: data.brandingKeywords || [],
                socialLinks: data.socialLinks || [],
                contactInfo: data.contactInfo || "",
                about: data.about || "",
                defaultDescriptionTemplate: data.defaultDescriptionTemplate || "",
              });
            });
            setProfiles(list);
          } else {
            const saved = localStorage.getItem("youtube_creator_profiles");
            let localList: CreatorProfile[] = DEFAULT_PROFILES;
            if (saved) {
              try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  localList = parsed;
                }
              } catch (err) {}
            }
            for (const item of localList) {
              await setDoc(doc(db, "users", user.uid, "creator_profiles", item.id), item);
            }
            setProfiles(localList);
          }
        } catch (err) {
          const saved = localStorage.getItem("youtube_creator_profiles");
          let fallbackList = DEFAULT_PROFILES;
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) fallbackList = parsed;
            } catch (jsonErr) {}
          }
          setProfiles(fallbackList);
        } finally {
          setLoadingProfiles(false);
        }
      } else {
        const saved = localStorage.getItem("youtube_creator_profiles");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setProfiles(parsed);
              setLoadingProfiles(false);
              return;
            }
          } catch (err) {}
        }
        setProfiles(DEFAULT_PROFILES);
        setLoadingProfiles(false);
      }
    };

    loadProfiles();
  }, [user, userLoading]);

  const saveProfilesToStorage = (updatedList: CreatorProfile[]) => {
    if (user) {
      profiles.forEach(async (oldProfile) => {
        if (!updatedList.some((p) => p.id === oldProfile.id)) {
          await deleteDoc(doc(db, "users", user.uid, "creator_profiles", oldProfile.id));
        }
      });
      updatedList.forEach(async (profile) => {
        await setDoc(doc(db, "users", user.uid, "creator_profiles", profile.id), profile);
      });
    }
    setProfiles(updatedList);
    localStorage.setItem("youtube_creator_profiles", JSON.stringify(updatedList));
  };

  const toggleProfileSelection = (id: string) => {
    setSelectedProfileIds((prev) => {
      if (id === "system-general-empty-profile") {
        return ["system-general-empty-profile"];
      }
      const filtered = prev.filter((pId) => pId !== "system-general-empty-profile");
      if (filtered.includes(id)) {
        const next = filtered.filter((pId) => pId !== id);
        return next.length === 0 ? ["system-general-empty-profile"] : next;
      } else {
        return [...filtered, id];
      }
    });
  };

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setNotification({ type: "error", message: "Supports images (JPEG/PNG/WEBP)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setUploadedImage(e.target.result as string);
        setNotification({ type: "success", message: "Thumbnail draft loaded for visual scanning." });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (overrideTopic?: string) => {
    const currentTopic = typeof overrideTopic === "string" ? overrideTopic : topic;
    if (!currentTopic.trim() && !uploadedImage) {
      setError("Please provide a video topic or custom transcript context.");
      return;
    }

    const activeProfiles = selectableProfiles.filter((p) => selectedProfileIds.includes(p.id));
    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;

    const seoRate = rates?.youtubeSeo || { system: 45, custom: 2 };
    const neededTokens = isPersonalApi ? seoRate.custom : seoRate.system;

    if (tokens < neededTokens) {
      setTokenInfo({ tokens, neededTokens });
      setShowInsufficientTokensModal(true);
      return;
    }

    const typeKey = isPersonalApi ? "chatDailyPersonalApi" : "chatDailySystemApi";
    if (!checkLimit(typeKey, !!isPersonalApi)) {
      setError("Daily rate limit reached. Upgrade or connect your own API Key.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const results = await processBatch({
        items: [{ topic: currentTopic, profile: activeProfiles[0] || SYSTEM_GENERAL_PROFILE, image: uploadedImage }],
        processItem: async (task, idx, apiKey) => {
          const response = await fetch("/api/youtube-seo", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "x-user-api-key": apiKey } : {}),
            },
            body: JSON.stringify({
              topic: task.topic,
              profile: task.profile,
              image: task.image,
            }),
          });

          if (!response.ok) {
            const txt = await response.text();
            throw new Error(JSON.parse(txt).error || "Failed to generate.");
          }
          return await response.json();
        }
      });

      if (!results[0]) throw new Error("Processing timed out. Please retry.");
      setResult(results[0]);
      await consumeLimit("chat", 1, !!isPersonalApi);
      await consumeTokens(neededTokens, `Generated SEO metadata: "${currentTopic.slice(0, 30)}..."`).catch(() => {});
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during rendering.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchYoutubeTranscript = async () => {
    if (!youtubeUrl.trim()) return;
    setIsFetchingTranscript(true);
    setError(null);

    try {
      const results = await processBatch({
        items: [youtubeUrl],
        processItem: async (url, idx, apiKey) => {
          const response = await fetch("/api/youtube-info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "x-user-api-key": apiKey } : {}),
            },
            body: JSON.stringify({ url }),
          });
          if (!response.ok) throw new Error("No transcription trace found (unsupported video).");
          return await response.json();
        }
      });

      const data = results[0];
      if (!data) throw new Error("Metadata request dropped.");

      let combinedContent = "";
      if (data.title) combinedContent += `Title: ${data.title}\n\n`;
      if (data.transcript) {
        combinedContent += `Transcript:\n${data.transcript}`;
      } else {
        combinedContent += `Description:\n${data.description || ""}`;
      }

      setTopic(combinedContent);
      setNotification({
        type: "success",
        message: data.hasTranscript ? "Transcript imported! Automatically optimizing..." : "Video data loaded.",
      });
      await handleGenerate(combinedContent);
    } catch (err: any) {
      setError(err.message || "Could not retrieve YouTube information.");
    } finally {
      setIsFetchingTranscript(false);
    }
  };

  const handleClearWorkspace = () => {
    setTopic("");
    setYoutubeUrl("");
    setUploadedImage(null);
    setResult(null);
    setError(null);
    setNotification({ type: "success", message: "Workspace cleared." });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus({ ...copyStatus, [key]: true });
    setTimeout(() => setCopyStatus({ ...copyStatus, [key]: false }), 2000);
  };

  const handleAddProfile = () => {
    setEditingProfile({
      id: `profile-${Date.now()}`,
      name: `New Creator ${profiles.length + 1}`,
      brandingKeywords: [],
      socialLinks: [],
      contactInfo: "",
      about: "",
      defaultDescriptionTemplate: "",
    });
    setNewKeywordInput("");
    setIsEditorOpen(true);
  };

  const handleSaveProfile = () => {
    if (!editingProfile) return;
    if (!editingProfile.name.trim()) return;

    const exists = profiles.some((p) => p.id === editingProfile.id);
    const updated = exists
      ? profiles.map((p) => (p.id === editingProfile.id ? editingProfile : p))
      : [...profiles, editingProfile];

    saveProfilesToStorage(updated);
    setSelectedProfileIds([editingProfile.id]);
    setIsEditorOpen(false);
    setEditingProfile(null);
    setNotification({ type: "success", message: `Profile saved.` });
  };

  const handleDuplicateProfile = (p: CreatorProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    const cloned = { ...p, id: `profile-clone-${Date.now()}`, name: `${p.name} (Copy)` };
    saveProfilesToStorage([...profiles, cloned]);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    saveProfilesToStorage(updated);
    setSelectedProfileIds(["system-general-empty-profile"]);
    setIsConfirmDeleteId(null);
  };

  const handleImportFileTrigger = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const validated = parsed.filter((x) => x && typeof x.name === "string");
          if (validated.length > 0) {
            setSelectedProfileIds([validated[0].id]);
            const nextList = [...profiles, ...validated.map(p => ({ ...p, id: p.id || `p-${Date.now()}` }))];
            saveProfilesToStorage(nextList);
            setNotification({ type: "success", message: "Successfully imported." });
          }
        }
      } catch (err) {}
    };
    reader.readAsText(file);
  };

  const handleCollisionResolution = (action: "replace" | "skip" | "copy") => {
    if (!activeCollision) return;
    const { incoming, existing } = activeCollision;
    let updatedList = [...profiles];

    if (action === "replace") {
      updatedList = updatedList.map((p) => (p.id === existing.id ? { ...incoming, id: existing.id } : p));
    } else if (action === "copy") {
      updatedList.push({ ...incoming, id: `clone-${Date.now()}`, name: `${incoming.name} (Copy)` });
    }
    saveProfilesToStorage(updatedList);
    setActiveCollision(null);
  };

  const selectableProfiles = [SYSTEM_GENERAL_PROFILE, ...profiles];
  const activeProfiles = selectableProfiles.filter((p) => selectedProfileIds.includes(p.id));

  const filteredProfiles = selectableProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <SystemMessageModal
        isOpen={showInsufficientTokensModal}
        onClose={() => setShowInsufficientTokensModal(false)}
        onConfirm={() => { window.location.href = "/pricing"; }}
        title="Insufficient Tokens"
        message={`Requires additional tokens. Upgrade plan to generate metadata.`}
        confirmText="Visit Recharge Hub"
        cancelText="Close"
      />

      <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6 md:py-8 font-sans text-[var(--text-primary)] antialiased">
        
        {/* Simplified Header Area */}
        <div className="mb-8 mt-1 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1 text-[var(--text-primary)] flex items-center justify-center sm:justify-start gap-2">
            <Youtube className="text-red-500" size={24} /> YouTube SEO Optimizer
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)]">
            Configure target creator profiles, fetch transcripts, and compile high-CTR description blueprints instantly.
          </p>
        </div>

        {/* Float Toast Notices */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed top-12 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-md border border-[var(--border-default)] bg-[var(--bg-card)] max-w-sm`}
            >
              <AlertCircle size={14} className="text-[var(--accent)]" />
              <p className="text-[11px] font-medium text-[var(--text-primary)]">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="ml-2 text-[var(--text-muted)] hover:text-white">
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6">

          {/* SECTION 1: Channel Profile Selection (Inline selector layout, NO visual boxes) */}
          <div className="py-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-wider font-extrabold text-[var(--text-muted)]">
                Selected Creator Target Profile
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                >
                  <Upload size={12} /> Import
                </button>
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFileTrigger} className="hidden" />
                <button
                  onClick={handleAddProfile}
                  className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer font-bold"
                >
                  <Plus size={12} /> New Profile
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectableProfiles.map((p) => {
                const isSelected = selectedProfileIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProfileSelection(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]"
                        : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    <span>{p.name}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
                    {p.id !== "system-general-empty-profile" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(p.id);
                        }}
                        className="hover:text-red-400 p-0.5"
                      >
                        <X size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: URL IMPORT (Understated elegant design) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube Link to instantly import transcript..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none h-[40px]"
                  onKeyDown={(e) => e.key === "Enter" && handleFetchYoutubeTranscript()}
                />
              </div>
              <button
                onClick={handleFetchYoutubeTranscript}
                disabled={isFetchingTranscript || !youtubeUrl.trim()}
                className="px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-default)] disabled:opacity-50 text-[var(--text-primary)] rounded-lg font-bold text-xs h-[40px] flex items-center justify-center gap-1.5"
              >
                {isFetchingTranscript ? <RefreshCw className="animate-spin" size={13} /> : <Youtube size={13} className="text-red-500" />}
                {isFetchingTranscript ? "Fetching..." : "Fetch & Pre-fill"}
              </button>
            </div>
          </div>

          {/* SECTION 3: Content Title / manual Topic Editor (No outer card wrappers) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[11px] uppercase tracking-wider font-extrabold text-[var(--text-muted)]">
                Video Topic, Draft Outline, or Transcript Trace:
              </label>
              {topic && (
                <button
                  onClick={handleClearWorkspace}
                  className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                >
                  <RefreshCcw size={10} /> Clear Content
                </button>
              )}
            </div>

            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="E.g., enter title, talking points, or copy-paste transcript manually..."
              className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none min-h-[110px] max-h-[300px] resize-y"
            />
          </div>

          {/* SECTION 4: Multimodal Image Uploader Grid */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-[var(--text-muted)]">
              Visual Reference Scan (Optional Thumbnail Draft)
            </label>

            {!uploadedImage ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]); }}
                onClick={() => imageFileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
                  dragActive ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-[var(--border-default)] hover:border-[var(--accent)] bg-[var(--bg-card)]"
                }`}
              >
                <input ref={imageFileInputRef} type="file" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }} className="hidden" />
                <p className="text-[11px] text-[var(--text-muted)]">
                  Drag & Drop draft JPG/PNG here to align metadata with your visual overlays
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-3">
                <div className="relative w-16 h-16 rounded overflow-hidden bg-neutral-900 border border-[var(--border-default)] shrink-0">
                  <img src={uploadedImage} alt="Reference" className="w-full h-full object-contain" />
                  <button onClick={() => setUploadedImage(null)} className="absolute top-0.5 right-0.5 bg-black/75 p-0.5 rounded-full text-white hover:text-red-400">
                    <X size={10} />
                  </button>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1">✓ Reference Scan Ready</h4>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                    AI will automatically analyze style visual branding & text overlays to contextualize tags.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ACTION SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              onClick={() => handleGenerate()}
              disabled={isLoading || (!topic.trim() && !uploadedImage)}
              className="w-full bg-[var(--accent)] hover:opacity-95 disabled:opacity-50 text-white rounded-lg font-bold text-xs py-2.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isLoading ? <RefreshCw className="animate-spin" size={14} /> : (error || result) ? <RefreshCw size={14} /> : <Wand2 size={14} />}
              {isLoading ? "Analyzing & Generating Blueprint..." : (error || result) ? "Retry AI Output" : "Generate AI SEO Material"}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* SECTION 5: AI RESULT BLOCKS (ChatGPT-style output content blocks, absolutely NO double-borders) */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-6 space-y-6"
              >
                {/* Result Title heading */}
                <div className="border-t border-[var(--border-default)] pt-6">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block mb-4">
                    Generated Blueprint
                  </span>

                  {/* CTR Titles List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Type size={14} className="text-blue-400" /> High-Click-Rate Titles
                      </h4>
                      <button
                        onClick={() => copyToClipboard(result.titles.join("\n"), "titles")}
                        className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer font-bold"
                      >
                        {copyStatus.titles ? <Check size={11} /> : <Copy size={11} />}
                        {copyStatus.titles ? "Copied" : "Copy All"}
                      </button>
                    </div>

                    <div className="space-y-1">
                      {result.titles.map((t, idx) => (
                        <div key={idx} className="flex gap-2 items-start text-xs bg-[var(--bg-card)] px-3 py-2 rounded-lg border border-[var(--border-default)]">
                          <span className="text-[var(--text-muted)] font-bold">{idx + 1}.</span>
                          <span className="text-[var(--text-primary)] flex-1">{t}</span>
                          <button onClick={() => copyToClipboard(t, `title-${idx}`)} className="text-[var(--text-muted)] hover:text-white p-0.5">
                            {copyStatus[`title-${idx}`] ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Optimised Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Youtube size={14} className="text-red-500" /> Viral Description Copy
                    </h4>
                    <button
                      onClick={() => copyToClipboard(result.description, "desc")}
                      className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer font-bold"
                    >
                      {copyStatus.desc ? <Check size={11} /> : <Copy size={11} />}
                      {copyStatus.desc ? "Copied" : "Copy Description"}
                    </button>
                  </div>

                  <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg p-3 text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap max-h-[250px] overflow-y-auto custom-scrollbar font-mono">
                    {result.description}
                  </div>
                </div>

                {/* Tags section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Tag size={14} className="text-emerald-400" /> Optimal Tags (Word Format)
                    </h4>
                    <button
                      onClick={() => copyToClipboard(result.tags.join(", "), "tags")}
                      className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer font-bold"
                    >
                      {copyStatus.tags ? <Check size={11} /> : <Copy size={11} />}
                      {copyStatus.tags ? "Copied" : "Copy Word List"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 bg-[var(--bg-card)] border border-[var(--border-default)] p-3 rounded-lg">
                    {result.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 rounded bg-[var(--bg-card-hover)] border border-[var(--border-default)] text-[10px] text-[var(--text-secondary)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Viral Hashtags */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Hash size={14} className="text-purple-400" /> Recommended Hashtags
                    </h4>
                    <button
                      onClick={() => copyToClipboard(result.hashtags.join(" "), "hash")}
                      className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer font-bold"
                    >
                      {copyStatus.hash ? <Check size={11} /> : <Copy size={11} />}
                      {copyStatus.hash ? "Copied" : "Copy Tags"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 bg-[var(--bg-card)] border border-[var(--border-default)] p-3 rounded-lg">
                    {result.hashtags.map((h) => (
                      <span key={h} className="text-xs font-bold text-[var(--accent)]">
                        {h.startsWith("#") ? h : `#${h}`}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cross-channel socials */}
                {(result.instagramCaption || result.facebookPost || result.twitterPost) && (
                  <div className="border-t border-[var(--border-default)] pt-4 space-y-3">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider text-[var(--text-muted)]">
                      Cross-Campaign Social Promo Blocks
                    </h4>

                    {/* Simple Tabs Selection */}
                    <div className="flex gap-2.5 border-b border-[var(--border-default)] pb-2">
                      {result.instagramCaption && (
                        <button
                          onClick={() => setActiveSocialTab("instagram")}
                          className={`text-xs font-semibold py-1 bg-transparent border-0 cursor-pointer flex items-center gap-1 ${
                            activeSocialTab === "instagram" ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)]"
                          }`}
                        >
                          <Instagram size={13} /> Instagram
                        </button>
                      )}
                      {result.facebookPost && (
                        <button
                          onClick={() => setActiveSocialTab("facebook")}
                          className={`text-xs font-semibold py-1 bg-transparent border-0 cursor-pointer flex items-center gap-1 ${
                            activeSocialTab === "facebook" ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)]"
                          }`}
                        >
                          <Facebook size={13} /> Facebook
                        </button>
                      )}
                      {result.twitterPost && (
                        <button
                          onClick={() => setActiveSocialTab("twitter")}
                          className={`text-xs font-semibold py-1 bg-transparent border-0 cursor-pointer flex items-center gap-1 ${
                            activeSocialTab === "twitter" ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)]"
                          }`}
                        >
                          <Twitter size={13} /> Twitter (X)
                        </button>
                      )}
                    </div>

                    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg p-3.5 relative">
                      <button
                        onClick={() => {
                          const promoContent =
                            activeSocialTab === "instagram"
                              ? result.instagramCaption
                              : activeSocialTab === "facebook"
                                ? result.facebookPost
                                : result.twitterPost;
                          copyToClipboard(promoContent || "", "promo");
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-[var(--bg-card-hover)] border border-[var(--border-default)] text-[var(--text-muted)] hover:text-white"
                      >
                        {copyStatus.promo ? <Check size={13} /> : <Copy size={13} />}
                      </button>

                      <p className="text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap pr-10">
                        {activeSocialTab === "instagram"
                          ? result.instagramCaption
                          : activeSocialTab === "facebook"
                            ? result.facebookPost
                            : result.twitterPost}
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RENDER SIMPLE DIALOG EDIT MODAL (No nested decorations) */}
      <AnimatePresence>
        {isEditorOpen && editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 max-w-md w-full space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-default)]">
                <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Create / Edit Persona Profile
                </span>
                <button onClick={() => { setIsEditorOpen(false); setEditingProfile(null); }} className="text-[var(--text-muted)] hover:text-white bg-transparent border-0 cursor-pointer">
                  <X size={15} />
                </button>
              </div>

              {editorError && <p className="text-xs text-rose-400 font-semibold">{editorError}</p>}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Creator / Brand Name</label>
                  <input
                    type="text"
                    value={editingProfile.name}
                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                    className="w-full h-9 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Inquiry Email</label>
                  <input
                    type="email"
                    value={editingProfile.contactInfo}
                    onChange={(e) => setEditingProfile({ ...editingProfile, contactInfo: e.target.value })}
                    className="w-full h-9 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    placeholder="contact@channel.com"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Biographical Background / Niche</label>
                  <textarea
                    value={editingProfile.about || ""}
                    onChange={(e) => setEditingProfile({ ...editingProfile, about: e.target.value })}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg p-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none h-[64px] resize-none"
                    placeholder="E.g. Code walkthroughs, technology guide setups, dev tools deep dives..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Default Persistent CTA Footer</label>
                  <textarea
                    value={editingProfile.defaultDescriptionTemplate}
                    onChange={(e) => setEditingProfile({ ...editingProfile, defaultDescriptionTemplate: e.target.value })}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg p-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none h-[64px] resize-none"
                    placeholder="Subscribe & follow socials!"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => { setIsEditorOpen(false); setEditingProfile(null); }}
                  className="px-3 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 bg-[var(--accent)] hover:opacity-90 text-white font-bold text-xs rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Save size={13} /> Save Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default YoutubeSeoTool;
