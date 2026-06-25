import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Send,
  Paperclip,
  Download,
  X,
  Search,
  MoreVertical,
  Trash2,
  Pin,
  MessageSquare,
  FileText,
  ImageIcon,
  FileCode,
  File,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Wand2,
  Zap,
  Database,
  ArrowUp,
} from "lucide-react";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from "../../services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  limit,
  setDoc,
} from "firebase/firestore";
import { ChatSession, ChatMessage, ChatFile } from "../../types";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { saveAs } from "file-saver";
import { utils, write } from "xlsx";
import { Document, Packer, Paragraph, TextRun } from "docx";
import SystemMessageModal from "../SystemMessageModal";
import ChatMessageItem from "./ChatMessageItem";
import { WebSocketConnectionManager } from "../../services/WebSocketConnectionManager";
import { nanoid } from "nanoid";

import { compressImage } from "../../services/imageService";
import { usePlanLimits } from "../../hooks/usePlanLimits";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const ChatApp: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<ChatFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInsufficientTokensModal, setShowInsufficientTokensModal] =
    useState(false);
  const [isSmartFormat, setIsSmartFormat] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({
    tokens: 0,
    neededTokens: 0,
    isPersonalApi: false,
  });

  // Local Guest States
  const [guestSessions, setGuestSessions] = useState<ChatSession[]>([]);
  const [guestMessages, setGuestMessages] = useState<ChatMessage[]>([]);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getContextualSuggestions = (): { label: string; prompt: string }[] => {
    if (attachedFiles.length === 0) {
      return [
        { label: "💡 Explain math concept", prompt: "Can you explain a complex math concept step-by-step with LaTeX equations?" },
        { label: "📝 Create practice quiz", prompt: "Create a 5-question bilingual practice quiz based on linear equations." },
        { label: "🎓 Homework helper", prompt: "Check if you can help me solve a difficult question step-by-step." },
        { label: "✍️ Write a proof", prompt: "Can you write a clear step-by-step mathematical proof for Pythagoras Theorem?" }
      ];
    }

    const hasImage = attachedFiles.some((f) => f.mimeType?.startsWith("image/"));
    const hasPdf = attachedFiles.some((f) => f.mimeType === "application/pdf" || f.name?.endsWith(".pdf"));
    const hasSpreadsheetOrTable = attachedFiles.some((f) => 
      f.name?.endsWith(".csv") || 
      f.name?.endsWith(".xlsx") || 
      f.name?.endsWith(".xls") || 
      f.mimeType?.includes("csv") || 
      f.mimeType?.includes("sheet") ||
      f.mimeType?.includes("excel")
    );

    if (hasImage) {
      return [
        { label: "🔍 Extract text (OCR)", prompt: "Please extract all the text and math equations from this image exactly as they are." },
        { label: "🧮 Solve math in image", prompt: "Solve the math problem shown in this image and explain each step clearly with formulas." },
        { label: "🖼️ Describe image", prompt: "Describe this image in detail and identify any key structural patterns." },
        { label: "✍️ Transcribe handwriting", prompt: "Transcribe any handwritten notes in this image and format them cleanly." }
      ];
    }

    if (hasSpreadsheetOrTable) {
      return [
        { label: "📊 Summarize table", prompt: "Read the table from the attached file and provide a clean executive summary of the data." },
        { label: "📉 Analyze data trends", prompt: "Can you analyze patterns, anomalies, and key data trends in this spreadsheet?" },
        { label: "🔢 Extract key stats", prompt: "Generate descriptive statistics (sum, average, min, max, count) from this dataset." },
        { label: "⚙️ Pivot overview", prompt: "What are the most significant grouped summaries or pivot-like insights in this file?" }
      ];
    }

    if (hasPdf) {
      return [
        { label: "📄 Summarize document", prompt: "Provide a comprehensive step-by-step summary of this PDF document." },
        { label: "📝 Extract MCQ", prompt: "Can you identify and extract all multiple-choice questions from this PDF, or generate some based on its content?" },
        { label: "🧮 Extract formulas", prompt: "Please list all key mathematical formulas mentioned in this document with LaTeX notation." },
        { label: "📚 Main vocabulary", prompt: "Extract the core vocabulary terms, definitions, and concepts from this PDF." }
      ];
    }

    return [
      { label: "📄 Summarize file", prompt: "Provide an overview and summary of this attached document." },
      { label: "🔍 Quick search", prompt: "What is the primary topic or purpose of the attached file?" },
      { label: "🖊️ Rewrite text", prompt: "Check the attached document and rewrite its main section to be more precise." }
    ];
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auth check using reactive useAuthState hook
  const [user, loading] = useAuthState(auth);

  const {
    limits,
    usage,
    checkLimit,
    consumeLimit,
    tokens,
    consumeTokens,
    rates,
  } = usePlanLimits();

  // Synchronize dynamic lists based on login state
  const currentSessions = user ? sessions : guestSessions;
  const currentMessages = user ? messages : guestMessages;

  // Fetch sessions for logged-in users from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/chats`),
      orderBy("updatedAt", "desc"),
    );

    const path = `users/${user.uid}/chats`;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const sess = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ChatSession,
        );
        setSessions(sess);
        if (sess.length > 0 && !activeSessionId) {
          setActiveSessionId(sess[0].id);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // Fetch messages for active session from Firestore
  useEffect(() => {
    if (!user || !activeSessionId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/chats/${activeSessionId}/messages`),
      orderBy("timestamp", "asc"),
    );

    const path = `users/${user.uid}/chats/${activeSessionId}/messages`;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setMessages(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ChatMessage,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      },
    );

    return () => unsubscribe();
  }, [user, activeSessionId]);

  // Load guest sessions from localStorage
  useEffect(() => {
    if (!user && !loading) {
      const stored = localStorage.getItem("guest_chat_sessions");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ChatSession[];
          setGuestSessions(parsed);
          if (parsed.length > 0 && !activeSessionId) {
            setActiveSessionId(parsed[0].id);
          }
        } catch (e) {
          console.error("Failed to parse guest sessions", e);
        }
      } else {
        setGuestSessions([]);
      }
    }
  }, [user, loading]);

  // Load guest messages from localStorage
  useEffect(() => {
    if (!user && !loading) {
      if (activeSessionId) {
        const stored = localStorage.getItem(
          `guest_chat_messages_${activeSessionId}`,
        );
        if (stored) {
          try {
            setGuestMessages(JSON.parse(stored));
          } catch (e) {
            console.error("Failed to parse guest messages", e);
          }
        } else {
          setGuestMessages([]);
        }
      } else {
        setGuestMessages([]);
      }
    }
  }, [user, activeSessionId, loading]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  const createNewSession = async () => {
    const sessionId = nanoid();

    if (user) {
      const newSession = {
        id: sessionId,
        userId: user.uid,
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
      };
      await setDoc(doc(db, `users/${user.uid}/chats`, sessionId), newSession);
    } else {
      const newSession: ChatSession = {
        id: sessionId,
        userId: "guest",
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
      };
      const updated = [newSession, ...guestSessions];
      setGuestSessions(updated);
      localStorage.setItem("guest_chat_sessions", JSON.stringify(updated));
    }

    setActiveSessionId(sessionId);
    setAttachedFiles([]);
    setInputText("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadProgress(0);
    const newFiles: ChatFile[] = [];

    let currentProgress = 0;
    const progressIncrement = 100 / (files.length * 2);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      currentProgress += progressIncrement;
      setUploadProgress(Math.round(currentProgress));

      let finalBase64 = base64;
      if (file.type.startsWith("image/")) {
        try {
          finalBase64 = await compressImage(base64, 1024, 1024, 0.6);
        } catch (err) {
          console.error("Compression failed", err);
        }
      }

      currentProgress += progressIncrement;
      setUploadProgress(Math.round(currentProgress));

      const chatFile: ChatFile = {
        id: nanoid(),
        name: file.name,
        size: finalBase64.length,
        type: file.type.split("/")[0],
        mimeType: file.type,
        base64: finalBase64,
      };

      if (finalBase64.length > 800000) {
        alert(
          `File "${file.name}" is too large even after compression and might fail to save to history. Only text will be sent.`,
        );
      }

      newFiles.push(chatFile);
    }

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    setTimeout(() => {
      setUploadProgress(null);
    }, 500);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && attachedFiles.length === 0) || isStreaming)
      return;

    const currentInput = inputText;
    const currentFiles = attachedFiles;

    // Quick optimistic UI updates
    setInputText("");
    setIsPreviewMode(false);
    setAttachedFiles([]);
    setIsStreaming(true);

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      targetSessionId = nanoid();
    }
    const messageId = nanoid();
    const userMessage: ChatMessage = {
      id: messageId,
      sessionId: targetSessionId,
      role: "user",
      content: currentInput,
      timestamp: Date.now(),
      ...(currentFiles.length > 0 ? { files: currentFiles } : {}),
    };

    // Optimistically add to UI immediately to unfreeze
    if (user) {
      setMessages((prev) => [...prev, userMessage]);
    } else {
      setGuestMessages((prev) => [...prev, userMessage]);
    }

    // Check Plan Limits
    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;

    // Token limit check
    const chatRate = rates?.chatApp || { system: 15, custom: 1 };
    const neededTokens = isPersonalApi ? chatRate.custom : chatRate.system;
    if (tokens < neededTokens) {
      setIsStreaming(false);
      setInputText(currentInput);
      setAttachedFiles(currentFiles);
      setTokenInfo({ tokens, neededTokens, isPersonalApi: !!isPersonalApi });
      setShowInsufficientTokensModal(true);
      return;
    }

    const typeKey = isPersonalApi
      ? "chatDailyPersonalApi"
      : "chatDailySystemApi";
    if (!checkLimit(typeKey, !!isPersonalApi)) {
      setIsStreaming(false);
      setInputText(currentInput);
      setAttachedFiles(currentFiles);
      alert(
        `Daily limit reached for Whiteboard AI messages (${isPersonalApi ? "Custom" : "System"} API).\nPlease UPGRADE your plan in the Hub.`,
      );
      return;
    }

    const consumptionSuccess = await consumeLimit("chat", 1, !!isPersonalApi);
    if (!consumptionSuccess) {
      setIsStreaming(false);
      setInputText(currentInput);
      setAttachedFiles(currentFiles);
      alert("Failed to verify usage tracking limit. Please try again.");
      return;
    }

    if (!activeSessionId) {
      if (user) {
        const newSession = {
          id: targetSessionId,
          userId: user.uid,
          title: currentInput.slice(0, 30) || "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false,
        };
        setDoc(
          doc(db, `users/${user.uid}/chats`, targetSessionId),
          newSession,
        ).catch((e) => console.error(e));
      } else {
        const newSession: ChatSession = {
          id: targetSessionId,
          userId: "guest",
          title: currentInput.slice(0, 30) || "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false,
        };
        const updated = [newSession, ...guestSessions];
        setGuestSessions(updated);
        localStorage.setItem("guest_chat_sessions", JSON.stringify(updated));
      }
      setActiveSessionId(targetSessionId);
    }

    // Save user message in background
    if (user) {
      setDoc(
        doc(
          db,
          `users/${user.uid}/chats/${targetSessionId}/messages`,
          messageId,
        ),
        userMessage,
      ).catch((err: any) => {
        if (
          err.code === "permission-denied" ||
          (err.message && err.message.includes("size"))
        ) {
          console.warn(
            "Message too large for Firestore, saving without full base64 data",
          );
          const strippedMessage = {
            ...userMessage,
            files: currentFiles.map((f) => ({
              ...f,
              base64: "[REMOVED DUE TO SIZE]",
            })),
          };
          setDoc(
            doc(
              db,
              `users/${user.uid}/chats/${targetSessionId}/messages`,
              messageId,
            ),
            strippedMessage,
          ).catch((e) => console.error(e));
        }
      });
    } else {
      const updatedMsgs = [...guestMessages, userMessage];
      localStorage.setItem(
        `guest_chat_messages_${targetSessionId}`,
        JSON.stringify(updatedMsgs),
      );
    }

    // Update session title in background
    if (user) {
      updateDoc(doc(db, `users/${user.uid}/chats/${targetSessionId}`), {
        title: currentInput.slice(0, 40) || "New Project Chat",
        updatedAt: Date.now(),
      }).catch((e) => console.error(e));
    } else {
      const isFirstMessage = guestMessages.length === 0;
      const updatedSess = guestSessions.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              title: isFirstMessage
                ? currentInput.slice(0, 40) || "Guest Chat"
                : s.title,
              updatedAt: Date.now(),
            }
          : s,
      );
      setGuestSessions(updatedSess);
      localStorage.setItem("guest_chat_sessions", JSON.stringify(updatedSess));
    }

    const streamId = nanoid();
    const streamPlaceholder: ChatMessage = {
      id: streamId,
      sessionId: targetSessionId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      statusText:
        currentFiles.length > 0
          ? "Scanning and processing file attachments..."
          : "Connecting with Gemini AI API Gateway...",
    };

    if (user) {
      setMessages((prev) => [...prev, streamPlaceholder]);
    } else {
      setGuestMessages((prev) => [...prev, streamPlaceholder]);
    }

    try {
      // Strip base64 from historical messages to keep payload small
      const cleanedMessages = [...currentMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userApiKey = localStorage.getItem("active_gemini_api_key");

      let fullText = "";

      await new Promise<void>((resolve, reject) => {
        const updateText = (text: string) => {
          if (user) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: text, statusText: "Typing response..." }
                  : m,
              ),
            );
          } else {
            setGuestMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: text, statusText: "Typing response..." }
                  : m,
              ),
            );
          }
        };

        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}/api/chat/stream-ws`;
        
        let wsManager: WebSocketConnectionManager;
        
        wsManager = new WebSocketConnectionManager(
          wsUrl,
          (type, data) => {
            if (type === "chunk" && data.text) {
              fullText += data.text;
              updateText(fullText);
            } else if (type === "error" && data.error) {
              reject(new Error(data.error));
              wsManager.close();
            } else if (type === "done") {
              resolve();
              wsManager.close();
            }
          },
          () => {
             if (fullText.length === 0) {
                 reject(new Error("WebSocket disconnected unexpectedly."));
             } else {
                 resolve();
             }
          },
          () => {
             if (user) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? { ...m, statusText: "Gemini is drafting your answer..." }
                    : m,
                ),
              );
            } else {
              setGuestMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? { ...m, statusText: "Gemini is drafting your answer..." }
                    : m,
                ),
              );
            }
            wsManager.send({
              type: "start",
              payload: {
                messages: cleanedMessages,
                files: currentFiles,
                userApiKey: userApiKey,
                isSmartFormat: isSmartFormat
              }
            });
          }
        );
        wsManager.connect();
      });

      const assistantMessageId = nanoid();
      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        sessionId: targetSessionId,
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
      };

      if (user) {
        await setDoc(
          doc(
            db,
            `users/${user.uid}/chats/${targetSessionId}/messages`,
            assistantMessageId,
          ),
          assistantMsg,
        );
        // Clean out placeholder
        setMessages((prev) => prev.filter((m) => m.id !== streamId));
      } else {
        const latestMsgs = JSON.parse(
          localStorage.getItem(`guest_chat_messages_${targetSessionId}`) ||
            "[]",
        );
        const finalMsgs = [
          ...latestMsgs.filter((m: ChatMessage) => m.id !== streamId),
          assistantMsg,
        ];
        setGuestMessages(finalMsgs);
        localStorage.setItem(
          `guest_chat_messages_${targetSessionId}`,
          JSON.stringify(finalMsgs),
        );
      }

      // Deduct Veda Tokens ONLY AFTER SUCCESS!
      await consumeTokens(
        neededTokens,
        `Asked Whiteboard AI: "${currentInput.slice(0, 30)}${currentInput.length > 30 ? "..." : ""}"`,
      ).catch((e) => console.error("Token consumption failed", e));
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMsg =
        error?.message ||
        "Gemini encountered a connection limit or network error. Please retry.";
      if (user) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  content: `⚠️ **Error:** ${errorMsg}`,
                  isStreaming: false,
                  statusText: undefined,
                }
              : m,
          ),
        );
      } else {
        setGuestMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  content: `⚠️ **Error:** ${errorMsg}`,
                  isStreaming: false,
                  statusText: undefined,
                }
              : m,
          ),
        );
        const latestMsgs = JSON.parse(
          localStorage.getItem(`guest_chat_messages_${targetSessionId}`) ||
            "[]",
        );
        const errorMsgObj: ChatMessage = {
          id: streamId,
          sessionId: targetSessionId,
          role: "assistant",
          content: `⚠️ **Error:** ${errorMsg}`,
          timestamp: Date.now(),
          isStreaming: false,
        };
        const finalMsgs = [
          ...latestMsgs.filter((m: ChatMessage) => m.id !== streamId),
          errorMsgObj,
        ];
        setGuestMessages(finalMsgs);
        localStorage.setItem(
          `guest_chat_messages_${targetSessionId}`,
          JSON.stringify(finalMsgs),
        );
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const editAndRegenerate = async (messageId: string, newContent: string) => {
    if (isStreaming || !activeSessionId) return;

    setIsStreaming(true);

    const currentMessages = user ? messages : guestMessages;
    const idx = currentMessages.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      setIsStreaming(false);
      return;
    }

    const originalMessage = currentMessages[idx];
    const editedMessage: ChatMessage = {
      ...originalMessage,
      content: newContent,
      timestamp: Date.now(),
    };

    // Slice history up to and including the updated message, removing all subsequent ones.
    const precedingMessages = currentMessages.slice(0, idx);
    const updatedHistory = [...precedingMessages, editedMessage];
    const subsequentMessages = currentMessages.slice(idx + 1);

    // Optimistically update memory state
    if (user) {
      setMessages(updatedHistory);
    } else {
      setGuestMessages(updatedHistory);
    }

    // Check Plan Limits
    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;

    // Token limit check
    const chatRate = rates?.chatApp || { system: 15, custom: 1 };
    const neededTokens = isPersonalApi ? chatRate.custom : chatRate.system;
    if (tokens < neededTokens) {
      setIsStreaming(false);
      // Revert optimism if token check fails
      if (user) {
        setMessages(currentMessages);
      } else {
        setGuestMessages(currentMessages);
      }
      setTokenInfo({ tokens, neededTokens, isPersonalApi: !!isPersonalApi });
      setShowInsufficientTokensModal(true);
      return;
    }

    const typeKey = isPersonalApi
      ? "chatDailyPersonalApi"
      : "chatDailySystemApi";
    if (!checkLimit(typeKey, !!isPersonalApi)) {
      setIsStreaming(false);
      // Revert optimism
      if (user) {
        setMessages(currentMessages);
      } else {
        setGuestMessages(currentMessages);
      }
      alert(
        `Daily limit reached for Whiteboard AI messages (${isPersonalApi ? "Custom" : "System"} API).\nPlease UPGRADE your plan in the Hub.`,
      );
      return;
    }

    const consumptionSuccess = await consumeLimit("chat", 1, !!isPersonalApi);
    if (!consumptionSuccess) {
      setIsStreaming(false);
      // Revert optimism
      if (user) {
        setMessages(currentMessages);
      } else {
        setGuestMessages(currentMessages);
      }
      alert("Failed to verify usage tracking limit. Please try again.");
      return;
    }

    // Persist subsequent message deletions and edited message updates
    if (user) {
      try {
        // Delete subsequent messages from Firestore
        for (const msg of subsequentMessages) {
          await deleteDoc(
            doc(db, `users/${user.uid}/chats/${activeSessionId}/messages`, msg.id)
          );
        }
        // Save the edited message to Firestore
        await setDoc(
          doc(db, `users/${user.uid}/chats/${activeSessionId}/messages`, messageId),
          editedMessage
        );
      } catch (e) {
        console.error("Firestore persistence error during edit:", e);
      }
    } else {
      localStorage.setItem(
        `guest_chat_messages_${activeSessionId}`,
        JSON.stringify(updatedHistory)
      );
    }

    const streamId = nanoid();
    const streamPlaceholder: ChatMessage = {
      id: streamId,
      sessionId: activeSessionId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      statusText:
        editedMessage.files && editedMessage.files.length > 0
          ? "Scanning and processing file attachments..."
          : "Connecting with Gemini AI API Gateway...",
    };

    if (user) {
      setMessages((prev) => [...prev, streamPlaceholder]);
    } else {
      setGuestMessages((prev) => [...prev, streamPlaceholder]);
    }

    try {
      // Build session context using the clean history
      const cleanedMessages = updatedHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userApiKey = localStorage.getItem("active_gemini_api_key");
      let fullText = "";

      await new Promise<void>((resolve, reject) => {
        const updateText = (text: string) => {
          if (user) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: text, statusText: "Typing response..." }
                  : m
              )
            );
          } else {
            setGuestMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: text, statusText: "Typing response..." }
                  : m
              )
            );
          }
        };

        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}/api/chat/stream-ws`;

        let wsManager: WebSocketConnectionManager;

        wsManager = new WebSocketConnectionManager(
          wsUrl,
          (type, data) => {
            if (type === "chunk" && data.text) {
              fullText += data.text;
              updateText(fullText);
            } else if (type === "error" && data.error) {
              reject(new Error(data.error));
              wsManager.close();
            } else if (type === "done") {
              resolve();
              wsManager.close();
            }
          },
          () => {
            if (fullText.length === 0) {
              reject(new Error("WebSocket disconnected unexpectedly."));
            } else {
              resolve();
            }
          },
          () => {
            if (user) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? { ...m, statusText: "Gemini is drafting your answer..." }
                    : m
                )
              );
            } else {
              setGuestMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? { ...m, statusText: "Gemini is drafting your answer..." }
                    : m
                )
              );
            }
            wsManager.send({
              type: "start",
              payload: {
                messages: cleanedMessages,
                files: editedMessage.files || [],
                userApiKey: userApiKey,
              },
            });
          }
        );
        wsManager.connect();
      });

      const assistantMessageId = nanoid();
      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        sessionId: activeSessionId,
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
      };

      if (user) {
        await setDoc(
          doc(
            db,
            `users/${user.uid}/chats/${activeSessionId}/messages`,
            assistantMessageId
          ),
          assistantMsg
        );
        setMessages((prev) => prev.filter((m) => m.id !== streamId));
      } else {
        const latestMsgs = JSON.parse(
          localStorage.getItem(`guest_chat_messages_${activeSessionId}`) || "[]"
        );
        const finalMsgs = [
          ...latestMsgs.filter((m: ChatMessage) => m.id !== streamId),
          assistantMsg,
        ];
        setGuestMessages(finalMsgs);
        localStorage.setItem(
          `guest_chat_messages_${activeSessionId}`,
          JSON.stringify(finalMsgs)
        );
      }

      await consumeTokens(
        neededTokens,
        `Asked Whiteboard AI (Edited): "${newContent.slice(0, 30)}${newContent.length > 30 ? "..." : ""}"`
      ).catch((e) => console.error("Token consumption failed", e));

    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMsg =
        error?.message ||
        "Gemini encountered a connection limit or network error. Please retry.";
      if (user) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  content: `⚠️ **Error:** ${errorMsg}`,
                  isStreaming: false,
                  statusText: undefined,
                }
              : m
          )
        );
      } else {
        setGuestMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  content: `⚠️ **Error:** ${errorMsg}`,
                  isStreaming: false,
                  statusText: undefined,
                }
              : m
          )
        );
        const latestMsgs = JSON.parse(
          localStorage.getItem(`guest_chat_messages_${activeSessionId}`) || "[]"
        );
        const errorMsgObj: ChatMessage = {
          id: streamId,
          sessionId: activeSessionId,
          role: "assistant",
          content: `⚠️ **Error:** ${errorMsg}`,
          timestamp: Date.now(),
          isStreaming: false,
        };
        const finalMsgs = [
          ...latestMsgs.filter((m: ChatMessage) => m.id !== streamId),
          errorMsgObj,
        ];
        setGuestMessages(finalMsgs);
        localStorage.setItem(
          `guest_chat_messages_${activeSessionId}`,
          JSON.stringify(finalMsgs)
        );
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (confirm("Are you sure you want to delete this chat?")) {
      if (user) {
        await deleteDoc(doc(db, `users/${user.uid}/chats/${id}`));
      } else {
        const updated = guestSessions.filter((s) => s.id !== id);
        setGuestSessions(updated);
        localStorage.setItem("guest_chat_sessions", JSON.stringify(updated));
        localStorage.removeItem(`guest_chat_messages_${id}`);
      }
      if (activeSessionId === id) setActiveSessionId(null);
    }
  };

  const exportChat = async (
    format: "txt" | "json" | "csv" | "docx" | "xlsx",
  ) => {
    if (messages.length === 0) {
      alert("No messages to export");
      return;
    }

    const activeMessages = messages;
    const session = sessions.find((s) => s.id === activeSessionId);
    const sanitizedTitle =
      session?.title.replace(/[^a-z0-9]/gi, "_") || "History";
    const fileName = `Chat_${sanitizedTitle}_${new Date().toISOString().split("T")[0]}`;

    try {
      switch (format) {
        case "txt":
          const txtContent = activeMessages
            .map(
              (m) =>
                `${m.role.toUpperCase()} [${new Date(m.timestamp).toLocaleString()}]:\n${m.content}`,
            )
            .join("\n\n" + "-".repeat(40) + "\n\n");
          saveAs(
            new Blob([txtContent], { type: "text/plain;charset=utf-8" }),
            `${fileName}.txt`,
          );
          break;
        case "json":
          saveAs(
            new Blob([JSON.stringify(activeMessages, null, 2)], {
              type: "application/json;charset=utf-8",
            }),
            `${fileName}.json`,
          );
          break;
        case "csv":
          const headers = ["Role", "Content", "Timestamp", "Time"];
          const rows = activeMessages.map((m) => [
            m.role,
            m.content.replace(/"/g, '""'),
            m.timestamp.toString(),
            new Date(m.timestamp).toLocaleString(),
          ]);
          const csvLines = [
            headers.join(","),
            ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
          ];
          saveAs(
            new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8" }),
            `${fileName}.csv`,
          );
          break;
        case "xlsx":
          const ws = utils.json_to_sheet(
            activeMessages.map((m) => ({
              Role: m.role,
              Content: m.content,
              Timestamp: m.timestamp,
              Time: new Date(m.timestamp).toLocaleString(),
            })),
          );
          const wb = utils.book_new();
          utils.book_append_sheet(wb, ws, "Chat History");
          const xlsxBuffer = write(wb, { bookType: "xlsx", type: "array" });
          saveAs(
            new Blob([xlsxBuffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
            `${fileName}.xlsx`,
          );
          break;
        case "docx":
          const sections = [];
          for (const m of activeMessages) {
            sections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${m.role.toUpperCase()} - ${new Date(m.timestamp).toLocaleString()}`,
                    bold: true,
                    color: m.role === "user" ? "FF6B2B" : "10B981",
                    size: 24,
                  }),
                ],
                spacing: { before: 400, after: 200 },
              }),
              new Paragraph({
                children: [new TextRun({ text: m.content, size: 22 })],
                spacing: { after: 200 },
              }),
            );
          }
          const docStructure = new Document({
            sections: [{ children: sections }],
          });
          const docxBlob = await Packer.toBlob(docStructure);
          saveAs(docxBlob, `${fileName}.docx`);
          break;
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export chat. Please try again.");
    }
  };

  const filteredSessions = currentSessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      currentMessages.some(
        (m) =>
          m.sessionId === s.id &&
          m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  return (
    <div className="flex h-full w-full bg-[#09090B] text-slate-200 font-sans relative overflow-hidden">
      <SystemMessageModal
        isOpen={showInsufficientTokensModal}
        onClose={() => setShowInsufficientTokensModal(false)}
        onConfirm={() => {
          window.location.href = "/pricing";
        }}
        title="Insufficient Whiteboard Tokens!"
        message={`You have ${tokenInfo.tokens} Whiteboard Tokens left, but Whiteboard AI replies require ${tokenInfo.neededTokens} Tokens on the ${tokenInfo.isPersonalApi ? "Custom" : "System"} API.\n\nWould you like to top up your token wallet in the Recharge Hub?`}
        confirmText="Visit Recharge Hub"
        cancelText="Close"
      />
      {/* Mobile Backdrop for sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed md:hidden top-[64px] bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed top-[64px] bottom-0 left-0 z-50 md:relative md:top-auto md:bottom-auto md:left-auto md:z-10 w-[280px] md:w-[260px] border-r border-[#1e1e24] bg-[#0c0c0e] flex flex-col overflow-hidden  md: md:h-full md:border-t-0 border-t border-[#1e1e24]"
          >
            <div className="p-1 border-b border-[#1e1e24] flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[#EFEFEF] flex items-center gap-2 tracking-[0.5px]">
                <span className="rounded-[3px]">
                  <div className="w-7 h-7 rounded-[8px] bg-[#FF6B2B]/10 flex items-center justify-center text-[#FF6B2B]">
                    <MessageSquare size={16} />
                  </div>
                </span>
                History
              </h2>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 hover:bg-[#1A1A1A] rounded-[8px] text-[#555555] hover:text-[#EFEFEF] transition-colors block md:hidden"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-1">
              <button
                onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#FF6B2B] hover:opacity-90 text-[#EFEFEF] rounded-xl font-bold text-[13px] transition-all shadow-md shadow-[#FF6B2B]/20 active:scale-95"
              >
                <Plus size={18} />
                New Chat
              </button>
            </div>

            <div className="px-1 pb-1">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-[30px] pr-[4px] pt-[8px] pb-[8px] bg-[#121214] border border-[#2e2e34] rounded-lg text-[13px] focus:outline-none focus:border-[#FF6B2B]/50 transition-all text-[#EFEFEF] placeholder:text-[#555555]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1 pb-1 space-y-1 custom-scrollbar">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    if (window.innerWidth < 768) {
                      setIsSidebarOpen(false);
                    }
                  }}
                  className={`group relative flex flex-col gap-1 p-1 rounded-xl cursor-pointer transition-all ${
                    activeSessionId === session.id
                      ? "bg-[#18181b] text-[#EFEFEF] border border-[#2e2e34]"
                      : "hover:bg-[#121214] text-[#888888] hover:text-[#EFEFEF] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      size={14}
                      className={
                        activeSessionId === session.id
                          ? "text-[#FF6B2B]"
                          : "text-[#555555]"
                      }
                    />
                    <p className="text-[13px] font-medium truncate flex-1 leading-none text-slate-200">
                      {session.title}
                    </p>
                  </div>
                  <p className="text-[10px] text-[#555555] font-medium pl-2">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded-lg text-[#555555] hover:text-red-400 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#09090B] h-full w-full">
        <header className="h-[56px] border border-solid border-[#1e1e24] rounded-[5px] bg-[#09090B]/90 backdrop-blur-md flex items-center justify-between px-1 sm:px-2 shrink-0 z-10 font-sans">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/hub")}
              className="p-1 hover:bg-[#1e1e24] rounded-lg text-[#888888] hover:text-[#FF6B2B] border border-transparent hover:border-[#FF6B2B]/20 transition-all flex items-center justify-center shrink-0"
              title="Back to Desktop Hub"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          
          <div className="flex items-center pr-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <span className="text-[13px] font-medium text-[#888888] group-hover:text-[#EFEFEF] transition-colors">Smart Format</span>
              <div 
                className={`w-[40px] h-[20px] rounded-full p-[2px] transition-colors ${isSmartFormat ? 'bg-[#FF6B2B]' : 'bg-[#2E2E34]'}`}
                onClick={(e) => { e.preventDefault(); setIsSmartFormat(!isSmartFormat); }}
              >
                <div className={`w-[16px] h-[16px] bg-[#EFEFEF] rounded-full transition-transform ${isSmartFormat ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </div>
            </label>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#212121] custom-scrollbar scroll-smooth">
          <div className="mx-auto sm:px-1 py-1 md:py-3 pb-2 space-y-6 px-1">
            {currentMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center mt-2 md:mt-5 text-center px-1">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-16 h-16 bg-transparent rounded-full flex items-center justify-center text-black mb-2 "
                >
                  <Wand2 size={32} />
                </motion.div>
                <h2 className="text-[28px] md:text-[32px] font-semibold text-[#EFEFEF] mb-1">
                  How can I help you today?
                </h2>
                {!user && (
                  <div className="flex items-center gap-2 mb-1 px-1 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                    <p className="text-[12px] font-medium text-yellow-500">
                      Guest Mode (Sync Disabled)
                    </p>
                  </div>
                )}
                <p className="text-[#888888] max-w-sm mb-5 text-[14px] md:text-[15px] leading-relaxed">
                  Advanced reasoning, document analysis, and natural
                  conversations powered by Whiteboard AI.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl px-1">
                  <button
                    onClick={() =>
                      setInputText(
                        "Explain quantum mechanics in 3 simple bullet points",
                      )
                    }
                    className="p-1 bg-[#2f2f32] border border-transparent rounded-2xl text-left hover:bg-[#3b3b3e] transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1 bg-purple-500/20 text-purple-300 rounded-md">
                        <Zap size={14} />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-200">
                        Physics
                      </p>
                    </div>
                    <p className="text-[13px] text-[#888888] group-hover:text-[#888888] transition-colors">
                      Quantum mechanics overview
                    </p>
                  </button>
                  <button
                    onClick={() =>
                      setInputText(
                        "Write a React hook for managing localStorage",
                      )
                    }
                    className="p-1 bg-[#2f2f32] border border-transparent rounded-2xl text-left hover:bg-[#3b3b3e] transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1 bg-blue-500/20 text-blue-300 rounded-md">
                        <FileCode size={14} />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-200">
                        Coding
                      </p>
                    </div>
                    <p className="text-[13px] text-[#888888] group-hover:text-[#888888] transition-colors">
                      React hook for localStorage
                    </p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl w-full mx-auto flex flex-col items-center">
                {currentMessages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    onEditSubmit={editAndRegenerate}
                    isStreamingAll={isStreaming}
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        <div className="w-full px-1 sm:px-1 pb-1 pt-1 md:pb-2 bg-[#212121] shrink-0 z-10">
          <div className="max-w-3xl mx-auto">
            {/* Quick Actions horizontal scrollable chips */}
            {(() => {
              const suggestions = getContextualSuggestions();
              if (suggestions.length === 0) return null;
              return (
                <div 
                  className="flex items-center gap-2 overflow-x-auto pb-2 px-1 scrollbar-none w-full select-none" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="flex gap-2 flex-nowrap py-1">
                    {suggestions.map((s, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setInputText(s.prompt);
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                            // Auto scroll height recalculation
                            textareaRef.current.style.height = "auto";
                            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2f2f32] hover:bg-[#3d3d42] border border-[#3e3e44] active:border-[#6366F1] hover:text-white text-slate-300 rounded-full text-xs font-semibold cursor-pointer shrink-0 transition-all shadow-sm active:scale-95 animate-fade-in"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="bg-[#2f2f32] border border-[#2e2e34] rounded-[5px]  p-1 pb-1 md:p-1 md:pb-1 flex flex-col gap-1 relative focus-within:ring-2 focus-within:ring-white/20 transition-all">
              {/* Write/Preview Switcher Bar */}
              <div className="flex items-center justify-between border-b border-[#1e1e24] pb-1 px-1 mb-1">
                <div className="flex items-center gap-1 bg-[#1e1e24] p-0.5 rounded-[5px]">
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(false)}
                    className={`text-[12px] px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
                      !isPreviewMode
                        ? "bg-[#2f2f32] text-white"
                        : "text-[#888888] hover:text-slate-200"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(true)}
                    className={`text-[12px] px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
                      isPreviewMode
                        ? "bg-[#2f2f32] text-white"
                        : "text-[#888888] hover:text-slate-200"
                    }`}
                  >
                    Preview
                  </button>
                </div>
                {isPreviewMode && (
                  <span className="text-[10px] text-slate-400 font-medium px-1 select-none">
                    Markdown Preview
                  </span>
                )}
              </div>

              {(attachedFiles.length > 0 || uploadProgress !== null) && (
                <div className="flex flex-wrap gap-2 px-1 pt-1 border-b border-[#1e1e24] pb-1 mb-1">
                  {attachedFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="group relative flex flex-col items-center justify-center p-1 bg-[#1e1e24] border border-[#2e2e34] rounded-lg text-[#888888] min-w-[60px] h-[60px]"
                    >
                      {file.mimeType.startsWith("image/") ? (
                        <img
                          src={file.base64}
                          alt={file.name}
                          className="w-full h-full object-cover rounded-md"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full rounded-md bg-[#2a2a30]">
                          <FileText size={16} className="text-[#888888] mb-1" />
                          <span className="truncate max-w-[50px] text-[8px] font-medium px-1">
                            {file.name}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() =>
                          setAttachedFiles((prev) =>
                            prev.filter((f) => f.id !== file.id),
                          )
                        }
                        className="absolute -top-1.5 -right-1.5 p-1 bg-[#2e2e34] text-[#888888] hover:text-[#EFEFEF] transition-all rounded-full border border-[#1e1e24]"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}

                  {uploadProgress !== null && (
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center justify-center p-1 bg-[#1e1e24] border border-[#2e2e34] rounded-lg text-[#888888] min-w-[60px] h-[60px]"
                    >
                      <div className="w-6 h-6 border-[#252525] border-slate-600 border-t-[#FF6B2B] rounded-full animate-spin mb-1"></div>
                      <div className="text-[10px] font-mono text-[#888888]">
                        {uploadProgress}%
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              <div className="flex items-end gap-2 relative z-10 px-1 py-1">
                <div className="shrink-0 mb-1 rounded-full bg-slate-700/50 hover:bg-slate-600/50 transition-colors">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 md:p-1 text-[#888888] transition-all flex items-center justify-center rounded-full"
                    title="Attach files"
                  >
                    <Plus size={18} strokeWidth={2.5} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                  />
                </div>

                {isPreviewMode ? (
                  <div
                    className="flex-1 pl-[9px] pt-[10px] pb-[10px] pr-[10px] ml-0 text-slate-200 text-[14px] md:text-[15px] custom-scrollbar overflow-y-auto w-full min-w-0"
                    style={{ minHeight: "36px", maxHeight: "200px" }}
                  >
                    {inputText.trim() ? (
                      <div className="prose prose-invert prose-sm max-w-none text-slate-200 leading-[1.6]">
                        <Markdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
                        >
                          {inputText}
                        </Markdown>
                      </div>
                    ) : (
                      <span className="text-[#555555] italic">Nothing to preview. Type something...</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Message Whiteboard AI..."
                    className="flex-1 bg-transparent border-0 border-none rounded-none pl-[9px] pt-[10px] pb-[10px] pr-[60px] ml-0 focus:outline-none text-slate-200 placeholder:text-[#555555] resize-none max-h-[200px] leading-[1.4] text-[14px] md:text-[15px] custom-scrollbar overflow-y-auto w-full min-w-0"
                    rows={1}
                    style={{ minHeight: "36px" }}
                  />
                )}

                <div className="shrink-0 mb-1 flex items-center">
                  <button
                    onClick={sendMessage}
                    disabled={
                      (!inputText.trim() && attachedFiles.length === 0) ||
                      isStreaming ||
                      uploadProgress !== null
                    }
                    className={`border border-white rounded-[5px] bg-[#ff6b2b] pl-[10px] pt-[8px] pr-[10px] pb-[6px] text-[12px] font-bold leading-[16.5px] transition-all active:scale-95 flex items-center justify-center ${
                      (inputText.trim() || attachedFiles.length > 0) &&
                      uploadProgress === null
                        ? "text-white"
                        : "bg-transparent/5 text-[#555555] cursor-not-allowed"
                    }`}
                  >
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-[11px] text-[#555555] mt-1 font-medium select-none hidden md:block">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;
