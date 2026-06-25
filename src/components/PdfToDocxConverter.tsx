import React, { useState, useEffect, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import {
  UploadCloud,
  FileText,
  CheckCircle,
  Download,
  AlertTriangle,
  AlertCircle,
  Eye,
  Lock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  Clock,
  Settings,
  FolderInput,
  Info,
  X,
  MessageSquare,
  Sparkles,
  Edit2,
  Trash2,
  ChevronsRight,
  RefreshCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as pdfjsLib from "pdfjs-dist";
import { processBatch, calculateParallelism } from "../services/geminiPool";

// Configure pdfjs-dist CDN worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ElementStyle {
  color?: string;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  backgroundColor?: string;
}

interface PageElement {
  type: string;
  text?: string;
  style?: ElementStyle;
  items?: string[];
  rows?: string[][];
  alignment?: "left" | "center" | "right";
}

interface PageImageData {
  width: number;
  height: number;
  base64: string;
}

function PageThumbnail({ pdfDoc, pageNum, fallbackUrl }: { pdfDoc: any; pageNum: number; fallbackUrl?: string | null }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!pdfDoc) {
        if (fallbackUrl) {
          if (active) {
            setImgUrl(fallbackUrl);
            setLoading(false);
          }
        } else {
          if (active) {
            setLoading(false);
          }
        }
        return;
      }
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({
            canvasContext: ctx,
            viewport: viewport,
            canvas: canvas,
          }).promise;
          if (active) {
            setImgUrl(canvas.toDataURL("image/jpeg", 0.6));
          }
        }
      } catch (e) {
        console.error("Page render thumbnail error pageNum:", pageNum, e);
      } finally {
        if (active) setLoading(false);
      }
    };
    render();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum, fallbackUrl]);

  if (loading) {
    return (
      <div className="w-full h-full bg-slate-900/40 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={`Page ${pageNum}`}
        className="w-full h-full object-cover select-none pointer-events-none rounded opacity-90 hover:opacity-100 transition-opacity"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="w-full h-full bg-slate-900/60 flex flex-col items-center justify-center p-1 text-center text-slate-500">
      <FileText size={18} className="text-slate-400 mb-1" />
      <span className="text-[9px] font-mono leading-none">Text Only</span>
    </div>
  );
}

