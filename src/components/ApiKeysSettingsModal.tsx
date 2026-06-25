import React, { useState, useEffect } from "react";
import { X, Key, Info, Trash2, ShieldCheck, Globe, Lock } from "lucide-react";
import { db } from "../services/firebase";
import {
  collection,
  doc,
  query,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ApiKey } from "../types";
import { User } from "firebase/auth";

interface ApiKeysSettingsModalProps {
  user: User;
  onClose: () => void;
}

const ApiKeysSettingsModal: React.FC<ApiKeysSettingsModalProps> = ({
  user,
  onClose,
}) => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchKeys();
  }, [user]);

  const fetchKeys = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "users", user.uid, "apiKeys"));
      const snapshot = await getDocs(q);
      const fetchedKeys: ApiKey[] = [];
      snapshot.forEach((doc) => {
        fetchedKeys.push(doc.data() as ApiKey);
      });
      // Sort by latest
      fetchedKeys.sort((a, b) => b.createdAt - a.createdAt);
      setKeys(fetchedKeys);

      // Auto-set first key to local storage active key if not set
      if (fetchedKeys.length > 0) {
        localStorage.setItem("active_gemini_api_key", fetchedKeys[0].keyValue);
      } else {
        localStorage.removeItem("active_gemini_api_key");
      }
    } catch (e) {
      console.error("Failed to fetch API keys", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || !newKeyValue.trim()) {
      setError("Please provide both name and key value.");
      return;
    }
    if (!newKeyValue.startsWith("AIza") && !newKeyValue.startsWith("AQ.")) {
      setError("Please provide a valid Gemini API key (starts with AIza or AQ.).");
      return;
    }

    setAdding(true);
    setError("");

    try {
      const keyId = crypto.randomUUID();
      const newKey: ApiKey = {
        id: keyId,
        userId: user.uid,
        keyName: newKeyName.trim(),
        keyValue: newKeyValue.trim(),
        isShared,
        createdAt: Date.now(),
      };

      // Save to shared pool if checked (we validate on server first)
      if (isShared) {
        const resp = await fetch("/api/keys/add-donated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyName: newKeyName.trim() || "Donated Key",
            keyValue: newKeyValue.trim(),
            userId: user.uid
          }),
        });
        if (!resp.ok) {
          const resJson = await resp.json();
          throw new Error(resJson.error || "Key validation failed.");
        }
        const data = await resp.json();
        if (data.success) {
          // Save valid key to user's profile list as well
          await setDoc(doc(db, "users", user.uid, "apiKeys", data.keyId), {
            id: data.keyId,
            userId: user.uid,
            keyName: newKeyName.trim(),
            keyValue: newKeyValue.trim(),
            isShared: true,
            createdAt: Date.now()
          });
        }
      } else {
        // Save only to user's profile if not shared
        await setDoc(doc(db, "users", user.uid, "apiKeys", keyId), newKey);
      }

      setNewKeyName("");
      setNewKeyValue("");
      setIsShared(false);
      fetchKeys(); // Refresh list
    } catch (e: any) {
      console.error("Error adding key", e);
      setError(e.message || "Failed to add API key. Please check permissions.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    try {
      await deleteDoc(doc(db, "users", user.uid, "apiKeys", key.id));
      if (key.isShared) {
        try {
          await deleteDoc(doc(db, "shared_api_keys", key.id));
        } catch (e) {
          console.warn(
            "Could not delete from shared_api_keys, might be permissions",
            e,
          );
        }
      }

      const currentActive = localStorage.getItem("active_gemini_api_key");
      if (currentActive === key.keyValue) {
        localStorage.removeItem("active_gemini_api_key");
      }

      fetchKeys();
    } catch (e: any) {
      console.error("Delete failed", e);
      alert("Failed to delete key: " + (e.message || ""));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-1">
      <div className="bg-[#111111] border border-[#252525] rounded-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-1 border-b border-[#252525]">
          <div className="flex items-center gap-2">
            <Key className="text-[#FF6B2B] w-5 h-5" />
            <h2 className="text-[#EFEFEF] font-bold tracking-wide uppercase text-[13px]">
              Gemini API Keys
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#555555] hover:text-[#EFEFEF] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-1 md:p-2 overflow-y-auto custom-scrollbar">
          {/* Info Card */}
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-1 mb-2">
            <div className="flex gap-3">
              <Info className="text-blue-400 w-5 h-5 shrink-0" />
              <div className="text-[13px] text-[#AAAAAA] flex flex-col gap-2">
                <p>
                  <strong className="text-[#EFEFEF]">
                    Use your own Gemini API Key
                  </strong>{" "}
                  to process documents for free and bypass usage limits. Your
                  key will be securely saved in your profile.
                </p>
                <p>
                  <strong className="text-green-400">Public Sharing:</strong> If
                  you choose to share your key, it will be added to the public
                  pool so other users can benefit from it. Shared keys help keep
                  the application free for everyone!
                </p>
                <p>
                  You can get a Gemini API key for free from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#FF6B2B] hover:underline"
                  >
                    Google AI Studio
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* Add Key Form */}
          <form
            onSubmit={handleAddKey}
            className="flex flex-col gap-4 mb-3 pb-3 border-b border-[#252525]"
          >
            <h3 className="text-[#EFEFEF] font-semibold text-[13px]">
              Add New API Key
            </h3>

            {error && (
              <div className="text-red-400 text-[11px] bg-red-400/10 p-1 rounded border border-red-400/20">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                  Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. My Personal Key"
                  className="bg-[#1A1A1A] border border-[#333333] rounded px-1 py-1 text-[13px] text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                  API Key
                </label>
                <input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-[#1A1A1A] border border-[#333333] rounded px-1 py-1 text-[13px] text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] transition-colors"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group w-fit">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isShared
                      ? "bg-[#FF6B2B] border-[#FF6B2B]"
                      : "bg-[#1A1A1A] border-[#333333] group-hover:border-[#555]"
                  }`}
                >
                  {isShared && (
                    <ShieldCheck size={14} className="text-[#EFEFEF]" />
                  )}
                </div>
              </div>
              <span className="text-[13px] font-medium text-[#EFEFEF] group-hover:text-[#EFEFEF] transition-colors">
                Share this API key publicly (Donate to pool)
              </span>
            </label>

            <button
              type="submit"
              disabled={adding}
              className="mt-1 w-full md:w-auto self-start px-2 py-1 bg-transparent text-black font-bold text-[13px] rounded hover:bg-[#EFEFEF] transition-colors disabled:opacity-50"
            >
              {adding ? "Saving..." : "Save API Key"}
            </button>
          </form>

          {/* Key List */}
          <div>
            <h3 className="text-[#EFEFEF] font-semibold text-[13px] mb-1">
              Your Saved API Keys
            </h3>

            {loading ? (
              <div className="text-[13px] text-[#555555]">Loading keys...</div>
            ) : keys.length === 0 ? (
              <div className="text-[13px] text-[#555555] bg-[#1A1A1A] p-1 rounded-lg border border-[#252525] text-center">
                You haven't added any API keys yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-1 flex items-center justify-between group"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#EFEFEF] font-medium text-[13px]">
                          {key.keyName}
                        </span>
                        {key.isShared ? (
                          <span className="bg-green-500/10 text-green-400 text-[10px] uppercase font-bold px-1 py-1 rounded flex items-center gap-1">
                            <Globe size={10} /> Shared
                          </span>
                        ) : (
                          <span className="bg-blue-500/10 text-blue-400 text-[10px] uppercase font-bold px-1 py-1 rounded flex items-center gap-1">
                            <Lock size={10} /> Private
                          </span>
                        )}
                        {keys[0].id === key.id && (
                          <span className="bg-[#FF6B2B]/10 text-[#FF6B2B] text-[10px] uppercase font-bold px-1 py-1 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#555555] font-mono">
                        {key.keyValue.substring(0, 10)}...
                        {key.keyValue.substring(key.keyValue.length - 4)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteKey(key)}
                      className="p-1 text-[#555555] hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Key"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeysSettingsModal;
