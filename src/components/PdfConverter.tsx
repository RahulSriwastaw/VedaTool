import React, { useState, useEffect, useRef } from "react";
import {
  FileDown,
  RefreshCw,
  Wand2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Filter,
  Settings,
  Layout,
  Clock,
  Plus,
  ListChecks,
  Zap,
  Type,
  Info,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import FileUploader from "./FileUploader";
import SystemMessageModal from "./SystemMessageModal";
import ProcessingList from "./ProcessingList";
import HistorySidebar from "./HistorySidebar";
import {
  AppState,
  ScannedPage,
  NumberingStyle,
  OptionArrangement,
  HistoryItem,
} from "../types";
import {
  convertPdfToImages,
  readFileAsBase64,
  cropImage,
} from "../services/pdfUtils";
import { extractLayoutFromImage } from "../services/geminiService";
import { processBatch } from "../services/geminiPool";
import { generateDocx } from "../services/docxService";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from "../services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { signInWithGoogle } from "../services/googleAuth";
import { usePlanLimits } from "../hooks/usePlanLimits";

// Fallback UUID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

interface BatchPage {
  id: string;
  pageNumber: number;
  imageUrl: string;
  status: "pending" | "processing" | "completed" | "failed";
  statusText: string;
  elements?: any[];
  expanded?: boolean;
}

interface BatchItem {
  id: string;
  file: File;
  name: string;
  progress: number;
  status: "pending" | "reading" | "processing" | "completed" | "failed";
  statusText: string;
  pageCount: number;
  docxBlob?: Blob;
  errorMessage?: string;
  pages?: BatchPage[];
}

const PdfConverter: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [fileName, setFileName] = useState<string>("document");
  const [rangeInput, setRangeInput] = useState<string>("");
  const [autoDownload, setAutoDownload] = useState<boolean>(true);
  const [numberingStyle, setNumberingStyle] = useState<NumberingStyle>(
    NumberingStyle.NONE,
  );
  const [isBilingual, setIsBilingual] = useState(false);
  const [includeImages, setIncludeImages] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [refineMode, setRefineMode] = useState(false);
  const [autoProofread, setAutoProofread] = useState(false);
  const [systematicArrange, setSystematicArrange] = useState<boolean>(true);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [wordsConsumed, setWordsConsumed] = useState(0);
  const [pointsConsumed, setPointsConsumed] = useState(0);
  const [totalKeys, setTotalKeys] = useState(1);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());
  const [showInsufficientTokensModal, setShowInsufficientTokensModal] =
    useState(false);
  const [tokenInfo, setTokenInfo] = useState({
    tokens: 0,
    pages: 0,
    neededTokens: 0,
  });
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [dailyLimitInfo, setDailyLimitInfo] = useState({
    type: "",
    usage: 0,
    limit: 0,
  });

  // Batch PDF processing state
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const batchItemsRef = useRef<BatchItem[]>(batchItems);
  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);
  const [batchProcessingActive, setBatchProcessingActive] = useState<boolean>(false);

  const updateBatchItemState = (id: string, updates: Partial<BatchItem>) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const removeBatchItem = (id: string) => {
    if (batchProcessingActive) return;
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearBatch = () => {
    if (batchProcessingActive) return;
    setBatchItems([]);
  };

  const [selectedBatchItemId, setSelectedBatchItemId] = useState<string | null>(null);
  const [aiEditingPageId, setAiEditingPageId] = useState<string | null>(null);

  const updateBatchElementContent = (
    itemId: string,
    pageId: string,
    elementId: string,
    newContent: string,
  ) => {
    setBatchItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId || !item.pages) return item;
        const updatedPages = item.pages.map((p) => {
          if (p.id !== pageId || !p.elements) return p;
          const updatedElements = p.elements.map((el) =>
            el.id === elementId ? { ...el, content: newContent } : el,
          );
          return { ...p, elements: updatedElements };
        });
        return { ...item, pages: updatedPages };
      }),
    );
  };

  const editBatchPageWithAi = async (
    itemId: string,
    pageId: string,
    instruction: string,
  ) => {
    if (!instruction.trim()) return;

    let elementsToEdit: any[] = [];
    let pageNumber = 1;
    setBatchItems((prev) => {
      const item = prev.find((it) => it.id === itemId);
      if (item && item.pages) {
        const p = item.pages.find((pg) => pg.id === pageId);
        if (p) {
          elementsToEdit = p.elements || [];
          pageNumber = p.pageNumber;
        }
      }
      return prev;
    });

    if (elementsToEdit.length === 0) {
      alert("Please process this page first before attempting edits!");
      return;
    }

    setAiEditingPageId(pageId);

    // Set page to processing status
    setBatchItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || !it.pages) return it;
        return {
          ...it,
          pages: it.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  status: "processing" as const,
                  statusText: "AI is editing page content...",
                }
              : p,
          ),
        };
      }),
    );

    try {
      const results = await processBatch({
        items: [{ elements: elementsToEdit, instruction }],
        processItem: async (task, idx, apiKey) => {
          const response = await fetch("/api/edit-page-layout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "x-user-api-key": apiKey } : {}),
            },
            body: JSON.stringify({
              elements: task.elements,
              instruction: task.instruction,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || "AI layout editing failed");
          }

          return await response.json();
        }
      });
      const data = results[0];
      if (!data || !data.elements) {
        throw new Error("No layout elements returned by AI.");
      }

      setBatchItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId || !it.pages) return it;
          return {
            ...it,
            pages: it.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    status: "completed" as const,
                    statusText: "AI optimization applied!",
                    elements: data.elements,
                  }
                : p,
            ),
          };
        }),
      );
    } catch (err: any) {
      console.error("AI page edit failed:", err);
      setBatchItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId || !it.pages) return it;
          return {
            ...it,
            pages: it.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    status: "failed" as const,
                    statusText: `AI Edit failed: ${err.message || err}`,
                  }
                : p,
            ),
          };
        }),
      );
    } finally {
      setAiEditingPageId(null);
    }
  };

  const splitBatchPdfIntoPages = async (itemId: string) => {
    try {
      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, status: "reading", statusText: "Splitting PDF into pages...", progress: 10 }
            : it,
        ),
      );

      let currentFile: File | null = null;
      setBatchItems((prev) => {
        const found = prev.find((it) => it.id === itemId);
        if (found) currentFile = found.file;
        return prev;
      });

      if (!currentFile) return;

      const images = await convertPdfToImages(currentFile, (pct, msg) => {
        setBatchItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  progress: 10 + Math.round(pct * 0.15),
                  statusText: `Breaking pages: ${Math.round(pct)}%`,
                }
              : it,
          ),
        );
      });

      if (images.length === 0) {
        throw new Error("No readable pages found in PDF.");
      }

      const parsedPages: BatchPage[] = images.map((img, idx) => ({
        id: `${itemId}-page-${idx + 1}`,
        pageNumber: idx + 1,
        imageUrl: img,
        status: "pending",
        statusText: "Awaiting run",
        elements: [],
      }));

      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: "pending",
                statusText: `${images.length} pages split, ready.`,
                pageCount: images.length,
                progress: 100,
                pages: parsedPages,
              }
            : it,
        ),
      );
    } catch (err: any) {
      console.error("Splitting failed:", err);
      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: "failed",
                statusText: `Page breaking failed: ${err.message}`,
                errorMessage: err.message,
              }
            : it,
        ),
      );
    }
  };

  const processSingleBatchPage = async (
    itemId: string,
    pageId: string,
    singlePageTokens: number,
  ) => {
    let pageToProcess: BatchPage | null = null;

    setBatchItems((prev) => {
      const it = prev.find((item) => item.id === itemId);
      if (it && it.pages) {
        const foundPage = it.pages.find((p) => p.id === pageId);
        if (foundPage) pageToProcess = foundPage;
      }
      return prev;
    });

    if (!pageToProcess) return;

    setBatchItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || !it.pages) return it;
        return {
          ...it,
          pages: it.pages.map((p) =>
            p.id === pageId
              ? { ...p, status: "processing" as const, statusText: "Analyzing design guidelines..." }
              : p,
          ),
        };
      }),
    );

    try {
      await consumeTokens(
        singlePageTokens,
        `Batch page extraction: ${(pageToProcess as BatchPage).pageNumber}`,
      ).catch((err) => console.error("Batch token deduction failed:", err));

      const elements = await extractLayoutFromImage(
        (pageToProcess as BatchPage).imageUrl,
        numberingStyle,
        includeImages,
        isBilingual,
        false,
        refineMode,
        undefined,
        undefined,
        undefined,
        systematicArrange,
        autoProofread,
      );

      const processedPageElements = await Promise.all(
        elements.map(async (el) => {
          if (
            includeImages &&
            (el.type === "image" || el.type === "table") &&
            el.bbox
          ) {
            try {
              const cropped = await cropImage((pageToProcess as BatchPage).imageUrl, el.bbox);
              return { ...el, imageB64: cropped };
            } catch (cropErr) {
              return el;
            }
          }
          return el;
        }),
      );

      setBatchItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId || !it.pages) return it;
          return {
            ...it,
            pages: it.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    status: "completed" as const,
                    statusText: "Extracted!",
                    elements: processedPageElements,
                  }
                : p,
            ),
          };
        }),
      );
    } catch (err: any) {
      console.error("Page processing failed:", err);
      setBatchItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId || !it.pages) return it;
          return {
            ...it,
            pages: it.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    status: "failed" as const,
                    statusText: `Failed: ${err.message || err}`,
                  }
                : p,
            ),
          };
        }),
      );
      throw err;
    }
  };

  const processSingleBatchItem = async (
    id: string,
    singlePageTokens: number,
    isPersonalApi: boolean,
  ) => {
    try {
      updateBatchItemState(id, {
        status: "processing",
        statusText: "Accessing pages...",
        progress: 10,
      });

      // Synchronously and safely retrieve the current item details from the updated ref
      const currentItem = batchItemsRef.current.find((it) => it.id === id);
      if (!currentItem) {
        throw new Error("Item not found in state.");
      }

      let pagesToProcess = currentItem.pages || [];

      // If pages are not split yet (failsafe), split them here
      if (pagesToProcess.length === 0) {
        if (!currentItem.file) {
          throw new Error("Source file is missing.");
        }
        updateBatchItemState(id, {
          statusText: "Splitting PDF into pages...",
          progress: 12,
        });
        const images = await convertPdfToImages(currentItem.file);
        pagesToProcess = images.map((img, idx) => ({
          id: `${id}-page-${idx + 1}`,
          pageNumber: idx + 1,
          imageUrl: img,
          status: "pending",
          statusText: "Awaiting run",
          elements: [],
        }));

        updateBatchItemState(id, {
          pages: pagesToProcess,
          pageCount: pagesToProcess.length,
          progress: 15,
        });
      }

      const totalPages = pagesToProcess.length;
      if (totalPages === 0) {
        throw new Error("No readable pages in PDF.");
      }

      const totalNeeded = totalPages * singlePageTokens;
      if (tokens < totalNeeded) {
        setTokenInfo({ tokens, pages: totalPages, neededTokens: totalNeeded });
        setShowInsufficientTokensModal(true);
        throw new Error("Insufficient Veda Tokens to extract pages.");
      }

      // Concurrency limit dynamically configured:
      // - Premium user/Custom API key: Unlimited parallelism (process all pages concurrently!).
      // - Free user: Parallelized up to the number of free keys in the pool (totalKeys).
      const isPremium = plan?.id !== "free";
      const customKeys = localStorage.getItem("active_gemini_api_key");
      const isUserCustomKey = customKeys && customKeys.length > 5;

      const concurrencyLimit = (isPremium || isUserCustomKey)
        ? totalPages
        : Math.max(1, totalKeys);

      const uncompletedPages = pagesToProcess.filter((pg) => pg.status !== "completed");

      if (uncompletedPages.length > 0) {
        // Safe tracking pool of completed count for this document
        let processedCount = pagesToProcess.filter((p) => p.status === "completed").length;

        const queue = [...uncompletedPages];
        const runPageWorker = async () => {
          while (queue.length > 0) {
            const pg = queue.shift();
            if (!pg) break;

            try {
              // Fire individual page extraction
              await processSingleBatchPage(id, pg.id, singlePageTokens);
            } catch (pageErr: any) {
              console.error(`Batch page ${pg.pageNumber} extraction errored:`, pageErr);
            } finally {
              processedCount++;
              const currentProgress = 15 + Math.round((processedCount / totalPages) * 70);
              updateBatchItemState(id, {
                progress: Math.min(85, currentProgress),
                statusText: `Processing: ${processedCount} of ${totalPages} pages complete ✓`,
              });
            }
          }
        };

        // Fire all parallel workers simultaneously
        const workers = [];
        const activeWorkersCount = Math.min(concurrencyLimit, queue.length);
        for (let i = 0; i < activeWorkersCount; i++) {
          workers.push(runPageWorker());
        }
        await Promise.all(workers);
      }

      // Check results post-run
      const freshItem = batchItemsRef.current.find((it) => it.id === id);
      const finalPages = freshItem?.pages || [];
      const completedCount = finalPages.filter((p) => p.status === "completed").length;
      const failedCount = finalPages.filter((p) => p.status === "failed").length;

      if (completedCount === 0) {
        throw new Error("Page Extraction failed. No pages were processed successfully.");
      }

      updateBatchItemState(id, {
        progress: 90,
        statusText: `Compiling docx (${completedCount}/${totalPages} successful)...`,
      });

      const compiledElements: any[] = finalPages
        .flatMap((p) => p.elements || [])
        .filter(Boolean);

      if (compiledElements.length === 0) {
        throw new Error("No layout elements extracted from pages.");
      }

      const docxBlob = await generateDocx(compiledElements, OptionArrangement.VERTICAL);

      updateBatchItemState(id, {
        status: "completed",
        progress: 100,
        statusText: failedCount > 0
          ? `Converted successfully (${completedCount}/${totalPages} pages successful)`
          : "Successfully converted!",
        docxBlob,
      });
    } catch (err: any) {
      console.error(`Batch processing failed for ID ${id}:`, err);
      const displayDesc = err?.message || "Extraction error occurred.";
      updateBatchItemState(id, {
        status: "failed",
        statusText: displayDesc,
        errorMessage: displayDesc,
      });
    }
  };

  const startBatchProcessing = async () => {
    if (batchItems.length === 0) return;
    if (batchProcessingActive) return;

    const pendingItems = batchItems.filter(
      (item) => item.status === "pending" || item.status === "failed",
    );

    if (pendingItems.length === 0) {
      alert("No pending PDF files in batch.");
      return;
    }

    setBatchProcessingActive(true);

    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;
    const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
    const singlePageTokens = isPersonalApi ? pdfRate.custom : pdfRate.system;

    // Concentrating the page-by-page parallel worker power on a single document at a time
    // gives the most responsive user interface and rapid document delivery.
    const BATCH_SIZE = 1;

    const queue = [...pendingItems];

    const runWorker = async () => {
      while (queue.length > 0) {
        const nextItem = queue.shift();
        if (!nextItem) break;

        try {
          await processSingleBatchItem(nextItem.id, singlePageTokens, isPersonalApi);
        } catch (e) {
          console.error("Worker failed in batch queue:", e);
        }
      }
    };

    const workerPromises = [];
    const numWorkers = Math.min(BATCH_SIZE, queue.length);
    for (let i = 0; i < numWorkers; i++) {
      workerPromises.push(runWorker());
    }

    await Promise.all(workerPromises);
    setBatchProcessingActive(false);
  };

  const togglePageCollapse = (id: string) => {
    setCollapsedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const {
    limits,
    usage,
    checkLimit,
    consumeLimit,
    tokens,
    consumeTokens,
    loading,
    rates,
    plan,
  } = usePlanLimits();

  // Helper to count words
  const countWords = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const [user] = useAuthState(auth);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.totalKeys) setTotalKeys(data.totalKeys);
      })
      .catch((err) => console.error("Config fetch failed:", err));
  }, []);

  // Load history on mount or when user changes, and sync local items to cloud
  useEffect(() => {
    if (user) {
      // Sync local unsynced history to Firestore first
      const savedHistory = localStorage.getItem("conversion_history");
      if (savedHistory) {
        try {
          const localHistory = JSON.parse(savedHistory) as HistoryItem[];
          if (localHistory && localHistory.length > 0) {
            console.log(
              "Synchronizing local history to Firestore for user:",
              user.uid,
            );
            localHistory.forEach((item) => {
              const docRef = doc(db, `users/${user.uid}/history`, item.id);

              // Validate schema compatibility before upload
              const elements = item.elements || [];
              const historyData = {
                id: item.id,
                userId: user.uid,
                fileName: item.fileName || "document",
                timestamp: item.timestamp || Date.now(),
                pagesCount: item.pagesCount || 1,
                elements: elements,
              };

              setDoc(docRef, historyData).catch((err) => {
                if (
                  err.code === "permission-denied" ||
                  (err.message && err.message.includes("size"))
                ) {
                  console.warn(
                    "Sync item too large, removing big assets during backup",
                  );
                  const strippedElements = elements.map((el) => {
                    if (el.imageB64)
                      return { ...el, imageB64: "[REMOVED DUE TO SIZE]" };
                    return el;
                  });
                  setDoc(docRef, {
                    ...historyData,
                    elements: strippedElements,
                  }).catch((e) => console.error("Sync backup failure:", e));
                } else {
                  console.error("Failed to sync item to Firestore:", err);
                }
              });
            });
            // Clear local storage history after synchronizing
            localStorage.removeItem("conversion_history");
          }
        } catch (e) {
          console.error("Failed to sync local history on login:", e);
        }
      }

      // Load from Firestore
      const historyQuery = query(
        collection(db, `users/${user.uid}/history`),
        orderBy("timestamp", "desc"),
        limit(20),
      );

      const historyPath = `users/${user.uid}/history`;
      const unsubscribe = onSnapshot(
        historyQuery,
        (snapshot) => {
          const cloudHistory = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          })) as HistoryItem[];
          setHistory(cloudHistory);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, historyPath);
        },
      );

      return () => unsubscribe();
    } else {
      // Load from localStorage for anonymous users
      const savedHistory = localStorage.getItem("conversion_history");
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error("Failed to load history", e);
        }
      }
    }
  }, [user]);

  // Save history when it changes (only for anonymous users, Firestore handles its own)
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem("conversion_history", JSON.stringify(history));
      } catch (e) {}
    }
  }, [history, user]);

  // Auto-save to history effect
  useEffect(() => {
    if (appState === AppState.COMPLETED) {
      const completedElements = pages
        .filter((p) => p.status === "done" && p.elements)
        .flatMap((p) => p.elements || []);

      if (completedElements.length > 0) {
        const newItem: Omit<HistoryItem, "id"> = {
          fileName: fileName,
          timestamp: Date.now(),
          pagesCount: pages.length,
          elements: completedElements,
        };

        if (user) {
          // Save to Firestore with size-limit fallback
          const historyId = generateId();
          const docRef = doc(db, `users/${user.uid}/history`, historyId);
          const historyData = {
            ...newItem,
            id: historyId,
            userId: user.uid,
          };

          setDoc(docRef, historyData).catch((err) => {
            if (
              err.code === "permission-denied" ||
              (err.message && err.message.includes("size"))
            ) {
              console.warn(
                "History item too large for Firestore, saving without full images",
              );
              const strippedElements = completedElements.map((el) => {
                if (el.imageB64)
                  return { ...el, imageB64: "[REMOVED DUE TO SIZE]" };
                return el;
              });
              setDoc(docRef, {
                ...historyData,
                elements: strippedElements,
              }).catch((e) =>
                console.error("Critical failure saving history:", e),
              );
            } else {
              console.error("Failed to save to Firestore:", err);
            }
          });
        } else {
          // Save to state (which saves to localStorage via effect)
          setHistory((prev) =>
            [{ ...newItem, id: generateId() } as HistoryItem, ...prev].slice(
              0,
              20,
            ),
          );
        }
      }

      if (autoDownload) {
        const timer = setTimeout(() => {
          downloadDocx();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [appState]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (appState === AppState.UPLOAD) return; // FileUploader handles it
      if (
        appState === AppState.ANALYZING ||
        appState === AppState.PROCESSING_PDF
      )
        return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const file = items[i].getAsFile();
        if (
          file &&
          (file.type.startsWith("image/") || file.type === "application/pdf")
        ) {
          files.push(file);
        }
      }

      if (files.length > 0) {
        const dataTransfer = new DataTransfer();
        files.forEach((file) => dataTransfer.items.add(file));
        handleFilesSelected(dataTransfer.files, true);
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [appState]);

  // Triggers selection and processing for all failed pages
  const retryAllErrors = async () => {
    const errorPages = pages.filter((p) => p.status === "error");
    if (errorPages.length === 0) return;

    setErrorMsg(null);
    setAppState(AppState.ANALYZING);

    // Update pages and then trigger extraction
    setPages((prev) => {
      const updated = prev.map((p) =>
        p.status === "error"
          ? {
              ...p,
              isSelected: true,
              status: "processing" as const,
              errorMessage: undefined,
              elements: undefined,
              extractedText: undefined,
            }
          : p,
      );

      return updated;
    });

    // Small delay to ensure state batching finishes
    setTimeout(() => startExtraction(), 0);
  };

  const handleRecompileItemDocx = async (itemId: string) => {
    const item = batchItems.find((it) => it.id === itemId);
    if (!item || !item.pages || item.pages.length === 0) {
      alert("No pages exist to compile. Please wait or process this item.");
      return;
    }

    try {
      const flatElements = item.pages.flatMap((p) => p.elements || []).filter(Boolean);
      if (flatElements.length === 0) {
        alert("No extracted AI elements exist yet across any pages. Process them first!");
        return;
      }

      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, statusText: "Recompiling DOCX...", progress: 95 } : it,
        ),
      );

      const docxBlob = await generateDocx(flatElements, OptionArrangement.VERTICAL);

      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                statusText: "Ready with local edits!",
                progress: 100,
                docxBlob,
              }
            : it,
        ),
      );

      // Auto-download file
      const url = window.URL.createObjectURL(docxBlob);
      const a = document.createElement("a");
      a.href = url;
      const nameWithoutExt =
        item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
      a.download = `${nameWithoutExt}_edited.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Recompilation failed: ${err.message || err}`);
    }
  };

  const handleBatchFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: BatchItem[] = [];
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_FILE_SIZE) {
        alert(`File ${file.name} exceeds 50MB and was skipped.`);
        continue;
      }
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const itemId = generateId();
        newItems.push({
          id: itemId,
          file: file,
          name: file.name,
          progress: 0,
          status: "pending",
          statusText: "Awaiting page parsing...",
          pageCount: 0,
          pages: [],
        });

        // Run split task in background
        setTimeout(() => splitBatchPdfIntoPages(itemId), 100);
      } else {
        alert(`File ${file.name} is not a valid PDF. Batch processor only supports PDF files.`);
      }
    }

    if (newItems.length > 0) {
      setBatchItems((prev) => [...prev, ...newItems]);
    }
  };

  const handleFilesSelected = async (
    fileList: FileList | null,
    append: boolean = false,
  ) => {
    if (!fileList || fileList.length === 0) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const validFiles: File[] = [];
    let hasOversizedFiles = false;

    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].size > MAX_FILE_SIZE) {
        hasOversizedFiles = true;
      } else {
        validFiles.push(fileList[i]);
      }
    }

    if (hasOversizedFiles) {
      setErrorMsg("Some files exceed the 50MB limit and were skipped.");
      if (validFiles.length === 0) {
        setAppState(AppState.ERROR);
        return;
      }
    }

    if (validFiles.length === 0) return;

    if (!append) {
      // Capture the name of the first file for saving later
      const firstFile = validFiles[0];
      const namePart =
        firstFile.name.substring(0, firstFile.name.lastIndexOf(".")) ||
        firstFile.name;
      setFileName(namePart);
      setPages([]); // Clear previous
      setWordsConsumed(0);
      setPointsConsumed(0);
    }

    setAppState(AppState.PROCESSING_PDF);
    setUploadProgress(5);
    setUploadStatus("Starting document read...");
    setErrorMsg(null);

    const newPages: Omit<ScannedPage, "pageNumber">[] = [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];

        if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          const images = await convertPdfToImages(file, (pct, msg) => {
            setUploadProgress(pct);
            setUploadStatus(msg);
          });
          images.forEach((img) => {
            newPages.push({
              id: generateId(),
              imageUrl: img,
              status: "pending",
              isSelected: true, // Default selected
            });
          });
        } else if (
          file.type.startsWith("image/") ||
          /\.(jpg|jpeg|png)$/i.test(file.name)
        ) {
          const base64 = await readFileAsBase64(file, (pct, msg) => {
            setUploadProgress(pct);
            setUploadStatus(msg);
          });
          newPages.push({
            id: generateId(),
            imageUrl: base64,
            status: "pending",
            isSelected: true,
          });
        }
      }

      setPages((prev) => {
        let currentCounter = append ? prev.length + 1 : 1;
        const mappedNewPages = newPages.map(
          (p) => ({ ...p, pageNumber: currentCounter++ }) as ScannedPage,
        );
        return append ? [...prev, ...mappedNewPages] : mappedNewPages;
      });
      setAppState(AppState.IDLE); // Ready to start AI
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err?.message ||
          "Failed to process files. Please check if the file is valid.",
      );
      setAppState(AppState.ERROR);
    }
  };

  const togglePageSelection = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isSelected: !p.isSelected } : p)),
    );
  };

  const toggleAllSelection = (select: boolean) => {
    setPages((prev) => prev.map((p) => ({ ...p, isSelected: select })));
  };

  const applyRangeSelection = () => {
    if (!rangeInput.trim()) return;

    const pagesToSelect = new Set<number>();
    const parts = rangeInput.split(",");

    parts.forEach((part) => {
      const p = part.trim();
      if (p.includes("-")) {
        const rangeParts = p.split("-").map((s) => s.trim());
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0], 10);
          const end = parseInt(rangeParts[1], 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            for (let i = min; i <= max; i++) pagesToSelect.add(i);
          }
        }
      } else {
        const num = parseInt(p, 10);
        if (!isNaN(num)) pagesToSelect.add(num);
      }
    });

    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        isSelected: pagesToSelect.has(p.pageNumber),
      })),
    );
  };

  const startExtraction = async () => {
    if (loading) {
      alert("Please wait for your plan limits to load.");
      return;
    }
    // Collect pages to extract
    const targetPages = pages.filter(
      (p) => p.isSelected && p.status !== "done",
    );
    if (targetPages.length === 0) {
      alert("No pending pages selected.");
      return;
    }

    // Determine config (we default to system keys if personal keys aren't used here explicitly, but since the frontend handles the key selection implicitly let's assume we read whether local keys exist)
    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;

    // Identify pages to process
    const pagesToProcess = pages.filter(
      (p) => p.isSelected && p.status !== "done",
    );
    const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
    const neededTokens =
      pagesToProcess.length * (isPersonalApi ? pdfRate.custom : pdfRate.system);

    if (tokens < neededTokens) {
      setTokenInfo({ tokens, pages: pagesToProcess.length, neededTokens });
      setShowInsufficientTokensModal(true);
      return;
    }

    // Check Plan Limits
    const typeKey = isPersonalApi ? "pdfDailyPersonalApi" : "pdfDailySystemApi";
    if (!checkLimit(typeKey, !!isPersonalApi)) {
      setDailyLimitInfo({
        type: isPersonalApi ? "Custom" : "System",
        usage:
          (isPersonalApi
            ? usage.pdfPersonalApiCount
            : usage.pdfSystemApiCount) || 0,
        limit: isPersonalApi
          ? limits.pdfDailyPersonalApi
          : limits.pdfDailySystemApi,
      });
      setShowDailyLimitModal(true);
      return;
    }

    // Consume 1 quota per request (or you can do per page, but let's do per batch request as standard)
    const consumptionSuccess = await consumeLimit("pdf", 1, !!isPersonalApi);
    if (!consumptionSuccess) {
      alert("Failed to verify usage tracking. Please try again.");
      return;
    }

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);

    // Process pages in parallel batches
    // We can confidently process up to 10 pages in parallel if multiple keys are available
    // Even with 1 key, Gemini 1.5 Flash supports concurrent requests well (up to 15 RPM).
    const BATCH_SIZE = 10;
    let criticalErrorOccurred = false;

    // 1. Visually mark ALL selected pages as 'processing' immediately.
    setPages((prev) =>
      prev.map((p) =>
        p.isSelected && p.status !== "done"
          ? {
              ...p,
              status: "processing",
              elements: undefined,
              extractedText: undefined,
            }
          : p,
      ),
    );

    // Identify pages to process

    for (let i = 0; i < targetPages.length; i += BATCH_SIZE) {
      if (criticalErrorOccurred) break;

      const batch = targetPages.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (page, index) => {
          if (criticalErrorOccurred) return;

          // Faster pipeline: minimal stagger to bypass browser connection limits
          await new Promise((resolve) => setTimeout(resolve, index * 50));

          try {
            const elements = await extractLayoutFromImage(
              page.imageUrl,
              numberingStyle,
              includeImages,
              isBilingual,
              false, // mcqMode is false in PDF- Converter
              refineMode,
              undefined,
              undefined,
              undefined,
              systematicArrange,
              autoProofread,
            );

            // Calculate words and points
            const pageText = elements
              .map((e) => (e.type === "text" ? e.content || "" : ""))
              .join(" ");
            const pageWords = countWords(pageText);
            setWordsConsumed((prev) => prev + pageWords);
            setPointsConsumed((prev) => prev + 1);

            // Process images & tables
            const processedElements = await Promise.all(
              elements.map(async (el) => {
                if (
                  includeImages &&
                  (el.type === "image" || el.type === "table") &&
                  el.bbox
                ) {
                  try {
                    const croppedB64 = await cropImage(page.imageUrl, el.bbox);
                    return { ...el, imageB64: croppedB64 };
                  } catch (cropErr) {
                    return el;
                  }
                }
                return el;
              }),
            );

            // Mark success
            setPages((prev) =>
              prev.map((p) =>
                p.id === page.id
                  ? {
                      ...p,
                      status: "done",
                      elements: processedElements,
                      extractedText: processedElements
                        .map((e) =>
                          e.type === "text"
                            ? e.content || ""
                            : `[Image: ${e.content || ""}]`,
                        )
                        .join("\n\n"),
                    }
                  : p,
              ),
            );

            // Deduct tokens ONLY on success!
            const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
            const singlePageTokens = isPersonalApi
              ? pdfRate.custom
              : pdfRate.system;
            await consumeTokens(
              singlePageTokens,
              `Successfully extracted layout details from page #${page.pageNumber}`,
            ).catch((err) => console.error("Token deduction failed:", err));
          } catch (e: any) {
            console.error(`Error processing page ${page.pageNumber}:`, e);
            const errorStr = e?.message || String(e);
            const errorLower = errorStr.toLowerCase();
            const isRateLimit =
              errorStr.includes("429") ||
              errorStr.includes("quota") ||
              errorStr.includes("exhausted");

            let displayError = errorStr;
            try {
              const parsed = JSON.parse(errorStr);
              if (parsed.message) displayError = parsed.message;
            } catch (e) {}

            const displayErrorLower = displayError.toLowerCase();
            if (displayErrorLower.includes("aborted") || displayErrorLower.includes("abort")) {
              displayError = "Request was cancelled or expired. Please click 'Open in New Tab' at the top-right to run steady background tasks.";
            } else if (displayErrorLower.includes("failed to fetch") || displayErrorLower.includes("typeerror")) {
              displayError = "Connection interrupted or iframe blocked. Drop into standard browser view using 'Open in New Tab' to resume.";
            }

            setPages((prev) =>
              prev.map((p) =>
                p.id === page.id
                  ? {
                      ...p,
                      status: "error",
                      errorMessage: displayError,
                      elements: undefined,
                      extractedText: undefined,
                    }
                  : p,
              ),
            );

            if (isRateLimit && totalKeys <= 1) {
              setErrorMsg(
                "API limit reached. Please wait a moment or add more keys.",
              );
              criticalErrorOccurred = true;
            } else if (
              errorLower.includes("authentication") ||
              errorLower.includes("api key not valid")
            ) {
              // Only stop if we have no keys left
              if (totalKeys <= 1) {
                setErrorMsg(`Authentication Error: ${displayError}`);
                criticalErrorOccurred = true;
              }
            }
          }
        }),
      );

      // Dynamic delay between batches to respect API limits (15 RPM per key)
      if (i + BATCH_SIZE < pagesToProcess.length && !criticalErrorOccurred) {
        // If we have multiple keys, we can be much faster.
        // Minimal batch delay for maximum speed
        const batchDelay = 500;
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    if (!criticalErrorOccurred) {
      setAppState(AppState.COMPLETED);
    }
  };

  const retryPage = async (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;

    const customKeys = localStorage.getItem("active_gemini_api_key");
    const isPersonalApi = customKeys && customKeys.length > 5;
    const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
    const singlePageTokens = isPersonalApi ? pdfRate.custom : pdfRate.system;

    if (tokens < singlePageTokens) {
      setTokenInfo({ tokens, pages: 1, neededTokens: singlePageTokens });
      setShowInsufficientTokensModal(true);
      return;
    }

    // Reset global error msg if any, as user is attempting action
    setErrorMsg(null);

    // Update to processing
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "processing",
              extractedText: undefined,
              elements: undefined,
              errorMessage: undefined,
            }
          : p,
      ),
    );

    try {
      const elements = await extractLayoutFromImage(
        page.imageUrl,
        numberingStyle,
        includeImages,
        isBilingual,
        false, // mcqMode is false in PDF- Converter
        refineMode,
        undefined,
        undefined,
        undefined,
        systematicArrange,
        autoProofread,
      );

      // Calculate words and points
      const pageText = elements
        .map((e) => (e.type === "text" ? e.content || "" : ""))
        .join(" ");
      const pageWords = countWords(pageText);
      setWordsConsumed((prev) => prev + pageWords);
      setPointsConsumed((prev) => prev + 1);

      const processedElements = await Promise.all(
        elements.map(async (el) => {
          if (
            includeImages &&
            (el.type === "image" || el.type === "table") &&
            el.bbox
          ) {
            try {
              const croppedB64 = await cropImage(page.imageUrl, el.bbox);
              return { ...el, imageB64: croppedB64 };
            } catch (cropErr) {
              return el;
            }
          }
          return el;
        }),
      );

      setPages((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "done",
                elements: processedElements,
                extractedText: processedElements
                  .map((e) =>
                    e.type === "text"
                      ? e.content || ""
                      : `[Image: ${e.content || ""}]`,
                  )
                  .join("\n\n"),
              }
            : p,
        ),
      );

      // Deduct Veda Tokens ONLY ON SUCCESS!
      await consumeTokens(
        singlePageTokens,
        `Re-extracted layout details for page #${page.pageNumber}`,
      ).catch((err) => console.error("Token deduction failed:", err));
    } catch (e: any) {
      console.error("Retry Page Error:", e);
      const errorStr = e.message || String(e);
      let displayError = errorStr;
      try {
        const parsed = JSON.parse(errorStr);
        if (parsed.message) displayError = parsed.message;
        else if (parsed.error && typeof parsed.error === "string")
          displayError = parsed.error;
      } catch (e) {}

      setPages((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "error", errorMessage: displayError }
            : p,
        ),
      );
      setErrorMsg(displayError);
    }
  };

  const updatePageText = (id: string, newText: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, extractedText: newText } : p)),
    );
  };

  const getFullText = () => {
    return pages
      .filter((p) => p.isSelected && p.status === "done")
      .map((p) => {
        if (p.elements) {
          return p.elements
            .filter((el) => includeImages || el.type !== "image")
            .map((el) =>
              el.type === "text" || el.type === "table"
                ? el.content
                : `[Image: ${el.content}]`,
            )
            .join("\n\n");
        }
        return p.extractedText || "";
      })
      .join("\n\n---\n\n");
  };

  const downloadDocx = async () => {
    // Collect all elements from all selected and completed pages
    const allElements = pages
      .filter((p) => p.isSelected && p.status === "done" && p.elements)
      .flatMap((p) => p.elements || [])
      .filter((el) => includeImages || el.type !== "image");

    if (allElements.length === 0) {
      if (!autoDownload) setErrorMsg("No content extracted to save.");
      return;
    }

    try {
      const blob = await generateDocx(allElements, OptionArrangement.VERTICAL);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to generate DOCX file.");
    }
  };

  const downloadTxt = () => {
    const fullText = getFullText();
    if (!fullText) return;

    const blob = new Blob([fullText], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const copyAllText = async () => {
    const fullText = getFullText();
    if (!fullText) return;

    try {
      await navigator.clipboard.writeText(fullText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const copyAsMarkdown = async () => {
    const fullText = getFullText();
    if (!fullText) return;

    try {
      await navigator.clipboard.writeText(
        `\`\`\`markdown\n${fullText}\n\`\`\``,
      );
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy markdown: ", err);
    }
  };

  const reset = () => {
    setPages([]);
    setAppState(AppState.IDLE);
    setErrorMsg(null);
    setFileName("document");
    setRangeInput("");
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    // For now, we just download it again or we could populate the UI
    // To keep it simple and professional, let's offer to download the DOCX
    const downloadItem = async () => {
      try {
        const elements = item.elements || [];
        if (elements.length === 0) {
          setErrorMsg("No content found in this history item.");
          return;
        }
        const blob = await generateDocx(elements, OptionArrangement.VERTICAL);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.fileName}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
        setErrorMsg("Failed to generate DOCX from history.");
      }
    };
    downloadItem();
    setIsHistoryOpen(false);
  };

  const handleDeleteHistoryItem = (id: string) => {
    if (user) {
      deleteDoc(doc(db, `users/${user.uid}/history`, id)).catch((err) =>
        console.error("Failed to delete history:", err),
      );
    } else {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const hasCompletedPages = pages.some(
    (p) => p.status === "done" && (p.extractedText || p.elements),
  );
  const hasErrorPages = pages.some((p) => p.status === "error");

  // Selection Stats
  const selectedCount = pages.filter((p) => p.isSelected).length;
  const totalCount = pages.length;
  const selectedPendingCount = pages.filter(
    (p) => p.isSelected && p.status !== "done",
  ).length;

  return (
    <>
      <SystemMessageModal
        isOpen={showInsufficientTokensModal}
        onClose={() => setShowInsufficientTokensModal(false)}
        onConfirm={() => {
          window.location.href = "/pricing";
        }}
        title="Insufficient Veda Tokens!"
        message={`You currently have ${tokenInfo.tokens} Veda Tokens, but this extraction of ${tokenInfo.pages} page(s) requires ${tokenInfo.neededTokens} Veda Tokens.\n\nWould you like to visit the Recharge Hub to top up your account balance?`}
        confirmText="Visit Recharge Hub"
        cancelText="Close"
      />
      <SystemMessageModal
        isOpen={showDailyLimitModal}
        onClose={() => setShowDailyLimitModal(false)}
        onConfirm={() => {
          window.location.href = "/pricing";
        }}
        title="Daily Limit Reached!"
        message={`Daily limit reached for PDF extractions (${dailyLimitInfo.type} API).\n\nUsage: ${dailyLimitInfo.usage} / ${dailyLimitInfo.limit} extractions.\n\nPlease UPGRADE your plan in the Hub to increase your limits.`}
        confirmText="Upgrade Plan"
        cancelText="Close"
      />
      <div className="bg-[#0F0F0F] font-sans selection:bg-[#FF6B2B]/20 selection:text-[#FF6B2B] overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-0 py-0 md:px-1 md:py-1">
          <header className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="flex items-center gap-1.5 px-1 py-1 bg-[#1A1A1A] border border-[#333] rounded-[6px] text-[10px] uppercase font-bold text-[#888888]">
                <Zap size={12} className="text-[#FF6B2B]" />
                <span>Available Extractions (System):</span>
                <span className="text-[#FF6B2B]">
                  {Math.max(
                    0,
                    (limits?.pdfDailySystemApi || 0) -
                      (usage?.pdfSystemApiCount || 0),
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-1 py-1 bg-[#1A1A1A] border border-[#333] rounded-[6px] text-[10px] uppercase font-bold text-[#888888]">
                <Database size={12} className="text-blue-500" />
                <span>Available Extractions (Custom API):</span>
                <span className="text-blue-500">
                  {Math.max(
                    0,
                    (limits?.pdfDailyPersonalApi || 0) -
                      (usage?.pdfPersonalApiCount || 0),
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pages.length > 0 && (
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-1 py-1 text-[11px] font-medium text-[#555555] hover:text-[#F44336] hover:bg-[#3A1A1A] rounded-[6px] transition-colors border border-[#252525]"
                  title="Reset All"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset All</span>
                </button>
              )}
            </div>
          </header>

          {/* Main Content */}
          <main className="relative">
            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-[#252525] mb-4 overflow-x-auto whitespace-nowrap">
              <button
                onClick={() => !batchProcessingActive && setActiveTab("single")}
                className={`px-4 py-2 text-[13px] font-medium transition-all border-b-2 -mb-[2px] ${
                  activeTab === "single"
                    ? "border-[#FF6B2B] text-[#FF6B2B] font-semibold"
                    : "border-transparent text-[#888888] hover:text-[#EFEFEF] cursor-pointer"
                }`}
                disabled={batchProcessingActive}
              >
                Single Document Converter
              </button>
              <button
                onClick={() => setActiveTab("batch")}
                className={`px-4 py-2 text-[13px] font-medium transition-all border-b-2 -mb-[2px] ${
                  activeTab === "batch"
                    ? "border-[#FF6B2B] text-[#FF6B2B] font-semibold"
                    : "border-transparent text-[#888888] hover:text-[#EFEFEF] cursor-pointer"
                }`}
              >
                Batch PDF Processor
              </button>
            </div>

            {activeTab === "batch" ? (
              <div className="space-y-4">
                {selectedBatchItemId !== null ? (
                  (() => {
                    const activeItem = batchItems.find((it) => it.id === selectedBatchItemId);
                    if (!activeItem) return null;

                    return (
                      <div className="space-y-4">
                        {/* Workspace header bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E1E1E] pb-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedBatchItemId(null)}
                              className="px-2.5 py-1.5 text-[11px] font-medium text-[#888888] hover:text-[#EFEFEF] bg-[#1A1A1A] border border-[#252525] rounded-[6px] transition-all hover:bg-[#252525]"
                            >
                              &larr; Back to Dashboard
                            </button>
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-bold text-[#EFEFEF] truncate flex items-center gap-1.5">
                                <FileText size={14} className="text-[#FF6B2B]" />
                                <span>{activeItem.name}</span>
                              </h3>
                              <p className="text-[11px] text-[#888888]">
                                {(activeItem.file.size / 1024 / 1024).toFixed(2)} MB • {activeItem.pages?.length || 0} Pages Broken • Status: <span className="text-[#FF6B2B]">{activeItem.statusText}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const customKeys = localStorage.getItem("active_gemini_api_key");
                                const isPersonalApi = customKeys && customKeys.length > 5;
                                const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
                                const singlePageTokens = isPersonalApi ? pdfRate.custom : pdfRate.system;
                                processSingleBatchItem(activeItem.id, singlePageTokens, isPersonalApi);
                              }}
                              disabled={batchProcessingActive || activeItem.status === "processing"}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-[#FF6B2B] hover:bg-[#E55A1A] text-white rounded-[6px] transition-all flex items-center gap-1 uppercase tracking-[0.5px] disabled:opacity-50"
                            >
                              <Zap size={11} />
                              <span>Process All Pages</span>
                            </button>

                            <button
                              onClick={() => {
                                handleRecompileItemDocx(activeItem.id);
                              }}
                              disabled={!activeItem.pages || activeItem.pages.every(p => p.status !== "completed")}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-transparent border border-[#FF6B2B]/30 hover:border-[#FF6B2B] text-[#FF6B2B] rounded-[6px] transition-all flex items-center gap-1 uppercase tracking-[0.5px] hover:bg-[#FF6B2B]/5 disabled:opacity-50"
                            >
                              <FileDown size={11} />
                              <span>Save &amp; Download DOCX</span>
                            </button>
                          </div>
                        </div>

                        {/* Pages lists */}
                        <div className="space-y-3">
                          <h4 className="text-[11px] uppercase tracking-[0.8px] font-bold text-[#888888]">
                            Page-by-Page Broken Layouts &amp; Real-time Word Editor
                          </h4>

                          {(!activeItem.pages || activeItem.pages.length === 0) ? (
                            <div className="p-8 text-center bg-[#1A1A1A] border border-[#252525] rounded-[8px]">
                              <p className="text-[#888888] text-[13px] mb-2">Awaiting page breaks layout initialization...</p>
                              <button
                                onClick={() => splitBatchPdfIntoPages(activeItem.id)}
                                className="px-3 py-1.5 text-[11px] font-medium text-white bg-[#FF6B2B] rounded-[6px]"
                              >
                                Split PDF Into Pages
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-4">
                              {activeItem.pages.map((page, pageIdx) => {
                                return (
                                  <div
                                    key={`${page.id}-${pageIdx}`}
                                    className="bg-[#1A1A1A] border border-[#252525] rounded-[8px] p-3 space-y-3 transition-colors"
                                  >
                                    {/* Page Header */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#252525] pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-[#FF6B2B]/10 text-[#FF6B2B] flex items-center justify-center text-[10px] font-bold">
                                          {page.pageNumber}
                                        </span>
                                        <h4 className="text-[11.5px] font-bold text-[#EFEFEF]">
                                          Page #{page.pageNumber}
                                        </h4>
                                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                          page.status === "completed"
                                            ? "bg-[#1A3A1A] text-[#4CAF50]"
                                            : page.status === "failed"
                                              ? "bg-[#3A1A1A] text-[#F44336]"
                                              : page.status === "processing"
                                                ? "bg-[#FF6B2B]/10 text-[#FF6B2B] animate-pulse"
                                                : "bg-[#111] text-[#888888]"
                                        }`}>
                                          {page.status}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-[#888888] italic truncate max-w-[200px]" title={page.statusText}>
                                          {page.statusText}
                                        </span>

                                        <button
                                          onClick={() => {
                                            const customKeys = localStorage.getItem("active_gemini_api_key");
                                            const isPersonalApi = customKeys && customKeys.length > 5;
                                            const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
                                            const singlePageTokens = isPersonalApi ? pdfRate.custom : pdfRate.system;
                                            processSingleBatchPage(activeItem.id, page.id, singlePageTokens);
                                          }}
                                          disabled={page.status === "processing"}
                                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-[4px] transition-all disabled:opacity-50 ${page.status === "completed" ? "bg-[#333333] hover:bg-[#444444] text-[#CCCCCC]" : "bg-[#FF6B2B] hover:bg-[#E55A1A] text-white"}`}
                                        >
                                          {page.status === "processing" ? "Typing..." : (page.status === "completed" ? "Retry AI" : "Process Page AI")}
                                        </button>

                                        <button
                                          onClick={() => {
                                            setBatchItems((prev) =>
                                              prev.map((it) => {
                                                if (it.id !== activeItem.id || !it.pages) return it;
                                                return {
                                                  ...it,
                                                  pages: it.pages.map((p) =>
                                                    p.id === page.id ? { ...p, expanded: !p.expanded } : p
                                                  )
                                                };
                                              })
                                            );
                                          }}
                                          className="px-2 py-0.5 text-[10px] font-medium bg-transparent border border-[#252525] text-[#888888] hover:text-[#EFEFEF] rounded-[4px]"
                                        >
                                          {page.expanded ? "Collapse Preview ↑" : "Expand Editor ↓"}
                                        </button>
                                      </div>
                                    </div>

                                    {/* AI Assistant Prompter Box inside page */}
                                    {page.status === "completed" && (
                                      <div className="flex items-center gap-1.5 bg-[#141414] p-1.5 rounded-[6px] border border-[#252525]">
                                        <input
                                          type="text"
                                          id={`prompt-page-${page.id}`}
                                          placeholder="Ask AI (translate, rewrite layout, auto color matching, adjust spacing format)..."
                                          className="flex-1 bg-transparent border-none outline-none text-[11px] px-1 text-[#EFEFEF] focus:ring-0 focus:outline-[#FF6B2B]/40"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const inp = document.getElementById(`prompt-page-${page.id}`) as HTMLInputElement;
                                              if (inp && inp.value.trim()) {
                                                editBatchPageWithAi(activeItem.id, page.id, inp.value);
                                                inp.value = "";
                                              }
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            const inp = document.getElementById(`prompt-page-${page.id}`) as HTMLInputElement;
                                            if (inp && inp.value.trim()) {
                                              editBatchPageWithAi(activeItem.id, page.id, inp.value);
                                              inp.value = "";
                                            }
                                          }}
                                          disabled={aiEditingPageId === page.id}
                                          className="px-2.5 py-1 text-[10px] bg-[#FF6B2B] text-white hover:bg-[#E55A1A] font-semibold rounded-[4px] transition-all flex items-center gap-1 flex-shrink-0"
                                        >
                                          <Wand2 size={10} />
                                          <span>{aiEditingPageId === page.id ? "Working..." : "Enhance Layout"}</span>
                                        </button>
                                      </div>
                                    )}

                                    {/* Preview Layout Area */}
                                    {page.expanded && (
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                                        {/* Original reference page layout */}
                                        <div className="md:col-span-4 bg-[#111] p-2 rounded border border-[#252525] flex flex-col justify-between max-h-[360px] overflow-hidden">
                                          <div className="flex items-center justify-between px-1 mb-1">
                                            <span className="text-[10px] text-[#888888] uppercase tracking-wider font-bold">Source Page Ref</span>
                                          </div>
                                          <div className="flex-1 flex items-center justify-center overflow-auto max-h-[320px]">
                                            <img
                                              src={page.imageUrl}
                                              alt={`Original PDF Page ${page.pageNumber}`}
                                              className="max-w-full max-h-full object-contain select-none"
                                              referrerPolicy="no-referrer"
                                            />
                                          </div>
                                        </div>

                                        {/* Live Preview Box with live text editors */}
                                        <div className="md:col-span-8 flex flex-col max-h-[360px] overflow-hidden bg-[#161616] rounded border border-[#252525]">
                                          <div className="flex items-center justify-between px-2 py-1 bg-[#1A1A1A] border-b border-[#252525]">
                                            <span className="text-[10px] text-[#888888] uppercase tracking-wider font-bold select-none">
                                              Live Generated Type Block Preview
                                            </span>
                                            <span className="text-[9px] text-[#FF6B2B] bg-[#FF6B2B]/10 px-1.5 rounded font-bold animate-pulse">
                                              Color Pattern Preserved
                                            </span>
                                          </div>

                                          <div className="p-3 overflow-y-auto space-y-2 flex-1 font-sans text-xs bg-[#111111]">
                                            {(!page.elements || page.elements.length === 0) ? (
                                              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#888888]">
                                                <h5 className="font-semibold text-[11px] mb-1">LAYOUT NOT PROCESSED</h5>
                                                <p className="text-[10px] max-w-sm leading-normal">
                                                  Click &quot;Process Page AI&quot; to prompt Gemini to read and model the visual patterns, blocks, and text values.
                                                </p>
                                              </div>
                                            ) : (
                                              page.elements.map((el: any, elIdx: number) => {
                                                const isTextOrHeader = el.type === "paragraph" || el.type === "header" || el.type === "ordered-list" || el.type === "unordered-list" || el.type === "list-item";
                                                
                                                // Pattern styling properties
                                                const colorHex = el.style?.color || (page.pageNumber % 2 === 0 ? "#FF6B2B" : "#2196F3");
                                                const isBold = el.style?.isBold ?? false;
                                                const isItalic = el.style?.isItalic ?? false;

                                                return (
                                                  <div key={`${el.id}-${elIdx}`} className="relative border border-[#252525] p-2 rounded bg-[#1A1A1A] hover:border-[#FF6B2B]/30 transition-colors">
                                                    <div className="flex items-center justify-between mb-1 text-[9px]">
                                                      <span className="uppercase tracking-wider font-bold style-badge" style={{ color: colorHex }}>
                                                        {el.type} {isBold ? "• bold" : ""} {isItalic ? "• italic" : ""} {el.style?.fontSize ? `(${el.style.fontSize}pt)` : ""}
                                                      </span>
                                                      <span className="text-[#555555]">
                                                        {el.id}
                                                      </span>
                                                    </div>

                                                    {isTextOrHeader ? (
                                                      <textarea
                                                        value={el.content || ""}
                                                        onChange={(e) => updateBatchElementContent(activeItem.id, page.id, el.id, e.target.value)}
                                                        style={{
                                                          color: colorHex,
                                                          fontWeight: isBold ? "bold" : "normal",
                                                          fontStyle: isItalic ? "italic" : "normal",
                                                        }}
                                                        className="w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-[#FF6B2B]/40 text-[11px] p-1 rounded resize-y leading-normal min-h-[44px]"
                                                      />
                                                    ) : el.type === "image" ? (
                                                      <div className="space-y-1">
                                                        {el.imageB64 && (
                                                          <div className="max-w-[120px] max-h-[80px] overflow-hidden rounded border border-[#252525]">
                                                            <img src={el.imageB64} alt="Extracted Layer" className="object-contain" referrerPolicy="no-referrer" />
                                                          </div>
                                                        )}
                                                        <textarea
                                                          value={el.content || ""}
                                                          onChange={(e) => updateBatchElementContent(activeItem.id, page.id, el.id, e.target.value)}
                                                          className="w-full bg-transparent border-none text-[10px] text-gray-400 font-mono p-1 rounded"
                                                          placeholder="Image description..."
                                                        />
                                                      </div>
                                                    ) : (
                                                      <textarea
                                                        value={el.content || ""}
                                                        onChange={(e) => updateBatchElementContent(activeItem.id, page.id, el.id, e.target.value)}
                                                        style={{ color: colorHex }}
                                                        className="w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-[#FF6B2B]/40 text-[11.5px] p-1 rounded font-mono leading-normal min-h-[44px]"
                                                      />
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : batchItems.length === 0 ? (
                  <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-5">
                      <h2 className="text-[20px] font-bold text-[#EFEFEF] mb-1">
                        Batch PDF Processing
                      </h2>
                      <p className="text-[#888888] text-[13px] leading-[1.5]">
                        Upload multiple PDF files and convert them to layout-preserved Word documents in parallel.
                      </p>
                    </div>

                    <FileUploader
                      onFilesSelected={handleBatchFilesSelected}
                      isLoading={false}
                    />

                    {/* How it works info */}
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-[12px] bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525]">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#FF6B2B] mb-1">
                          Concurrently Processing
                        </h4>
                        <p className="text-[#888888] text-[11px] leading-[1.5]">
                          Assigns work dynamically across available API keys to process multiple PDFs at 50% capacity concurrently.
                        </p>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#888888] mb-1">
                          Auto-Generated DOCX
                        </h4>
                        <p className="text-[#888888] text-[11px] leading-[1.5]">
                          Once conversion is complete, click to download the individual layout-preserved DOCX files or grab them all.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* BATCH MONITOR DASHBOARD HEADER */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E1E1E] pb-2">
                      <div>
                        <h2 className="text-[14px] font-bold text-[#EFEFEF] flex items-center gap-1.5 uppercase tracking-[0.8px]">
                          <Layout size={14} className="text-[#FF6B2B]" />
                          <span>Batch Monitor Dashboard</span>
                        </h2>
                        <p className="text-[11px] text-[#888888]">
                          Monitor engine workload allocations, real-time key activities and file extractions.
                        </p>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Compact Add File Button */}
                        <label className={`px-2.5 py-1 text-[11px] font-medium bg-transparent border border-[#252525] text-[#EFEFEF] rounded-[6px] hover:bg-[#1E1E1E] transition-all cursor-pointer flex items-center gap-1 ${batchProcessingActive ? "opacity-50 pointer-events-none" : ""}`}>
                          <Plus size={11} className="text-[#FF6B2B]" />
                          <span>Add More PDFs</span>
                          <input
                            type="file"
                            accept="application/pdf"
                            multiple
                            onChange={(e) => handleBatchFilesSelected(e.target.files)}
                            className="hidden"
                            disabled={batchProcessingActive}
                          />
                        </label>

                        <button
                          onClick={clearBatch}
                          disabled={batchProcessingActive}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#888888] hover:text-[#F44336] rounded-[6px] transition-all disabled:opacity-50 border border-[#252525] hover:bg-[#1E1E1E]"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* KPI METRIC CARDS GRID */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
                      {/* Stat 1: Total Queue */}
                      <div className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] flex flex-col justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#888888]">
                          Total Uploads
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-[20px] font-bold text-[#EFEFEF]">
                            {batchItems.length}
                          </span>
                          <span className="text-[10px] text-[#555555]">files</span>
                        </div>
                      </div>

                      {/* Stat 2: Active / Processing */}
                      <div className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] flex flex-col justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#888888]">
                          Active Tasks
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-[20px] font-bold text-[#FF6B2B]">
                            {batchItems.filter((it) => it.status === "processing" || it.status === "reading").length}
                          </span>
                          {batchProcessingActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B2B] animate-ping" />
                          )}
                          <span className="text-[10px] text-[#555555]">running</span>
                        </div>
                      </div>

                      {/* Stat 3: Successful */}
                      <div className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] flex flex-col justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-green-500">
                          Completed
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-[20px] font-bold text-green-500">
                            {batchItems.filter((it) => it.status === "completed").length}
                          </span>
                          <span className="text-[10px] text-green-500/60">
                            / {batchItems.length}
                          </span>
                        </div>
                      </div>

                      {/* Stat 4: Failed */}
                      <div className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] flex flex-col justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#F44336]">
                          Errors / Failed
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-[20px] font-bold text-[#F44336]">
                            {batchItems.filter((it) => it.status === "failed").length}
                          </span>
                          <span className="text-[10px] text-[#F44336]/60">failed</span>
                        </div>
                      </div>
                    </div>

                    {/* GLOBAL BATCH PROGRESS BOARD */}
                    {batchItems.length > 0 && (
                      <div className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold uppercase tracking-[0.8px] text-[#888888]">
                            Global Batch Progress
                          </span>
                          <span className="font-mono text-[#EFEFEF] font-bold">
                            {Math.round(
                              batchItems.reduce((acc, item) => acc + item.progress, 0) /
                                batchItems.length,
                            )}
                            %
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#111111] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF6B2B] transition-all duration-300"
                            style={{
                              width: `${Math.round(
                                batchItems.reduce((acc, item) => acc + item.progress, 0) /
                                  batchItems.length,
                              )}%`,
                            }}
                          />
                        </div>

                        {/* Top controls toolbar */}
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between pt-1 gap-2 border-t border-[#1E1E1E]">
                          <div className="flex items-center gap-1.5 text-[11px] text-[#888888]">
                            <Info size={12} className="text-[#FF6B2B]" />
                            <span>
                              {batchProcessingActive
                                ? "Processing queued documents..."
                                : "Documents loaded. Click below or start process."}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 self-end">
                            <button
                              onClick={startBatchProcessing}
                              disabled={batchProcessingActive || batchItems.every((it) => it.status === "completed")}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-[#FF6B2B] hover:bg-[#E55A1A] text-white rounded-[6px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 uppercase tracking-[0.5px]"
                            >
                              {batchProcessingActive ? (
                                <>
                                  <RefreshCw size={11} className="animate-spin" />
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <Zap size={11} />
                                  <span>Start Batch Run</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => {
                                const completed = batchItems.filter((it) => it.status === "completed");
                                completed.forEach((it, idx) => {
                                  setTimeout(() => {
                                    if (it.docxBlob) {
                                      const url = window.URL.createObjectURL(it.docxBlob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      const nameWithoutExt = it.name.substring(0, it.name.lastIndexOf(".")) || it.name;
                                      a.download = `${nameWithoutExt}.docx`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      window.URL.revokeObjectURL(url);
                                    }
                                  }, idx * 400);
                                });
                              }}
                              disabled={batchItems.filter((it) => it.status === "completed").length === 0}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-transparent border border-[#252525] text-[#EFEFEF] rounded-[6px] hover:bg-[#1C1C1C] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 uppercase tracking-[0.5px]"
                            >
                              <FileDown size={11} />
                              <span>Download All DOCX</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TWO-COLUMN GRID LIST FOR ACTIVE UPLOADS & PROGRESS MONITORING */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[12px]">
                      {batchItems.map((item, itemIdx) => (
                        <div
                          key={`${item.id}-${itemIdx}`}
                          className="bg-[#1A1A1A] p-3 rounded-[8px] border border-[#252525] hover:shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-all flex flex-col justify-between"
                        >
                          {/* File info panel */}
                          <div>
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <div className="p-1 bg-[#FF6B2B]/10 rounded text-[#FF6B2B] mt-[1px] flex-shrink-0">
                                  <FileText size={14} />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-[12px] font-semibold text-[#EFEFEF] truncate" title={item.name}>
                                    {item.name}
                                  </h4>
                                  <p className="text-[10px] text-[#888888]">
                                    {(item.file.size / 1024 / 1024).toFixed(2)} MB • {item.pageCount > 0 ? `${item.pageCount} pages` : "Awaiting processing"}
                                  </p>
                                </div>
                              </div>

                              {!batchProcessingActive && item.status !== "completed" && (
                                <button
                                  onClick={() => removeBatchItem(item.id)}
                                  className="text-[#555555] hover:text-[#F44336] transition-colors p-0.5 text-[14px] leading-none cursor-pointer"
                                  title="Remove file"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {/* Status badge with customizable styles & real-time subtitle */}
                            <div className="flex items-center gap-1.5 mb-2.5">
                              {item.status === "completed" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#1A3A1A] text-[#4CAF50]">
                                  COMPLETED
                                </span>
                              )}
                              {item.status === "failed" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#3A1A1A] text-[#F44336]">
                                  FAILED
                                </span>
                              )}
                              {item.status === "processing" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#FF6B2B]/20 text-[#FF6B2B] animate-pulse">
                                  PROCESSING
                                </span>
                              )}
                              {item.status === "reading" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#1A2A3A] text-[#2196F3]">
                                  READING
                                </span>
                              )}
                              {item.status === "pending" && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#1C1C1C] text-[#888888] border border-[#252525]">
                                  PENDING
                                </span>
                              )}

                              <span className="text-[10px] text-[#888888] truncate flex-1 block" title={item.statusText}>
                                {item.statusText}
                              </span>
                            </div>
                          </div>

                          {/* Live Dynamic Loader & Bottom Actions */}
                          <div className="space-y-2 pt-2 border-t border-[#1E1E1E]">
                            <div className="w-full h-1 bg-[#111111] rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  item.status === "completed"
                                    ? "bg-green-500"
                                    : item.status === "failed"
                                      ? "bg-[#F44336]"
                                      : "bg-[#FF6B2B]"
                                }`}
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[#555555] font-mono font-medium">
                                Progress: {item.progress}%
                              </span>

                              {item.status === "completed" && item.docxBlob && (
                                <button
                                  onClick={() => {
                                    if (item.docxBlob) {
                                      const url = window.URL.createObjectURL(item.docxBlob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      const nameWithoutExt = item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
                                      a.download = `${nameWithoutExt}.docx`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      window.URL.revokeObjectURL(url);
                                    }
                                  }}
                                  className="flex items-center gap-0.5 text-[11px] font-medium text-[#FF6B2B] hover:underline"
                                >
                                  <FileDown size={10} />
                                  <span>DOCX</span>
                                </button>
                              )}

                              {(item.status === "failed" || item.status === "completed") && (
                                <button
                                  onClick={() => {
                                    const customKeys = localStorage.getItem("active_gemini_api_key");
                                    const isPersonalApi = customKeys && customKeys.length > 5;
                                    const pdfRate = rates?.pdfConverter || { system: 50, custom: 2 };
                                    const singlePageTokens = isPersonalApi ? pdfRate.custom : pdfRate.system;
                                    processSingleBatchItem(item.id, singlePageTokens, isPersonalApi);
                                  }}
                                  disabled={batchProcessingActive}
                                  className="text-[11px] font-medium text-[#FF6B2B] hover:underline flex items-center gap-0.5 disabled:opacity-50"
                                >
                                  <RefreshCw size={10} />
                                  <span>{item.status === "failed" ? "Retry" : "Retry AI"}</span>
                                </button>
                              )}
                            </div>
                            
                            <button
                              onClick={() => setSelectedBatchItemId(item.id)}
                              className="w-full mt-2 py-1.5 text-[10.5px] font-bold bg-[#FF6B2B]/10 hover:bg-[#FF6B2B]/15 border border-[#FF6B2B]/20 text-[#FF6B2B] rounded-[6px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Layout size={11} />
                              <span>Open Page Workspace ({item.pages?.length || 0})</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : pages.length === 0 ? (
              <div className="max-w-4xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-center mb-4 space-y-4"
                >
                  {/* SPLASH HEADER REMOVED FOR CLEANER UI */}
                  <div className="flex flex-wrap justify-center gap-4 pt-1 hidden md:flex">
                    <div className="flex items-center gap-2 bg-[#1A1A1A] px-1 py-1 rounded-full border border-[#252525]">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-[13px] font-medium text-[#EFEFEF]">
                        99.9% Accuracy
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-[#1A1A1A] px-1 py-1 rounded-full border border-[#252525]">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-[13px] font-medium text-[#EFEFEF]">
                        Layout Aware
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-[#1A1A1A] px-1 py-1 rounded-full border border-[#252525]">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-[13px] font-medium text-[#EFEFEF]">
                        Secure Cloud Sync
                      </span>
                    </div>
                  </div>
                </motion.div>

                <FileUploader
                  onFilesSelected={handleFilesSelected}
                  isLoading={appState === AppState.PROCESSING_PDF}
                  progress={uploadProgress}
                  status={uploadStatus}
                />

                {/* How it works section */}
                <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-[12px]">
                  {[
                    {
                      step: "01",
                      title: "Upload PDF",
                      desc: "Drag and drop your scanned PDFs or images into the secure converter.",
                    },
                    {
                      step: "02",
                      title: "AI Analysis",
                      desc: "Our Gemini-powered AI identifies text, tables, and layouts in real-time.",
                    },
                    {
                      step: "03",
                      title: "Export Word",
                      desc: "Download the refined, layout-preserved DOCX or TXT file instantly.",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="bg-[#1A1A1A] p-2 rounded-[8px] border border-[#252525] relative overflow-hidden group"
                    >
                      <div className="text-[40px] font-black text-[#EFEFEF]/5 absolute -right-2 -bottom-2 group-hover:text-[#FF6B2B]/10 transition-colors">
                        {item.step}
                      </div>
                      <h3 className="text-[13px] font-semibold text-[#EFEFEF] mb-1 relative z-10 uppercase tracking-[0.8px]">
                        {item.title}
                      </h3>
                      <p className="text-[#888888] text-[11px] leading-[1.5] relative z-10">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>

                {appState === AppState.PROCESSING_PDF && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 flex flex-col items-center gap-3"
                  >
                    <div className="w-8 h-8 border-[#252525] border-[#252525] border-t-[#FF6B2B] rounded-[20px] animate-spin" />
                    <p className="text-[#EFEFEF] font-semibold tracking-wider uppercase text-[10px]">
                      Analyzing document...
                    </p>
                  </motion.div>
                )}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Error Modal */}
                <AnimatePresence>
                  {selectedError && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-[#0F0F0F]/50 z-[100] flex items-center justify-center p-1"
                      onClick={() => setSelectedError(null)}
                    >
                      <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="bg-[#1A1A1A] p-1 rounded-[8px] max-w-lg w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h3 className="text-[16px] font-bold text-[#EFEFEF] mb-1">
                          Error Details
                        </h3>
                        <pre className="bg-[#141414] p-1 rounded-[8px] text-[11px] text-[#EFEFEF] overflow-auto max-h-60 whitespace-pre-wrap">
                          {selectedError}
                        </pre>
                        <button
                          onClick={() => setSelectedError(null)}
                          className="mt-1 w-full bg-transparent border border-[#2A2A2A] text-[#EFEFEF] py-1 rounded-[6px] hover:bg-[#1A1A1A] transition-colors font-medium text-[13px]"
                        >
                          Close
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main Tool Header - Combined Progress & Actions */}
                <div className="bg-[#1A1A1A] rounded-[8px] border border-[#252525] sticky top-0 z-50 overflow-hidden">
                  {/* Integrated Progress Bar (Top edge) */}
                  <AnimatePresence>
                    {appState === AppState.ANALYZING && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 3 }}
                        exit={{ height: 0 }}
                        className="w-full bg-[#141414] relative overflow-hidden"
                      >
                        <motion.div
                          className="h-full bg-[#FF6B2B] relative"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.round((pages.filter((p) => p.isSelected && (p.status === "done" || p.status === "error")).length / Math.max(1, pages.filter((p) => p.isSelected).length)) * 100)}%`,
                          }}
                          transition={{
                            type: "spring",
                            bounce: 0,
                            duration: 0.5,
                          }}
                        ></motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="p-1 flex flex-col gap-2.5">
                    {/* Top Row: Processing Info (Conditional) & Main Actions */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-2.5">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {appState === AppState.ANALYZING ? (
                          <div className="flex items-center gap-2.5 bg-[#1A1A1A] px-1 py-1 rounded-[8px] border border-[#252525] min-w-0 max-w-md">
                            <RefreshCw className="w-3.5 h-3.5 text-[#FF6B2B] animate-spin flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-bold text-[#EFEFEF] truncate">
                                Processing: {fileName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-[#FF6B2B] font-bold tabular-nums">
                                  {Math.round(
                                    (pages.filter(
                                      (p) =>
                                        p.isSelected &&
                                        (p.status === "done" ||
                                          p.status === "error"),
                                    ).length /
                                      Math.max(
                                        1,
                                        pages.filter((p) => p.isSelected)
                                          .length,
                                      )) *
                                      100,
                                  )}
                                  %
                                </span>
                                <span className="text-[9px] text-[#888888] font-medium">
                                  {
                                    pages.filter(
                                      (p) =>
                                        p.isSelected &&
                                        (p.status === "done" ||
                                          p.status === "error"),
                                    ).length
                                  }
                                  /{pages.filter((p) => p.isSelected).length}{" "}
                                  pages
                                </span>
                                {totalKeys > 1 && (
                                  <span className="px-1 py-1 bg-[#1A3A1A] text-[#4CAF50] text-[8px] font-black rounded uppercase tracking-tighter border border-[#4CAF50]/20">
                                    Turbo: {totalKeys} Keys
                                  </span>
                                )}
                                {pages.filter(
                                  (p) => p.isSelected && p.status === "error",
                                ).length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() =>
                                        setSelectedError(
                                          pages.find(
                                            (p) =>
                                              p.isSelected &&
                                              p.status === "error",
                                          )?.errorMessage ||
                                            "No error details available.",
                                        )
                                      }
                                      className="text-[9px] text-[#F44336] font-bold hover:underline"
                                    >
                                      {
                                        pages.filter(
                                          (p) =>
                                            p.isSelected &&
                                            p.status === "error",
                                        ).length
                                      }{" "}
                                      errors
                                    </button>
                                    <button
                                      onClick={retryAllErrors}
                                      className="flex items-center gap-1.5 px-1 py-1 bg-[#3A1A1A] border border-[#F44336]/30 text-[#F44336] rounded-[6px] hover:bg-[#F44336]/20 transition-all text-[9px] font-bold"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" />
                                      Retry All
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-1 py-1 bg-[#141414] rounded-[8px]">
                            <span className="text-[11px] font-bold text-[#EFEFEF]">
                              {selectedCount}/{totalCount}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => toggleAllSelection(true)}
                                className="text-[10px] font-bold text-[#EFEFEF] hover:bg-[#1A1A1A] px-1 py-1 rounded  transition-all"
                              >
                                ALL
                              </button>
                              <button
                                onClick={() => toggleAllSelection(false)}
                                className="text-[10px] font-bold text-[#555555] hover:bg-[#1A1A1A] px-1 py-1 rounded  transition-all"
                              >
                                NONE
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Live Consumption Stats */}
                        <div className="hidden sm:flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-[#1A1A1A] px-1 py-1 rounded-[8px] border border-[#252525]">
                            <Type className="w-3 h-3 text-[#2196F3]" />
                            <span className="text-[10px] font-bold text-[#EFEFEF] tabular-nums">
                              {wordsConsumed.toLocaleString()}{" "}
                              <span className="text-[8px] text-[#555555]">
                                WORDS
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[#1A1A1A] px-1 py-1 rounded-[8px] border border-[#252525]">
                            <Zap className="w-3 h-3 text-[#FF6B2B]" />
                            <span className="text-[10px] font-bold text-[#EFEFEF] tabular-nums">
                              {pointsConsumed}{" "}
                              <span className="text-[8px] text-[#555555]">
                                POINTS
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="relative">
                          <Filter className="w-3 h-3 text-[#555555] absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Range (e.g. 1-5)"
                            className="pl-2 pr-1 py-1 text-[11px] bg-[#111111] border border-[#252525] rounded-[8px] focus:outline-none focus:border-[#FF6B2B] focus:ring-2 focus:ring-slate-200 transition-all w-28"
                            value={rangeInput}
                            onChange={(e) => setRangeInput(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && applyRangeSelection()
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto">
                        {hasCompletedPages && (
                          <div className="flex gap-2 mr-1">
                            <button
                              onClick={copyAllText}
                              className="p-1 text-[#555555] hover:bg-[#141414] rounded-[8px] transition-colors"
                              title="Copy All"
                            >
                              {copySuccess ? (
                                <Check className="w-4 h-4 text-[#4CAF50]" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={downloadDocx}
                              className="px-1 py-1 transparent text-[#EFEFEF] border border-[#2A2A2A] hover:bg-[#1A1A1A] rounded-[6px] text-[11px] font-bold flex items-center gap-2 transition-all "
                            >
                              <FileDown className="w-4 h-4" />
                              DOCX
                            </button>
                          </div>
                        )}

                        {appState !== AppState.ANALYZING ? (
                          <div className="flex gap-2 flex-1 md:flex-none">
                            <label className="px-1 py-1 transparent text-[#EFEFEF] border border-[#2A2A2A] hover:bg-[#1A1A1A] rounded-[6px] text-[11px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                              <Plus className="w-4 h-4" />
                              ADD
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                multiple
                                onChange={(e) =>
                                  handleFilesSelected(e.target.files, true)
                                }
                              />
                            </label>
                            <button
                              onClick={startExtraction}
                              disabled={
                                selectedPendingCount === 0 && !hasErrorPages
                              }
                              className={`flex-1 md:flex-none px-1 py-1 rounded-[6px] flex items-center justify-center gap-2 text-[11px] font-bold transition-all ${
                                selectedPendingCount === 0 && !hasErrorPages
                                  ? "bg-[#141414] text-[#555555] cursor-not-allowed"
                                  : "bg-[#FF6B2B] text-[#EFEFEF] hover:bg-[#E55A1A]"
                              }`}
                            >
                              <Wand2 className="w-4 h-4" />
                              {hasErrorPages && selectedPendingCount === 0
                                ? "RETRY"
                                : `CONVERT (${selectedPendingCount})`}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 flex-1 md:flex-none">
                            {pages.filter(
                              (p) => p.isSelected && p.status === "error",
                            ).length > 0 && (
                              <button
                                onClick={() => {
                                  setPages((prev) =>
                                    prev.map((p) =>
                                      p.isSelected && p.status === "error"
                                        ? {
                                            ...p,
                                            status: "pending",
                                            elements: undefined,
                                            extractedText: undefined,
                                          }
                                        : p,
                                    ),
                                  );
                                  startExtraction();
                                }}
                                className="px-1 py-1 bg-[#3A1A1A] text-[#F44336] border border-[#F44336]/30 text-[#EFEFEF] rounded-[8px] text-[11px] font-bold hover:bg-[#F44336]/20 transition-colors "
                              >
                                Retry Failed
                              </button>
                            )}
                            <div className="px-1 py-1 bg-[#141414] text-[#EFEFEF] rounded-[8px] text-[11px] font-bold flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              PROCESSING...
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aligned Conversion Configuration Center */}
                    <div className="pt-2 mt-2 border-t border-[#252525]">
                      <div className="flex items-center gap-2 mb-1">
                        <Settings className="w-4 h-4 text-[#FF6B2B]" />
                        <span className="text-[11px] font-bold text-[#EFEFEF] uppercase tracking-[1px]">
                          Conversion Settings
                        </span>
                      </div>

                      <div className="bg-[#141414] border border-[#252525] p-1 rounded-[8px] flex flex-col gap-3.5 mt-1">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 pb-1 border-b border-[#252525]">
                            <Layout className="w-3.5 h-3.5 text-[#FF6B2B]" />
                            <span className="text-[10px] font-black uppercase text-[#EFEFEF] tracking-[0.5px]">
                              Layout Rules
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1.5">
                            {/* Numbering Style Select */}
                            <div className="flex items-center justify-between gap-1 px-1 py-1 bg-[#1A1A1A] border border-[#252525] rounded-[4px]">
                              <span className="text-[10px] font-bold text-[#888888] uppercase">
                                Numbering
                              </span>
                              <select
                                value={numberingStyle}
                                onChange={(e) =>
                                  setNumberingStyle(
                                    e.target.value as NumberingStyle,
                                  )
                                }
                                className="text-[10px] bg-[#141414] border border-[#252525] rounded px-1 py-1 text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] cursor-pointer"
                              >
                                <option value={NumberingStyle.NONE}>
                                  None
                                </option>
                                <option value={NumberingStyle.Q_DOT}>
                                  Q1.
                                </option>
                                <option value={NumberingStyle.HASH}>#1.</option>
                                <option value={NumberingStyle.QUESTION_DOT}>
                                  Question 1.
                                </option>
                                <option value={NumberingStyle.NUMBER_DOT}>
                                  1.
                                </option>
                              </select>
                            </div>

                            {/* Bilingual OCR Toggle */}
                            <button
                              onClick={() => setIsBilingual(!isBilingual)}
                              className={`flex items-center justify-between px-1 py-1 bg-[#1A1A1A] border rounded-[4px] transition-all text-[10px] font-bold cursor-pointer ${isBilingual ? "border-[#FF6B2B]/30 text-[#FF6B2B]" : "border-[#252525] text-[#888888] hover:text-[#EFEFEF]"}`}
                            >
                              <span className="uppercase">Bilingual</span>
                              <span
                                className={`text-[8px] font-black px-1 py-1 rounded-full ${isBilingual ? "bg-[#FF6B2B] text-black" : "bg-[#2A2A2A] text-[#555555]"}`}
                              >
                                {isBilingual ? "ON" : "OFF"}
                              </span>
                            </button>

                            {/* Extract Images Toggle */}
                            <button
                              onClick={() => setIncludeImages(!includeImages)}
                              className={`flex items-center justify-between px-1 py-1 bg-[#1A1A1A] border rounded-[4px] transition-all text-[10px] font-bold cursor-pointer ${includeImages ? "border-[#FF6B2B]/30 text-[#FF6B2B]" : "border-[#252525] text-[#888888] hover:text-[#EFEFEF]"}`}
                            >
                              <span className="uppercase">Extract Images</span>
                              <span
                                className={`text-[8px] font-black px-1 py-1 rounded-full ${includeImages ? "bg-[#FF6B2B] text-black" : "bg-[#2A2A2A] text-[#555555]"}`}
                              >
                                {includeImages ? "ON" : "OFF"}
                              </span>
                            </button>

                            {/* Refine Format Toggle */}
                            <button
                              onClick={() => setRefineMode(!refineMode)}
                              className={`flex items-center justify-between px-1 py-1 bg-[#1A1A1A] border rounded-[4px] transition-all text-[10px] font-bold cursor-pointer ${refineMode ? "border-[#FF6B2B]/30 text-[#FF6B2B]" : "border-[#252525] text-[#888888] hover:text-[#EFEFEF]"}`}
                            >
                              <span className="uppercase">Refine Format</span>
                              <span
                                className={`text-[8px] font-black px-1 py-1 rounded-full ${refineMode ? "bg-[#FF6B2B] text-black" : "bg-[#2A2A2A] text-[#555555]"}`}
                              >
                                {refineMode ? "ON" : "OFF"}
                              </span>
                            </button>

                            {/* Auto Proofread Toggle */}
                            <button
                              onClick={() => setAutoProofread(!autoProofread)}
                              className={`flex items-center justify-between px-1 py-1 bg-[#1A1A1A] border rounded-[4px] transition-all text-[10px] font-bold cursor-pointer ${autoProofread ? "border-[#FF6B2B]/30 text-[#FF6B2B]" : "border-[#252525] text-[#888888] hover:text-[#EFEFEF]"}`}
                            >
                              <span className="uppercase">Proofread</span>
                              <span
                                className={`text-[8px] font-black px-1 py-1 rounded-full ${autoProofread ? "bg-[#FF6B2B] text-black" : "bg-[#2A2A2A] text-[#555555]"}`}
                              >
                                {autoProofread ? "ON" : "OFF"}
                              </span>
                            </button>

                            {/* Systematic Layout Toggle */}
                            <button
                              onClick={() =>
                                setSystematicArrange(!systematicArrange)
                              }
                              className={`flex items-center justify-between px-1 py-1 bg-[#1A1A1A] border rounded-[4px] transition-all text-[10px] font-bold cursor-pointer ${systematicArrange ? "border-[#FF6B2B]/30 text-[#FF6B2B]" : "border-[#252525] text-[#888888] hover:text-[#EFEFEF]"}`}
                              title="On: Systematic arrange & format layout dynamically. Off: raw block template text verbatim."
                            >
                              <span className="uppercase">Systematic</span>
                              <span
                                className={`text-[8px] font-black px-1 py-1 rounded-full ${systematicArrange ? "bg-[#FF6B2B] text-black" : "bg-[#2A2A2A] text-[#555555]"}`}
                              >
                                {systematicArrange ? "ON" : "OFF"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-1 bg-[#3A1A1A] text-[#F44336] rounded-[12px] border border-[#F44336]/30 flex flex-col gap-3 mt-1 "
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-1 text-[#F44336]" />
                        <div>
                          <h4 className="font-bold text-[14px] uppercase tracking-wider text-[#F44336]">
                            Processing Interrupted
                          </h4>
                          <p className="text-[13px] mt-1 text-[#EFEFEF] leading-relaxed">
                            {errorMsg}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 pl-3">
                        <button
                          onClick={retryAllErrors}
                          className="px-1 py-1 bg-[#F44336] text-[#EFEFEF] rounded-[8px] text-[12px] font-bold flex items-center gap-2 hover:bg-[#d32f2f] transition-all  active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry All Failed Pages
                        </button>
                        <button
                          onClick={() => setErrorMsg(null)}
                          className="px-1 py-1 bg-transparent border border-[#F44336]/30 text-[#F44336] rounded-[8px] text-[12px] font-bold hover:bg-[#F44336]/10 transition-all active:scale-95"
                        >
                          Dismiss
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {hasErrorPages && !errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex flex-col sm:flex-row items-center justify-between gap-3 p-1 bg-[#1A1111] border border-[#F44336]/20 rounded-[12px]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#3A1A1A] flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-[#F44336]" />
                      </div>
                      <div>
                        <h5 className="text-[12px] font-bold text-[#EFEFEF]">
                          Some pages failed to process
                        </h5>
                        <p className="text-[11px] text-[#888888]">
                          You can retry them all at once or individually.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={retryAllErrors}
                      className="w-full sm:w-auto px-1 py-1 bg-[#F44336] text-[#EFEFEF] rounded-[8px] text-[12px] font-bold flex items-center justify-center gap-2 hover:bg-[#d32f2f] transition-all  active:scale-95"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry {
                        pages.filter((p) => p.status === "error").length
                      }{" "}
                      Failed Pages
                    </button>
                  </motion.div>
                )}

                {/* Grid of Pages */}
                <div className="space-y-8">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[12px] font-black text-[#555555] uppercase tracking-[0.2em] flex items-center gap-2">
                        <Layout className="w-4 h-4" />
                        Processing Queue
                      </h3>
                      <span className="text-[10px] font-bold text-[#333333] bg-[#1A1A1A] px-1 py-1 rounded">
                        {pages.length} PAGES TOTAL
                      </span>
                    </div>
                    <ProcessingList
                      pages={pages}
                      onUpdateText={updatePageText}
                      onRetry={retryPage}
                      onToggleSelection={(id) => {
                        togglePageSelection(id);
                      }}
                      collapsedPages={collapsedPages}
                      togglePageCollapse={togglePageCollapse}
                      includeImages={includeImages}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </main>

          <HistorySidebar
            history={history}
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            onSelectItem={handleSelectHistoryItem}
            onDeleteItem={handleDeleteHistoryItem}
            onClearAll={() => setHistory([])}
            isCloudSynced={!!user}
            onLoginRequest={() => {
              signInWithGoogle().catch((err) => {
                console.error("Login redirect failed", err);
                setErrorMsg(
                  "Failed to sign in: " +
                    (err instanceof Error ? err.message : String(err)),
                );
              });
            }}
          />

          {/* SEO Content Section */}
          <div className="mt-15 border-t border-[#252525] pt-11 pb-9">
            <div className="max-w-5xl mx-auto px-1 box-border">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-center mb-7"
              >
                <h2 className="text-[28px] md:text-[32px] font-bold text-[#EFEFEF] mb-1 tracking-tight">
                  Why Choose Our{" "}
                  <span className="text-[#FF6B2B]">AI PDF to Text</span>{" "}
                  Converter?
                </h2>
                <p className="text-[#888888] text-[14px] max-w-2xl mx-auto leading-relaxed">
                  We don't just extract text; we understand your documents. Our
                  vision-language models bridge the gap between flat images and
                  structured, editable content.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px] mb-11">
                {[
                  {
                    title: "Human-Quality OCR",
                    desc: "Handles pixelated scans, handwritten notes, and low-contrast documents that standard tools fail on.",
                    icon: <Wand2 className="w-5 h-5 text-[#FF6B2B]" />,
                  },
                  {
                    title: "Smart Layout Detection",
                    desc: "Automatically detects multi-column layouts, tables, and nested lists to maintain reading order.",
                    icon: <Layout className="w-5 h-5 text-[#2196F3]" />,
                  },
                  {
                    title: "MCQ & Exam Optimized",
                    desc: "Tuned specifically for digitizing question papers with automated answer extraction and pattern recognition.",
                    icon: <ListChecks className="w-5 h-5 text-[#4CAF50]" />,
                  },
                ].map((feature, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-[#1A1A1A] p-2 rounded-[8px] border border-[#252525] hover:border-[#FF6B2B]/30 transition-all flex flex-col items-center text-center"
                  >
                    <div className="w-10 h-10 bg-[#141414] rounded-[8px] flex items-center justify-center mb-1 border border-[#252525]">
                      {feature.icon}
                    </div>
                    <h3 className="text-[14px] font-bold text-[#EFEFEF] mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-[#888888] text-[12px] leading-relaxed">
                      {feature.desc}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-11">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                >
                  <h2 className="text-[24px] font-bold text-[#EFEFEF] mb-1">
                    Advanced <span className="text-[#FF6B2B]">PDF to Text</span>{" "}
                    Processing
                  </h2>
                  <div className="space-y-4 text-[#888888] text-[13px] leading-relaxed">
                    <p>
                      When you convert a **pdf to text** with our tool, you're
                      using the same technology that powers some of the world's
                      most advanced AI researchers. We utilize **Gemini AI** to
                      analyze the visual context of every page.
                    </p>
                    <p>
                      This means our **pdf to text converter** can distinguish
                      between a footer and a main paragraph, correctly identify
                      headings even if they aren't marked in the file metadata,
                      and accurately recreate tables that would normally come
                      out as a jumbled mess of text.
                    </p>
                    <div className="pt-1 flex gap-3">
                      <div className="bg-[#1A1A1A] border border-[#252525] p-1 rounded-[8px] flex-1 text-center">
                        <div className="text-[18px] font-bold text-[#EFEFEF]">
                          4x
                        </div>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-[#555555]">
                          Better Results
                        </div>
                      </div>
                      <div className="bg-[#1A1A1A] border border-[#252525] p-1 rounded-[8px] flex-1 text-center">
                        <div className="text-[18px] font-bold text-[#EFEFEF]">
                          0s
                        </div>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-[#555555]">
                          Setup Time
                        </div>
                      </div>
                      <div className="bg-[#1A1A1A] border border-[#252525] p-1 rounded-[8px] flex-1 text-center">
                        <div className="text-[18px] font-bold text-[#EFEFEF]">
                          Free
                        </div>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-[#555555]">
                          AI Access
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="bg-[#1A1A1A] p-1 rounded-[8px] border border-[#252525]  relative"
                >
                  <div className="absolute inset-0 bg-[#FF6B2B]/5 rounded-[8px] blur-3xl -z-10" />
                  <div className="aspect-video bg-[#141414] rounded-[6px] border border-[#252525] flex items-center justify-center overflow-hidden">
                    <div className="p-2 w-full">
                      <div className="h-1.5 w-1/2 bg-[#252525] rounded-full mb-1" />
                      <div className="h-1.5 w-3/4 bg-[#FF6B2B]/30 rounded-full mb-1" />
                      <div className="h-1.5 w-2/3 bg-[#252525] rounded-full mb-2" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-16 bg-[#1A1A1A] rounded-[4px] border border-[#252525] border-dashed" />
                        <div className="h-16 bg-[#1A1A1A] rounded-[4px] border border-[#252525] border-dashed" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              <section className="mb-11">
                <h2 className="text-[24px] font-bold text-[#EFEFEF] mb-4 text-center">
                  Frequently Asked Questions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      q: "How accurate is the AI PDF to Text converter?",
                      a: "Our tool achieves near-perfect accuracy even on messy documents. By leveraging Gemini's visual understanding, it resolves ambiguous characters using linguistic context, making it the most reliable pdf to text converter available.",
                    },
                    {
                      q: "Is it safe to upload sensitive documents?",
                      a: "Security is our priority. Files are processed over encrypted channels (HTTPS) and are purged after analysis. We do not store your raw file content permanently, ensuring your data remains private.",
                    },
                    {
                      q: "Does it support languages other than English?",
                      a: "Yes, our **pdf to text** engine is natively multilingual. It can process Hindi, Spanish, French, Chinese, and many other languages accurately, even within the same document.",
                    },
                    {
                      q: "Can I convert images (JPG/PNG) to text?",
                      a: "Yes. The same powerful engine handles images exactly like PDFs. Simply drag your image into the converter to extract text instantly.",
                    },
                    {
                      q: "What makes this different from regular OCR?",
                      a: "Traditional OCR 'guesses' letters. Our **AI PDF to Text** 'understands' the document. It knows when a list starts, when a table spans multiple lines, and how to ignore irrelevant watermarks.",
                    },
                    {
                      q: "Can I export the results to Microsoft Word?",
                      a: "Absolutely. Once extracted, you can download a professionally formatted DOCX file that maintains the structure and styling of your original document.",
                    },
                  ].map((faq, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-[#1A1A1A] border border-[#252525] p-2 rounded-[8px] hover:bg-[#1C1C1C] transition-colors"
                    >
                      <h4 className="text-[13px] font-bold text-[#FF6B2B] mb-1">
                        {faq.q}
                      </h4>
                      <p className="text-[#888888] text-[12px] leading-relaxed">
                        {faq.a}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </section>

              <footer className="pt-5 border-t border-[#252525] text-center space-y-3">
                <div className="flex justify-center gap-4 text-[#555555] text-[11px] font-medium">
                  <a
                    href="#"
                    className="hover:text-[#FF6B2B] transition-colors"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="#"
                    className="hover:text-[#FF6B2B] transition-colors"
                  >
                    Terms of Service
                  </a>
                  <a
                    href="#"
                    className="hover:text-[#FF6B2B] transition-colors"
                  >
                    Contact Us
                  </a>
                </div>
                <p className="text-[#555555] text-[10px] pt-1">
                  © 2026 AI PDF to Text Converter. Powered by Next-Gen Vision
                  OCR. Accurate. Fast. Secure.
                </p>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PdfConverter;