export default function PdfToDocxConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  // Page specific conversion queues and configurations
  const [pageStatuses, setPageStatuses] = useState<Record<number, "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED">>({});
  const [pageRetryModes, setPageRetryModes] = useState<Record<number, "Normal" | "OCR" | "High Accuracy">>({});
  const [pageAIInstructions, setPageAIInstructions] = useState<Record<number, string>>({});
  const [pageContents, setPageContents] = useState<Record<number, PageElement[]>>({});
  const [pageImagesData, setPageImagesData] = useState<Record<number, PageImageData[]>>({});
  const [pageRevealCounts, setPageRevealCounts] = useState<Record<number, number>>({});
  
  // UI Display Control States
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [expandedFixPage, setExpandedFixPage] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [compilingDocx, setCompilingDocx] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);

  // Conversion Options
  const [formattingLevel, setFormattingLevel] = useState<"high" | "balanced" | "text">("balanced");
  const [languageHint, setLanguageHint] = useState<"auto" | "hindi" | "english" | "mixed">("auto");
  const [embedImages, setEmbedImages] = useState(true);
  const [insertPageBreaks, setInsertPageBreaks] = useState(true);
  const [ocrRenderScale, setOcrRenderScale] = useState<number>(2.0);
  const [ocrImageQuality, setOcrImageQuality] = useState<number>(0.8);

  // Global Prompt Controls
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [errorType, setErrorType] = useState<"size" | "password" | "scanned" | "corrupt" | "server" | null>(null);
  const [customErrorMsg, setCustomErrorMsg] = useState("");
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [totalKeys, setTotalKeys] = useState(1);

  const queueCancelRef = useRef<boolean>(false);

  useEffect(() => {
    const customKeys = localStorage.getItem("active_gemini_api_key");
    const count = customKeys && customKeys.length > 5 ? 1 : 0;

    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setTotalKeys((data.totalKeys || 0) + count);
      })
      .catch(() => {
        setTotalKeys(1 + count);
      });
  }, []);

  const handleClear = () => {
    setFile(null);
    setPageCount(null);
    setThumbnailUrl(null);
    setPdfDoc(null);
    setSelectedPages([]);
    setPageStatuses({});
    setPageRetryModes({});
    setPageAIInstructions({});
    setPageContents({});
    setPageImagesData({});
    setPageRevealCounts({});
    setIsEditingInline(false);
    setExpandedFixPage(null);
    setErrorType(null);
    setCustomErrorMsg("");
    setIsScannedPdf(false);
    setGlobalPrompt("");
    setQueueProcessing(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  const validateAndProcessFile = async (selectedFile: File) => {
    const isImg = selectedFile.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(selectedFile.name);
    const isDocPdf = selectedFile.type === "application/pdf" || selectedFile.name.endsWith(".pdf");

    if (!isImg && !isDocPdf) {
      setErrorType("corrupt");
      setCustomErrorMsg("Sikayat: Only PDF or Image format (PNG, JPG, JPEG, WEBP, GIF) is allowed.");
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setErrorType("size");
      return;
    }

    setFile(selectedFile);
    setErrorType(null);
    setCustomErrorMsg("");

    if (isImg) {
      setPdfDoc(null);
      setPageCount(1);
      setSelectedPages([1]);
      setPageStatuses({ 1: "PENDING" });
      setPageRetryModes({ 1: "Normal" });
      setIsScannedPdf(false);

      const reader = new FileReader();
      reader.onloadend = () => {
        setThumbnailUrl(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
      return;
    }

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      setPdfDoc(pdf);
      const count = pdf.numPages;
      setPageCount(count);
      setSelectedPages(Array.from({ length: count }, (_, i) => i + 1));

      // Read initial text to check if PDF is scanned/image-only
      let pageTextAccumulator = "";
      for (let pNum = 1; pNum <= Math.min(count, 3); pNum++) {
        const pag = await pdf.getPage(pNum);
        const textCon = await pag.getTextContent();
        pageTextAccumulator += textCon.items.map((it: any) => it.str).join("");
      }

      const isScanned = pageTextAccumulator.trim().length === 0;
      setIsScannedPdf(isScanned);

      // Preset queues
      const initialStatuses: Record<number, "PENDING"> = {};
      const initialModes: Record<number, "Normal" | "OCR"> = {};
      Array.from({ length: count }, (_, i) => i + 1).forEach((p) => {
        initialStatuses[p] = "PENDING";
        initialModes[p] = isScanned ? "OCR" : "Normal";
      });
      setPageStatuses(initialStatuses);
      setPageRetryModes(initialModes);

      const pageOne = await pdf.getPage(1);
      const viewport = pageOne.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await pageOne.render({
          canvasContext: ctx,
          viewport: viewport,
          canvas: canvas,
        }).promise;
        setThumbnailUrl(canvas.toDataURL("image/jpeg", 0.75));
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("encrypted") || msg.includes("password")) {
        setErrorType("password");
      } else {
        setErrorType("corrupt");
        setCustomErrorMsg("Fail to parse PDF data. The file might be corrupted.");
      }
    }
  };

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages((prev) => {
      const updated = prev.includes(pageNum)
        ? prev.filter((p) => p !== pageNum)
        : [...prev, pageNum].sort((a, b) => a - b);
      
      // Update statuses as well
      setPageStatuses((old) => {
        const next = { ...old };
        if (updated.includes(pageNum)) {
          if (!next[pageNum]) next[pageNum] = "PENDING";
        } else {
          delete next[pageNum];
        }
        return next;
      });
      return updated;
    });
  };

  const handleConvertSinglePage = async (pNum: number, maxRetries = 2, isRetry = false, apiKey?: string) => {
    if (queueCancelRef.current) return;

    setPageStatuses((prev) => ({ ...prev, [pNum]: "PROCESSING" }));
    setPageRevealCounts((prev) => ({ ...prev, [pNum]: 0 }));

    try {
      if (!file) throw new Error("No file selected.");
      
      let singlePageBlob: Blob;
      let uploadFilename = "page.pdf";
      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
      
      if (isPdf) {
        const currentMode = pageRetryModes[pNum] || "Normal";
        const useImageExtraction = isScannedPdf || currentMode === "OCR" || currentMode === "High Accuracy";

        if (useImageExtraction && pdfDoc) {
          try {
            const page = await pdfDoc.getPage(pNum);
            // Render at customizable scale for flexible visual representation
            const viewport = page.getViewport({ scale: ocrRenderScale });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (context) {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              // Fill white background to avoid transparent PDFs rendering as black
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);

              await page.render({
                canvasContext: context,
                viewport: viewport,
                canvas: canvas,
              }).promise;

              const blobPromise = new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), "image/jpeg", ocrImageQuality);
              });
              const imageBlob = await blobPromise;
              if (imageBlob) {
                singlePageBlob = imageBlob;
                uploadFilename = "page.jpg";
              } else {
                throw new Error("Failed to generate image blob");
              }
            } else {
              throw new Error("Canvas context is null");
            }
          } catch (renderErr) {
            console.warn("Client-side PDF page rendering failed, falling back to PDF page extraction:", renderErr);
            const fileArrayBuffer = await file.arrayBuffer();
            const srcDoc = await PDFDocument.load(fileArrayBuffer);
            const singlePageDoc = await PDFDocument.create();
            const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pNum - 1]);
            singlePageDoc.addPage(copiedPage);
            const subPdfBytes = await singlePageDoc.save();
            singlePageBlob = new Blob([subPdfBytes], { type: "application/pdf" });
            uploadFilename = "page.pdf";
          }
        } else {
          const fileArrayBuffer = await file.arrayBuffer();
          const srcDoc = await PDFDocument.load(fileArrayBuffer);
          const singlePageDoc = await PDFDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pNum - 1]);
          singlePageDoc.addPage(copiedPage);
          const subPdfBytes = await singlePageDoc.save();
          singlePageBlob = new Blob([subPdfBytes], { type: "application/pdf" });
          uploadFilename = "page.pdf";
        }
      } else {
        singlePageBlob = file;
        uploadFilename = file.name;
      }

      let lastError = new Error("Unknown Error");
      let success = false;

      // Retry loop up to maxRetries
      for (let attempt = 0; attempt <= maxRetries && !queueCancelRef.current; attempt++) {
        try {
          const formData = new FormData();
          formData.append("pdf", singlePageBlob, uploadFilename);
          formData.append("pageNum", "1"); // Since it's a 1-page PDF
          formData.append("retryMode", pageRetryModes[pNum] || "Normal");
          formData.append("instruction", pageAIInstructions[pNum] || "");
          formData.append("languageHint", languageHint);
          formData.append("globalPrompt", globalPrompt);
          formData.append("embedImages", embedImages ? "true" : "false");
          if (isRetry) {
            formData.append("isRetry", "true");
          }

          const activeApiKey = apiKey || localStorage.getItem("active_gemini_api_key") || "";
          const response = await fetch("/api/pdf-to-docx/process-page", {
            method: "POST",
            headers: {
              ...(activeApiKey ? { "x-user-api-key": activeApiKey } : {}),
            },
            body: formData,
          });

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            let errMsg = "Failed visual character analysis.";
            if (text.startsWith("<!DOCTYPE") || text.includes("<html")) {
              if (response.status === 429) {
                errMsg = "API limits reached or server busy. Retrying...";
              } else if (response.status >= 500) {
                 errMsg = "Backend server busy. Retrying...";
              } else {
                 errMsg = "Iframe cookie constraint detected. In preview mode, please click 'Open in New Tab' at the top-right to bypass session blocks.";
              }
            } else {
              try {
                const errorJson = JSON.parse(text);
                errMsg = errorJson.error || errMsg;
              } catch (e) {}
            }
            throw new Error(errMsg);
          }

          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            if (text.startsWith("<!DOCTYPE") || text.includes("<html")) {
              throw new Error("Received HTML error from server. Retrying...");
            } else {
              throw new Error("Failed to parse extractor response.");
            }
          }

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.success) {
            setPageContents((prev) => ({ ...prev, [pNum]: data.elements || [] }));
            setPageImagesData((prev) => ({ ...prev, [pNum]: data.images || [] }));
            setPageStatuses((prev) => ({ ...prev, [pNum]: "SUCCESS" }));

            // Start progressive word/paragraph streaming reveal
            let count = 0;
            const total = (data.elements || []).length;
            const timer = setInterval(() => {
              count++;
              setPageRevealCounts((prev) => ({ ...prev, [pNum]: count }));
              if (count >= total) {
                clearInterval(timer);
              }
            }, 80);
            
            success = true;
            break; // Break retry loop on success
          } else {
            throw new Error("Failed extraction payload layout match.");
          }
        } catch (err: any) {
           lastError = err;
           console.warn(`Page ${pNum} extraction attempt ${attempt + 1} failed:`, err);
           // Wait before retrying
           if (attempt < maxRetries && !queueCancelRef.current) {
             await new Promise(r => setTimeout(r, 2000 + (Math.random() * 2000)));
           }
        }
      } // end retry loop

      if (!success) {
        throw lastError;
      }
    } catch (err: any) {
      console.error(`Page ${pNum} extraction failed completely:`, err);
      setPageStatuses((prev) => ({ ...prev, [pNum]: "FAILED" }));
      setErrorType("server");
      const errStr = String(err?.message || "").toLowerCase();
      if (errStr.includes("fetch") || errStr.includes("cors") || errStr.includes("redirect") || errStr.includes("cookie")) {
        setCustomErrorMsg("Iframe Cookie Constraint / Session Expired detected. Your browser blocked the secure container session check inside this iframe. Please click 'Open in New Tab' at the top-right toolbar of the screen to work seamlessly without browser security blocks.");
      } else {
        setCustomErrorMsg(err?.message || "Failed page visual character analysis matches.");
      }
    }
  };

  const handleConvertAllSelected = async () => {
    if (!file || selectedPages.length === 0) return;
    setQueueProcessing(true);
    queueCancelRef.current = false;
    setErrorType(null);
    setCustomErrorMsg("");

    // Setup statuses to PENDING for those selected
    setPageStatuses((prev) => {
      const next = { ...prev };
      selectedPages.forEach((p) => {
        if (next[p] !== "SUCCESS") {
          next[p] = "PENDING";
        }
      });
      return next;
    });

    const pagesToProcess = selectedPages.filter((p) => pageStatuses[p] !== "SUCCESS");
    
    try {
      await processBatch({
        items: pagesToProcess,
        maxWorkers: 5,
        processItem: async (pNum, index, apiKey) => {
          if (queueCancelRef.current) return;
          await handleConvertSinglePage(pNum, 2, false, apiKey);
        }
      });
    } catch (err) {
      console.error("Queue execution interrupted:", err);
    }
    setQueueProcessing(false);
  };

  const handleCancelAll = () => {
    queueCancelRef.current = true;
    setQueueProcessing(false);
    setPageStatuses((old) => {
      const next = { ...old };
      Object.keys(next).forEach((k) => {
        const p = Number(k);
        if (next[p] === "PROCESSING" || next[p] === "PENDING") {
          next[p] = "PENDING";
        }
      });
      return next;
    });
  };

  const handleSinglePageRetry = async (pNum: number, mode?: "Normal" | "OCR" | "High Accuracy") => {
    if (mode) {
      setPageRetryModes((old) => ({ ...old, [pNum]: mode }));
    }
    await handleConvertSinglePage(pNum, 2, true);
  };

  const handleSinglePageFixSubmit = async (pNum: number) => {
    setExpandedFixPage(null);
    await handleConvertSinglePage(pNum, 2, true);
  };

  const updateElementText = (pNum: number, elIdx: number, newText: string) => {
    setPageContents((prev) => {
      const next = { ...prev };
      if (next[pNum] && next[pNum][elIdx]) {
        next[pNum][elIdx] = { ...next[pNum][elIdx], text: newText };
      }
      return next;
    });
  };

  const deleteElement = (pNum: number, elIdx: number) => {
    setPageContents((prev) => {
      const next = { ...prev };
      if (next[pNum]) {
        next[pNum] = next[pNum].filter((_, idx) => idx !== elIdx);
      }
      return next;
    });
  };

  const handleDownloadFinalDocx = async () => {
    if (!file) return;
    setCompilingDocx(true);
    try {
      const payload = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        insertPageBreaks,
        pages: selectedPages.map((pNum) => ({
          pageNum: pNum,
          elements: pageContents[pNum] || [],
          images: pageImagesData[pNum] || [],
        })),
      };

      const response = await fetch("/api/pdf-to-docx/generate-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let serverMsg = "";
        try {
          const errData = await response.json();
          serverMsg = errData.error || errData.message || "";
        } catch (_) {}
        throw new Error(serverMsg || "Failed to compile layout elements inside host document packer.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.[^/.]+$/, "")}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Compilation error:", err);
      setErrorType("server");
      setCustomErrorMsg(err.message || "Failed docx generation on host server.");
    } finally {
      setCompilingDocx(false);
    }
  };

  // Compute stats for progress bar
  const totalSelected = selectedPages.length;
  const completedSelected = selectedPages.filter((p) => pageStatuses[p] === "SUCCESS").length;
  const progressPercent = totalSelected > 0 ? Math.round((completedSelected / totalSelected) * 100) : 0;
  const allComplete = totalSelected > 0 && completedSelected === totalSelected;

  return (
    <div className="max-w-full w-full mx-auto px-4 py-6 relative text-slate-100 min-h-screen bg-[#080B14] overflow-x-hidden font-body flex flex-col gap-6">
      {/* Background Ambients */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* STEP DETAILED PROGRESS HEADER */}
      {queueProcessing && (
        <div className="w-full bg-[#0C0F1E] border border-[#1C2140] rounded-[10px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none relative overflow-hidden">
          <div className="absolute top-0 left-0 bottom-0 bg-indigo-500/10" style={{ width: `${progressPercent}%` }} />
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 animate-spin">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Processing Page Elements</h3>
              <p className="text-xs text-slate-400 mt-1">
                Completed: <span className="text-indigo-400 font-extrabold">{completedSelected}</span> of {totalSelected} Selected Pages
              </p>
            </div>
          </div>
          <div className="flex-1 max-w-md relative z-10">
            <div className="w-full bg-[#14182E] h-2 rounded-[99px] overflow-hidden border border-[#1E2545]">
              <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3 relative z-10 shrink-0">
            <span className="text-xs text-indigo-400 font-black">{progressPercent}% DONE</span>
            <button
              onClick={handleCancelAll}
              className="px-3 py-1.5 bg-red-950/40 border border-red-500/30 text-red-400 hover:text-red-300 rounded-[6px] text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MAIN TWO PANEL SYSTEM GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full flex-1">
        
        {/* Left Side: Layout, Presets, Option, Page Cards (ColSpan 7) */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          
          {/* UPLOAD PANEL ZONE */}
          <div className="bg-[#0C0F1E] border border-[#1C2140] rounded-[10px] p-4 select-none">
            {!file ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("pdf-select-node")?.click()}
                className={`border-dashed border-2 rounded-[10px] p-6 text-center cursor-pointer transition-all duration-300 group ${
                  dragOver
                    ? "border-indigo-500 bg-indigo-500/5 shadow-md"
                    : "border-[#1E2545] hover:border-indigo-500/40 bg-[#141828]"
                }`}
              >
                <input
                  id="pdf-select-node"
                  type="file"
                  accept="application/pdf, image/png, image/jpeg, image/jpg, image/webp, image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="mx-auto w-12 h-12 rounded-[10px] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2 group-hover:scale-105 transition-transform">
                  <UploadCloud size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-200">PDF ya Image file drop karein</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-[320px] mx-auto leading-relaxed">
                  ya click karke browse karein. Supports PDF, PNG, JPG, WEBP. Max limit 20MB. No signup required.
                </p>
              </div>
            ) : (
              <div className="p-2 bg-[#141828] border border-[#1E2545] rounded-[10px] flex gap-4 items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {thumbnailUrl ? (
                    <div className="w-12 h-16 bg-[#111528] border border-[#1C2140] rounded overflow-hidden shadow-sm shrink-0">
                      <img src={thumbnailUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-16 bg-indigo-950/20 border border-indigo-500/20 rounded shrink-0 flex items-center justify-center text-indigo-400">
                      <FileText size={20} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-100 truncate" title={file.name}>
                      {file.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                      {pageCount !== null && (
                        <>
                          <span className="mx-1 text-slate-600">|</span>
                          {pageCount} page(s) loaded
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  className="p-1.5 hover:bg-[#1C2140] text-slate-400 hover:text-slate-100 rounded-[6px] border border-[#1E2545] transition-all cursor-pointer shadow-xs"
                  title="Clear file"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* PAGE BREAK & GRID CONFIG PANEL */}
          {file && pageCount !== null && (
            <div className="bg-[#0C0F1E] border border-[#1C2140] rounded-[10px] p-4 space-y-4 flex flex-col flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#14182E] pb-3 shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                    Select Pages to Convert
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Select individual pages below. Toggle modes and instructions under each page card.
                  </p>
                </div>
                <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-1 rounded-[24px] self-start sm:self-auto uppercase">
                  Selected: {selectedPages.length} / {pageCount} Pages
                </div>
              </div>

              {/* Selection Presets */}
              <div className="flex flex-wrap gap-2 items-center text-[11px] shrink-0">
                <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px] mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setSelectedPages(Array.from({ length: pageCount }, (_, i) => i + 1))}
                  className="px-2.5 py-1 bg-[#141828] border border-[#1E2545] text-slate-400 hover:text-slate-100 hover:border-indigo-500 rounded-[6px] transition-all cursor-pointer text-[10px] font-semibold"
                >
                  All Pages
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPages([])}
                  className="px-2.5 py-1 bg-[#141828] border border-[#1E2545] text-slate-400 hover:text-slate-100 hover:border-indigo-500 rounded-[6px] transition-all cursor-pointer text-[10px] font-semibold"
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const odds = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p % 2 !== 0);
                    setSelectedPages(odds);
                  }}
                  className="px-2.5 py-1 bg-[#141828] border border-[#1E2545] text-slate-400 hover:text-slate-100 hover:border-indigo-500 rounded-[6px] transition-all cursor-pointer text-[10px] font-semibold"
                >
                  Odd
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const evens = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p % 2 === 0);
                    setSelectedPages(evens);
                  }}
                  className="px-2.5 py-1 bg-[#141828] border border-[#1E2545] text-slate-400 hover:text-slate-100 hover:border-indigo-500 rounded-[6px] transition-all cursor-pointer text-[10px] font-semibold"
                >
                  Even
                </button>
              </div>

              {isScannedPdf && (
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-[10px] text-xs flex items-start gap-2.5 shrink-0 select-none">
                  <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded-md shrink-0 mt-0.5">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <span className="font-bold block text-slate-200">Scanned Document Detected</span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      AI OCR mode has been auto-activated for all pages to perform extremely high-precision character extraction and layout preservation directly from the page image.
                    </p>
                  </div>
                </div>
              )}

              {/* Grid lists with Page status integration */}
              <div className="overflow-y-auto flex-1 max-h-[350px] pr-1 scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-0.5">
                  {Array.from({ length: pageCount }, (_, idx) => {
                    const pNum = idx + 1;
                    const isSelected = selectedPages.includes(pNum);
                    const status = pageStatuses[pNum] || "PENDING";
                    const isFixOpen = expandedFixPage === pNum;

                    return (
                      <div
                        key={pNum}
                        className={`border rounded-[10px] flex flex-col justify-between overflow-hidden transition-all duration-200 select-none ${
                          isSelected
                            ? "border-indigo-500/50 bg-[#141828]"
                            : "border-[#1C2140] bg-[#111528] opacity-60 hover:opacity-100"
                        }`}
                      >
                        {/* Top panel segment */}
                        <div className="flex gap-2 p-2">
                          <div
                            onClick={() => togglePageSelection(pNum)}
                            className="w-12 h-16 bg-[#080B14] rounded overflow-hidden cursor-pointer relative grow-0 shrink-0 border border-[#1E2545]"
                          >
                            <PageThumbnail pdfDoc={pdfDoc} pageNum={pNum} fallbackUrl={thumbnailUrl} />
                            
                            {/* Visual select overlay check circle */}
                            {isSelected && (
                              <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                                <div className="p-0.5 bg-indigo-500 text-slate-100 rounded-full">
                                  <CheckCircle size={10} />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-1">
                              <h5 className="text-[11px] font-bold text-slate-100 truncate">
                                Page {pNum}
                              </h5>
                              
                              {/* Page Status Pill */}
                              {isSelected && (
                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-[24px] ${
                                  status === "SUCCESS"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : status === "PROCESSING"
                                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                                      : status === "FAILED"
                                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                        : "bg-[#1E2545] text-slate-400 border border-[#1C2140]"
                                }`}>
                                  {status}
                                </span>
                              )}
                            </div>

                            {/* Options Buttons row under Thumbnail block */}
                            {isSelected && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {/* Mode toggle inline */}
                                <select
                                  value={pageRetryModes[pNum] || "Normal"}
                                  disabled={status === "PROCESSING"}
                                  onChange={(e) => setPageRetryModes((old) => ({ ...old, [pNum]: e.target.value as any }))}
                                  className="bg-[#0C0F1E] border border-[#1C2140] text-[9px] font-extrabold text-[#06B6D4] px-1 py-0.5 rounded-[4px] outline-none"
                                >
                                  <option value="Normal">Normal</option>
                                  <option value="OCR">OCR Mode</option>
                                  <option value="High Accuracy">High Accuracy</option>
                                </select>

                                {/* Action Retry trigger */}
                                <button
                                  onClick={() => handleSinglePageRetry(pNum)}
                                  disabled={status === "PROCESSING"}
                                  className="p-1 hover:bg-[#1E2545] text-indigo-400 hover:text-indigo-300 rounded-[4px] border border-[#1C2140] cursor-pointer"
                                  title="Reprocess page"
                                >
                                  <RefreshCcw size={10} />
                                </button>

                                {/* Collapsible AI Fix toggle Button */}
                                <button
                                  onClick={() => setExpandedFixPage(isFixOpen ? null : pNum)}
                                  className={`p-1 rounded-[4px] border ${
                                    isFixOpen
                                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                                      : "border-[#1C2140] hover:bg-[#1E2545] text-slate-400"
                                  } cursor-pointer`}
                                  title="AI Fix specific instruction"
                                >
                                  <Sparkles size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Collapsed Instruction pane details */}
                        {isSelected && isFixOpen && (
                          <div className="border-t border-[#1C2140] p-2 bg-[#0C0F1E] flex flex-col gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">AI Page Fix Prompt</span>
                            <textarea
                              value={pageAIInstructions[pNum] || ""}
                              onChange={(e) => setPageAIInstructions((old) => ({ ...old, [pNum]: e.target.value }))}
                              placeholder="e.g. Is page ka table high-fidelity extract karein, heading bold index matching..."
                              className="w-full bg-[#111528] border border-[#1E2545] rounded-[6px] p-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400 h-16 resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setExpandedFixPage(null)}
                                className="px-2 py-1 text-[9px] font-semibold text-slate-400 hover:text-slate-100 rounded cursor-pointer"
                              >
                                Close
                              </button>
                              <button
                                onClick={() => handleSinglePageFixSubmit(pNum)}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-[9px] font-black uppercase rounded cursor-pointer flex items-center gap-1.5"
                              >
                                <Sparkles size={8} /> Process Fix
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ADVANCED SETUP FORM CONFIG - Collapsible */}
          <div className="bg-[#0C0F1E] border border-[#1C2140] rounded-[10px] overflow-hidden">
            <button
              onClick={() => setOptionsOpen(!optionsOpen)}
              className="w-full p-3 flex items-center justify-between hover:bg-[#141828]/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">Global Conversion Settings</span>
              </div>
              {optionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <AnimatePresence>
              {optionsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-4 border-t border-[#1C2140] bg-[#111528] space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Select Language */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Language Model Hint</label>
                      <select
                        value={languageHint}
                        onChange={(e) => setLanguageHint(e.target.value as any)}
                        className="w-full bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] px-2 py-1.5 text-xs text-slate-200 outline-none"
                      >
                        <option value="auto">Auto-detect Language</option>
                        <option value="hindi">Hindi / Devanagari Specific</option>
                        <option value="english">English (Global standard)</option>
                        <option value="mixed">Mixed (English + Hindi)</option>
                      </select>
                    </div>

                    {/* Formatting detail */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Formatting Tier</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["text", "balanced", "high"].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setFormattingLevel(lvl as any)}
                            className={`py-1 text-[10px] font-black uppercase rounded-[6px] border transition-all cursor-pointer ${
                              formattingLevel === lvl
                                ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                                : "bg-[#0C0F1E] border-[#1C2140] text-slate-400 hover:text-slate-100"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Images config */}
                    <div className="p-3 bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] flex items-center justify-between">
                      <div>
                        <h6 className="text-[11px] font-bold text-slate-200">Extract Inline Images</h6>
                        <p className="text-[9px] text-slate-400 mt-0.5">Embed page bitmap arrays logically</p>
                      </div>
                      <button
                        onClick={() => setEmbedImages(!embedImages)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                          embedImages ? "bg-indigo-500" : "bg-[#1E2545]"
                        }`}
                      >
                        <div className={`w-4 h-4 bg-slate-100 rounded-full transition-transform ${embedImages ? "translate-x-4" : ""}`} />
                      </button>
                    </div>

                    {/* Segment separators */}
                    <div className="p-3 bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] flex items-center justify-between">
                      <div>
                        <h6 className="text-[11px] font-bold text-slate-200">Insert Page Breaks</h6>
                        <p className="text-[9px] text-slate-400 mt-0.5">Maintain page boundaries in DOCX</p>
                      </div>
                      <button
                        onClick={() => setInsertPageBreaks(!insertPageBreaks)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                          insertPageBreaks ? "bg-indigo-500" : "bg-[#1E2545]"
                        }`}
                      >
                        <div className={`w-4 h-4 bg-slate-100 rounded-full transition-transform ${insertPageBreaks ? "translate-x-4" : ""}`} />
                      </button>
                    </div>

                    {/* Rendering Zoom Scale */}
                    <div className="p-3 bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] space-y-1.5 col-span-1 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h6 className="text-[11px] font-bold text-slate-200">AI Extraction Zoom Level (Render Scale)</h6>
                          <p className="text-[9px] text-slate-400 mt-0.5">Higher = better text detection of small text/scans. Lower = faster processing, no Fail-to-Fetch timeouts.</p>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{ocrRenderScale.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="3.5"
                        step="0.5"
                        value={ocrRenderScale}
                        onChange={(e) => setOcrRenderScale(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#1E2545] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* JPEG Image Quality */}
                    <div className="p-3 bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] space-y-1.5 col-span-1 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h6 className="text-[11px] font-bold text-slate-200">JPEG Compression Quality</h6>
                          <p className="text-[9px] text-slate-400 mt-0.5">Lower value decreases file payload size substantially, reducing connection drop risks.</p>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{Math.round(ocrImageQuality * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.0"
                        step="0.1"
                        value={ocrImageQuality}
                        onChange={(e) => setOcrImageQuality(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#1E2545] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  </div>

                  {/* Options: Global specific instructions input */}
                  <div className="pt-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                      <Zap size={11} className="text-cyan-400" /> Global Conversion Context (All Pages)
                    </label>
                    <textarea
                      value={globalPrompt}
                      onChange={(e) => setGlobalPrompt(e.target.value)}
                      placeholder="e.g. Translate entire document into simple Hindi, Highlight important formulas, Ignore headers..."
                      className="w-full bg-[#0C0F1E] border border-[#1C2140] rounded-[6px] p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-400 h-16 resize-none mt-1.5"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CORE EXECUTE TRIGGER BAR */}
          {file && selectedPages.length > 0 && !queueProcessing && (
            <button
              onClick={handleConvertAllSelected}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold uppercase tracking-wider text-xs rounded-[6px] cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/10"
            >
              <Zap size={14} className="text-cyan-400" />
              {allComplete
                ? "Resubmit Selected Pages to AI"
                : `Extract Selected Pages (${selectedPages.length}) with AI`}
            </button>
          )}
        </div>

        {/* Right Side: LIVE STREAMING PREVIEW PANEL & INLINE EDITOR (ColSpan 5) */}
        <div className="lg:col-span-5 flex flex-col h-full">
          <div className="bg-[#0C0F1E] border border-[#1C2140] rounded-[10px] p-4 flex flex-col h-full min-h-[500px]">
            
            {/* Upper preview configurations block */}
            <div className="flex items-center justify-between border-b border-[#14182E] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-cyan-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">Extracted Content</h3>
              </div>

              {/* Edit text toggle switch */}
              {selectedPages.some((p) => (pageContents[p] || []).length > 0) && (
                <button
                  onClick={() => setIsEditingInline(!isEditingInline)}
                  className={`px-2.5 py-1.5 rounded-[6px] border text-[10px] font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                    isEditingInline
                      ? "bg-cyan-500/10 border-cyan-500 text-cyan-400"
                      : "border-[#1E2545] hover:border-cyan-500/40 text-slate-400"
                  }`}
                >
                  <Edit2 size={10} />
                  {isEditingInline ? "Exit Edit" : "Edit Text"}
                </button>
              )}
            </div>

            {/* Scroll view of the contents elements list */}
            <div className="flex-1 overflow-y-auto max-h-[460px] my-3 pr-1 bg-[#111528] rounded-[10px] p-3 text-slate-300 leading-relaxed scrollbar">
              {selectedPages.some((p) => (pageContents[p] || []).length > 0) ? (
                <div className="space-y-4">
                  {selectedPages.map((pNum) => {
                    const elements = pageContents[pNum] || [];
                    const revealCount = pageRevealCounts[pNum] !== undefined ? pageRevealCounts[pNum] : elements.length;
                    
                    if (elements.length === 0) return null;

                    return (
                      <div key={pNum} className="space-y-3 pb-4 border-b border-[#1C2140]/60 last:border-0">
                        {/* Page header marker tag */}
                        <div className="flex items-center gap-2 text-slate-500 font-mono text-[9px] uppercase tracking-wider font-extrabold border-b border-[#1A1F38] pb-1.5">
                          <ChevronsRight size={10} className="text-indigo-400" /> Page {pNum} Content
                        </div>

                        {elements.slice(0, revealCount).map((el, elIdx) => {
                          const style = el.style || {};
                          const isHeading = String(el.type).startsWith("heading");
                          const isTable = el.type === "table";
                          const isBullet = el.type === "bullet_list";
                          const isEquation = el.type === "chemical_equation";
                          
                          // Style extraction
                          const customStyle: React.CSSProperties = {
                            color: style.color ? `#${style.color}` : undefined,
                            fontStyle: style.isItalic ? "italic" : undefined,
                            fontWeight: style.isBold || isHeading ? "bold" : "normal",
                            fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
                            backgroundColor: style.backgroundColor && style.backgroundColor !== "white" ? `#${style.backgroundColor}20` : undefined,
                            textAlign: el.alignment || "left"
                          };

                          if (isEditingInline) {
                            return (
                              <div key={elIdx} className="p-2 border border-[#1E2545] rounded-[6px] bg-[#0C0F1E] flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-[8px] font-black uppercase text-slate-500">
                                  <span>Type: {el.type}</span>
                                  <button
                                    onClick={() => deleteElement(pNum, elIdx)}
                                    className="p-1 hover:bg-[#1E2545] hover:text-red-400 rounded cursor-pointer"
                                    title="Delete block"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>

                                {isTable ? (
                                  <div className="space-y-1">
                                    {(el.rows || []).map((row, rIdx) => (
                                      <div key={rIdx} className="flex gap-1.5">
                                        {row.map((val, cIdx) => (
                                          <input
                                            key={cIdx}
                                            value={val}
                                            onChange={(e) => {
                                              const updatedRows = [...(el.rows || [])];
                                              updatedRows[rIdx] = [...updatedRows[rIdx]];
                                              updatedRows[rIdx][cIdx] = e.target.value;
                                              setPageContents((prev) => {
                                                const next = { ...prev };
                                                next[pNum][elIdx] = { ...next[pNum][elIdx], rows: updatedRows };
                                                return next;
                                              });
                                            }}
                                            className="w-full bg-[#111528] border border-[#1C2140] text-xs text-slate-100 rounded px-1 py-0.5 outline-none"
                                          />
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                ) : isBullet ? (
                                  <div className="space-y-1">
                                    {(el.items || []).map((item, itemIdx) => (
                                      <input
                                        key={itemIdx}
                                        value={item}
                                        onChange={(e) => {
                                          const updatedItems = [...(el.items || [])];
                                          updatedItems[itemIdx] = e.target.value;
                                          setPageContents((prev) => {
                                            const next = { ...prev };
                                            next[pNum][elIdx] = { ...next[pNum][elIdx], items: updatedItems };
                                            return next;
                                          });
                                        }}
                                        className="w-full bg-[#111528] border border-[#1C2140] text-xs text-slate-100 rounded px-1.5 py-0.5 outline-none"
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <textarea
                                    value={el.text || ""}
                                    onChange={(e) => updateElementText(pNum, elIdx, e.target.value)}
                                    className="w-full bg-[#111528] border border-[#1C2140] text-xs text-slate-100 p-1.5 rounded-[6px] outline-none h-12 resize-none"
                                  />
                                )}
                              </div>
                            );
                          }

                          // RENDER BLOCKS IN NORMAL MOOD
                          if (isTable) {
                            return (
                              <div key={elIdx} className="overflow-x-auto my-2 border border-[#1C2140] rounded-[6px]">
                                <table className="w-full text-left text-xs border-collapse">
                                  <tbody>
                                    {(el.rows || []).map((row, rIdx) => (
                                      <tr key={rIdx} className={rIdx === 0 ? "bg-indigo-500/10 border-b border-[#1C2140]" : "border-b border-[#1C2140]/40 last:border-0"}>
                                        {row.map((cell, cIdx) => (
                                          <td key={cIdx} className="p-2 border-r border-[#1C2140]/30 last:border-r-0 font-medium">
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          }

                          if (isBullet) {
                            return (
                              <ul key={elIdx} className="list-disc pl-4 space-y-1.5 text-xs text-slate-300" style={customStyle}>
                                {(el.items || []).map((item, itemIdx) => (
                                  <li key={itemIdx}>{item}</li>
                                ))}
                              </ul>
                            );
                          }

                          if (isEquation) {
                            return (
                              <div key={elIdx} className="p-2 my-2 bg-slate-900 border border-slate-700/60 rounded text-center text-xs font-mono text-cyan-400">
                                {el.text}
                              </div>
                            );
                          }

                          if (el.type === "heading1") {
                            return (
                              <h1 key={elIdx} className="text-lg font-black leading-snug mt-2 text-slate-100" style={customStyle}>
                                {el.text}
                              </h1>
                            );
                          }

                          if (el.type === "heading2") {
                            return (
                              <h2 key={elIdx} className="text-sm font-bold leading-snug text-slate-200 mt-1.5" style={customStyle}>
                                {el.text}
                              </h2>
                            );
                          }

                          return (
                            <p key={elIdx} className="text-xs text-slate-300 leading-relaxed" style={customStyle}>
                              {el.text}
                            </p>
                          );
                        })}

                        {/* Rendering Embedded Images below elements for visual verification */}
                        {embedImages && (pageImagesData[pNum] || []).length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            {(pageImagesData[pNum] || []).map((img, imgIdx) => (
                              <div key={imgIdx} className="border border-[#1E2545] rounded-[6px] overflow-hidden bg-[#0C0F1E] flex flex-col items-center p-1">
                                <img
                                  src={`data:image/png;base64,${img.base64}`}
                                  alt="Embedded object"
                                  className="max-h-24 object-contain"
                                />
                                <span className="text-[8px] text-slate-500 font-mono mt-1">{img.width}x{img.height} PNG</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-10">
                  <FolderInput size={28} className="mb-2 text-slate-600" />
                  <p className="text-xs font-semibold">Ready for extraction analyses.</p>
                  <p className="text-[10px] mt-1 text-slate-600 max-w-[200px]">
                    PDF/Image upload karke is structural panel me real-time output check karein.
                  </p>
                </div>
              )}
            </div>

            {/* Downloader compiling bar segment */}
            <div className="shrink-0 pt-3 border-t border-[#14182E]">
              {selectedPages.some((p) => (pageContents[p] || []).length > 0) && (
                <button
                  onClick={handleDownloadFinalDocx}
                  disabled={!allComplete || compilingDocx}
                  className={`w-full py-2.5 rounded-[6px] font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                    allComplete && !compilingDocx
                      ? "bg-indigo-600 hover:bg-indigo-500 text-slate-100 border-transparent active:scale-98 shadow-sm"
                      : "bg-[#111528] text-slate-500 border-[#1E2545] cursor-not-allowed opacity-50"
                  }`}
                >
                  {compilingDocx ? (
                    <>
                      <div className="w-3 h-3 border-2 border-slate-100 border-t-transparent rounded-full animate-spin" />
                      Compiling Word Document...
                    </>
                  ) : (
                    <>
                      <Download size={14} className="text-cyan-400" />
                      Download Word Document (.docx)
                    </>
                  )}
                </button>
              )}
              
              {!allComplete && selectedPages.some((p) => (pageContents[p] || []).length > 0) && (
                <p className="text-[10px] text-slate-500 text-center mt-2 italic">
                  Sabhi pages complete hone par download button active ho jayega.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DYNAMIC ERROR MODALS */}
      <AnimatePresence>
        {errorType && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-xs select-none"
          >
            <div className="bg-[#0C0F1E] border border-red-500/20 max-w-md w-full rounded-[10px] p-5 shadow-lg space-y-4 relative">
              <button
                onClick={() => setErrorType(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex gap-3">
                <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-[10px] shrink-0 h-fit">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-100">Conversion System Error</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {customErrorMsg || "Something skipped. Critical extraction is required to run smoothly."}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setErrorType(null);
                    setCustomErrorMsg("");
                  }}
                  className="px-4 py-2 bg-[#1E2545] hover:bg-[#1C2140] text-slate-100 text-xs font-bold uppercase rounded-[6px] transition-all cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
