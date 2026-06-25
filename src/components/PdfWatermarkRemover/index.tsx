import React, { useRef, useState } from "react";
import { DetectedWatermark, ToolState } from "./types";
import WatermarkCard from "./WatermarkCard";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Download,
  File,
  FileText,
  Loader,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

export default function PdfWatermarkRemover() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [state, setState] = useState<ToolState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [watermarks, setWatermarks] = useState<DetectedWatermark[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [cleaningStage, setCleaningStage] = useState("");
  const [scanStage, setScanStage] = useState<"structure" | "ai">("structure");
  const [customText, setCustomText] = useState("");

  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatusText, setScanStatusText] = useState("");
  const [activeScanStepIndex, setActiveScanStepIndex] = useState(0);

  const [removeProgress, setRemoveProgress] = useState(0);
  const [removeStatusText, setRemoveStatusText] = useState("");
  const [activeRemoveStepIndex, setActiveRemoveStepIndex] = useState(0);

  const scanSteps = [
    { key: "init", label: "Initialize Scan", desc: "Validate MIME type and initialize parser metadata" },
    { key: "stream", label: "Extraction", desc: "Expose embedded stream operators across catalog pages" },
    { key: "ai", label: "AI Deep-Scan", desc: "Run Gemini sample frames scanning for hidden watermarks" },
    { key: "consensus", label: "Target Consensus", desc: "Index content operators and pattern maps for matched vectors" },
    { key: "gallery", label: "Gallery Assembly", desc: "Form candidate previews and metadata summaries" }
  ];

  const scanProgressMapping = [
    { name: "Verifying and indexing file headers...", range: [0, 15], stepIndex: 0 },
    { name: "Decoding internal PDF structural dictionaries...", range: [15, 30], stepIndex: 1 },
    { name: "Searching for repeated text pattern candidates...", range: [30, 45], stepIndex: 1 },
    { name: "Initiating L2 Gemini Visual AI Scanner...", range: [45, 60], stepIndex: 2 },
    { name: "Scanning sample pages for hidden visual watermarks...", range: [60, 75], stepIndex: 2 },
    { name: "Consolidating findings and determining confidence ratios...", range: [75, 90], stepIndex: 3 },
    { name: "Rendering preview thumbnails for detected objects...", range: [90, 98], stepIndex: 4 },
  ];

  const removeSteps = [
    { key: "init", label: "Initialize Clean", desc: "Establish pristine buffer stream and extract reference addresses" },
    { key: "purge", label: "Purge Stream Operators", desc: "Scrub inline content stream code rendering matched vectors" },
    { key: "catalog", label: "Clean Resource Catalogs", desc: "Strip reference elements and Form XObjects from page resources" },
    { key: "trailer", label: "Reconstruct Trailer", desc: "Repack structural content streams and update xref bytes catalog" },
    { key: "finalize", label: "Finalize PDF package", desc: "Final integrity checks and wrapping binary attachment" }
  ];

  const removeProgressMapping = [
    { name: "Locating targeted watermark XRef structures...", range: [0, 15], stepIndex: 0 },
    { name: "Analyzing nested graphics state definitions...", range: [15, 30], stepIndex: 1 },
    { name: "Scrubbing inline content stream strings...", range: [30, 50], stepIndex: 1 },
    { name: "Purging Form and Pattern sub-definitions...", range: [50, 70], stepIndex: 2 },
    { name: "Cleaning resource dictionary mapping blocks...", range: [70, 85], stepIndex: 3 },
    { name: "De-allocating orphan bytes & updating cross-reference tables...", range: [85, 95], stepIndex: 3 },
    { name: "Compiling final purified production stream...", range: [95, 98], stepIndex: 4 },
  ];

  const startProgressMultiplier = (
    setProgress: React.Dispatch<React.SetStateAction<number>>,
    setStatusText: React.Dispatch<React.SetStateAction<string>>,
    setStepIndex: React.Dispatch<React.SetStateAction<number>>,
    mapping: { name: string; range: number[]; stepIndex: number }[]
  ) => {
    let pct = 0;
    setProgress(0);

    const updateStatusAndStep = (p: number) => {
      const match = mapping.find(item => p >= item.range[0] && p <= item.range[1]);
      if (match) {
        setStatusText(match.name);
        setStepIndex(match.stepIndex);
      }
    };

    updateStatusAndStep(0);

    const timer = setInterval(() => {
      pct += Math.floor(Math.random() * 2) + 1; // slow-steady progress
      if (pct > 98) {
        pct = 98;
      }
      setProgress(pct);
      updateStatusAndStep(pct);
    }, 120);

    return {
      complete: () => {
        clearInterval(timer);
        setProgress(100);
        const lastMapping = mapping[mapping.length - 1];
        setStatusText(lastMapping.name);
        setStepIndex(lastMapping.stepIndex);
      },
      destroy: () => {
        clearInterval(timer);
      }
    };
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine API base dynamically based on viewport/origin
  const API_BASE = ""; 

  // Drag and drop setup
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Upload & scan document
  const processSelectedFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setErrorMessage("Please select a valid PDF file");
      setState("error");
      return;
    }

    setUploadedFile(file);
    setFileName(file.name);
    setState("scanning");
    setErrorMessage("");

    const sim = startProgressMultiplier(
      setScanProgress,
      setScanStatusText,
      setActiveScanStepIndex,
      scanProgressMapping
    );

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/tools/pdf-watermark-remover/scan`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to scan PDF document");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setTotalPages(data.totalPages);
      setWatermarks(data.watermarks);
      setErrorMessage(data.aiWarning || "");

      // Automatically select all identified watermarks by default
      setSelectedIds(data.watermarks.map((w: any) => w.id));
      
      sim.complete();
      setTimeout(() => {
        setState("results");
      }, 500);

    } catch (err: any) {
      sim.destroy();
      setErrorMessage(err.message || "An error occurred while uploading. Please check API connection.");
      setState("error");
    }
  };

  // Toggle selection for a single watermark card
  const handleToggleWatermark = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle select all state
  const handleToggleSelectAll = () => {
    if (selectedIds.length === watermarks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(watermarks.map((wm) => wm.id));
    }
  };

  // Add custom manual text watermark mapping
  const addCustomWatermarkText = () => {
    if (!customText.trim()) return;
    const cleanText = customText.trim();
    
    // Check duplicates
    if (watermarks.some((w) => w.text === cleanText)) {
      setCustomText("");
      return;
    }

    // Create a client-side generated inline watermark object targeting all pages
    const newWm: DetectedWatermark = {
      id: "custom_" + Math.random().toString(36).substring(2, 11),
      type: "TEXT_INLINE",
      text: cleanText,
      source: "structure",
      pagesAffected: Array.from({ length: totalPages }, (_, i) => i),
      confidence: 1.0,
    };

    setWatermarks((prev) => [...prev, newWm]);
    setSelectedIds((prev) => [...prev, newWm.id]);
    setCustomText("");
  };

  // Trigger Purge / Removal pipeline
  const handlePurgeSelected = async () => {
    if (selectedIds.length === 0) return;

    setState("removing");
    setCleaningStage("Purging nested PDF stream operators...");

    const sim = startProgressMultiplier(
      setRemoveProgress,
      setRemoveStatusText,
      setActiveRemoveStepIndex,
      removeProgressMapping
    );

    try {
      const res = await fetch(`${API_BASE}/api/tools/pdf-watermark-remover/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          watermarkIds: selectedIds,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to purge requested watermarks");
      }

      setCleaningStage("Assembling final document streams...");
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      // Trigger automatic background download
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `clean_${fileName || "document.pdf"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();

      sim.complete();
      setTimeout(() => {
        setState("done");
      }, 500);

    } catch (err: any) {
      sim.destroy();
      setErrorMessage(err.message || "Failed to remove watermarks");
      setState("error");
    }
  };

  // Clean / reset state
  const handleReset = () => {
    setState("idle");
    setWatermarks([]);
    setSelectedIds([]);
    setFileName("");
    setTotalPages(0);
    setSessionId("");
    setCustomText("");
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 font-sans text-[var(--text-primary)]">
      {/* Header section */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center justify-center gap-2 text-gray-900">
          <Trash2 className="text-red-500 w-8 h-8" />
          PDF Watermark Purger Pro
        </h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
          Purge hidden text watermarks from Telegram, shared watermarks, and duplicated logo images instantly without breaking formatting.
        </p>
      </div>

      {/* --- IDLE STATE --- */}
      {state === "idle" && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={`
            border-2 border-dashed rounded-[var(--radius-xl)] p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[340px]
            ${
              isDragOver
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary-muted)] scale-[0.99] shadow-inner"
                : "border-[var(--border-strong)] bg-[var(--bg-card)] hover:border-[var(--brand-primary)] hover:bg-[var(--bg-hover)]"
            }
          `}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />
          <div className="p-4 rounded-full bg-[var(--brand-primary-muted)] mb-5 text-[var(--brand-primary)]">
            <UploadCloud size={40} className="animate-pulse" />
          </div>
          <h3 className="font-semibold text-lg mb-1.5 text-gray-900">
            Click to upload or drag & drop PDF
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
            Supports documents up to 50MB. Multi-page recursive scanning for inline stream elements and repeated XObjects.
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--brand-primary)] font-medium bg-[var(--brand-primary-muted)] px-3 py-1.5 rounded-full">
            <Sliders size={13} strokeWidth={2.5} />
            Auto-Detect Image & Text Watermarks
          </div>
        </div>
      )}

      {/* --- SCANNING STATE --- */}
      {state === "scanning" && (
        <div className="border border-[var(--border-default)] bg-[var(--bg-card)] rounded-[var(--radius-xl)] p-8 md:p-12 min-h-[420px] flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-center">
            {/* Left Column: Overall Progress Wheel */}
            <div className="md:col-span-2 flex flex-col items-center text-center">
              <div className="relative mb-5 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
                  {/* Circular SVG progress wheel */}
                  <svg className="absolute w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="var(--border-strong)"
                      strokeWidth="6"
                      fill="transparent"
                      className="text-gray-200"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="#6366F1"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={364.4}
                      strokeDashoffset={364.4 - (364.4 * scanProgress) / 100}
                      className="transition-all duration-300 ease-out"
                    />
                  </svg>
                  <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    {scanProgress}%
                  </span>
                </div>
                <div className="absolute -bottom-2 bg-indigo-50 border border-indigo-100 text-[#6366F1] font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Loader size={10} className="animate-spin" /> Scanning
                </div>
              </div>

              <h3 className="font-bold text-lg text-gray-950 mb-2">
                Document Indexing Active
              </h3>
              
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg max-w-xs w-full text-center mb-1">
                <p className="text-xs font-semibold text-indigo-600 animate-pulse">
                  {scanStatusText}
                </p>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-2 font-semibold">
                Please wait, processing page streams
              </p>
            </div>

            {/* Right Column: Step-by-Step Status Indicators */}
            <div className="md:col-span-3 space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Processing Steps
              </h4>
              <div className="space-y-2.5">
                {scanSteps.map((step, index) => {
                  const isCompleted = activeScanStepIndex > index;
                  const isActive = activeScanStepIndex === index;
                  
                  return (
                    <div 
                      key={step.key} 
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                        isActive 
                          ? "bg-indigo-50/50 border-indigo-100 text-indigo-950 shadow-sm" 
                          : isCompleted 
                            ? "bg-emerald-50/20 border-transparent text-gray-600" 
                            : "bg-transparent border-transparent text-gray-400"
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isCompleted ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        ) : isActive ? (
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center relative">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping absolute"></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 relative"></span>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"></div>
                        )}
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${isActive ? "text-indigo-600" : isCompleted ? "text-emerald-700" : "text-gray-500"}`}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-normal">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- REMOVING STATE --- */}
      {state === "removing" && (
        <div className="border border-[var(--border-default)] bg-[var(--bg-card)] rounded-[var(--radius-xl)] p-8 md:p-12 min-h-[420px] flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-center">
            {/* Left Column: Overall Progress */}
            <div className="md:col-span-2 flex flex-col items-center text-center">
              <div className="relative mb-5 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
                  {/* Circular SVG progress wheel */}
                  <svg className="absolute w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="var(--border-strong)"
                      strokeWidth="6"
                      fill="transparent"
                      className="text-gray-200"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="#EF4444"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={364.4}
                      strokeDashoffset={364.4 - (364.4 * removeProgress) / 100}
                      className="transition-all duration-300 ease-out"
                    />
                  </svg>
                  <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    {removeProgress}%
                  </span>
                </div>
                <div className="absolute -bottom-2 bg-red-50 border border-red-100 text-red-600 font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span> Purging
                </div>
              </div>

              <h3 className="font-bold text-lg text-gray-950 mb-2">
                Purger Pipeline Active
              </h3>
              
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg max-w-xs w-full text-center mb-1">
                <p className="text-xs font-semibold text-red-600 animate-pulse">
                  {removeStatusText}
                </p>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-2 font-semibold">
                Purifying stream operator structures
              </p>
            </div>

            {/* Right Column: Step-by-Step Status Indicators */}
            <div className="md:col-span-3 space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Removal Phases
              </h4>
              <div className="space-y-2.5">
                {removeSteps.map((step, index) => {
                  const isCompleted = activeRemoveStepIndex > index;
                  const isActive = activeRemoveStepIndex === index;
                  
                  return (
                    <div 
                      key={step.key} 
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                        isActive 
                          ? "bg-red-50/50 border-red-100 text-red-955 shadow-sm" 
                          : isCompleted 
                            ? "bg-emerald-50/20 border-transparent text-gray-600" 
                            : "bg-transparent border-transparent text-gray-400"
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isCompleted ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        ) : isActive ? (
                          <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center relative">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping absolute"></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 relative"></span>
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"></div>
                        )}
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${isActive ? "text-red-600" : isCompleted ? "text-emerald-700" : "text-gray-500"}`}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-normal">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RESULTS STATE --- */}
      {state === "results" && (
        <div className="space-y-6">
          {/* File Meta Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[var(--radius-lg)] gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-red-100 text-red-500">
                <FileText size={20} />
              </div>
              <div>
                <h4 className="text-sm font-semibold truncate max-w-[280px] text-gray-900">
                  {fileName}
                </h4>
                <p className="text-xs text-[var(--text-secondary)]">
                  {totalPages} Pages Scanned
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5 self-start sm:self-center transition-all"
            >
              <RefreshCw size={12} /> Change File
            </button>
          </div>
 
          {errorMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] flex items-start gap-2.5">
               <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
               <div className="flex-1">
                 <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Deep Scan Notification</p>
                 <p className="text-xs text-amber-800 leading-normal">{errorMessage}</p>
               </div>
            </div>
          )}

          {/* Core Controls */}
          {watermarks.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-gray-900">
                    Detected Watermarks ({watermarks.length})
                  </h3>
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                  >
                    {selectedIds.length === watermarks.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {selectedIds.length} of {watermarks.length} selected for purge
                </span>
              </div>

              {/* Watermark Card Collection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {watermarks.map((wm) => (
                  <WatermarkCard
                    key={wm.id}
                    watermark={wm}
                    selected={selectedIds.includes(wm.id)}
                    onToggle={handleToggleWatermark}
                    sessionId={sessionId}
                    apiBase={API_BASE}
                  />
                ))}
              </div>
            </div>
          ) : (
            // No Watermarks Found Empty State
            <div className="border border-[var(--border-default)] bg-[var(--bg-card)] p-8 text-center rounded-[var(--radius-lg)]">
              <AlertTriangle className="text-amber-500 w-12 h-12 mx-auto mb-4 animate-[bounce_1.5s_infinite]" />
              <h3 className="text-lg font-bold text-gray-900 mb-1.5">
                No Auto-Detected Watermarks!
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mb-6">
                Our recursive scanner couldn't automatically match recurring watermarks. However, you can map and purge any custom text watermark below instead!
              </p>
            </div>
          )}

          {/* Custom watermark manual insert tool */}
          <div className="p-4 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-[var(--radius-lg)]">
            <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <Search size={14} className="text-[var(--brand-primary)]" /> Cannot find your watermark? Add custom text:
            </h4>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="e.g. @username, target website, custom name"
                  className="w-full px-3 py-2 pl-8 text-sm rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-card)] focus:outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
                <Search size={14} className="absolute left-2.5 top-3 text-[var(--text-muted)]" />
              </div>
              <button
                onClick={addCustomWatermarkText}
                disabled={!customText.trim()}
                className="px-4 py-2 bg-[var(--text-primary)] hover:bg-[#1a1c1e] text-white text-xs font-semibold rounded-[var(--radius-md)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Add & Target
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              Adds a client-side targeted custom rule to match and strip the provided text across all pages.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="pt-4 flex items-center justify-between border-t border-[var(--border-default)] flex-wrap gap-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-[var(--border-strong)] rounded-[var(--radius-lg)] text-sm font-semibold hover:bg-[var(--bg-hover)] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handlePurgeSelected}
              disabled={selectedIds.length === 0}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-[var(--radius-lg)] text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              <Trash2 size={16} /> Purge Selected & Download
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* --- DONE STATE --- */}
      {state === "done" && (
        <div className="border border-[var(--border-default)] bg-[var(--bg-card)] rounded-[var(--radius-xl)] p-12 text-center min-h-[340px] flex flex-col items-center justify-center">
          <div className="p-4 rounded-full bg-emerald-100 text-emerald-600 mb-6 animate-[bounce_1.5s_infinite]">
            <CheckCircle size={44} />
          </div>
          <h3 className="font-extrabold text-xl mb-1.5 text-gray-900">
            Watermarks Purged Successfully!
          </h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-6">
            All targeted graphics states have been purified and content streams re-allocated. Your document was clean and downloaded automatically!
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm justify-center">
            <button
              onClick={handlePurgeSelected}
              className="w-full sm:w-auto px-5 py-2.5 bg-[var(--brand-primary)] text-white text-sm font-bold rounded-[var(--radius-lg)] transition-all hover:bg-[var(--brand-primary-hover)] flex items-center justify-center gap-1.5"
            >
              <Download size={14} /> Download Again
            </button>
            <button
              onClick={handleReset}
              className="w-full sm:w-auto px-5 py-2.5 border border-[var(--border-strong)] rounded-[var(--radius-lg)] text-sm font-semibold hover:bg-[var(--bg-hover)] transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} /> Purge Another
            </button>
          </div>
        </div>
      )}

      {/* --- ERROR STATE --- */}
      {state === "error" && (
        <div className="border border-[var(--border-default)] bg-[var(--bg-card)] rounded-[var(--radius-xl)] p-12 text-center min-h-[340px] flex flex-col items-center justify-center">
          <div className="p-4 rounded-full bg-red-100 text-red-600 mb-6">
            <AlertTriangle size={44} />
          </div>
          <h3 className="font-extrabold text-lg mb-1.5 text-gray-950">
            Scanning Error Occurred
          </h3>
          <p className="text-xs text-[var(--text-secondary)] sm:max-w-md mb-6 bg-red-500/5 p-4 rounded-[var(--radius-md)] border border-red-500/10 font-mono text-left max-w-full overflow-x-auto whitespace-pre-wrap">
            {errorMessage || "An unexpected system fault occurred while purging the PDF file structures."}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => uploadedFile ? processSelectedFile(uploadedFile) : handleReset()}
              className="px-5 py-2.5 bg-[var(--brand-primary)] text-white text-sm font-bold rounded-[var(--radius-lg)] transition-all hover:bg-[var(--brand-primary-hover)]"
            >
              {uploadedFile ? "Retry AI Scan" : "Retry Upload"}
            </button>
            {uploadedFile && (
              <button
                onClick={handleReset}
                className="px-5 py-2.5 border border-[var(--border-strong)] rounded-[var(--radius-lg)] text-sm font-semibold hover:bg-[var(--bg-hover)] transition-all"
              >
                Start Over
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
