import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Move,
  Check,
  Trash2,
  RotateCw,
  RotateCcw,
  Download,
  Maximize2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Eye,
  RefreshCw,
  Loader2,
  Scissors,
  Settings2,
  BookOpen,
  Plus,
  AlertTriangle,
  AlertCircle,
  ArrowLeftRight,
  HelpCircle,
  X,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, degrees } from "pdf-lib";
import * as fflate from "fflate";

// Setup pdf.js worker URL relative to the version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Custom lightweight concurrency queue to speed up client-side PDF page rendering
class ConcurrencyQueue {
  private activeCount = 0;
  // Scaled max concurrency: uses 4 to 8 concurrent renders depending on CPU core count, matching modern processors
  private maxConcurrency = Math.max(4, Math.min(8, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 6));
  private queue: (() => Promise<void>)[] = [];

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const runTask = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };
      this.queue.push(runTask);
      this.processNext();
    });
  }

  private processNext() {
    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const renderQueue = new ConcurrencyQueue();

// Interfaces
interface PDFPageItem {
  id: string; // unique page ID: fileId_originalPageNumber_unique
  fileId: string;
  sourceFileName: string;
  sourceFileColor: string;
  originalPageNumber: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnailUrl?: string;
}

interface UploadedPDFSource {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  color: string;
  isEncrypted: boolean;
  isValid: boolean;
  arrayBuffer: ArrayBuffer;
}

interface UndoRedoAction {
  pages: PDFPageItem[];
  description: string;
}

const SOURCE_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-[#FF6B2B]",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-teal-500",
  "bg-amber-500",
];

interface Props {
  onBackToHub?: () => void;
}

export const PdfArranger: React.FC<Props> = ({ onBackToHub }) => {
  // Application states
  const [sources, setSources] = useState<UploadedPDFSource[]>([]);
  const [pages, setPages] = useState<PDFPageItem[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  // History State (Undo & Redo)
  const [undoStack, setUndoStack] = useState<UndoRedoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoAction[]>([]);
  const [historyFlashMsg, setHistoryFlashMsg] = useState<string | null>(null);

  // Loading and Progress statuses
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingText, setProcessingText] = useState("");

  // PDF.js cache for parsed Documents in React
  const pdfJsDocCache = useRef<Map<string, any>>(new Map());

  // High performance localized thumbnail cache (keyed by fileId_pPageNumber)
  const thumbnailCache = useRef<Map<string, string>>(new Map());

  // Interactive configurations (Merge Options)
  const [outputFilename, setOutputFilename] = useState("merged_output.pdf");
  const [enablePageNumbers, setEnablePageNumbers] = useState(false);
  const [pageNumbersStyle, setPageNumbersStyle] = useState<"arabic" | "roman">(
    "arabic",
  );
  const [pageNumbersPosition, setPageNumbersPosition] = useState<
    "bottom-center" | "bottom-right" | "top-right"
  >("bottom-center");
  const [pageNumbersFontSize, setPageNumbersFontSize] = useState<number>(10);

  // Custom Confirmation Dialog (prevents sandboxed iframe confirm errors)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [enableBookmarks, setEnableBookmarks] = useState(false);
  const [blankPageInsert, setBlankPageInsert] = useState(false);
  const [forceMergeMode, setForceMergeMode] = useState<
    "hybrid" | "client" | "server"
  >("hybrid");

  // Metadata Configurations
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataAuthor, setMetadataAuthor] = useState("");
  const [metadataSubject, setMetadataSubject] = useState("");
  const [metadataKeywords, setMetadataKeywords] = useState("");

  // Split & Extract Configurations
  const [splitMode, setSplitMode] = useState<"single" | "range" | "every-n">(
    "single",
  );
  const [splitRangeText, setSplitRangeText] = useState("1-2, 3-5");
  const [splitEveryNValue, setSplitEveryNValue] = useState<number>(2);

  // Layout selection states
  const [previewingPage, setPreviewingPage] = useState<PDFPageItem | null>(
    null,
  );
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [isDraggingOverUpload, setIsDraggingOverUpload] = useState(false);

  // Drag and Drop tracking coordinates and speed modifiers
  const draggingRef = useRef<{
    isDragging: boolean;
    draggedIndex: number | null;
    initialMouseY: number;
    lastMouseY: number;
    scrollTimerId: number | null;
  }>({
    isDragging: false,
    draggedIndex: null,
    initialMouseY: 0,
    lastMouseY: 0,
    scrollTimerId: null,
  });

  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<
    "left" | "right" | null
  >(null);

  // Keyboard shortcut listeners for UNDO / REDO
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        triggerUndo();
      } else if (
        isCtrl &&
        (e.key.toLowerCase() === "y" ||
          (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        triggerRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pages, undoStack, redoStack]);

  // Handle Drag-Scroll in requestAnimationFrame loops
  const handleDragScroll = () => {
    if (!draggingRef.current.isDragging) return;

    const topZone = 80;
    const bottomZone = window.innerHeight - 80;
    const currentY = draggingRef.current.lastMouseY;

    if (currentY < topZone) {
      // Near top of active view, scroll up
      const intensity = (topZone - currentY) / topZone;
      const scrollSpeed = Math.min(25, intensity * 25);
      window.scrollBy({ top: -scrollSpeed });
    } else if (currentY > bottomZone) {
      // Near bottom of active view, scroll down
      const intensity = (currentY - bottomZone) / topZone;
      const scrollSpeed = Math.min(25, intensity * 25);
      window.scrollBy({ top: scrollSpeed });
    }

    draggingRef.current.scrollTimerId = requestAnimationFrame(handleDragScroll);
  };

  const startDragScrollLoop = (e: React.DragEvent | React.TouchEvent | any) => {
    draggingRef.current.isDragging = true;
    draggingRef.current.lastMouseY =
      e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    if (!draggingRef.current.scrollTimerId) {
      draggingRef.current.scrollTimerId =
        requestAnimationFrame(handleDragScroll);
    }
  };

  const stopDragScrollLoop = () => {
    draggingRef.current.isDragging = false;
    if (draggingRef.current.scrollTimerId) {
      cancelAnimationFrame(draggingRef.current.scrollTimerId);
      draggingRef.current.scrollTimerId = null;
    }
  };

  // Helper: Deep copies active state array of pages to history queue stack prior to edits
  const saveStateToHistory = (
    customPages: PDFPageItem[] = pages,
    description: string = "Action",
  ) => {
    // Limit local stacks size to 100 maximum entries
    const clone = customPages.map((p) => ({ ...p }));
    setUndoStack((prev) => [...prev.slice(-99), { pages: clone, description }]);
    setRedoStack([]); // Clear Redo history when new actions are formulated
  };

  // Trigger UNDO state recovery
  const triggerUndo = () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));

    // Save current state onto Redo stack
    const currentClone = pages.map((p) => ({ ...p }));
    setRedoStack((prev) => [
      ...prev,
      { pages: currentClone, description: lastState.description },
    ]);

    setPages(lastState.pages);
    setSelectedPageIds([]);
    flashHistoryMsg(`Undone: ${lastState.description}`);
  };

  // Trigger REDO state recovery
  const triggerRedo = () => {
    if (redoStack.length === 0) return;
    const targetState = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));

    // Save current back on Undo
    const currentClone = pages.map((p) => ({ ...p }));
    setUndoStack((prev) => [
      ...prev,
      { pages: currentClone, description: targetState.description },
    ]);

    setPages(targetState.pages);
    setSelectedPageIds([]);
    flashHistoryMsg(`Redone: ${targetState.description}`);
  };

  const flashHistoryMsg = (msg: string) => {
    setHistoryFlashMsg(msg);
    setTimeout(() => setHistoryFlashMsg(null), 1500);
  };

  // Validate incoming PDF File structure
  const validatePdfFile = async (
    file: File,
  ): Promise<{
    isValid: boolean;
    isEncrypted: boolean;
    totalPages: number;
    error?: string;
  }> => {
    try {
      // Guard Check 1: Magic bytes
      const headerBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const headerMagic = String.fromCharCode(...headerBytes);
      if (headerMagic !== "%PDF") {
        return {
          isValid: false,
          isEncrypted: false,
          totalPages: 0,
          error: "Invalid magic bytes",
        };
      }

      // Guard Check 2: Readable total pages & Encryptions
      const arrBuffer = await file.arrayBuffer();
      try {
        const pdfDoc = await PDFDocument.load(arrBuffer, {
          ignoreEncryption: false,
        });
        const pagesCount = pdfDoc.getPageCount();
        return { isValid: true, isEncrypted: false, totalPages: pagesCount };
      } catch (err: any) {
        if (
          err.message?.includes("encrypted") ||
          err.message?.includes("password") ||
          err.message?.includes("Password")
        ) {
          // Password protected PDF
          return { isValid: true, isEncrypted: true, totalPages: 0 };
        }
        throw err;
      }
    } catch (err) {
      console.error("PDF validation fail:", err);
      return {
        isValid: false,
        isEncrypted: false,
        totalPages: 0,
        error: "Failed to parse structure",
      };
    }
  };

  // Handle addition of PDF files (browse / drag drop)
  const processFiles = async (fileList: FileList | File[]) => {
    const freshSources: UploadedPDFSource[] = [];
    const freshPages: PDFPageItem[] = [];

    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingText("Analyzing document structure...");

    // Maximum 20 files constraints check
    const currentTotalFiles = sources.length + fileList.length;
    if (currentTotalFiles > 20) {
      alert(
        "Maximum Limit Exceeded: You can only upload up to 20 PDF files in a session.",
      );
      setIsProcessing(false);
      return;
    }

    saveStateToHistory(pages, "Add PDFs");

    for (let index = 0; index < fileList.length; index++) {
      const file = fileList[index];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        continue; // Silently skip invalid non-PDF extensions
      }

      // Check size ceiling limit (500MB)
      if (file.size > 500 * 1024 * 1024) {
        alert(`File too large: ${file.name} exceeds our 500MB single limit.`);
        continue;
      }

      setProcessingText(`Validating ${file.name}...`);
      const { isValid, isEncrypted, totalPages } = await validatePdfFile(file);

      const colorIndex =
        (sources.length + freshSources.length) % SOURCE_COLORS.length;
      const fileColor = SOURCE_COLORS[colorIndex];
      const fileId = `file_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const buf = await file.arrayBuffer();

      freshSources.push({
        id: fileId,
        name: file.name,
        size: file.size,
        totalPages: isEncrypted ? 0 : totalPages,
        color: fileColor,
        isEncrypted,
        isValid,
        arrayBuffer: buf,
      });

      if (isValid && !isEncrypted) {
        // Hydrate pages for layout grids
        for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
          freshPages.push({
            id: `${fileId}_p${pageNo}_${Math.floor(Math.random() * 100000)}`,
            fileId,
            sourceFileName: file.name,
            sourceFileColor: fileColor,
            originalPageNumber: pageNo,
            rotation: 0,
          });
        }
      }
    }

    if (freshSources.length === 0) {
      setIsProcessing(false);
      return;
    }

    setSources((prev) => [...prev, ...freshSources]);
    setPages((prev) => [...prev, ...freshPages]);
    setIsProcessing(false);
  };

  // Convert/Render PDF page on request index
  const getPageThumbnail = async (
    fileId: string,
    pageNumber: number,
  ): Promise<string> => {
    let pdfJsDoc = pdfJsDocCache.current.get(fileId);
    if (!pdfJsDoc) {
      const src = sources.find((s) => s.id === fileId);
      if (!src) throw new Error("Source file data not found in index state.");

      // Load file directly into PDF.js reader context to save memory copying
      pdfJsDoc = await pdfjsLib.getDocument({ data: src.arrayBuffer }).promise;
      pdfJsDocCache.current.set(fileId, pdfJsDoc);
    }

    return renderQueue.add(async () => {
      const page = await pdfJsDoc.getPage(pageNumber);
      // Low-scale thumbnail: 0.3 is optimal for fast rendering and remains highly legible in workspace cards.
      const viewport = page.getViewport({ scale: 0.3 }); 
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to secure canvas 2D frame.");

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas,
      }).promise;

      // Extract toDataURL image string representing physical PDF layout accurately
      const url = canvas.toDataURL("image/jpeg", 0.85);
      return url;
    });
  };

  // Handle single and range based multi selections
  const handlePageClick = (pageId: string, e: React.MouseEvent) => {
    // If user clicked inside page card actions (rotation buttons/delete), ignore selection triggering
    const targetElement = e.target as HTMLElement;
    if (targetElement.closest('[data-grid-action="true"]')) {
      return;
    }

    const clickedIndex = pages.findIndex((p) => p.id === pageId);
    if (clickedIndex === -1) return;

    if (e.shiftKey && selectedPageIds.length > 0) {
      // Select sequence ranges from last selection point
      const lastSelectedId = selectedPageIds[selectedPageIds.length - 1];
      const lastIndex = pages.findIndex((p) => p.id === lastSelectedId);
      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, clickedIndex);
        const end = Math.max(lastIndex, clickedIndex);
        const rangeIds = pages.slice(start, end + 1).map((p) => p.id);

        // Merge without duplicates
        setSelectedPageIds((prev) => {
          const union = new Set([...prev, ...rangeIds]);
          return Array.from(union);
        });
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      // Toggle single point selection state safely
      setSelectedPageIds((prev) =>
        prev.includes(pageId)
          ? prev.filter((id) => id !== pageId)
          : [...prev, pageId],
      );
    } else {
      // Pure Select: Select only current, deselect all previous cards
      setSelectedPageIds([pageId]);
    }
  };

  // Clean current files
  const handleClearAll = () => {
    setConfirmDialog({
      title: "Clear Desk Workspace",
      message:
        "Are you sure you want to clear your entire desk workspace? This deletes all files, arrange queues, and histories.",
      onConfirm: () => {
        saveStateToHistory(pages, "Clear Workspace");
        setSources([]);
        setPages([]);
        setSelectedPageIds([]);
        setUndoStack([]);
        setRedoStack([]);
        pdfJsDocCache.current.clear();
      },
    });
  };

  // Reverse active pages array ordering
  const handleReverseAll = () => {
    if (pages.length === 0) return;
    saveStateToHistory(pages, "Reverse Pages");
    setPages((prev) => [...prev].reverse());
    setSelectedPageIds([]);
  };

  // Individual Card Actions (Delete, Rotations)
  const handleDeletePage = (pageId: string) => {
    saveStateToHistory(pages, "Delete Page");
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    setSelectedPageIds((prev) => prev.filter((id) => id !== pageId));
  };

  const handleRotatePage = (pageId: string, direction: "cw" | "ccw") => {
    saveStateToHistory(
      pages,
      direction === "cw" ? "Rotate Clockwise" : "Rotate Counter-Clockwise",
    );
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        let angle = p.rotation;
        if (direction === "cw") {
          angle = ((angle + 90) % 360) as any;
        } else {
          angle = ((angle - 90 + 360) % 360) as any;
        }
        return { ...p, rotation: angle };
      }),
    );
  };

  const handleDuplicatePage = (pageId: string) => {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return;
    saveStateToHistory(pages, "Duplicate Page");

    const clone: PDFPageItem = {
      ...pages[idx],
      id: `${pages[idx].fileId}_dup_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    };

    setPages((prev) => {
      const updated = [...prev];
      updated.splice(idx + 1, 0, clone);
      return updated;
    });
  };

  // Bulk Panel Selections Operations
  const handleBulkDelete = () => {
    if (selectedPageIds.length === 0) return;
    saveStateToHistory(pages, `Delete ${selectedPageIds.length} Pages`);
    setPages((prev) => prev.filter((p) => !selectedPageIds.includes(p.id)));
    setSelectedPageIds([]);
  };

  const handleBulkRotate = (direction: "cw" | "ccw") => {
    if (selectedPageIds.length === 0) return;
    saveStateToHistory(pages, `Rotate ${selectedPageIds.length} Pages`);
    setPages((prev) =>
      prev.map((p) => {
        if (!selectedPageIds.includes(p.id)) return p;
        let angle = p.rotation;
        if (direction === "cw") {
          angle = ((angle + 90) % 360) as any;
        } else {
          angle = ((angle - 90 + 360) % 360) as any;
        }
        return { ...p, rotation: angle };
      }),
    );
  };

  const handleBulkDuplicate = () => {
    if (selectedPageIds.length === 0) return;
    saveStateToHistory(pages, `Duplicate ${selectedPageIds.length} Pages`);

    // Create duplicated pages, maintaining original index mapping flow
    setPages((prev) => {
      const updated: PDFPageItem[] = [];
      for (const page of prev) {
        updated.push(page);
        if (selectedPageIds.includes(page.id)) {
          updated.push({
            ...page,
            id: `${page.fileId}_dup_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
          });
        }
      }
      return updated;
    });
    setSelectedPageIds([]);
  };

  // Move selections to target custom page number index
  const [goToPageInput, setGoToPageInput] = useState("");
  const handleBulkMoveToPos = (e: React.FormEvent) => {
    e.preventDefault();
    const destinationIdx = parseInt(goToPageInput, 10) - 1;
    if (
      isNaN(destinationIdx) ||
      destinationIdx < 0 ||
      destinationIdx > pages.length
    ) {
      alert(
        `Invalid Index: Please input index values inside active workspaces page ranges (1 to ${pages.length + 1}).`,
      );
      return;
    }
    if (selectedPageIds.length === 0) return;

    saveStateToHistory(
      pages,
      `Move ${selectedPageIds.length} Pages to Position`,
    );

    // Separate selected from unselected items
    const selectedItems = pages.filter((p) => selectedPageIds.includes(p.id));
    const cleanUnselected = pages.filter(
      (p) => !selectedPageIds.includes(p.id),
    );

    // Calculate splice insert index relative to unselected layout
    let adjustedDest = destinationIdx;

    // Safety clamp target bound thresholds
    adjustedDest = Math.max(0, Math.min(adjustedDest, cleanUnselected.length));

    const finalPages = [...cleanUnselected];
    finalPages.splice(adjustedDest, 0, ...selectedItems);

    setPages(finalPages);
    setSelectedPageIds([]);
    setGoToPageInput("");
  };

  // Drag Reordering Core Handlers
  const handlePageDragStart = (idx: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedPageIndex(idx);

    // Set customized drag visual ghost context
    const isSelected = selectedPageIds.includes(pages[idx].id);
    if (isSelected && selectedPageIds.length > 1) {
      const dragGhostNode = document.createElement("div");
      dragGhostNode.style.padding = "8px 16px";
      dragGhostNode.style.background = "#FF6B2B";
      dragGhostNode.style.color = "#FFFFFF";
      dragGhostNode.style.borderRadius = "8px";
      dragGhostNode.style.fontWeight = "bold";
      dragGhostNode.style.position = "absolute";
      dragGhostNode.style.top = "-1000px";
      dragGhostNode.innerHTML = `Moving ${selectedPageIds.length} pages`;
      document.body.appendChild(dragGhostNode);
      e.dataTransfer.setDragImage(dragGhostNode, 0, 0);
      setTimeout(() => document.body.removeChild(dragGhostNode), 10);
    }

    startDragScrollLoop(e);
  };

  const handlePageDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedPageIndex === null) return;

    draggingRef.current.lastMouseY = e.clientY;

    const bounding = e.currentTarget.getBoundingClientRect();
    const cursorXRelative = e.clientX - bounding.left;
    const cardMidX = bounding.width / 2;

    const nextPos = cursorXRelative < cardMidX ? "left" : "right";
    if (dragOverIndex !== idx || dragDropPosition !== nextPos) {
      setDragOverIndex(idx);
      setDragDropPosition(nextPos);
    }
  };

  const handlePageDrop = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    stopDragScrollLoop();

    const originIdx = draggedPageIndex;
    if (originIdx === null) return;

    const dragTargetPage = pages[originIdx];
    const isMultiDrag =
      selectedPageIds.includes(dragTargetPage.id) && selectedPageIds.length > 1;

    saveStateToHistory(
      pages,
      isMultiDrag ? `Reorder ${selectedPageIds.length} Pages` : "Reorder Page",
    );

    if (isMultiDrag) {
      // Retrieve selected page references in relative current order
      const movingItems = pages.filter((p) => selectedPageIds.includes(p.id));
      const untouchedItems = pages.filter(
        (p) => !selectedPageIds.includes(p.id),
      );

      if (untouchedItems.length > 0) {
        // Find reference untouched item starting with the one dropped on
        let refPage = pages[idx];
        let dropPos = dragDropPosition;

        // If the user drops onto one of the moving pages, find the nearest untouched page
        if (selectedPageIds.includes(refPage.id)) {
          let foundUntouched = null;
          // Try searching forward for context
          for (let i = idx + 1; i < pages.length; i++) {
            if (!selectedPageIds.includes(pages[i].id)) {
              foundUntouched = pages[i];
              dropPos = "left";
              break;
            }
          }
          // fallback to backward search
          if (!foundUntouched) {
            for (let i = idx - 1; i >= 0; i--) {
              if (!selectedPageIds.includes(pages[i].id)) {
                foundUntouched = pages[i];
                dropPos = "right";
                break;
              }
            }
          }
          if (foundUntouched) {
            refPage = foundUntouched;
          }
        }

        let untouchedDestIdx = untouchedItems.findIndex(
          (p) => p.id === refPage.id,
        );
        if (untouchedDestIdx !== -1) {
          if (dropPos === "right") {
            untouchedDestIdx += 1;
          }
          const composite = [...untouchedItems];
          composite.splice(untouchedDestIdx, 0, ...movingItems);
          setPages(composite);
        }
      }
    } else {
      // Standard Single Card drag and drop movement
      const itemToMove = pages[originIdx];
      const remainder = pages.filter((_, i) => i !== originIdx);

      let targetRefPage = pages[idx];
      let remainderDestIdx = remainder.findIndex(
        (p) => p.id === targetRefPage.id,
      );

      if (remainderDestIdx !== -1) {
        if (dragDropPosition === "right") {
          remainderDestIdx += 1;
        }
        const composite = [...remainder];
        composite.splice(remainderDestIdx, 0, itemToMove);
        setPages(composite);
      }
    }

    // Finished: Reset Drag Tracking states
    setDraggedPageIndex(null);
    setDragOverIndex(null);
    setDragDropPosition(null);
    setSelectedPageIds([]);
  };

  const handlePageDragEnd = () => {
    stopDragScrollLoop();
    setDraggedPageIndex(null);
    setDragOverIndex(null);
    setDragDropPosition(null);
  };



  // High performance localized React PDF client-side download merger logic
  const executeLocalPdfActions = async (
    mode: "merge" | "extract" | "split",
  ) => {
    if (pages.length === 0) {
      alert("Workspace Desk is empty. Please upload some PDF files first.");
      return;
    }

    const mergeTargets =
      mode === "extract"
        ? pages.filter((p) => selectedPageIds.includes(p.id))
        : pages;

    if (mode === "extract" && mergeTargets.length === 0) {
      alert(
        "Range Warning: Select targeted pages inside grid map first using Ctrl/Shift click to perform Extract operations.",
      );
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(10);
    setProcessingText(
      mode === "merge"
        ? "Initiating PDF compilation..."
        : "Processing selected PDF slice...",
    );

    try {
      if (mode === "split") {
        // Core splitting operations inside client context
        setProcessingText("Slicing individual pages into chunks...");
        const docCache = new Map<string, PDFDocument>();
        const outputZips: Record<string, Uint8Array> = {};

        // Parse and register documents
        for (const source of sources) {
          const doc = await PDFDocument.load(source.arrayBuffer);
          docCache.set(source.id, doc);
        }

        if (splitMode === "single") {
          // Mode: Splitting ALL pages into independent output units
          const totalPagesToSlice = pages.length;
          for (let i = 0; i < totalPagesToSlice; i++) {
            const pageItem = pages[i];
            setProcessingProgress(
              Math.round((i / totalPagesToSlice) * 80) + 10,
            );
            setProcessingText(
              `Packaging sliced page ${i + 1} of ${totalPagesToSlice}...`,
            );

            const singleDoc = await PDFDocument.create();
            const originalDoc = docCache.get(pageItem.fileId);
            if (!originalDoc) continue;

            const [copiedPage] = await singleDoc.copyPages(originalDoc, [
              pageItem.originalPageNumber - 1,
            ]);

            if (pageItem.rotation) {
              copiedPage.setRotation(degrees(pageItem.rotation));
            }
            singleDoc.addPage(copiedPage);

            const pdfBytes = await singleDoc.save();
            outputZips[`page_${i + 1}.pdf`] = pdfBytes;
          }
        } else if (splitMode === "every-n") {
          // Mode: Splitting every N elements chunk-wise
          const n = splitEveryNValue || 2;
          const totalPagesToSlice = pages.length;
          let chunkIndex = 1;

          for (let i = 0; i < totalPagesToSlice; i += n) {
            setProcessingProgress(
              Math.round((i / totalPagesToSlice) * 80) + 10,
            );
            setProcessingText(`Compiling split chunk ${chunkIndex}...`);

            const chunkDoc = await PDFDocument.create();
            const pagesSlice = pages.slice(i, i + n);

            for (const pageItem of pagesSlice) {
              const originalDoc = docCache.get(pageItem.fileId);
              if (!originalDoc) continue;
              const [copiedPage] = await chunkDoc.copyPages(originalDoc, [
                pageItem.originalPageNumber - 1,
              ]);
              if (pageItem.rotation) {
                copiedPage.setRotation(degrees(pageItem.rotation));
              }
              chunkDoc.addPage(copiedPage);
            }

            const pdfBytes = await chunkDoc.save();
            outputZips[`split_part_${chunkIndex}.pdf`] = pdfBytes;
            chunkIndex++;
          }
        } else if (splitMode === "range") {
          // Mode: Range based subsets, e.g., "1-2, 3-5" matches final arrangement
          const rangeQueries = splitRangeText.split(",").map((s) => s.trim());
          let partIndex = 1;

          for (const query of rangeQueries) {
            const parts = query.split("-").map((s) => parseInt(s.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              const startIdx = Math.max(1, parts[0]) - 1;
              const endIdx = Math.min(pages.length, parts[1]) - 1;

              if (startIdx <= endIdx) {
                setProcessingText(`Preparing range ${query}...`);
                const chunkDoc = await PDFDocument.create();
                const pagesSlice = pages.slice(startIdx, endIdx + 1);

                for (const pageItem of pagesSlice) {
                  const originalDoc = docCache.get(pageItem.fileId);
                  if (!originalDoc) continue;
                  const [copiedPage] = await chunkDoc.copyPages(originalDoc, [
                    pageItem.originalPageNumber - 1,
                  ]);
                  if (pageItem.rotation) {
                    copiedPage.setRotation(degrees(pageItem.rotation));
                  }
                  chunkDoc.addPage(copiedPage);
                }

                const pdfBytes = await chunkDoc.save();
                outputZips[`range_${query}.pdf`] = pdfBytes;
                partIndex++;
              }
            }
          }
        }

        // package into fflate ZIP client-side
        setProcessingText("Zipping slice pack files in-memory...");
        const zipData = fflate.zipSync(outputZips);
        const zipBlob = new Blob([zipData], { type: "application/zip" });
        const zipUrl = URL.createObjectURL(zipBlob);

        const link = document.createElement("a");
        link.href = zipUrl;
        link.download = `parts_split_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(zipUrl);
      } else {
        // Mode: Merge or Extract operations inside PDF-lib Context
        const mergedDoc = await PDFDocument.create();

        // Populate standard Metadata structures
        if (metadataTitle) mergedDoc.setTitle(metadataTitle);
        if (metadataAuthor) mergedDoc.setAuthor(metadataAuthor);
        if (metadataSubject) mergedDoc.setSubject(metadataSubject);
        if (metadataKeywords) {
          mergedDoc.setKeywords(
            metadataKeywords.split(",").map((k) => k.trim()),
          );
        }

        const docCache = new Map<string, PDFDocument>();
        let consecutiveCount = 0;
        let lastFileId = "";

        for (let i = 0; i < mergeTargets.length; i++) {
          const item = mergeTargets[i];
          setProcessingProgress(
            Math.round((i / mergeTargets.length) * 80) + 10,
          );
          setProcessingText(
            `Copying page ${i + 1} of ${mergeTargets.length}...`,
          );

          // Insert blank page on Double-Sided printing options if odd sequence ends
          if (blankPageInsert && lastFileId && lastFileId !== item.fileId) {
            if (consecutiveCount % 2 !== 0) {
              setProcessingText("Inserting blank padding page...");
              const blankPage = mergedDoc.addPage();
              blankPage.drawText(
                "(Blank Page inserted for printing alignment)",
                {
                  x: 100,
                  y: 100,
                  size: 8,
                  opacity: 0.35,
                },
              );
            }
            consecutiveCount = 0; // Reset
          }

          lastFileId = item.fileId;
          consecutiveCount++;

          let srcDoc = docCache.get(item.fileId);
          if (!srcDoc) {
            const b = sources.find((s) => s.id === item.fileId)?.arrayBuffer;
            if (!b)
              throw new Error(
                "Memory corrupted: original PDF buffers parsed as empty.",
              );
            srcDoc = await PDFDocument.load(b);
            docCache.set(item.fileId, srcDoc);
          }

          const [copiedPage] = await mergedDoc.copyPages(srcDoc, [
            item.originalPageNumber - 1,
          ]);
          if (item.rotation) {
            copiedPage.setRotation(degrees(item.rotation));
          }

          mergedDoc.addPage(copiedPage);

          // If last element of loop, check final blank page insert pad sequence
          if (
            blankPageInsert &&
            i === mergeTargets.length - 1 &&
            consecutiveCount % 2 !== 0
          ) {
            const blankPage = mergedDoc.addPage();
            blankPage.drawText("(Blank Page inserted for printing alignment)", {
              x: 100,
              y: 100,
              size: 8,
              opacity: 0.35,
            });
          }
        }

        // Apply visual Arabic/Roman footers if enabled
        if (enablePageNumbers) {
          setProcessingText("Adding page numbers overlays...");
          const font = await mergedDoc.embedFont("Helvetica");
          const totalMergedCount = mergedDoc.getPageCount();

          // Roman numeral generator
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

            const size = pageNumbersFontSize;
            const textWidth = font.widthOfTextAtSize(textStr, size);

            let numX = width / 2 - textWidth / 2; // Default bottom center
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

        setProcessingText("Saving finalized PDF object...");
        const mergedBytes = await mergedDoc.save();
        const mergedBlob = new Blob([mergedBytes], { type: "application/pdf" });
        const mergedUrl = URL.createObjectURL(mergedBlob);

        const targetFileName = outputFilename.endsWith(".pdf")
          ? outputFilename
          : `${outputFilename}.pdf`;

        const link = document.createElement("a");
        link.href = mergedUrl;
        link.download = targetFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(mergedUrl);

        setProcessingProgress(100);
        setTimeout(() => {
          setIsProcessing(false);
          setProcessingProgress(0);
        }, 800);
      }
    } catch (err: any) {
      console.error("Local actions failed execution:", err);
      alert(`Critical error compiling PDF object: ${err.message || err}`);
      setIsProcessing(false);
    }
  };

  // Drag Drop utilities for main Upload section
  const handleZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverUpload(true);
  };

  const handleZoneDragLeave = () => {
    setIsDraggingOverUpload(false);
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverUpload(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="text-[#EFEFEF] min-h-screen bg-[#0F0F0F] pb-11 overflow-x-hidden">
      {/* Undo Flash Notification */}
      <AnimatePresence>
        {historyFlashMsg && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#FF6B2B] text-[#EFEFEF] px-2 py-1 rounded-full  text-[11px] font-bold tracking-wide flex items-center gap-2 z-[9999]"
          >
            <RefreshCw size={14} className="animate-spin" />
            <span>{historyFlashMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Dialog Loader */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[10000] backdrop-blur-sm">
          <div className="bg-[#1A1A1A] border border-[#252525] p-3 rounded-2xl w-full max-w-md text-center  relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-1 bg-[#FF6B2B] transition-all duration-300"
              style={{ width: `${processingProgress}%` }}
            ></div>

            <Loader2
              className="animate-spin text-[#FF6B2B] mx-auto mb-1"
              size={40}
            />
            <h3 className="text-[13px] font-bold mb-1 col-span-full">
              Processing Workspace Files
            </h3>
            <p className="text-[#888888] text-[11px] mb-2">{processingText}</p>

            <div className="w-full h-2 bg-[#252525] rounded-full overflow-hidden mb-1">
              <div
                className="h-full   ] rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>
            <span className="text-[11px] text-[#555555] font-bold">
              {processingProgress}% complete
            </span>
          </div>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="border-b border-[#252525] bg-[#141414]/90 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-2 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBackToHub && (
              <button
                onClick={onBackToHub}
                className="hidden md:flex text-[#888888] hover:text-[#EFEFEF] transition-colors p-1 hover:bg-[#252525] rounded-lg border border-transparent hover:border-[#333]"
              >
                <ArrowLeftRight size={16} />
              </button>
            )}
            <div className="hidden md:block">
              <h1 className="text-[13px] font-black flex items-center gap-2 uppercase tracking-wider">
                <LayoutGrid className="text-[#FF6B2B]" size={16} /> PDF Page
                Arranger
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* History stack tools */}
            <button
              onClick={triggerUndo}
              disabled={undoStack.length === 0}
              className={`p-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all ${
                undoStack.length > 0
                  ? "bg-[#1e1e24] border-[#2e2e34] text-slate-200 hover:text-[#EFEFEF] hover:bg-[#25252d]"
                  : "bg-transparent border-transparent text-slate-600 cursor-not-allowed"
              }`}
              title={
                undoStack.length > 0
                  ? `Undo: ${undoStack[undoStack.length - 1].description}`
                  : "Nothing to undo (Ctrl+Z)"
              }
            >
              <Undo2 size={13} />
              <span className="hidden md:inline">Undo</span>
            </button>

            <button
              onClick={triggerRedo}
              disabled={redoStack.length === 0}
              className={`p-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all ${
                redoStack.length > 0
                  ? "bg-[#1e1e24] border-[#2e2e34] text-slate-200 hover:text-[#EFEFEF] hover:bg-[#25252d]"
                  : "bg-transparent border-transparent text-slate-600 cursor-not-allowed"
              }`}
              title={
                redoStack.length > 0
                  ? `Redo: ${redoStack[redoStack.length - 1].description}`
                  : "Nothing to redo (Ctrl+Y)"
              }
            >
              <Redo2 size={13} />
              <span className="hidden md:inline">Redo</span>
            </button>

            <div className="h-6 w-px bg-[#1A1A1A] mx-1"></div>

            <button
              onClick={handleReverseAll}
              disabled={pages.length < 2}
              className={`p-1 border rounded-lg text-[11px] font-bold transition-all ${
                pages.length >= 2
                  ? "border-[#2d2d34] hover:bg-[#25252d] text-slate-200 hover:text-[#EFEFEF]"
                  : "border-transparent text-slate-600 cursor-not-allowed"
              }`}
            >
              Reverse All
            </button>

            <button
              onClick={handleClearAll}
              disabled={sources.length === 0}
              className={`p-1 border text-[11px] font-bold rounded-lg transition-all ${
                sources.length > 0
                  ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  : "border-transparent text-slate-600 cursor-not-allowed"
              }`}
            >
              Clear Desk
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-[12px]">
          {/* LEFT CONTAINER: Sidebar file manager inputs & output controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* SECTION 1: ADD FILES / WORKSPACE STATUS */}
            <div className="bg-[#141414] border border-[#252525] p-2 rounded-2xl">
              <h2 className="text-[11px] font-black text-[#888888] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Upload size={14} className="text-[#FF6B2B]" /> Upload Source
                Documents
              </h2>

              <div
                onDragOver={handleZoneDragOver}
                onDragLeave={handleZoneDragLeave}
                onDrop={handleZoneDrop}
                className={`border-[#252525] border-dashed rounded-xl p-2 text-center transition-all cursor-pointer ${
                  isDraggingOverUpload
                    ? "border-[#FF6B2B] bg-[#FF6B2B]/5"
                    : "border-[#252525] hover:border-[#3a3a3a] bg-[#1a1a1a]/40"
                }`}
                onClick={() =>
                  document.getElementById("file-upload-input")?.click()
                }
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) processFiles(e.target.files);
                  }}
                />
                <Upload className="mx-auto text-[#555555] mb-1" size={24} />
                <span className="block text-[11px] font-bold mb-1">
                  Drag & Drop files here
                </span>
                <span className="block text-[10px] text-[#555555]">
                  or click to browse PDFs (&lt; 500MB)
                </span>
              </div>

              {/* UPLOADED FILES LIST */}
              {sources.length > 0 && (
                <div className="mt-2 pt-1 border-t border-[#252525] space-y-2.5">
                  <h3 className="text-[10px] font-black text-[#555555] uppercase tracking-widest mb-1">
                    File Queue ({sources.length}/20)
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-2 custom-scrollbar">
                    {sources.map((src) => {
                      const fileKbSize = (src.size / 1024).toFixed(0);
                      const displaySize =
                        Number(fileKbSize) > 1020
                          ? `${(src.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${fileKbSize} KB`;

                      return (
                        <div
                          key={src.id}
                          className="bg-[#1A1A1A] border border-[#252525] px-1 py-1 rounded-xl flex items-center justify-between gap-2  relative overflow-hidden group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Source color tag indicator */}
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${src.color}`}
                            ></div>
                            <div className="min-w-0">
                              <p
                                className="text-[11px] font-bold truncate pr-1 text-slate-200"
                                title={src.name}
                              >
                                {src.name}
                              </p>
                              <span className="text-[9px] text-[#555555] font-sans block mt-1">
                                {displaySize} &bull;{" "}
                                {src.isEncrypted
                                  ? "Password protected"
                                  : `${src.totalPages} pages`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center shrink-0">
                            {src.isEncrypted && (
                              <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] px-1 py-1 rounded mr-1">
                                Lock
                              </span>
                            )}
                            <button
                              onClick={() => {
                                saveStateToHistory(pages, "Remove file");
                                setSources((prev) =>
                                  prev.filter((s) => s.id !== src.id),
                                );
                                setPages((prev) =>
                                  prev.filter((p) => p.fileId !== src.id),
                                );
                                setSelectedPageIds([]);
                              }}
                              className="text-[#555555] hover:text-red-400 p-1 hover:bg-[#1A1A1A] rounded transition-all transition-opacity md:opacity-0 group-hover:opacity-100"
                              title="Delete source file"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: COMBINE STITCH OPTIONS */}
            <div className="bg-[#141414] border border-[#252525] p-2 rounded-2xl">
              <h2 className="text-[11px] font-black text-[#888888] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Settings2 size={14} className="text-[#FF6B2B]" /> Stitch &
                Output Settings
              </h2>

              <div className="space-y-4 text-[11px]">
                <div>
                  <label className="block text-[10px] text-[#555555] font-black uppercase tracking-wider mb-1">
                    Output File Name
                  </label>
                  <input
                    type="text"
                    value={outputFilename}
                    onChange={(e) => setOutputFilename(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#252525] px-1 py-1 rounded-xl text-[11px] text-[#EFEFEF] focus:outline-none focus:border-[#FF6B2B] transition-colors"
                    placeholder="merged_output.pdf"
                  />
                </div>

                <div className="h-px bg-[#252525] my-1"></div>

                {/* Page Numbering Overlays */}
                <div className="p-1 bg-[#1a1a1a]/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#FF6B2B] flex items-center gap-1">
                      Page Number Overlay
                    </span>
                    <input
                      type="checkbox"
                      checked={enablePageNumbers}
                      onChange={(e) => setEnablePageNumbers(e.target.checked)}
                      className="accent-[#FF6B2B] w-4 h-4 rounded cursor-pointer"
                    />
                  </div>

                  {enablePageNumbers && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-2.5 pt-1 overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-[#555555] uppercase tracking-widest block mb-1">
                            Style
                          </label>
                          <select
                            value={pageNumbersStyle}
                            onChange={(e: any) =>
                              setPageNumbersStyle(e.target.value)
                            }
                            className="bg-[#121214] border border-[#2e2e34] px-1 py-1 rounded-lg w-full text-[10px] text-slate-200"
                          >
                            <option value="arabic">Arabic (1, 2, 3)</option>
                            <option value="roman">Roman (I, II, III)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-[#555555] uppercase tracking-widest block mb-1">
                            Font Size
                          </label>
                          <select
                            value={pageNumbersFontSize}
                            onChange={(e: any) =>
                              setPageNumbersFontSize(Number(e.target.value))
                            }
                            className="bg-[#121214] border border-[#2e2e34] px-1 py-1 rounded-lg w-full text-[10px] text-slate-200"
                          >
                            <option value={9}>9 px</option>
                            <option value={10}>10 px</option>
                            <option value={12}>12 px</option>
                            <option value={14}>14 px</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] text-[#555555] uppercase tracking-widest block mb-1">
                          Position
                        </label>
                        <select
                          value={pageNumbersPosition}
                          onChange={(e: any) =>
                            setPageNumbersPosition(e.target.value)
                          }
                          className="bg-[#121214] border border-[#2e2e34] px-1 py-1 rounded-lg w-full text-[10px] text-slate-200"
                        >
                          <option value="bottom-center">Bottom Center</option>
                          <option value="bottom-right">Bottom Right</option>
                          <option value="top-right">Top Right</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#888888] block">
                      Blank Padding Page
                    </span>
                    <span className="text-[9px] text-[#555555]">
                      Insert blank page for odd files (Double Sided)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={blankPageInsert}
                    onChange={(e) => setBlankPageInsert(e.target.checked)}
                    className="accent-[#FF6B2B] w-4 h-4 rounded cursor-pointer"
                  />
                </div>

                <div className="h-px bg-[#252525] my-1"></div>

                {/* PDF metadata information */}
                <div className="bg-[#1a1a1a]/30 p-1 border border-[#252525]/50 rounded-xl space-y-2">
                  <span className="font-bold text-[#888888] block text-[9px] uppercase tracking-widest mb-1">
                    Document Metadata Fields
                  </span>
                  <div className="space-y-2 text-[10px]">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={metadataTitle}
                        onChange={(e) => setMetadataTitle(e.target.value)}
                        placeholder="Title..."
                        className="w-1/2 bg-[#121214] border border-slate-850 px-1 py-1 rounded focus:outline-none focus:border-[#FF6B2B]"
                      />
                      <input
                        type="text"
                        value={metadataAuthor}
                        onChange={(e) => setMetadataAuthor(e.target.value)}
                        placeholder="Author..."
                        className="w-1/2 bg-[#121214] border border-slate-850 px-1 py-1 rounded focus:outline-none focus:border-[#FF6B2B]"
                      />
                    </div>
                    <input
                      type="text"
                      value={metadataSubject}
                      onChange={(e) => setMetadataSubject(e.target.value)}
                      placeholder="Subject matter..."
                      className="w-full bg-[#121214] border border-slate-850 px-1 py-1 rounded focus:outline-none focus:border-[#FF6B2B]"
                    />
                    <input
                      type="text"
                      value={metadataKeywords}
                      onChange={(e) => setMetadataKeywords(e.target.value)}
                      placeholder="Keywords (comma separated)..."
                      className="w-full bg-[#121214] border border-slate-850 px-1 py-1 rounded focus:outline-none focus:border-[#FF6B2B]"
                    />
                  </div>
                </div>

                <button
                  onClick={() => executeLocalPdfActions("merge")}
                  disabled={pages.length === 0}
                  className="w-full bg-[#FF6B2B] hover:bg-[#FF6B2B]/90 disabled:bg-[#1A1A1A] disabled:text-slate-600 font-bold py-1 px-1 rounded-xl flex items-center justify-center gap-2  shadow-[#FF6B2B]/10 hover:shadow-[#FF6B2B]/20 transition-all text-[11px]"
                >
                  <Download size={14} /> Stitch & Merge PDFs ({pages.length}{" "}
                  Pages)
                </button>
              </div>
            </div>

            {/* SECTION 3: SPLIT OPERATORS */}
            <div className="bg-[#141414] border border-[#252525] p-2 rounded-2xl">
              <h2 className="text-[11px] font-black text-[#888888] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Scissors size={14} className="text-[#FF6B2B]" /> Split &
                Extract Engine
              </h2>

              <div className="space-y-4 text-[11px]">
                <div>
                  <label className="block text-[10px] text-[#555555] font-black uppercase tracking-wider mb-1">
                    Split PDF Pack Mode
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-[#1A1A1A] p-1 rounded-xl border border-[#252525]">
                    <button
                      onClick={() => setSplitMode("single")}
                      className={`py-1 rounded-lg text-[9px] font-bold transition-all ${splitMode === "single" ? "bg-[#FF6B2B] text-[#EFEFEF] shadow" : "text-[#888888]"}`}
                    >
                      All Pages
                    </button>
                    <button
                      onClick={() => setSplitMode("range")}
                      className={`py-1 rounded-lg text-[9px] font-bold transition-all ${splitMode === "range" ? "bg-[#FF6B2B] text-[#EFEFEF] shadow" : "text-[#888888]"}`}
                    >
                      Ranges
                    </button>
                    <button
                      onClick={() => setSplitMode("every-n")}
                      className={`py-1 rounded-lg text-[9px] font-bold transition-all ${splitMode === "every-n" ? "bg-[#FF6B2B] text-[#EFEFEF] shadow" : "text-[#888888]"}`}
                    >
                      Every N
                    </button>
                  </div>
                </div>

                {splitMode === "range" && (
                  <div>
                    <label className="block text-[9px] text-[#555555] uppercase tracking-widest block mb-1">
                      Define ranges
                    </label>
                    <input
                      type="text"
                      value={splitRangeText}
                      onChange={(e) => setSplitRangeText(e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-[#252525] px-1 py-1 rounded-xl text-[11px] text-[#EFEFEF] focus:outline-none"
                      placeholder="e.g. 1-2, 3-5, 6-9"
                    />
                    <span className="text-[8px] text-[#555555] mt-1 block">
                      Specifies final customized sequence boundaries.
                    </span>
                  </div>
                )}

                {splitMode === "every-n" && (
                  <div>
                    <label className="block text-[9px] text-[#555555] uppercase tracking-widest block mb-1">
                      Pages per split file
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={splitEveryNValue}
                      onChange={(e) =>
                        setSplitEveryNValue(Number(e.target.value))
                      }
                      className="w-full bg-[#1A1A1A] border border-[#252525] px-1 py-1 rounded-xl text-[11px] text-[#EFEFEF] focus:outline-none"
                    />
                  </div>
                )}

                <button
                  onClick={() => executeLocalPdfActions("split")}
                  disabled={pages.length === 0}
                  className="w-full bg-[#1e1e24] border border-[#2e2e34] hover:bg-[#25252d] hover:border-slate-500 text-[#888888] font-bold py-1 px-1 rounded-xl flex items-center justify-center gap-2 transition-all text-[11px]"
                >
                  <Scissors size={12} /> Split Desk PDF into ZIP
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT CONTAINER: Main Desk Grid layout area */}
          <div className="lg:col-span-3 space-y-6 flex flex-col min-h-[calc(100vh-140px)]">
            {/* BULK ACTIONS BANNER VIEW */}
            {selectedPageIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="bg-[#1c1d22] border-l-4 border-[#FF6B2B] px-2 py-1 rounded-xl flex flex-wrap items-center justify-between gap-4  shadow-[#FF6B2B]/5 border border-default"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#FF6B2B] rounded-full animate-ping shrink-0" />
                  <span className="text-[11px] font-bold text-slate-200">
                    {selectedPageIds.length} of {pages.length} pages selected
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleBulkRotate("ccw")}
                    className="p-1 bg-[#121214] border border-[#2e2e34] hover:border-slate-500 hover:text-[#EFEFEF] rounded-lg text-[11px] text-[#888888] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <RotateCcw size={12} /> Rotate CCW
                  </button>
                  <button
                    onClick={() => handleBulkRotate("cw")}
                    className="p-1 bg-[#121214] border border-[#2e2e34] hover:border-slate-500 hover:text-[#EFEFEF] rounded-lg text-[11px] text-[#888888] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <RotateCw size={12} /> Rotate CW
                  </button>
                  <button
                    onClick={handleBulkDuplicate}
                    className="p-1 bg-[#121214] border border-[#2e2e34] hover:border-slate-500 hover:text-[#EFEFEF] rounded-lg text-[11px] text-[#888888] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Plus size={12} /> Duplicate
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="p-1 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 size={12} /> Delete Pages
                  </button>
                  <button
                    onClick={() => executeLocalPdfActions("extract")}
                    className="p-1 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Scissors size={12} /> Extract Selected PDF
                  </button>

                  <div className="h-4 w-px bg-[#1A1A1A] mx-1"></div>

                  {/* Move Selections Inline box */}
                  <form
                    onSubmit={handleBulkMoveToPos}
                    className="flex items-center gap-1 shrink-0"
                  >
                    <input
                      type="number"
                      min={1}
                      max={pages.length}
                      value={goToPageInput}
                      onChange={(e) => setGoToPageInput(e.target.value)}
                      placeholder="Go page #..."
                      className="w-16 bg-[#121214] border border-[#2e2e34] rounded px-1 py-1 text-[10px] text-[#EFEFEF] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-1 py-1 bg-[#FF6B2B] text-[#EFEFEF] rounded text-[10px] font-bold"
                    >
                      Go
                    </button>
                  </form>

                  <button
                    onClick={() => setSelectedPageIds([])}
                    className="text-[#555555] hover:text-slate-350 text-[10px] uppercase font-bold tracking-wider px-1"
                  >
                    Clear Selected
                  </button>
                </div>
              </motion.div>
            )}

            {/* DESK GRID */}
            <div className="flex-1 bg-[#141414] border border-[#252525] rounded-3xl p-2 relative flex flex-col justify-between">
              {pages.length === 0 ? (
                /* Empty state screen with cool icons descriptors */
                <div className="flex-1 flex flex-col items-center justify-center py-9 text-center text-[#555555]">
                  <div className="w-16 h-16 bg-[#FF6B2B]/5 border border-[#FF6B2B]/10 rounded-full flex items-center justify-center mb-2">
                    <FileText className="text-[#FF6B2B]" size={32} />
                  </div>
                  <h3 className="text-[13px] font-black text-[#EFEFEF] mb-1 uppercase tracking-wide">
                    Workspace Desk is Empty
                  </h3>
                  <p className="text-[11px] max-w-sm mx-auto leading-relaxed text-[#888888] font-sans">
                    Drop PDF files into the Sidebar container, or browse to load
                    document layers. You can rearrange, rotate, duplicate, and
                    merge them with instant client outputs.
                  </p>
                </div>
              ) : (
                /* Interactive draggable, rotating multi-select page grid layout */
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6B2B]">
                      WORKSPACE DESK ({pages.length} Pages Loaded)
                    </span>
                    <span className="text-[10px] text-[#555555] font-sans hidden sm:block">
                      ⚙️ Click to select &bull; Hold Shift to range-select
                      &bull; Drag and drop to reorder pages
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-[12px]">
                    {pages.map((p, index) => {
                      const isSelected = selectedPageIds.includes(p.id);
                      const isDragged = draggedPageIndex === index;
                      const isDragOver = dragOverIndex === index;

                      return (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => handlePageDragStart(index, e)}
                          onDragOver={(e) => handlePageDragOver(index, e)}
                          onDrop={(e) => handlePageDrop(index, e)}
                          onDragEnd={handlePageDragEnd}
                          onClick={(e) => handlePageClick(p.id, e)}
                          className={`relative select-none transition-all flex flex-col group ${
                            isDragged ? "opacity-25 scale-90" : "opacity-100"
                          }`}
                        >
                          {/* Left/Right Drag insert placement indicator */}
                          {isDragOver && (
                            <div
                              className={`absolute top-0 bottom-0 w-1.5 bg-[#FF6B2B] rounded  shadow-[#FF6B2B]/20 z-50 ${dragDropPosition === "left" ? "-left-3" : "-right-3"}`}
                            ></div>
                          )}

                          {/* Outer card shell with customized rotation border logic and selection color gradients */}
                          <div
                            className={`aspect-[3/4] rounded-2xl overflow-hidden border bg-[#0d0d0f] relative flex flex-col items-center justify-center transition-all ${
                              isSelected
                                ? "border-[#FF6B2B]  shadow-[#FF6B2B]/5 ring-1 ring-[#FF6B2B]/25"
                                : "border-[#252525] hover:border-[#444] "
                            }`}
                          >
                            {/* Sequential page overlay badge */}
                            <div className="absolute top-2.5 left-2.5 bg-black/60 border border-[#252525] text-[#EFEFEF] text-[9px] font-black px-1 py-1 rounded-full z-10 font-mono tracking-tighter flex items-center gap-1.5 shadow">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${p.sourceFileColor}`}
                              ></span>
                              <span>P {index + 1}</span>
                            </div>

                            {/* Checkbox indicator selection overlay */}
                            {isSelected && (
                              <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#FF6B2B] text-[#EFEFEF] flex items-center justify-center z-10 shadow border border-[#FF6B2B]/20">
                                <Check size={9} strokeWidth={3} />
                              </div>
                            )}

                            {/* Single Card HOVER ACTIONS Overlay */}
                            <div
                              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                              data-grid-action="true"
                            >
                              <button
                                onClick={() => handleRotatePage(p.id, "ccw")}
                                className="w-6 h-6 rounded-lg bg-black/65 hover:bg-black border border-[#252525] text-[#888888] hover:text-[#EFEFEF] flex items-center justify-center shadow transition-all"
                                title="Rotate CCW"
                              >
                                <RotateCcw size={11} />
                              </button>
                              <button
                                onClick={() => handleRotatePage(p.id, "cw")}
                                className="w-6 h-6 rounded-lg bg-black/65 hover:bg-black border border-[#252525] text-[#888888] hover:text-[#EFEFEF] flex items-center justify-center shadow transition-all"
                                title="Rotate CW"
                              >
                                <RotateCw size={11} />
                              </button>
                              <button
                                onClick={() => handleDuplicatePage(p.id)}
                                className="w-6 h-6 rounded-lg bg-black/65 hover:bg-black border border-[#252525] text-[#888888] hover:text-[#FF6B2B] flex items-center justify-center shadow transition-all"
                                title="Duplicate page copy"
                              >
                                <Plus size={11} />
                              </button>
                              <button
                                onClick={() => setPreviewingPage(p)}
                                className="w-6 h-6 rounded-lg bg-black/65 hover:bg-black border border-[#252525] text-[#888888] hover:text-[#FF6B2B] flex items-center justify-center shadow transition-all"
                                title="Preview full size render"
                              >
                                <Eye size={11} />
                              </button>
                              <button
                                onClick={() => handleDeletePage(p.id)}
                                className="w-6 h-6 rounded-lg bg-black/65 hover:bg-red-950 border border-[#252525] text-[#888888] hover:text-red-400 flex items-center justify-center shadow transition-all"
                                title="Delete this page"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>

                            {/* INTERSECTION OBSERVER LAZY LOAD THUMBNAIL COMPONENT RENDER */}
                            <PageThumbnailRenderer
                              page={p}
                              renderThumbnail={getPageThumbnail}
                              thumbnailCache={thumbnailCache}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!selectedPageIds.includes(p.id)) {
                                  handlePageClick(p.id, e);
                                }
                                setPreviewingPage(p);
                              }}
                            />
                          </div>

                          {/* Base descriptions overlay */}
                          <p
                            className="text-[9px] text-[#555555] font-serif font-medium truncate mt-1 px-1 block text-center"
                            title={`${p.sourceFileName} (original page #${p.originalPageNumber})`}
                          >
                            {p.sourceFileName}{" "}
                            <span className="font-mono text-[8px] text-slate-650 opacity-70">
                              org#{p.originalPageNumber}
                            </span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FULL PREVIEW MODAL LIGHTBOX PANEL (FEATURE 7) */}
      <AnimatePresence>
        {previewingPage && (
          <PreviewLightboxPanel
            page={previewingPage}
            pages={pages}
            zoom={previewZoom}
            setZoom={setPreviewZoom}
            onClose={() => setPreviewingPage(null)}
            onChangePage={(p) => setPreviewingPage(p)}
            sources={sources}
            pdfJsDocCache={pdfJsDocCache}
          />
        )}
      </AnimatePresence>

      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-1 alert-modal-overlay">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1A1A1E] border border-red-500/20 max-w-sm w-full rounded-[12px]  p-2 relative overflow-hidden"
            >
              <div className="flex items-start gap-4">
                <div className="p-1 bg-red-500/10 rounded-full border border-red-500/20 text-[#FF6B2B] shrink-0">
                  <AlertCircle size={18} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-[13px] font-black text-[#EFEFEF] uppercase tracking-wider">
                    {confirmDialog.title}
                  </h3>
                  <p className="text-zinc-400 text-[11px] font-medium leading-relaxed">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-1 py-1 hover:bg-zinc-800 border border-transparent text-zinc-400 hover:text-[#EFEFEF] rounded-[6px] text-[11px] font-bold uppercase transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="px-1 py-1 bg-red-500 hover:bg-red-600 text-black rounded-[6px] text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer  shadow-red-950/20 active:scale-95"
                >
                  Yes, Proceed
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Intersection Observer Lazy Page Card Thumbnail Wrapper component
interface PageThumbProps {
  page: PDFPageItem;
  renderThumbnail: (fileId: string, pageNumber: number) => Promise<string>;
  thumbnailCache: React.RefObject<Map<string, string>>;
  onClick?: (e: React.MouseEvent) => void;
}
const PageThumbnailRenderer: React.FC<PageThumbProps> = ({
  page,
  renderThumbnail,
  thumbnailCache,
  onClick,
}) => {
  const cacheKey = `${page.fileId}_p${page.originalPageNumber}`;
  const [imgUrl, setImgUrl] = useState<string | null>(() => {
    return thumbnailCache.current?.get(cacheKey) || null;
  });
  const [isInView, setIsInView] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" }, // Slightly increased margin to pre-render cards before scrolling on screens
    );

    if (triggerRef.current) {
      observer.observe(triggerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || imgUrl) return;

    let isMounted = true;
    const fetchThumb = async () => {
      try {
        const cached = thumbnailCache.current?.get(cacheKey);
        if (cached) {
          if (isMounted) setImgUrl(cached);
          return;
        }
        const url = await renderThumbnail(page.fileId, page.originalPageNumber);
        if (isMounted) {
          thumbnailCache.current?.set(cacheKey, url);
          setImgUrl(url);
        }
      } catch (err) {
        console.error("Thumbnail render queue error:", err);
      }
    };
    fetchThumb();

    return () => {
      isMounted = false;
    };
  }, [isInView, page.fileId, page.originalPageNumber, cacheKey, thumbnailCache, imgUrl]);

  return (
    <div
      ref={triggerRef}
      onClick={onClick}
      className="w-full h-full flex items-center justify-center overflow-hidden relative p-1 cursor-pointer hover:bg-[#1A1A1A]/10 transition-colors"
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`Page shadow`}
          className="max-h-full max-w-full object-contain pointer-events-none rounded select-none transition-transform duration-300 shadow"
          style={{ transform: `rotate(${page.rotation}deg)` }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-600 gap-1 animate-pulse">
          <FileText size={18} strokeWidth={1.5} />
          <span className="text-[9px] font-bold">Rendering...</span>
        </div>
      )}
    </div>
  );
};

// Preview slide lightbox component (Right side panel or full visual modal)
interface LightboxProps {
  page: PDFPageItem;
  pages: PDFPageItem[];
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
  onChangePage: (page: PDFPageItem) => void;
  sources: UploadedPDFSource[];
  pdfJsDocCache: React.RefObject<Map<string, any>>;
}
const PreviewLightboxPanel: React.FC<LightboxProps> = ({
  page,
  pages,
  zoom,
  setZoom,
  onClose,
  onChangePage,
  sources,
  pdfJsDocCache,
}) => {
  const [fullResUrl, setFullResUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentIdx = pages.findIndex((p) => p.id === page.id);

  // Keyboard navigation shortcuts helper inside active views
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && currentIdx > 0) {
        onChangePage(pages[currentIdx - 1]);
      } else if (e.key === "ArrowRight" && currentIdx < pages.length - 1) {
        onChangePage(pages[currentIdx + 1]);
      } else if (e.key === "+") {
        setZoom((z) => Math.min(200, z + 20));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(50, z - 20));
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [currentIdx, pages, onClose, onChangePage, setZoom]);

  // High quality high-res canvas renderer for the slide lightbox
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setFullResUrl(null);

    const renderPreview = async () => {
      try {
        const fileRef = sources.find((s) => s.id === page.fileId);
        if (!fileRef) return;

        // Try getting cached PDF.js document directly to load screens instantly
        let docCopy = pdfJsDocCache.current?.get(page.fileId);
        if (!docCopy) {
          docCopy = await pdfjsLib.getDocument({
            data: fileRef.arrayBuffer,
          }).promise;
          pdfJsDocCache.current?.set(page.fileId, docCopy);
        }

        const pageObj = await docCopy.getPage(page.originalPageNumber);

        // Render at high scaling size 1.5 for high-fidelity visual preview
        const viewport = pageObj.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await pageObj.render({
          canvasContext: ctx,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        if (isMounted) {
          setFullResUrl(canvas.toDataURL("image/jpeg", 0.9));
          setIsLoading(false);
        }
      } catch (err) {
        console.error("High res rendering preview error:", err);
        setIsLoading(false);
      }
    };

    renderPreview();
    return () => {
      isMounted = false;
    };
  }, [page, sources, pdfJsDocCache]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 z-[9999] flex flex-col md:flex-row  overflow-hidden backdrop-blur-md"
    >
      {/* Lightbox Main Preview View container block */}
      <div className="flex-1 flex flex-col md:w-3/5 h-full relative border-r border-[#252525]">
        {/* Top Navbar */}
        <div className="h-14 px-2 flex items-center justify-between border-b border-[#252525] bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#888888] font-bold uppercase tracking-wider">
              High Resolution page Preview
            </span>
            <span className="bg-[#1A1A1A] text-[#888888] text-[10px] px-1 py-1 rounded-full font-bold">
              Desk Page {currentIdx + 1} of {pages.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 20))}
              disabled={zoom <= 50}
              className="p-1 hover:bg-[#1A1A1A] text-[#888888] hover:text-[#EFEFEF] rounded transition-colors disabled:opacity-40"
              title="Zoom Out (-)"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-[10px] font-mono font-bold text-[#888888] w-12 text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(200, z + 20))}
              disabled={zoom >= 200}
              className="p-1 hover:bg-[#1A1A1A] text-[#888888] hover:text-[#EFEFEF] rounded transition-colors disabled:opacity-40"
              title="Zoom In (+)"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>

        {/* Center High resolution Canvas Render target */}
        <div className="flex-1 flex items-center justify-center p-2 overflow-auto custom-scrollbar relative">
          {isLoading ? (
            <div className="text-center text-[#555555] space-y-2 animate-pulse">
              <Loader2
                className="animate-spin text-[#FF6B2B] mx-auto"
                size={32}
              />
              <p className="text-[11px] font-bold font-mono">
                Stitching High Quality Pixels...
              </p>
            </div>
          ) : fullResUrl ? (
            <div
              className="transition-transform duration-200  relative"
              style={{
                transform: `scale(${zoom / 100}) rotate(${page.rotation}deg)`,
                maxWidth: "90%",
                maxHeight: "90%",
              }}
            >
              <img
                src={fullResUrl}
                alt="HQ Render"
                className="max-w-full max-h-[80vh] object-contain rounded border border-[#252525] bg-transparent pointer-events-none select-none"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="text-center text-red-400 space-y-2 flex flex-col items-center">
              <AlertTriangle className="text-red-500" size={28} />
              <p className="text-[11px] font-bold font-mono">
                HQ Render failed. Source file locked or corrupt.
              </p>
            </div>
          )}

          {/* Quick Nav elements on hovered elements */}
          {currentIdx > 0 && (
            <button
              onClick={() => onChangePage(pages[currentIdx - 1])}
              className="absolute left-6 w-11 h-11 rounded-full bg-[#1A1A1A]/85 hover:bg-[#FF6B2B] text-[#888888] hover:text-[#EFEFEF] flex items-center justify-center border border-[#252525]  transition-all"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {currentIdx < pages.length - 1 && (
            <button
              onClick={() => onChangePage(pages[currentIdx + 1])}
              className="absolute right-6 w-11 h-11 rounded-full bg-[#1A1A1A]/85 hover:bg-[#FF6B2B] text-[#888888] hover:text-[#EFEFEF] flex items-center justify-center border border-[#252525]  transition-all"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Lightbox Right side descriptions and info cards panel (35% width desktop, full screen mobile) */}
      <div className="w-full md:w-[320px] bg-[#141414] h-full flex flex-col relative z-20">
        <div className="p-2 border-b border-[#252525] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="text-[#FF6B2B]" size={16} />
            <h3 className="text-[11px] font-black uppercase tracking-wider">
              Page Information
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#888888] hover:text-[#EFEFEF] hover:bg-[#1A1A1A] p-1 rounded transition-colors border border-default"
            title="Close Lightbox"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 p-2 space-y-6 text-[11px] overflow-y-auto">
          {/* File item metadata displays */}
          <div className="space-y-3 p-1 bg-[#1a1a1a] rounded-xl border border-default">
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-[#555555] block mb-1">
                Source Document
              </span>
              <p
                className="font-bold word-all text-slate-200"
                title={page.sourceFileName}
              >
                {page.sourceFileName}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#252525]">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-[#555555] block mb-1">
                  Original Page
                </span>
                <p className="font-mono font-bold text-[#888888]">
                  # {page.originalPageNumber}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-[#555555] block mb-1">
                  Desk Position
                </span>
                <p className="font-mono font-bold text-[#888888]">
                  # {currentIdx + 1}
                </p>
              </div>
            </div>

            <div className="pt-1 border-t border-[#252525]">
              <span className="text-[10px] uppercase font-black tracking-wider text-[#555555] block mb-1 animate-pulse">
                Rotation parameters
              </span>
              <p className="font-mono font-bold text-[#FF6B2B]">
                {page.rotation} degrees CW
              </p>
            </div>
          </div>

          <div className="space-y-2 text-[#888888] text-[11px] leading-relaxed font-sans bg-[#FF6B2B]/5 p-1 rounded-xl border border-[#FF6B2B]/10">
            <h4 className="font-bold text-[#EFEFEF] uppercase tracking-wider text-[10px] mb-1">
              Keyboard Shortcuts
            </h4>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span>Next page</span>
              <kbd className="bg-[#1A1A1A] text-[#888888] px-1 py-1 rounded text-[9px]">
                Right Arrow
              </kbd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span>Prev page</span>
              <kbd className="bg-[#1A1A1A] text-[#888888] px-1 py-1 rounded text-[9px]">
                Left Arrow
              </kbd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span>Zoom In</span>
              <kbd className="bg-[#1A1A1A] text-[#888888] px-1 py-1 rounded text-[9px]">
                +
              </kbd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span>Zoom Out</span>
              <kbd className="bg-[#1A1A1A] text-[#888888] px-1 py-1 rounded text-[9px]">
                -
              </kbd>
            </div>
            <div className="flex justify-between">
              <span>Close Lightbox</span>
              <kbd className="bg-[#1A1A1A] text-[#888888] px-1 py-1 rounded text-[9px]">
                Esc
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
