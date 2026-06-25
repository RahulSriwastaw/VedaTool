import React, { useState, useEffect, useRef } from "react";
import { 
  FileUp, FileText, Search, Plus, Filter, Tag, Calendar, Database, 
  Trash2, Eye, Edit2, ChevronLeft, ChevronRight, Sparkles, Check, 
  Copy, Key, ListOrdered, GraduationCap, AlertCircle, Info, RefreshCw,
  Sliders, Wand2, ArrowLeftRight, CheckCircle2, SlidersHorizontal, Image as ImageIcon,
  Save, AlertTriangle, FileSpreadsheet, Lock, HelpCircle, Clock, Maximize2, Minimize2, Loader2, Terminal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth } from "../services/firebase";
import { 
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, limit, Timestamp, writeBatch
} from "firebase/firestore";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { convertPdfToImages } from "../services/pdfUtils";
import { useAuthState } from "react-firebase-hooks/auth";
import ImagePainterEditor from "./ImagePainterEditor";
import { McqQuestion, McqOption } from "../types";
import { MathRenderer } from "./MathRenderer";
import { useLanguage } from "../hooks/useLanguage";

// Random ID generators for Set ID and Password
function generateSetId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "SET-";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function McqWorkspace() {
  const [user] = useAuthState(auth);
  const currentUid = user?.uid || "unauthenticated_guest";

  // Active Main Tab: "extract" | "import" | "bank" | "tests"
  const [activeTab, setActiveTab] = useState<"extract" | "import" | "bank" | "tests">("extract");

  // Document extraction variables
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]); // Base64 rendered page images
  const [activePageIdx, setActivePageIdx] = useState<number>(0);
  const [mobileSubTab, setMobileSubTab] = useState<"pdf" | "mcq">("pdf");
  const [isRenderingPdf, setIsRenderingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<string>("");
  const [pdfProgressPercent, setPdfProgressPercent] = useState<number>(0);

  // Global Fast-Fill Batch Parameters for Metadata Harvesting
  const [batchMeta, setBatchMeta] = useState({
    org: "SSC",
    exam: "CGL",
    questionType: "PYQs",
    year: "2025",
    shift: "Shift 1",
    date: "01-01-2025",
    subject: "",
    subSubject: "",
    chapter: "",
    topic: "",
    subTopic: "",
    difficulty: "Medium" as "" | "Easy" | "Medium" | "Hard",
    level: ""
  });

  // Extraction Questions (Questions extracted on active pdf, mapped per page index)
  // Saved questions will be in Firestore but we keep active page ones in state
  const [extractedQuestions, setExtractedQuestions] = useState<Record<number, McqQuestion[]>>({});
  const [isExtractingPage, setIsExtractingPage] = useState<boolean>(false);
  const [parallelExtractionActive, setParallelExtractionActive] = useState<boolean>(false);
  const [extractedPagesCount, setExtractedPagesCount] = useState<number>(0);

  // Firestore Question Bank Questions
  const [bankQuestions, setBankQuestions] = useState<McqQuestion[]>([]);
  const [isFetchingBank, setIsFetchingBank] = useState<boolean>(false);
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<string[]>([]);
  
  // Bank Filters
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("All Subjects");
  const [filterChapter, setFilterChapter] = useState<string>("All Chapters");
  const [filterTopic, setFilterTopic] = useState<string>("All Topics");
  const [filterExam, setFilterExam] = useState<string>("All");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  // Advanced metadata filters
  const [filterPyqStatus, setFilterPyqStatus] = useState<string>("All");
  const [filterLanguage, setFilterLanguage] = useState<string>("All");
  const [filterQuestionType, setFilterQuestionType] = useState<string>("All");
  const [filterPdfName, setFilterPdfName] = useState<string>("All");
  const [filterYear, setFilterYear] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<string>("Date (Newest)");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Global viewing language direction: English (EN), Hindi (HI), or Both (BOTH)
  const { language: viewLanguage, setLanguage: handleLanguageSwitch } = useLanguage();

  // Render specific single question text beautifully based on selected language
  const renderQuestionText = (q: McqQuestion) => {
    if (viewLanguage === "EN") {
      const enText = q.question_eng || q.questionText || "";
      return (
        <div className="text-zinc-900 dark:text-[var(--text-primary)] text-xs font-black select-text leading-relaxed">
          <MathRenderer text={enText} />
        </div>
      );
    }
    if (viewLanguage === "HI") {
      const hiText = q.question_hin || q.questionText || "";
      return (
        <div className="text-zinc-900 dark:text-[var(--text-primary)] text-xs font-bold select-text leading-relaxed">
          <MathRenderer text={hiText} />
        </div>
      );
    }
    // BOTH
    const enText = q.question_eng || q.questionText || "";
    const hiText = q.question_hin || "";
    const showHin = hiText && hiText !== enText;

    return (
      <div className="space-y-1.5 animate-fadeIn">
        {enText && (
          <div className="text-zinc-900 dark:text-[var(--text-primary)] text-[12px] font-black select-text leading-relaxed">
            <span className="text-amber-600 dark:text-amber-400 font-extrabold mr-1 bg-amber-500/10 px-1 py-0.2 rounded text-[9px] uppercase">EN:</span>
            <MathRenderer text={enText} />
          </div>
        )}
        {showHin && (
          <div className="text-zinc-750 dark:text-[var(--text-secondary)] text-[12px] font-bold select-text leading-relaxed border-t border-dashed border-zinc-100 dark:border-zinc-800/60 pt-1">
            <span className="text-blue-600 dark:text-cyan-400 font-extrabold mr-1 bg-blue-500/10 px-1 py-0.2 rounded text-[9px] uppercase">HI:</span>
            <MathRenderer text={hiText} />
          </div>
        )}
      </div>
    );
  };

  // Render specific single option text based on language
  const renderOptionText = (opt: McqOption) => {
    if (viewLanguage === "EN") {
      const enOptText = opt.text_eng || opt.text || "";
      return <span className="text-zinc-800 dark:text-[var(--text-secondary)] text-xs"><span className="font-extrabold mr-1 text-zinc-900 dark:text-[var(--text-primary)]">{opt.label}.</span><MathRenderer text={enOptText} /></span>;
    }
    if (viewLanguage === "HI") {
      const hiOptText = opt.text_hin || opt.text || "";
      return <span className="text-zinc-800 dark:text-[var(--text-secondary)] text-xs"><span className="font-extrabold mr-1 text-zinc-900 dark:text-[var(--text-primary)]">{opt.label}.</span><MathRenderer text={hiOptText} /></span>;
    }
    // BOTH
    const enOptText = opt.text_eng || opt.text || "";
    const hiOptText = opt.text_hin || "";
    const hasHin = hiOptText && hiOptText !== enOptText;
    return (
      <span className="flex flex-col gap-0.5 text-left text-zinc-800 dark:text-[var(--text-secondary)] text-xs">
        <span><span className="font-extrabold mr-1 text-zinc-900 dark:text-[var(--text-primary)]">{opt.label}.</span><MathRenderer text={enOptText} /></span>
        {hasHin && (
          <span className="text-[10px] text-zinc-500 dark:text-[var(--text-muted)] border-t border-dashed border-zinc-150/45 dark:border-zinc-800/40 pt-0.5 mt-0.5 font-medium block">
            <MathRenderer text={hiOptText} />
          </span>
        )}
      </span>
    );
  };

  // Render specific explanation text based on language
  const renderExplanationText = (q: McqQuestion) => {
    if (viewLanguage === "EN") {
      const enSol = q.solution_eng || q.solution;
      if (!enSol) return null;
      return (
        <div className="text-[10px] text-zinc-500 dark:text-[var(--text-secondary)] bg-zinc-50 dark:bg-[#0F172A] border border-zinc-200 dark:border-[var(--border-subtle)] p-2.5 rounded-xl whitespace-pre-wrap">
          <strong className="text-zinc-700 dark:text-[var(--text-primary)] font-bold block mb-1">Explanation (EN):</strong>
          <MathRenderer text={enSol} />
        </div>
      );
    }
    if (viewLanguage === "HI") {
      const hiSol = q.solution_hin || q.solution;
      if (!hiSol) return null;
      return (
        <div className="text-[10px] text-zinc-500 dark:text-[var(--text-secondary)] bg-zinc-50 dark:bg-[#0F172A] border border-zinc-200 dark:border-[var(--border-subtle)] p-2.5 rounded-xl whitespace-pre-wrap">
          <strong className="text-zinc-700 dark:text-[var(--text-primary)] font-bold block mb-1">Explanation (HI):</strong>
          <MathRenderer text={hiSol} />
        </div>
      );
    }
    // BOTH
    const enSol = q.solution_eng || q.solution;
    const hiSol = q.solution_hin || "";
    if (!enSol && !hiSol) return null;
    return (
      <div className="text-[10px] text-zinc-500 dark:text-[var(--text-secondary)] bg-zinc-50 dark:bg-[#0F172A] border border-zinc-200 dark:border-[var(--border-subtle)] p-2.5 rounded-xl whitespace-pre-wrap space-y-2">
        {enSol && (
          <div>
            <strong className="text-zinc-700 dark:text-[var(--text-primary)] font-bold block mb-1">Explanation (English):</strong>
            <MathRenderer text={enSol} />
          </div>
        )}
        {hiSol && hiSol !== enSol && (
          <div className={enSol ? "border-t border-dashed border-zinc-200 dark:border-zinc-800/60 pt-2" : ""}>
            <strong className="text-zinc-700 dark:text-[var(--text-primary)] font-bold block mb-1">Explanation (हिंदी):</strong>
            <MathRenderer text={hiSol} />
          </div>
        )}
      </div>
    );
  };

  // Switch button UI element
  const renderLanguageSwitcherGlobal = () => (
    <div className="inline-flex bg-zinc-100/80 dark:bg-[#0F172A] hover:bg-zinc-150 dark:hover:bg-[#182338] p-0.5 rounded-lg items-center border border-zinc-200/40 dark:border-[var(--border-subtle)] shadow-xs transition select-none shrink-0">
      <span className="text-[9px] font-black uppercase text-zinc-455 dark:text-[var(--text-muted)] px-2 tracking-wider select-none hidden md:inline">Language:</span>
      <div className="flex gap-0.5">
        {(["EN", "HI", "BOTH"] as const).map((lang) => {
          const isActive = viewLanguage === lang;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => handleLanguageSwitch(lang)}
              className={`py-1 px-2 rounded md:rounded-md text-[9px] sm:text-[9.5px] font-black uppercase transition-all cursor-pointer ${
                isActive
                  ? "bg-amber-500 text-zinc-950 font-black shadow-xs border-b border-amber-600/30"
                  : "text-zinc-650 dark:text-[var(--text-secondary)] hover:bg-zinc-200 dark:hover:bg-[#121A2B] hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {lang === "BOTH" ? "Bilingual" : lang}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Bulk Edit Modal State
  const [showBulkTagModal, setShowBulkTagModal] = useState<boolean>(false);
  const [bulkTagMeta, setBulkTagMeta] = useState({
    topic: "",
    subTopic: "",
    chapter: "",
    subSubject: "",
    subject: "",
    difficulty: "Medium" as "Easy" | "Medium" | "Hard",
    status: "Draft" as "Draft" | "Published"
  });

  // Staging / Import Area Questions
  const [stagingQuestions, setStagingQuestions] = useState<McqQuestion[]>([]);
  const [isFetchingStaging, setIsFetchingStaging] = useState<boolean>(false);
  const [selectedStagingQuestionIds, setSelectedStagingQuestionIds] = useState<string[]>([]);
  const [showStagingBulkTagModal, setShowStagingBulkTagModal] = useState<boolean>(false);

  // Importer states for Bulk CSV and AI Single parser
  const [showImporter, setShowImporter] = useState<boolean>(false);
  const [importerMode, setImporterMode] = useState<"csv" | "single">("csv");
  const [stagingSearch, setStagingSearch] = useState<string>("");

  const filteredStaging = stagingQuestions.filter((q) => {
    if (!stagingSearch.trim()) return true;
    const queryTerm = stagingSearch.toLowerCase();
    return (
      q.questionText?.toLowerCase().includes(queryTerm) ||
      q.question_hin?.toLowerCase().includes(queryTerm) ||
      q.subject?.toLowerCase().includes(queryTerm) ||
      q.chapter?.toLowerCase().includes(queryTerm) ||
      q.topic?.toLowerCase().includes(queryTerm)
    );
  });
  
  // Single Question Import Form
  const [singleImportForm, setSingleImportForm] = useState<McqQuestion>({
    id: "",
    questionText: "",
    question_hin: "",
    question_eng: "",
    options: [
      { label: "A", text: "" },
      { label: "B", text: "" },
      { label: "C", text: "" },
      { label: "D", text: "" }
    ],
    answer: "A",
    solution: "",
    solution_hin: "",
    solution_eng: "",
    subject: "",
    chapter: "",
    topic: "",
    difficultyLevel: "Medium",
    questionType: "Multiple Choice",
    status: "Published"
  });
  const [rawPasteText, setRawPasteText] = useState<string>("");
  const [isParsingRawText, setIsParsingRawText] = useState<boolean>(false);

  // Bulk CSV Importer state
  const [csvUploadedQuestions, setCsvUploadedQuestions] = useState<McqQuestion[]>([]);
  const [csvFileError, setCsvFileError] = useState<string>("");
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);
  const [csvUploadType, setCsvUploadType] = useState<"pyq" | "new_mcq">("pyq");
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvUploadStage, setCsvUploadStage] = useState<number>(1);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [csvPreFillMeta, setCsvPreFillMeta] = useState({
    org: "SSC",
    examName: "CGL",
    questionType: "PYQs",
    examYear: "2025",
    examDate: "2025-01-01",
    shift: "Shift 1",
    subject: "",
    subSubject: "",
    chapter: "",
    topic: "",
    subTopic: ""
  });

  const isCsvFormValid = !!(
    csvPreFillMeta.org?.trim() &&
    csvPreFillMeta.examName?.trim() &&
    csvPreFillMeta.questionType?.trim() &&
    csvPreFillMeta.examDate &&
    csvPreFillMeta.shift?.trim()
  );

  // Unique lists from Firestore bank questions for filter dropdowns
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [chaptersList, setChaptersList] = useState<string[]>([]);
  const [topicsList, setTopicsList] = useState<string[]>([]);
  const [examsList, setExamsList] = useState<string[]>([]);
  const [languagesList, setLanguagesList] = useState<string[]>([]);
  const [questionTypesList, setQuestionTypesList] = useState<string[]>([]);
  const [pdfNamesList, setPdfNamesList] = useState<string[]>([]);
  const [yearsList, setYearsList] = useState<string[]>([]);

  // Tests / Created Sets State
  const [createdTests, setCreatedTests] = useState<any[]>([]);
  const [isCreatingTest, setIsCreatingTest] = useState<boolean>(false);
  const [isFetchingTests, setIsFetchingTests] = useState<boolean>(false);
  const [testForm, setTestForm] = useState({
    name: "SSC GD Live Practice Paper",
    examPattern: "SSC GD",
  });
  const [newlyCreatedTestCredentials, setNewlyCreatedTestCredentials] = useState<{ setId: string; password: string } | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);

  // Active Editing Question Drawer
  const [editingQuestion, setEditingQuestion] = useState<McqQuestion | null>(null);
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number>(-1);
  const [editingSourceTab, setEditingSourceTab] = useState<"extract" | "bank" | "staging">("extract");
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(true);

  // AI Edit Tool State
  const [aiFieldsToFill, setAiFieldsToFill] = useState<Record<string, boolean>>({});
  const [aiFieldsMenuOpen, setAiFieldsMenuOpen] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  
  const AI_FILLABLE_FIELDS = [
    { key: "question_hin", label: "Question Hindi" },
    { key: "question_eng", label: "Question English" },
    { key: "solution", label: "Solution" },
    { key: "solution_hin", label: "Solution Hindi" },
    { key: "solution_eng", label: "Solution English" },
    { key: "subject", label: "Subject" },
    { key: "subSubject", label: "Sub Subj" },
    { key: "chapter", label: "Chapter" },
    { key: "topic", label: "Topic" },
    { key: "subTopic", label: "Sub Topic" },
    { key: "questionType", label: "Type" },
    { key: "examName", label: "Exam Name" },
    { key: "examCategory", label: "Exam Category" },
    { key: "examYear", label: "Exam Year" },
    { key: "examDate", label: "Exam Date" },
    { key: "shift", label: "Shift" },
    { key: "session", label: "Session" },
    { key: "stage", label: "Stage" },
    { key: "difficultyLevel", label: "Difficulty" },
    { key: "pyqStatus", label: "PYQ" },
    { key: "language", label: "Language" },
    { key: "bookName", label: "Book Name" },
    { key: "sourceBook", label: "Source Book" },
    { key: "publisher", label: "Publisher" }
  ];

  // Visual Whiteboard drawing popup
  const [paintTargetIndex, setPaintTargetIndex] = useState<{ qIdx: number, source: "extract" | "bank" } | null>(null);

  // Bulk Verification & AI Taxonomy Repair State
  const [showBulkVerifyScreen, setShowBulkVerifyScreen] = useState<boolean>(false);
  const [verifyQuestionsList, setVerifyQuestionsList] = useState<McqQuestion[]>([]);
  const [verifySource, setVerifySource] = useState<"page" | "all">("page");
  const [verifyPageIdx, setVerifyPageIdx] = useState<number>(0);
  const [isAiRepairing, setIsAiRepairing] = useState<boolean>(false);
  const [aiRepairProgress, setAiRepairProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Initial mount data load
  useEffect(() => {
    // Fetch initial items from Firestore
    fetchBankFromFirestore();
    fetchTestsFromFirestore();
    fetchStagingFromFirestore();
  }, []);

  // Sync / fetch questions from Firestore
  const fetchBankFromFirestore = async () => {
    setIsFetchingBank(true);
    try {
      const qRef = collection(db, "questions");
      // Limit to 400 for quick performance
      const qQuery = query(qRef, orderBy("createdAt", "desc"), limit(400));
      const querySnap = await getDocs(qQuery);
      
      const loaded: McqQuestion[] = [];
      querySnap.forEach((doc) => {
        const d = doc.data();
        loaded.push({
          id: doc.id,
          ...d,
        } as McqQuestion);
      });

      setBankQuestions(loaded);

      // Build unique lists for filter dropdowns
      const subs = new Set<string>();
      const chaps = new Set<string>();
      const tops = new Set<string>();
      const exms = new Set<string>();
      const langs = new Set<string>();
      const qTypes = new Set<string>();
      const pdfs = new Set<string>();
      const yrs = new Set<string>();

      loaded.forEach(q => {
        if (q.subject) subs.add(q.subject);
        if (q.chapter) chaps.add(q.chapter);
        if (q.topic) tops.add(q.topic);
        if (q.exam) exms.add(q.exam);
        if (q.examName) exms.add(q.examName);
        if (q.language) langs.add(q.language);
        if (q.questionType) qTypes.add(q.questionType);
        if (q.pdfName) pdfs.add(q.pdfName);
        if (q.examYear) yrs.add(String(q.examYear));
        if (q.year) yrs.add(String(q.year));
      });

      setSubjectsList(Array.from(subs));
      setChaptersList(Array.from(chaps));
      setTopicsList(Array.from(tops));
      setExamsList(Array.from(exms));
      setLanguagesList(Array.from(langs));
      setQuestionTypesList(Array.from(qTypes));
      setPdfNamesList(Array.from(pdfs));
      setYearsList(Array.from(yrs));

    } catch (err) {
      console.error("Firestore loading error:", err);
    } finally {
      setIsFetchingBank(false);
    }
  };

  // Fetch Tests from Firestore
  const fetchTestsFromFirestore = async () => {
    setIsFetchingTests(true);
    try {
      const tRef = collection(db, "tests");
      const querySnap = await getDocs(tRef);
      const loaded: any[] = [];
      querySnap.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() });
      });
      setCreatedTests(loaded);
    } catch (err) {
      console.error("Tests retrieval error:", err);
    } finally {
      setIsFetchingTests(false);
    }
  };

  // Fetch staging questions from Firestore staging collection
  const fetchStagingFromFirestore = async () => {
    setIsFetchingStaging(true);
    try {
      const qRef = collection(db, "staging_questions");
      const qQuery = query(qRef, orderBy("createdAt", "desc"), limit(400));
      const querySnap = await getDocs(qQuery);
      
      const loaded: McqQuestion[] = [];
      querySnap.forEach((doc) => {
        const d = doc.data();
        loaded.push({
          id: doc.id,
          ...d,
        } as McqQuestion);
      });
      setStagingQuestions(loaded);
    } catch (err: any) {
      console.error("Error fetching staging questions:", err);
    } finally {
      setIsFetchingStaging(false);
    }
  };

  // Convert uploaded PDF file page-by-page
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setIsRenderingPdf(true);
    setPdfProgressPercent(10);
    setPdfProgress("Reading PDF format...");

    try {
      const pages = await convertPdfToImages(file, (percent, status) => {
        setPdfProgressPercent(percent);
        setPdfProgress(status);
      });

      setPdfPages(pages);
      setActivePageIdx(0);
    } catch (err: any) {
      alert("Error parsing PDF file: " + err.message);
    } finally {
      setIsRenderingPdf(false);
    }
  };

  // Extract MCQs from active page via API (with robust client-side retry for transient network errors)
  const runExtractionForPage = async (pageIdx: number, attempt = 1): Promise<McqQuestion[]> => {
    const base64Img = pdfPages[pageIdx];
    if (!base64Img) return [];

    const maxAttempts = 3;

    try {
      const response = await fetch("/api/extract-mcq-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          base64Image: base64Img,
          isBilingual: true,
          metadata: {
            org: batchMeta.org,
            exam: batchMeta.exam,
            questionType: batchMeta.questionType,
            year: batchMeta.year,
            shift: batchMeta.shift,
            date: batchMeta.date,
            subject: batchMeta.subject,
            subSubject: batchMeta.subSubject,
            chapter: batchMeta.chapter,
            topic: batchMeta.topic,
            subTopic: batchMeta.subTopic,
            difficulty: batchMeta.difficulty
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`HTTP Error ${response.status}: ${errorText || "Failed to extract"}`);
      }

      const resText = await response.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        throw new Error(`Failed to parse response JSON: ${resText.slice(0, 200)}`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return (data.questions || []).map((q: any, idx: number) => ({
        ...q,
        id: `ext_${pageIdx}_${idx}_${Date.now()}`,
        pageNumber: pageIdx + 1,
        status: "Draft"
      }));

    } catch (err: any) {
      console.error(`Attempt ${attempt} failed for Page ${pageIdx + 1}:`, err);
      if (attempt < maxAttempts) {
        const backoffDelay = attempt * 3000; // 3s, 6s
        console.log(`Retrying page ${pageIdx + 1} (Attempt ${attempt + 1}/${maxAttempts}) after ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return runExtractionForPage(pageIdx, attempt + 1);
      }
      throw err;
    }
  };

  const handleSinglePageExtract = async (pageIdx = activePageIdx) => {
    if (pdfPages.length === 0) return;
    setIsExtractingPage(true);
    if (pageIdx !== activePageIdx) setActivePageIdx(pageIdx);
    try {
      const questions = await runExtractionForPage(pageIdx);
      setExtractedQuestions(prev => ({
        ...prev,
        [pageIdx]: questions
      }));
    } catch (err: any) {
      alert(`AI Extraction Error: ${err.message}`);
    } finally {
      setIsExtractingPage(false);
    }
  };

  // Extract All Pages sequentially/parallely
  const handleAllPagesParallelExtract = async () => {
    if (pdfPages.length === 0) return;
    setParallelExtractionActive(true);
    setExtractedPagesCount(0);

    try {
      let completedCount = 0;
      const batchSize = 3;
      
      for (let i = 0; i < pdfPages.length; i += batchSize) {
        setPdfProgress(`Extracting Questions (Batch of ${batchSize}) starting from Page ${i + 1}...`);
        const batchEnd = Math.min(i + batchSize, pdfPages.length);
        const batchPromises = [];
        
        for (let j = i; j < batchEnd; j++) {
          const promise = runExtractionForPage(j).then((qs) => {
            setExtractedQuestions(prev => ({
              ...prev,
              [j]: qs
            }));
            completedCount++;
            setExtractedPagesCount(completedCount);
            return qs;
          }).catch((err) => {
            console.error(`Error on page ${j}:`, err);
            completedCount++;
            setExtractedPagesCount(completedCount);
            return [];
          });
          batchPromises.push(promise);
        }
        
        await Promise.all(batchPromises);
      }
      alert("Success! Extracted all questions across all pages!");
    } catch (err: any) {
      alert(`Parallel Extraction Error: ${err.message}`);
    } finally {
      setParallelExtractionActive(false);
    }
  };

  // Store extracted questions of active page or all pages to Firestore
  const handleSavePageToBank = async (pageIdx: number) => {
    const questions = extractedQuestions[pageIdx] || [];
    if (questions.length === 0) {
      alert("No questions extracted for this page yet.");
      return;
    }
    setVerifyQuestionsList(JSON.parse(JSON.stringify(questions))); // deep copy
    setVerifySource("page");
    setVerifyPageIdx(pageIdx);
    setShowBulkVerifyScreen(true);
  };

  const [isAutoDetectingMeta, setIsAutoDetectingMeta] = useState(false);

  const handleAutoDetectBatchMeta = async () => {
    if (stagingQuestions.length === 0) {
      alert("Please import or paste some questions into the staging area first.");
      return;
    }
    
    setIsAutoDetectingMeta(true);
    try {
      const res = await fetch("/api/auto-detect-meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": localStorage.getItem("VEDATOOL_API_KEY") || ""
        },
        body: JSON.stringify({ questions: stagingQuestions })
      });
      
      if (!res.ok) {
        throw new Error("Failed to auto-detect metadata.");
      }
      
      const data = await res.json();
      setBatchMeta(prev => ({
        ...prev,
        subject: data.subject || prev.subject || "",
        subSubject: data.subSubject || prev.subSubject || "",
        chapter: data.chapter || prev.chapter || "",
        topic: data.topic || prev.topic || "",
        subTopic: data.subTopic || prev.subTopic || ""
      }));
    } catch (err: any) {
      console.error(err);
      alert("Auto-detect failed. Please try again.");
    } finally {
      setIsAutoDetectingMeta(false);
    }
  };

  // Save ALL extracted pages questions.
  const handleSaveAllToBank = async () => {
    let list: McqQuestion[] = [];
    Object.keys(extractedQuestions).forEach((k) => {
      list = [...list, ...extractedQuestions[Number(k)]];
    });

    if (list.length === 0) {
      alert("No questions found on any page.");
      return;
    }
    setVerifyQuestionsList(JSON.parse(JSON.stringify(list))); // deep copy
    setVerifySource("all");
    setShowBulkVerifyScreen(true);
  };

  // Confirm and write verified questions to Firestore with full metadata model
  const saveVerifiedQuestionsToDb = async () => {
    if (verifyQuestionsList.length === 0) return;
    try {
      for (const q of verifyQuestionsList) {
        const payload = {
          ...q,
          userId: currentUid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          status: "Published"
        };
        // @ts-ignore
        delete payload.id;
        await addDoc(collection(db, "questions"), payload);
      }
      
      // Clear local state questions that were successfully saved
      if (verifySource === "page") {
        setExtractedQuestions(prev => ({
          ...prev,
          [verifyPageIdx]: []
        }));
      } else {
        setExtractedQuestions({});
      }

      setShowBulkVerifyScreen(false);
      setVerifyQuestionsList([]);
      alert(`Successfully saved ${verifyQuestionsList.length} verified questions to global Question Bank!`);
      fetchBankFromFirestore();
    } catch (err: any) {
      alert("Failed saving modified elements to Question Bank: " + err.message);
    }
  };

  // AI-Powered auto repair of missing field metadata
  const handleAiFillMissingMetadata = async () => {
    setIsAiRepairing(true);
    setAiRepairProgress({ current: 0, total: 0 });
    try {
      const updatedQuestions = [...verifyQuestionsList];
      const indicesToRepair: number[] = [];

      for (let i = 0; i < updatedQuestions.length; i++) {
        const currentQ = updatedQuestions[i];
        
        // Define missing fields check
        const isMissing = 
          !currentQ.subject || 
          !currentQ.chapter || 
          !currentQ.topic || 
          !currentQ.examName || 
          !currentQ.shift || 
          !currentQ.difficultyLevel || 
          !currentQ.questionType;
        
        // Check if any field has low confidence score
        const hasLowConfidence = currentQ.confidenceScores && Object.values(currentQ.confidenceScores).some(score => score < 85);

        if (isMissing || hasLowConfidence || !currentQ.confidenceScores) {
          indicesToRepair.push(i);
        }
      }

      if (indicesToRepair.length === 0) {
        alert("All questions are already complete and verified!");
        setIsAiRepairing(false);
        return;
      }

      setAiRepairProgress({ current: 0, total: indicesToRepair.length });

      let currentIndex = 0;
      let completedCount = 0;

      const runNextRepair = async (): Promise<void> => {
        if (currentIndex >= indicesToRepair.length) return;

        const taskIdx = currentIndex++;
        const index = indicesToRepair[taskIdx];
        const currentQ = updatedQuestions[index];

        try {
          // Gather context (surrounding questions, up to 2 preceding and 2 succeeding)
          const contextStart = Math.max(0, index - 2);
          const contextEnd = Math.min(updatedQuestions.length, index + 3);
          const contexts = updatedQuestions
            .slice(contextStart, contextEnd)
            .filter((_, idx) => (idx + contextStart) !== index)
            .map(q => ({
              questionText: q.questionText,
              subject: q.subject,
              chapter: q.chapter,
              topic: q.topic,
              exam: q.examName || q.exam,
              shift: q.shift,
              difficulty: q.difficultyLevel || q.difficulty
            }));

          // Make the API request
          const res = await fetch("/api/repair-mcq-metadata", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              question: currentQ,
              contexts
            })
          });

          if (res.ok) {
            const repaired = await res.json();
            
            // Map repaired fields
            updatedQuestions[index] = {
              ...currentQ,
              subject: repaired.subject || currentQ.subject || "",
              subSubject: repaired.subSubject || currentQ.subSubject || "",
              chapter: repaired.chapter || currentQ.chapter || "",
              topic: repaired.topic || currentQ.topic || "",
              subTopic: repaired.subTopic || currentQ.subTopic || "",
              examName: repaired.examName || currentQ.examName || currentQ.exam || "",
              exam: repaired.examName || currentQ.examName || currentQ.exam || "",
              examYear: repaired.examYear || currentQ.examYear || currentQ.year || "",
              year: repaired.examYear || currentQ.examYear || currentQ.year || "",
              examDate: repaired.examDate || currentQ.examDate || currentQ.date || "",
              date: repaired.examDate || currentQ.examDate || currentQ.date || "",
              shift: repaired.shift || currentQ.shift || "",
              stage: repaired.stage || currentQ.stage || "",
              difficulty: repaired.difficultyLevel || currentQ.difficultyLevel || currentQ.difficulty || "Medium",
              difficultyLevel: repaired.difficultyLevel || currentQ.difficultyLevel || currentQ.difficulty || "Medium",
              questionType: repaired.questionType || currentQ.questionType || "Conceptual",
              pyqStatus: repaired.pyqStatus || currentQ.pyqStatus || "TRUE",
              confidenceScores: repaired.confidenceScores || currentQ.confidenceScores || {}
            };
          }
        } catch (err) {
          console.error("AI Repair failed for question index " + index, err);
        } finally {
          completedCount++;
          setAiRepairProgress({ current: completedCount, total: indicesToRepair.length });
          // Recursive call for moving window pool execution
          await runNextRepair();
        }
      };

      // Create a pool of up to 20 concurrent execution promises
      const workerPool: Promise<void>[] = [];
      const numWorkers = Math.min(20, indicesToRepair.length);
      for (let w = 0; w < numWorkers; w++) {
        workerPool.push(runNextRepair());
      }
      await Promise.all(workerPool);

      setVerifyQuestionsList(updatedQuestions);
      alert(`AI Metadata Repair completed successfully in parallel! Processed ${indicesToRepair.length} questions.`);
    } catch (err: any) {
      alert("AI Metadata Repair failed: " + err.message);
    } finally {
      setIsAiRepairing(false);
    }
  };

  // Delete local question item before saving
  const handleDeleteLocalQuestion = (pageIdx: number, qIdx: number) => {
    setExtractedQuestions(prev => {
      const copy = { ...prev };
      const list = [...(copy[pageIdx] || [])];
      list.splice(qIdx, 1);
      copy[pageIdx] = list;
      return copy;
    });
  };

  // Open Edit drawer
  const openEditDrawer = (qIdx: number, source: "extract" | "bank" | "staging") => {
    if (source === "extract") {
      const q = extractedQuestions[activePageIdx]?.[qIdx];
      if (q) {
        setEditingQuestion({ ...q });
        setEditingQuestionIdx(qIdx);
        setEditingSourceTab("extract");
      }
    } else if (source === "staging") {
      const q = stagingQuestions[qIdx];
      if (q) {
        setEditingQuestion({ ...q });
        setEditingQuestionIdx(qIdx);
        setEditingSourceTab("staging");
      }
    } else {
      const q = bankQuestions[qIdx];
      if (q) {
        setEditingQuestion({ ...q });
        setEditingQuestionIdx(qIdx);
        setEditingSourceTab("bank");
      }
    }
  };

  // Save Single Question edit changes
  const saveEditedQuestion = async () => {
    if (!editingQuestion) return;

    if (editingSourceTab === "extract") {
      // Modify active page list
      setExtractedQuestions(prev => {
        const copy = { ...prev };
        const list = [...(copy[activePageIdx] || [])];
        list[editingQuestionIdx] = editingQuestion;
        copy[activePageIdx] = list;
        return copy;
      });
      setEditingQuestion(null);
    } else if (editingSourceTab === "staging") {
      // Modify Firestore staging document
      try {
        const docRef = doc(db, "staging_questions", editingQuestion.id);
        const { id, ...payload } = editingQuestion;
        await updateDoc(docRef, payload as any);
        
        // Update local staging question state
        setStagingQuestions(prev => {
          const list = [...prev];
          list[editingQuestionIdx] = editingQuestion;
          return list;
        });

        setEditingQuestion(null);
        alert("Staging question updated successfully!");
      } catch (err: any) {
        alert("Failed to update staging question: " + err.message);
      }
    } else {
      // Modify Firestore Document
      try {
        const docRef = doc(db, "questions", editingQuestion.id);
        const { id, ...payload } = editingQuestion;
        await updateDoc(docRef, payload as any);
        
        // Update local bank question state
        setBankQuestions(prev => {
          const list = [...prev];
          list[editingQuestionIdx] = editingQuestion;
          return list;
        });

        setEditingQuestion(null);
        alert("Question updated successfully!");
      } catch (err: any) {
        alert("Failed to update in Firestore: " + err.message);
      }
    }
  };

  // Run AI assist edit improvement on specific question
  const toggleAiFieldsMenu = () => {
    if (!aiFieldsMenuOpen && editingQuestion) {
      // Auto-select empty fields
      const newSettings: Record<string, boolean> = {};
      for (const f of AI_FILLABLE_FIELDS) {
        if (!editingQuestion[f.key as keyof McqQuestion]) {
          newSettings[f.key] = true;
        } else {
          newSettings[f.key] = false;
        }
      }
      setAiFieldsToFill(newSettings);
    }
    setAiFieldsMenuOpen(!aiFieldsMenuOpen);
  };

  const runAiAssistImprove = async () => {
    if (!editingQuestion) return;
    const fields = Object.keys(aiFieldsToFill).filter(k => aiFieldsToFill[k]);
    if (fields.length === 0) {
      alert("Please select at least one field to fill.");
      return;
    }
    await performAiEdit(fields);
  };

  const triggerAiCategoriesAutoFill = async () => {
    if (!editingQuestion) return;
    await performAiEdit(["subject", "subSubject", "chapter", "topic", "subTopic", "questionType"]);
  };

  const performAiEdit = async (fields: string[]) => {
    if (!editingQuestion) return;
    setIsAiEditing(true);
    try {
      const res = await fetch("/api/ai-edit-mcq", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-api-key": localStorage.getItem("VEDATOOL_API_KEY") || ""
        },
        body: JSON.stringify({ question: editingQuestion, fieldsToFill: fields })
      });
      
      const textResponse = await res.text();
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        throw new Error(textResponse);
      }

      if (data.error) throw new Error(data.error);

      setEditingQuestion(prev => {
        if (!prev) return null;
        
        const newAiVerifiedFields = [...(prev.aiVerifiedFields || [])];
        for (const f of fields) {
          if (!newAiVerifiedFields.includes(f)) {
            newAiVerifiedFields.push(f);
          }
        }
        
        return { 
          ...prev, 
          ...data,
          aiVerifiedFields: newAiVerifiedFields
        };
      });
      setAiFieldsMenuOpen(false);
    } catch (err: any) {
      alert("AI Edit failed: " + err.message);
    } finally {
      setIsAiEditing(false);
    }
  };

  // Robust CSV Parser (RFC 4180 compliant)
  const parseCsvContent = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let currentVal = "";
    let insideQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(currentVal);
        currentVal = "";
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(currentVal);
        result.push(row);
        row = [];
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
    if (currentVal || row.length > 0) {
      row.push(currentVal);
      result.push(row);
    }
    return result;
  };

  // Handle uploaded CSV file parsing
  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCsvFileError("");
    setCsvUploadedQuestions([]);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) {
          setCsvFileError("The uploaded CSV file is empty.");
          return;
        }
        
        const lines = parseCsvContent(text);
        if (lines.length < 2) {
          setCsvFileError("No valid rows discovered in your CSV file. Make sure you have at least 1 Header row + 1 Data row.");
          return;
        }
        
        const headers = lines[0].map(h => h.trim().replace(/^\uFEFF/i, "").toLowerCase());
        const mappedQuestions: McqQuestion[] = [];
        
        // Helper function inside handler to extract details from set_name formats
        const parseSetNameDetails = (setName: string) => {
          let examName = setName;
          let examYear = "";
          let examDate = "";
          let shift = "";

          // Extract shift (e.g., Shift 1, Shift 2, etc.)
          const shiftMatch = setName.match(/Shift\s*[1-4]/i);
          if (shiftMatch) {
            shift = shiftMatch[0];
          }

          // Extract date (e.g., Held On: 12 Sept, 2025)
          const dateMatch = setName.match(/Held\s*On:\s*([^)]*?)(?=\s*Shift|$)/i) || setName.match(/(\d{1,2}\s+[a-zA-Z]{3,9},?\s+\d{4})/i);
          if (dateMatch) {
            examDate = dateMatch[1].trim();
            // Try to parse "12 Sept, 2025" to "2025-09-12" to be standard
            const parts = examDate.match(/(\d{1,2})\s+([a-zA-Z]{3,9}),?\s+(\d{4})/);
            if (parts) {
              const day = parts[1].padStart(2, "0");
              const monthStr = parts[2].toLowerCase().slice(0, 3);
              const year = parts[3];
              const months: Record<string, string> = {
                jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
                jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
              };
              const month = months[monthStr];
              if (month) {
                examDate = `${year}-${month}-${day}`;
              }
            }
          }

          // Extract year (4 digit number, e.g. 2025)
          const yearMatch = setName.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            examYear = yearMatch[0];
          }

          // Extract base exam name before year or parentheses
          const baseMatch = setName.split(/\b(19|20)\d{2}\b|\(/)[0];
          if (baseMatch) {
            examName = baseMatch.trim();
          }

          return { examName, examYear, examDate, shift };
        };

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          if (row.length === 0 || row.every(cell => !cell.trim())) continue;
          
          const rowObj: Record<string, string> = {};
          headers.forEach((header, idx) => {
            if (row[idx] !== undefined) {
              rowObj[header] = row[idx].trim();
            }
          });
          
          // Fallback extraction keys mapping
          const qText = rowObj.questiontext || rowObj.question || rowObj.question_en || rowObj.question_hi || "";
          if (!qText) continue;
          
          const question_en = rowObj.question_en || rowObj.questiontext || rowObj.question || "";
          const question_hi = rowObj.question_hi || "";
          
          const options: McqOption[] = [];
          
          const addOpt = (lbl: string, valEn: string, valHi: string) => {
            const hasVal = (valEn && valEn.trim()) || (valHi && valHi.trim());
            if (hasVal) {
              options.push({
                label: lbl,
                text: valEn || valHi,
                text_eng: valEn,
                text_hin: valHi
              });
            }
          };
          
          const opt1_en = rowObj.option1_en || rowObj.option1 || rowObj.option_a || rowObj.opt_a || rowObj.a || "";
          const opt1_hi = rowObj.option1_hi || "";
          addOpt("A", opt1_en, opt1_hi);
          
          const opt2_en = rowObj.option2_en || rowObj.option2 || rowObj.option_b || rowObj.opt_b || rowObj.b || "";
          const opt2_hi = rowObj.option2_hi || "";
          addOpt("B", opt2_en, opt2_hi);
          
          const opt3_en = rowObj.option3_en || rowObj.option3 || rowObj.option_c || rowObj.opt_c || rowObj.c || "";
          const opt3_hi = rowObj.option3_hi || "";
          addOpt("C", opt3_en, opt3_hi);
          
          const opt4_en = rowObj.option4_en || rowObj.option4 || rowObj.option_d || rowObj.opt_d || rowObj.d || "";
          const opt4_hi = rowObj.option4_hi || "";
          addOpt("D", opt4_en, opt4_hi);
          
          const opt5_en = rowObj.option5_en || rowObj.option5 || rowObj.option_e || rowObj.opt_e || rowObj.e || "";
          const opt5_hi = rowObj.option5_hi || "";
          if (opt5_en || opt5_hi) {
            addOpt("E", opt5_en, opt5_hi);
          }
          
          let rawAns = rowObj.answer || rowObj.correct_answer || "A";
          let parsedAnswer = "A";
          if (rawAns === "1" || rawAns === "A" || rawAns.toUpperCase() === "A") parsedAnswer = "A";
          else if (rawAns === "2" || rawAns === "B" || rawAns.toUpperCase() === "B") parsedAnswer = "B";
          else if (rawAns === "3" || rawAns === "C" || rawAns.toUpperCase() === "C") parsedAnswer = "C";
          else if (rawAns === "4" || rawAns === "D" || rawAns.toUpperCase() === "D") parsedAnswer = "D";
          else if (rawAns === "5" || rawAns === "E" || rawAns.toUpperCase() === "E") parsedAnswer = "E";
          else {
            parsedAnswer = rawAns.trim().toUpperCase();
          }
          
          let rawDiff = rowObj.difficulty_level || rowObj.difficulty || "Medium";
          let parsedDiff: "Easy" | "Medium" | "Hard" = "Medium";
          if (rawDiff === "1" || rawDiff.toLowerCase() === "easy") parsedDiff = "Easy";
          else if (rawDiff === "2" || rawDiff.toLowerCase() === "medium") parsedDiff = "Medium";
          else if (rawDiff === "3" || rawDiff.toLowerCase() === "hard") parsedDiff = "Hard";
          
          // Parse rich info from set_name (e.g. SSC CGL 2025 (Held On: 12 Sept, 2025 Shift 1)) if available
          const rawSetName = rowObj.set_name || rowObj.exam || rowObj.exam_name || "";
          const parsedDetails = rawSetName ? parseSetNameDetails(rawSetName) : { examName: "", examYear: "", examDate: "", shift: "" };

          const finalExamName = rowObj.exam_name || parsedDetails.examName || rowObj.exam || rowObj.set_name || csvPreFillMeta.examName || "";
          const finalExamYear = rowObj.exam_year || parsedDetails.examYear || rowObj.year || csvPreFillMeta.examYear || "";
          const finalExamDate = rowObj.exam_date || parsedDetails.examDate || rowObj.date || csvPreFillMeta.examDate || "";
          const finalShift = rowObj.shift || parsedDetails.shift || csvPreFillMeta.shift || "";

          mappedQuestions.push({
            id: `csv-${Date.now()}-${Math.random()}`,
            questionText: qText,
            question_hin: question_hi,
            question_eng: question_en,
            options,
            answer: parsedAnswer,
            solution: rowObj.solution_en || rowObj.solution || rowObj.solution_hi || "",
            solution_hin: rowObj.solution_hi || "",
            solution_eng: rowObj.solution_eng || "",
            subject: rowObj.subject || rowObj.subject_name || csvPreFillMeta.subject || "",
            subSubject: rowObj.subsubject || csvPreFillMeta.subSubject || "",
            chapter: rowObj.chapter || rowObj.chapter_name || csvPreFillMeta.chapter || "",
            topic: rowObj.topic || csvPreFillMeta.topic || "",
            subTopic: rowObj.subtopic || csvPreFillMeta.subTopic || "",
            set_name: finalExamName,
            examName: finalExamName,
            exam: finalExamName,
            examYear: finalExamYear,
            examDate: finalExamDate,
            shift: finalShift,
            difficultyLevel: parsedDiff,
            questionType: rowObj.question_type || csvPreFillMeta.questionType || "PYQs",
            pyqStatus: (rowObj.question_type || csvPreFillMeta.questionType) === "PYQs" ? "TRUE" : "FALSE",
            org: rowObj.org || rowObj.organization || csvPreFillMeta.org || "",
            status: "Published"
          });
        }
        
        if (mappedQuestions.length === 0) {
          setCsvFileError("No questions could be mapped. Please ensure you have headers like standard 'question_en/question_hi', 'option1_en', 'answer', etc.");
        } else {
          setCsvUploadedQuestions(mappedQuestions);
          setCsvUploadStage(3);
        }
      } catch (err: any) {
        setCsvFileError("Error parsing CSV upload file structure: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Save bulk CSV uploaded rows to Cloud Firestore staging collection
  const saveAllCsvQuestionsToDb = async () => {
    if (csvUploadedQuestions.length === 0) return;
    setIsImportingCsv(true);
    let count = 0;
    try {
      for (const q of csvUploadedQuestions) {
        const payload = {
          ...q,
          userId: currentUid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          status: "Draft"
        };
        // @ts-ignore
        delete payload.id;
        
        await addDoc(collection(db, "staging_questions"), payload);
        count++;
      }
      alert(`Import completed! ${count} draft questions have been save securely to the Import Area. Proceed to edit or finalize them to move them to the permanent Question Bank.`);
      setCsvUploadedQuestions([]);
      setShowImporter(false);
      fetchStagingFromFirestore();
    } catch (err: any) {
      alert(`Import saved ${count} staging questions before encountering an issue: ` + err.message);
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Convert raw paste question text using Gemini's intelligent parser
  const handleParseRawQuestionWithAi = async () => {
    if (!rawPasteText.trim()) {
      alert("Please enter or paste raw questions draft text to parse.");
      return;
    }
    setIsParsingRawText(true);
    try {
      const res = await fetch("/api/parse-raw-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": localStorage.getItem("VEDATOOL_API_KEY") || ""
        },
        body: JSON.stringify({ 
          rawText: rawPasteText,
          metadata: {
            org: batchMeta.org,
            exam: batchMeta.exam,
            questionType: batchMeta.questionType,
            year: batchMeta.year,
            shift: batchMeta.shift,
            date: batchMeta.date,
            subject: batchMeta.subject,
            subSubject: batchMeta.subSubject,
            chapter: batchMeta.chapter,
            topic: batchMeta.topic,
            subTopic: batchMeta.subTopic,
            difficulty: batchMeta.difficulty
          }
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Network status returned ${res.status}`);
      }
      
      const parsedData = await res.json();
      if (parsedData.error) throw new Error(parsedData.error);
      
      setSingleImportForm({
        id: "",
        questionText: parsedData.questionText || "",
        question_hin: parsedData.question_hin || "",
        question_eng: parsedData.question_eng || "",
        options: parsedData.options && parsedData.options.length > 0 ? parsedData.options : [
          { label: "A", text: "" },
          { label: "B", text: "" },
          { label: "C", text: "" },
          { label: "D", text: "" }
        ],
        answer: parsedData.answer || "A",
        solution: parsedData.solution || "",
        solution_hin: parsedData.solution_hin || "",
        solution_eng: parsedData.solution_eng || "",
        subject: parsedData.subject || "",
        chapter: parsedData.chapter || "",
        topic: parsedData.topic || "",
        difficultyLevel: parsedData.difficultyLevel || "Medium",
        questionType: parsedData.questionType || "Multiple Choice",
        status: "Draft"
      });
      alert("Success! AI parsed the messy inputs and filled your form fields with LaTeX equations, option formatting and billingual translations!");
    } catch (err: any) {
      alert("AI interpretation failed: " + err.message);
    } finally {
      setIsParsingRawText(false);
    }
  };

  // Save the single imported question into Firestore staging collection
  const saveSingleImportedQuestion = async () => {
    if (!singleImportForm.questionText.trim()) {
      alert("Please enter the primary Question Text first.");
      return;
    }
    setIsImportingCsv(true);
    try {
      const payload = {
        ...singleImportForm,
        userId: currentUid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: "Draft"
      };
      // @ts-ignore
      delete payload.id;
      
      await addDoc(collection(db, "staging_questions"), payload);
      
      // Reset
      setSingleImportForm({
        id: "",
        questionText: "",
        question_hin: "",
        question_eng: "",
        options: [
          { label: "A", text: "" },
          { label: "B", text: "" },
          { label: "C", text: "" },
          { label: "D", text: "" }
        ],
        answer: "A",
        solution: "",
        solution_hin: "",
        solution_eng: "",
        subject: "",
        chapter: "",
        topic: "",
        difficultyLevel: "Medium",
        questionType: "Multiple Choice",
        status: "Draft"
      });
      setRawPasteText("");
      alert("Successfully parsed and saved draft question into Import Area staging!");
      fetchStagingFromFirestore();
    } catch (err: any) {
      alert("Failed storing staging question: " + err.message);
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Finalize selected staging questions and move them to Question Bank
  const finalizeStagingQuestions = (ids: string[]) => {
    if (ids.length === 0) {
      alert("Please select at least 1 question to finalize.");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "Finalize Questions",
      message: `Are you sure you want to finalize & move ${ids.length} questions to the permanent Question Bank?`,
      confirmText: "Yes, Finalize",
      onConfirm: async () => {
        setIsImportingCsv(true);
        let count = 0;
        try {
          for (const id of ids) {
            const q = stagingQuestions.find(item => item.id === id);
            if (q) {
              const { id: stagingId, ...payload } = q;
              payload.status = "Published"; // finalize status
              (payload as any).updatedAt = Timestamp.now();
              
              // Save to permanent bank
              await addDoc(collection(db, "questions"), payload);
              // Delete from staging
              await deleteDoc(doc(db, "staging_questions", id));
              count++;
            }
          }
          alert(`Success! Successfully finalized & published ${count} questions directly into the live Question Bank!`);
          setSelectedStagingQuestionIds([]);
          fetchStagingFromFirestore();
          fetchBankFromFirestore();
        } catch (err: any) {
          alert(`Successfully finalized ${count} questions, but encountered an error: ` + err.message);
        } finally {
          setIsImportingCsv(false);
        }
      }
    });
  };

  // Delete questions from staging area
  const deleteStagingQuestions = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: "Delete Staging Questions",
      message: `Are you sure you want to delete ${ids.length} questions from the staging area? This action is irreversible.`,
      confirmText: "Yes, Delete",
      onConfirm: async () => {
        try {
          for (const id of ids) {
            await deleteDoc(doc(db, "staging_questions", id));
          }
          alert(`Successfully deleted ${ids.length} staging questions.`);
          setSelectedStagingQuestionIds(prev => prev.filter(id => !ids.includes(id)));
          fetchStagingFromFirestore();
        } catch (err: any) {
          alert("Failed deleting staging elements: " + err.message);
        }
      }
    });
  };

  // Bulk Apply Tags to Staging area questions
  const applyStagingBulkTagging = async () => {
    if (selectedStagingQuestionIds.length === 0) return;
    try {
      for (const qId of selectedStagingQuestionIds) {
        const docRef = doc(db, "staging_questions", qId);
        const updates: any = {};
        if (bulkTagMeta.topic) updates.topic = bulkTagMeta.topic;
        if (bulkTagMeta.subTopic) updates.subTopic = bulkTagMeta.subTopic;
        if (bulkTagMeta.chapter) updates.chapter = bulkTagMeta.chapter;
        if (bulkTagMeta.subSubject) updates.subSubject = bulkTagMeta.subSubject;
        if (bulkTagMeta.subject) updates.subject = bulkTagMeta.subject;
        updates.difficultyLevel = bulkTagMeta.difficulty;
        updates.status = "Draft"; // keeps element in staging

        await updateDoc(docRef, updates);
      }

      alert(`Successfully bulk updated tags for ${selectedStagingQuestionIds.length} staging questions!`);
      setShowStagingBulkTagModal(false);
      fetchStagingFromFirestore();
      setSelectedStagingQuestionIds([]);
    } catch (err: any) {
      alert("Failed staging bulk updates: " + err.message);
    }
  };

  // Global AI Live Work Monitor
  const [aiProgressMonitor, setAiProgressMonitor] = useState<{
    isOpen: boolean;
    title: string;
    current: number;
    total: number;
    currentTextSnippet: string;
    logs: string[];
  }>({ isOpen: false, title: "", current: 0, total: 0, currentTextSnippet: "", logs: [] });

  const [isBulkStagingAiProcessing, setIsBulkStagingAiProcessing] = useState<boolean>(false);
  const [stagingAiProgress, setStagingAiProgress] = useState<{ current: number; total: number } | null>(null);

  // Bulk AI Auto-Fill metadata fields (subject, chapter, topic, subSubject, subTopic) for staging questions
  const bulkAiFillStagingQuestions = async (targetIds: string[]) => {
    if (targetIds.length === 0) return;
    
    setConfirmDialog({
      isOpen: true,
      title: "Confirm AI Auto-Tagging",
      message: `Are you sure you want to run AI Auto-Fill to analyze and tag fields for ${targetIds.length} chosen questions?`,
      confirmText: "Start AI Process",
      onConfirm: async () => {
        setIsBulkStagingAiProcessing(true);
        setStagingAiProgress({ current: 0, total: targetIds.length });
        
        setAiProgressMonitor({
          isOpen: true,
          title: "AI Staging Auto-Fill Metadata",
          current: 0,
          total: targetIds.length,
          currentTextSnippet: "Initializing engine...",
          logs: ["Job initialized for " + targetIds.length + " items"]
        });

        let successCount = 0;
        let currentIndex = 0;
        let completedCount = 0;

        const runNextStagingAutoFill = async (): Promise<void> => {
          if (currentIndex >= targetIds.length) return;

          const taskIdx = currentIndex++;
          const id = targetIds[taskIdx];
          const qOriginal = stagingQuestions.find(q => q.id === id);

          if (!qOriginal) {
            completedCount++;
            setStagingAiProgress({ current: completedCount, total: targetIds.length });
            setAiProgressMonitor(prev => prev ? { ...prev, current: completedCount } : null);
            await runNextStagingAutoFill();
            return;
          }

          // Auto determine which fields are missing/empty
          const fieldsToFill: string[] = [];
          if (!qOriginal.subject || !qOriginal.subject.trim()) fieldsToFill.push("subject");
          if (!qOriginal.subSubject || !qOriginal.subSubject.trim()) fieldsToFill.push("subSubject");
          if (!qOriginal.chapter || !qOriginal.chapter.trim()) fieldsToFill.push("chapter");
          if (!qOriginal.topic || !qOriginal.topic.trim()) fieldsToFill.push("topic");
          if (!qOriginal.subTopic || !qOriginal.subTopic.trim()) fieldsToFill.push("subTopic");

          // If all are already populated, skip
          if (fieldsToFill.length === 0) {
            successCount++;
            completedCount++;
            setStagingAiProgress({ current: completedCount, total: targetIds.length });
            setAiProgressMonitor(prev => prev ? { ...prev, current: completedCount } : null);
            await runNextStagingAutoFill();
            return;
          }

          // Update progress monitor and logs actively
          setAiProgressMonitor(prev => prev ? {
            ...prev,
            currentTextSnippet: `[Parallel] Starting: ${qOriginal.questionText.substring(0, 80)}...`,
            logs: [...prev.logs, `Starting Q${taskIdx + 1}: ${qOriginal.questionText.substring(0, 40)}...`]
          } : null);

          try {
            const res = await fetch("/api/ai-edit-mcq", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-user-api-key": localStorage.getItem("VEDATOOL_API_KEY") || ""
              },
              body: JSON.stringify({ question: qOriginal, fieldsToFill })
            });

            if (res.ok) {
              const data = await res.json();
              const docRef = doc(db, "staging_questions", id);
              
              const newAiVerifiedFields = [...(qOriginal.aiVerifiedFields || [])];
              for (const f of fieldsToFill) {
                if (!newAiVerifiedFields.includes(f)) {
                  newAiVerifiedFields.push(f);
                }
              }

              await updateDoc(docRef, {
                ...qOriginal,
                ...data,
                aiVerifiedFields: newAiVerifiedFields,
                updatedAt: Timestamp.now()
              });
              successCount++;
              setAiProgressMonitor(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `✅ Success Q${taskIdx + 1}`]
              } : null);
            } else {
              setAiProgressMonitor(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `❌ Failed Q${taskIdx + 1}: Server Error`]
              } : null);
            }
          } catch (err: any) {
            setAiProgressMonitor(prev => prev ? {
              ...prev,
              logs: [...prev.logs, `❌ Error Q${taskIdx + 1}: ${err.message}`]
            } : null);
          } finally {
            completedCount++;
            setStagingAiProgress({ current: completedCount, total: targetIds.length });
            setAiProgressMonitor(prev => prev ? { ...prev, current: completedCount } : null);
            await runNextStagingAutoFill();
          }
        };

        try {
          const workerPool: Promise<void>[] = [];
          const numWorkers = Math.min(20, targetIds.length);
          for (let w = 0; w < numWorkers; w++) {
            workerPool.push(runNextStagingAutoFill());
          }
          await Promise.all(workerPool);

          alert(`AI Parallel Auto-Fill Completed! Successfully updated and tagged ${successCount} staging questions with taxonomy fields.`);
          setSelectedStagingQuestionIds([]);
          fetchStagingFromFirestore();
        } catch (err: any) {
          alert("AI Auto-Fill encountered an error: " + err.message);
        } finally {
          setIsBulkStagingAiProcessing(false);
          setStagingAiProgress(null);
          setAiProgressMonitor(prev => prev ? { ...prev, isOpen: false } : null);
        }
      }
    });
  };

  const [isBulkAiProcessing, setIsBulkAiProcessing] = useState<boolean>(false);
  
  // Bulkt AI Auto-Fill / Repair operation for multiple selected Bank questions
  const handleBulkAiFill = async () => {
    if (selectedBankQuestionIds.length === 0) return;
    
    setConfirmDialog({
      isOpen: true,
      title: "Confirm Bulk AI Rebuild",
      message: `Are you sure you want to AI-rebuild & enrich the taxonomy/translations of ${selectedBankQuestionIds.length} selected questions in bulk?`,
      confirmText: "Start AI Process",
      onConfirm: async () => {
        setIsBulkAiProcessing(true);
        setAiProgressMonitor({
          isOpen: true,
          title: "AI Bank Taxonomy Rebuilder",
          current: 0,
          total: selectedBankQuestionIds.length,
          currentTextSnippet: "Initializing engine...",
          logs: ["Bank Job initialized for " + selectedBankQuestionIds.length + " items"]
        });
        
        let count = 0;
        let currentIndex = 0;
        let completedCount = 0;

        const runNextBankAutoFill = async (): Promise<void> => {
          if (currentIndex >= selectedBankQuestionIds.length) return;

          const taskIdx = currentIndex++;
          const id = selectedBankQuestionIds[taskIdx];
          const qOriginal = bankQuestions.find(q => q.id === id);

          if (!qOriginal) {
            completedCount++;
            setAiProgressMonitor(prev => prev ? { ...prev, current: completedCount } : null);
            await runNextBankAutoFill();
            return;
          }

          // Update progress monitor details
          setAiProgressMonitor(prev => prev ? {
            ...prev,
            currentTextSnippet: `[Parallel] Starting: ${qOriginal.questionText.substring(0, 80)}...`,
            logs: [...prev.logs, `Starting Q${taskIdx + 1}: ${qOriginal.questionText.substring(0, 40)}...`]
          } : null);

          try {
            const fields = ["question_hin", "question_eng", "solution", "subject", "subSubject", "chapter", "topic", "subTopic", "difficultyLevel", "questionType"];
            const res = await fetch("/api/ai-edit-mcq", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "x-user-api-key": localStorage.getItem("VEDATOOL_API_KEY") || ""
              },
              body: JSON.stringify({ question: qOriginal, fieldsToFill: fields })
            });
            
            if (res.ok) {
              const data = await res.json();
              const docRef = doc(db, "questions", id);

              const newAiVerifiedFields = [...(qOriginal.aiVerifiedFields || [])];
              for (const f of fields) {
                if (!newAiVerifiedFields.includes(f)) {
                  newAiVerifiedFields.push(f);
                }
              }

              await updateDoc(docRef, {
                ...qOriginal,
                ...data,
                aiVerifiedFields: newAiVerifiedFields,
                updatedAt: Timestamp.now()
              });
              count++;
              setAiProgressMonitor(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `✅ Success Q${taskIdx + 1}`]
              } : null);
            } else {
              setAiProgressMonitor(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `❌ Failed Q${taskIdx + 1}: Server Error`]
              } : null);
            }
          } catch (err: any) {
            setAiProgressMonitor(prev => prev ? {
              ...prev,
              logs: [...prev.logs, `❌ Error Q${taskIdx + 1}: ${err.message}`]
            } : null);
          } finally {
            completedCount++;
            setAiProgressMonitor(prev => prev ? { ...prev, current: completedCount } : null);
            await runNextBankAutoFill();
          }
        };

        try {
          const workerPool: Promise<void>[] = [];
          const numWorkers = Math.min(20, selectedBankQuestionIds.length);
          for (let w = 0; w < numWorkers; w++) {
            workerPool.push(runNextBankAutoFill());
          }
          await Promise.all(workerPool);

          alert(`Successfully AI-rebuilt & published ${count} questions in bulk parallelly!`);
          setSelectedBankQuestionIds([]);
          fetchBankFromFirestore();
        } catch (err: any) {
          alert("Bulk AI Process encountered an error: " + err.message);
        } finally {
          setIsBulkAiProcessing(false);
          setAiProgressMonitor(prev => prev ? { ...prev, isOpen: false } : null);
        }
      }
    });
  };

  // Question Delete in Firestore bank
  const handleBankDelete = (id: string, qIdx: number) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Question",
      message: "Are you sure you want to delete this question? This action cannot be undone.",
      confirmText: "Yes, Delete",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "questions", id));
          setBankQuestions(prev => prev.filter(q => q.id !== id));
          alert("Question purged.");
        } catch (err: any) {
          alert("Failed deletes: " + err.message);
        }
      }
    });
  };

  // Bank checkboxes selection handler
  const toggleBankSelection = (id: string) => {
    setSelectedBankQuestionIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllFilteredBankQuestions = (filteredList: McqQuestion[]) => {
    if (selectedBankQuestionIds.length === filteredList.length) {
      setSelectedBankQuestionIds([]);
    } else {
      setSelectedBankQuestionIds(filteredList.map(q => q.id));
    }
  };

  // Bulk Apply Tags
  const applyBulkTagging = async () => {
    if (selectedBankQuestionIds.length === 0) return;
    try {
      for (const qId of selectedBankQuestionIds) {
        const docRef = doc(db, "questions", qId);
        const updates: any = {};
        if (bulkTagMeta.topic) updates.topic = bulkTagMeta.topic;
        if (bulkTagMeta.subTopic) updates.subTopic = bulkTagMeta.subTopic;
        if (bulkTagMeta.chapter) updates.chapter = bulkTagMeta.chapter;
        if (bulkTagMeta.subSubject) updates.subSubject = bulkTagMeta.subSubject;
        if (bulkTagMeta.subject) updates.subject = bulkTagMeta.subject;
        updates.difficulty = bulkTagMeta.difficulty;
        updates.status = bulkTagMeta.status;

        await updateDoc(docRef, updates);
      }

      alert(`Successfully bulk updated tags for ${selectedBankQuestionIds.length} questions!`);
      setShowBulkTagModal(false);
      fetchBankFromFirestore();
      setSelectedBankQuestionIds([]);
    } catch (err: any) {
      alert("Failed bulk updates: " + err.message);
    }
  };

  // Create Test assessment
  const handleCreateTest = async () => {
    if (selectedBankQuestionIds.length === 0) {
      alert("Please select at least 1 or more questions from the Question Bank first!");
      return;
    }

    setIsCreatingTest(true);
    const setId = generateSetId();
    const password = generatePassword();

    try {
      const testPayload = {
        name: testForm.name,
        examPattern: testForm.examPattern,
        questionsCount: selectedBankQuestionIds.length,
        questionIds: selectedBankQuestionIds,
        setId,
        password,
        userId: currentUid,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, "tests"), testPayload);
      setNewlyCreatedTestCredentials({ setId, password });
      fetchTestsFromFirestore();
      setSelectedBankQuestionIds([]);
    } catch (err: any) {
      alert("Failed creating test: " + err.message);
    } finally {
      setIsCreatingTest(false);
    }
  };

  // Save whiteboard canvas draw changes back
  const handleCanvasSaved = (editedUrl: string) => {
    if (!paintTargetIndex) return;

    if (paintTargetIndex.source === "extract") {
      setExtractedQuestions(prev => {
        const copy = { ...prev };
        const list = [...(copy[activePageIdx] || [])];
        if (list[paintTargetIndex.qIdx]) {
          list[paintTargetIndex.qIdx].imageUrl = editedUrl;
        }
        copy[activePageIdx] = list;
        return copy;
      });
    } else {
      const q = bankQuestions[paintTargetIndex.qIdx];
      if (q) {
        setBankQuestions(prev => {
          const list = [...prev];
          list[paintTargetIndex.qIdx].imageUrl = editedUrl;
          return list;
        });

        // Trigger firestore save
        const qRef = doc(db, "questions", q.id);
        updateDoc(qRef, { imageUrl: editedUrl }).catch(err => console.error("Saving url error", err));
      }
    }

    setPaintTargetIndex(null);
  };

  // Filtering Bank Logic
  const filteredBank = bankQuestions.filter(q => {
    const queryLower = filterSearch.toLowerCase();
    const matchesSearch = 
      !filterSearch || 
      q.questionText.toLowerCase().includes(queryLower) ||
      (q.subject && q.subject.toLowerCase().includes(queryLower)) ||
      (q.chapter && q.chapter.toLowerCase().includes(queryLower)) ||
      (q.topic && q.topic.toLowerCase().includes(queryLower)) ||
      (q.examName && q.examName.toLowerCase().includes(queryLower)) ||
      (q.exam && q.exam.toLowerCase().includes(queryLower)) ||
      (q.sourceBook && q.sourceBook.toLowerCase().includes(queryLower)) ||
      (q.pdfName && q.pdfName.toLowerCase().includes(queryLower)) ||
      (q.stage && q.stage.toLowerCase().includes(queryLower)) ||
      (q.shift && q.shift.toLowerCase().includes(queryLower));

    const matchesSubject = filterSubject === "All Subjects" || q.subject === filterSubject;
    const matchesChapter = filterChapter === "All Chapters" || q.chapter === filterChapter;
    const matchesTopic = filterTopic === "All Topics" || q.topic === filterTopic;
    const matchesExam = filterExam === "All" || q.exam === filterExam || q.examName === filterExam;
    const matchesDiff = filterDifficulty === "All" || (q.difficultyLevel || q.difficulty) === filterDifficulty;
    const matchesStatus = filterStatus === "All" || q.status === filterStatus;

    // Advanced metadata match filters
    const matchesPyq = filterPyqStatus === "All" || (
      filterPyqStatus === "PYQ Only" 
        ? (q.pyqStatus === "TRUE" || q.pyqStatus === true)
        : (q.pyqStatus !== "TRUE" && q.pyqStatus !== true)
    );
    const matchesLanguage = filterLanguage === "All" || q.language === filterLanguage;
    const matchesQType = filterQuestionType === "All" || q.questionType === filterQuestionType;
    const matchesPdf = filterPdfName === "All" || q.pdfName === filterPdfName;
    const matchesYear = filterYear === "All" || String(q.examYear) === filterYear || String(q.year) === filterYear;

    return matchesSearch && 
           matchesSubject && 
           matchesChapter && 
           matchesTopic && 
           matchesExam && 
           matchesDiff && 
           matchesStatus &&
           matchesPyq &&
           matchesLanguage &&
           matchesQType &&
           matchesPdf &&
           matchesYear;
  });

  const [isExportingWord, setIsExportingWord] = useState(false);

  const handleDownloadWord = async () => {
    const targets = selectedBankQuestionIds.length > 0
      ? filteredBank.filter(q => selectedBankQuestionIds.includes(q.id))
      : filteredBank;
      
    if (targets.length === 0) {
      alert("No questions to export.");
      return;
    }

    setIsExportingWord(true);
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: "Question Bank Export",
              heading: HeadingLevel.HEADING_1,
            }),
            ...targets.flatMap((q, index) => {
              const children = [];
              
              children.push(new Paragraph({
                children: [
                  new TextRun({ text: `Q${index + 1}. `, bold: true }),
                  new TextRun({ text: q.questionText || "" }),
                ],
              }));
              
              if (q.question_hin) {
                 children.push(new Paragraph({
                   children: [
                     new TextRun({ text: q.question_hin, italics: true }),
                   ]
                 }));
              }

              if (q.options && Array.isArray(q.options)) {
                q.options.forEach((opt) => {
                  children.push(new Paragraph({
                     text: `${opt.label}) ${opt.text || ""}`,
                     indent: { left: 720 },
                  }));
                });
              }

              children.push(new Paragraph({
                children: [
                  new TextRun({ text: "Answer: ", bold: true }),
                  new TextRun({ text: q.answer || "N/A" }),
                ]
              }));

              if (q.solution) {
                children.push(new Paragraph({
                  children: [
                    new TextRun({ text: "Solution: ", bold: true }),
                    new TextRun({ text: q.solution }),
                  ]
                }));
              }

              const metadata = [];
              if (q.subject) metadata.push(`Subject: ${q.subject}`);
              if (q.chapter) metadata.push(`Chapter: ${q.chapter}`);
              if (q.examName) metadata.push(`Exam: ${q.examName}`);
              if (q.examYear) metadata.push(`Year: ${q.examYear}`);
              
              if (metadata.length > 0) {
                 children.push(new Paragraph({
                   children: [
                     new TextRun({ text: metadata.join(" | "), size: 16, color: "666666" })
                   ]
                 }));
              }

              children.push(new Paragraph({ text: "" }));
              return children;
            })
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, "Questions_Export.docx");
    } catch (e) {
      console.error(e);
      alert("Failed to export Word document.");
    } finally {
      setIsExportingWord(false);
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col h-full bg-[#FAFAFC] dark:bg-[var(--bg-body)] text-zinc-800 dark:text-[var(--text-primary)] font-sans">
      
      {/* GLOBAL WORKSPACE HEADER */}
      <div className="border-b border-zinc-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-sidebar)] px-3 py-2 sm:px-5 sm:py-2.5 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 sm:gap-3.5 shadow-xs shrink-0 select-none">
        <div>
          <h1 className="text-[15px] sm:text-[17px] font-black text-zinc-900 dark:text-[var(--text-primary)] tracking-tight flex items-center gap-1.5 mt-0.5 font-display">
            Veda Question Bank Creator
          </h1>
          <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-[var(--text-muted)] font-semibold tracking-wide mt-0.5 hidden md:block">
            Digitize exams, tag elements sequentially, paint/crop canvas snips, and secure test presets.
          </p>
        </div>

        {/* REVOLVING TABS NAVIGATION */}
        <div className="flex border border-zinc-200 dark:border-[var(--border-subtle)] rounded-xl p-0.5 bg-zinc-50 dark:bg-[#080C16] font-medium overflow-x-auto max-w-full scrollbar-none shrink-0 snap-x">
          <button
            type="button"
            onClick={() => setActiveTab("extract")}
            className={`py-1 px-2.5 sm:py-1.5 sm:px-3.5 rounded-lg text-[10.5px] sm:text-xs flex items-center gap-1.5 transition shrink-0 snap-center font-bold cursor-pointer ${
              activeTab === "extract"
                ? "bg-amber-500 text-zinc-950 font-black shadow-xs"
                : "text-zinc-600 dark:text-[var(--text-secondary)] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#121A2B]"
            }`}
          >
            <FileUp size={12} />
            PDF Extractor
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`py-1 px-2.5 sm:py-1.5 sm:px-3.5 rounded-lg text-[10.5px] sm:text-xs flex items-center gap-1.5 transition shrink-0 snap-center font-bold cursor-pointer ${
              activeTab === "import"
                ? "bg-amber-500 text-zinc-950 font-black shadow-xs"
                : "text-zinc-650 dark:text-[var(--text-secondary)] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#121A2B]"
            }`}
          >
            <FileSpreadsheet size={12} />
            Question Importer
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab("bank")}
            className={`py-1 px-2.5 sm:py-1.5 sm:px-3.5 rounded-lg text-[10.5px] sm:text-xs flex items-center gap-1.5 transition shrink-0 snap-center font-bold cursor-pointer ${
              activeTab === "bank"
                ? "bg-amber-500 text-zinc-950 font-black shadow-xs"
                : "text-zinc-650 dark:text-[var(--text-secondary)] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#121A2B]"
            }`}
          >
            <Database size={12} />
            Question Bank
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tests")}
            className={`py-1 px-2.5 sm:py-1.5 sm:px-3.5 rounded-lg text-[10.5px] sm:text-xs flex items-center gap-1.5 transition shrink-0 snap-center font-bold cursor-pointer ${
              activeTab === "tests"
                ? "bg-amber-500 text-zinc-950 font-black shadow-xs"
                : "text-zinc-650 dark:text-[var(--text-secondary)] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#121A2B]"
            }`}
          >
            <Key size={12} />
            Assessments
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB BODY */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: EXTRACT VIEW (Side-by-Side Widescreen) */}
          {activeTab === "extract" && (
            <motion.div 
              key="extract-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col overflow-hidden"
            >
              
              {/* DUAL WORKSPACE COLUMNS CONTAINER */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

                {/* LEFT COLUMN: MAIN WORKSPACE */}
                <div className="flex-1 border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col overflow-hidden bg-zinc-50 flex">
                <div className="px-5 py-3 border-b border-zinc-200 bg-white flex justify-between items-center z-10">
                  <div className="flex items-center gap-2">
                    <FileText className="text-zinc-500" size={18} />
                    <span className="text-xs font-bold text-zinc-700 uppercase font-sans">
                      Source PDF Document
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pdfFile && (
                      <span className="text-xs text-zinc-500 font-mono">
                        {pdfFile.name} ({pdfPages.length} Pages)
                      </span>
                    )}
                    <label className="bg-zinc-900 hover:bg-zinc-800 text-white py-1.5 px-4 rounded-xl text-xs font-black cursor-pointer shadow-xs transition hover:shadow-md">
                      Change File
                      <input 
                        type="file" 
                        accept="application/pdf" 
                        onChange={handlePdfUpload} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto w-full p-4 lg:p-6 bg-[#FAFAFC] space-y-6">
                  {isRenderingPdf && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center p-6">
                      <RefreshCw className="animate-spin text-amber-500 w-8 h-8 mb-3" />
                      <p className="text-xs font-mono text-zinc-600 mb-2">{pdfProgress}</p>
                      <div className="w-48 bg-zinc-200 rounded-full h-1.5">
                        <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${pdfProgressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  {pdfPages.length > 0 ? (
                    <>
                      {/* GLOBAL BATCH METADATA & ACTIONS PANEL */}
                      <div className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
                        <div className="px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row gap-3 justify-between items-center">
                          <div className="flex items-center gap-2 text-zinc-800">
                            <Tag className="text-amber-500" size={16} />
                            <span className="text-[11px] font-black uppercase tracking-wider font-sans">
                              Global Batch Parameters
                            </span>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={handleAllPagesParallelExtract}
                              disabled={isExtractingPage || parallelExtractionActive}
                              className="flex-1 sm:flex-none justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-1.5 px-3 rounded-lg text-xs font-sans transition flex items-center gap-1"
                            >
                              {parallelExtractionActive ? (
                                <>
                                  <RefreshCw className="animate-spin" size={12} />
                                  {extractedPagesCount}/{pdfPages.length} Done
                                </>
                              ) : (
                                <>
                                  <ListOrdered size={12} />
                                  Extract All Pages
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveAllToBank}
                              className="flex-1 sm:flex-none justify-center bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold py-1.5 px-3 rounded-lg text-xs font-sans transition flex items-center gap-1"
                            >
                              <Database size={12} />
                              Save All to Bank
                            </button>
                          </div>
                        </div>
                        
                        <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 content-start">
                          <div className="col-span-full mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase text-zinc-600 tracking-wider">Bulk Meta Configuration (Applies to all new AI extracted sets)</span>
                            <button
                              type="button"
                              onClick={handleAutoDetectBatchMeta}
                              disabled={isAutoDetectingMeta || stagingQuestions.length === 0}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 text-[10px] font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isAutoDetectingMeta ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              Auto-Fill Meta
                            </button>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Org</label>
                            <input
                              type="text"
                              value={batchMeta.org || ""}
                              onChange={(e) => setBatchMeta({ ...batchMeta, org: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. SSC"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Exam Name</label>
                            <input
                              type="text"
                              value={batchMeta.exam}
                              onChange={(e) => setBatchMeta({ ...batchMeta, exam: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. CGL"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Type</label>
                            <input
                              type="text"
                              value={batchMeta.questionType || ""}
                              onChange={(e) => setBatchMeta({ ...batchMeta, questionType: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. PYQs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Shift/Year</label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={batchMeta.shift}
                                onChange={(e) => setBatchMeta({ ...batchMeta, shift: e.target.value })}
                                className="w-[55%] text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                                placeholder="Shift"
                              />
                              <input
                                type="text"
                                value={batchMeta.year}
                                onChange={(e) => setBatchMeta({ ...batchMeta, year: e.target.value })}
                                className="w-[45%] text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                                placeholder="Year"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Date</label>
                            <input
                              type="date"
                              value={batchMeta.date || ""}
                              onChange={(e) => setBatchMeta({ ...batchMeta, date: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Subject</label>
                            <input
                              type="text"
                              value={batchMeta.subject}
                              onChange={(e) => setBatchMeta({ ...batchMeta, subject: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. Maths"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Sub Subject</label>
                            <input
                              type="text"
                              value={batchMeta.subSubject || ""}
                              onChange={(e) => setBatchMeta({ ...batchMeta, subSubject: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. Arithmetic"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Chapter</label>
                            <input
                              type="text"
                              value={batchMeta.chapter}
                              onChange={(e) => setBatchMeta({ ...batchMeta, chapter: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. Percentage"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Topic</label>
                            <input
                              type="text"
                              value={batchMeta.topic}
                              onChange={(e) => setBatchMeta({ ...batchMeta, topic: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="e.g. Basic"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Sub Topic</label>
                            <input
                              type="text"
                              value={batchMeta.subTopic || ""}
                              onChange={(e) => setBatchMeta({ ...batchMeta, subTopic: e.target.value })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                              placeholder="Sub Topic"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 block mb-0.5">Difficulty</label>
                            <select
                              value={batchMeta.difficulty}
                              onChange={(e) => setBatchMeta({ ...batchMeta, difficulty: e.target.value as any })}
                              className="w-full text-[11px] font-semibold border border-zinc-200 focus:border-amber-500 bg-zinc-50 py-1.5 px-2 rounded-lg transition"
                            >
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* PAGES LIST - PARALLEL ROW LAYOUT */}
                      <div className="space-y-4 md:space-y-6">
                        {pdfPages.map((pageDataUrl, pIdx) => {
                          const pgQs = extractedQuestions[pIdx] || [];
                          return (
                            <div key={pIdx} className="w-full flex flex-col xl:flex-row bg-white border border-zinc-200 rounded-xl sm:rounded-2xl shadow-xs overflow-hidden min-h-0 sm:min-h-[400px]">
                              
                              {/* LEFT SIDE: PDF PAGE PREVIEW */}
                              <div className="w-full xl:w-2/5 border-b xl:border-b-0 xl:border-r border-zinc-200 bg-zinc-50/50 p-3 sm:p-4 flex flex-col">
                                <div className="flex justify-between items-center mb-3 sm:mb-4">
                                  <span className="font-mono text-[10px] bg-zinc-200 text-zinc-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                    Page {pIdx + 1}
                                  </span>
                                  <button
                                    onClick={() => handleSinglePageExtract(pIdx)}
                                    disabled={isExtractingPage || parallelExtractionActive}
                                    className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold py-1.5 px-3 rounded-lg text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                                  >
                                    {isExtractingPage && activePageIdx === pIdx ? (
                                      <RefreshCw className="animate-spin" size={12} />
                                    ) : pgQs.length > 0 ? (
                                      <RefreshCw size={12} />
                                    ) : (
                                      <Wand2 size={12} />
                                    )}
                                    {isExtractingPage && activePageIdx === pIdx ? "Typing..." : pgQs.length > 0 ? "Retry AI" : "Extract Process"}
                                  </button>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center bg-white border border-zinc-200 rounded-xl overflow-hidden p-2 min-h-0 sm:min-h-[300px]">
                                  <img referrerPolicy="no-referrer" src={pageDataUrl} className="max-h-[220px] sm:max-h-[350px] xl:max-h-[500px] hover:max-h-full transition-all duration-350 object-contain w-full rounded-lg" alt={`Page ${pIdx + 1}`} />
                                </div>
                                <div className="mt-2.5 sm:mt-4 flex w-full">
                                  <button
                                    onClick={() => handleSavePageToBank(pIdx)}
                                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                                  >
                                    <Database size={14} />
                                    Save Page {pIdx + 1} to Bank
                                  </button>
                                </div>
                              </div>

                              {/* RIGHT SIDE: EXTRACTED QUESTIONS */}
                              <div className="w-full xl:w-3/5 flex flex-col">
                                <div className="px-4 py-2 sm:px-5 sm:py-3 border-b border-zinc-100 bg-white flex justify-between items-center shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <Sparkles className="text-amber-500" size={16} />
                                    <span className="text-xs font-extrabold text-zinc-850 uppercase tracking-wider font-sans flex items-center gap-2">
                                      Extracted Questions
                                    </span>
                                  </div>
                                  <span className="bg-amber-100 text-amber-800 py-0.5 px-2.5 rounded-full text-[10px] font-black font-mono">
                                    {pgQs.length} items
                                  </span>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#FAFAFC] max-h-[320px] sm:max-h-[500px] xl:max-h-[650px]">
                                  {pgQs.length > 0 ? (
                                    <div className="space-y-4">
                                      {pgQs.map((q, idx) => {
                                        const requiredFields = [
                                          'subject', 'subSubject', 'chapter', 'topic', 'subTopic', 
                                          'examName', 'examYear', 'examDate', 'shift', 
                                          'difficultyLevel', 'questionType', 'language', 'pyqStatus'
                                        ];
                                        const emptyFieldsCount = requiredFields.filter(f => !q[f as keyof typeof q]).length;

                                        return (
                                        <div key={q.id || idx} className={`border ${emptyFieldsCount > 0 ? "border-amber-300" : "border-zinc-200"} rounded-2xl bg-white p-4 shadow-sm space-y-3 relative group`}>
                                          <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                                            <span className="font-mono text-[9px] bg-zinc-100 text-zinc-500 font-bold px-2 py-0.5 rounded uppercase">
                                              Snip #{idx + 1}
                                            </span>
                                            <div className="flex gap-1.5 flex-wrap justify-end">
                                              {emptyFieldsCount > 0 && (
                                                <span className="flex items-center gap-1 text-[9px] bg-amber-50 border border-amber-500/20 text-amber-600 font-extrabold p-0.5 px-2 rounded" title="Missing metadata fields that can be AI-filled">
                                                  <AlertCircle size={10} />
                                                  {emptyFieldsCount} Empty Field{emptyFieldsCount !== 1 ? 's' : ''}
                                                </span>
                                              )}
                                              {q.subject && (
                                                <span className="text-[9px] bg-amber-50 border border-amber-500/10 text-amber-600 font-extrabold p-0.5 px-2 rounded">
                                                  {q.subject}
                                                </span>
                                              )}
                                              <span className="text-[9px] bg-red-50 text-red-600 font-extrabold p-0.5 px-2 rounded">
                                                {q.difficultyLevel || q.difficulty || "Medium"}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="text-xs text-zinc-900 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                                            {renderQuestionText(q)}
                                          </div>

                                          {q.imageUrl && (
                                            <div className="relative border border-zinc-200 rounded-lg overflow-hidden group/image max-w-xs bg-zinc-100">
                                              <img referrerPolicy="no-referrer" src={q.imageUrl} alt="Question Graphic" className="max-h-28 object-contain" />
                                              <button
                                                type="button"
                                                onClick={() => { setActivePageIdx(pIdx); setPaintTargetIndex({ qIdx: idx, source: "extract" }); }}
                                                className="absolute inset-0 bg-black/40 text-white text-[10px] font-bold uppercase opacity-0 group-hover/image:opacity-100 transition flex items-center justify-center gap-1"
                                              >
                                                <Edit2 size={12} />
                                                Edit Canvas
                                              </button>
                                            </div>
                                          )}

                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded-xl">
                                            {q.options.map((opt, oK) => (
                                              <div key={oK} className={`text-[11px] p-1.5 px-2.5 rounded-lg border font-medium flex items-center justify-between ${
                                                q.answer === opt.label 
                                                  ? "bg-emerald-50 border-emerald-500/30 text-emerald-800 font-bold" 
                                                  : "bg-white border-zinc-200 text-zinc-600"
                                              }`}>
                                                <span>{renderOptionText(opt)}</span>
                                                {q.answer === opt.label && <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />}
                                              </div>
                                            ))}
                                          </div>

                                          {renderExplanationText(q)}

                                          <div className="flex gap-2 justify-end border-t border-zinc-100 pt-3">
                                            <button
                                              type="button"
                                              onClick={() => { setActivePageIdx(pIdx); setPaintTargetIndex({ qIdx: idx, source: "extract" }); }}
                                              className="text-[10px] font-semibold text-zinc-600 hover:text-zinc-950 p-1.5 px-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 transition flex items-center gap-1"
                                            >
                                              <ImageIcon size={10} />
                                              Markup
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => { setActivePageIdx(pIdx); openEditDrawer(idx, "extract"); }}
                                              className="text-[10px] font-semibold text-zinc-800 hover:text-zinc-950 p-1.5 px-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 transition flex items-center gap-1"
                                            >
                                              <Edit2 size={10} />
                                              Edit Details
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteLocalQuestion(pIdx, idx)}
                                              className="text-[10px] font-semibold text-red-500 hover:text-red-700 p-1.5 px-2 rounded-lg hover:bg-red-50 transition border border-transparent hover:border-red-100"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center text-zinc-500">
                                      <FileText className="mx-auto text-zinc-300 mb-3" size={32} />
                                      <h4 className="text-sm font-bold text-zinc-700">No questions mapped yet</h4>
                                      <p className="text-[11px] text-zinc-400 mt-2 max-w-[250px] leading-relaxed">
                                        Click "Extract Process" on the left to structure multiple-choice questions from this page.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <label className="flex flex-col items-center justify-center p-8 w-full max-w-md text-center cursor-pointer hover:bg-amber-50/40 rounded-3xl border-2 border-dashed border-zinc-200 hover:border-amber-500/40 transition-all group bg-white shadow-xs">
                        <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/15 text-amber-500 mb-4 animate-bounce group-hover:scale-110 transition-transform">
                          <FileUp size={36} />
                        </div>
                        <h3 className="font-bold text-zinc-800 text-sm">Upload Academic PDF</h3>
                        <p className="text-zinc-500 text-xs mt-1 mb-6 leading-relaxed px-4">
                          Upload an exam paper or booklet. Mapped parallel rows will be generated to preview pages individually and extract structured MCQs alongside.
                        </p>
                        <span className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-extrabold py-2.5 px-6 rounded-xl text-xs font-sans transition-all shadow-sm">
                          Select Document
                        </span>
                        <input 
                          type="file" 
                          accept="application/pdf" 
                          onChange={handlePdfUpload} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          )}

          {/* TAB: QUESTION IMPORTER & STAGING AREA */}
          {activeTab === "import" && (
            <motion.div 
              key="import-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col overflow-hidden bg-zinc-50 font-sans"
            >
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 md:space-y-6">
                
                {/* Upper Section: Core Importer Toolkits */}
                <button 
                  onClick={() => {
                    if (csvUploadedQuestions.length > 0) {
                      setCsvUploadStage(3);
                    } else {
                      setCsvUploadStage(1);
                    }
                    setShowCsvModal(true);
                  }}
                  className="w-full bg-white border border-dashed border-amber-500/50 hover:border-amber-500 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between transition cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="p-2 sm:p-2.5 bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors rounded-lg">
                      <FileSpreadsheet size={16} />
                    </div>
                    <div>
                      <h2 className="text-[13px] font-black text-zinc-900 tracking-tight">Question Importer Space</h2>
                      <p className="text-[10px] text-zinc-500 font-medium">Click to open the importer workspace (Bulk CSV or AI Parser)</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-xs font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg group-hover:bg-amber-100 transition-colors">
                    Open Importer
                  </div>
                </button>
                
                {/* Ready CSV Preview Table */}
                {csvUploadedQuestions.length > 0 && importerMode === "csv" && (
                  <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="bg-zinc-50 p-4 border-b border-zinc-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none">
                      <div>
                        <h5 className="text-xs font-black text-zinc-900">Mapped CSV Rows Preview ({csvUploadedQuestions.length})</h5>
                        <p className="text-[10px] text-zinc-505 font-semibold">Verify option mappings and translations before finalizing publishing logs.</p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => { setCsvUploadedQuestions([]); setCsvUploadStage(1); setCsvFileError(""); setShowCsvModal(true); }}
                          className="bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-xs py-2 px-4 rounded-xl transition flex-1 sm:flex-auto cursor-pointer"
                        >
                          Upload Diff CSV
                        </button>
                        <button
                          type="button"
                          onClick={saveAllCsvQuestionsToDb}
                          disabled={isImportingCsv}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-2 px-6 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm flex-1 sm:flex-auto justify-center"
                        >
                          {isImportingCsv ? <RefreshCw className="animate-spin" size={13} /> : <Check size={13} />}
                          Store to Staging Area ({csvUploadedQuestions.length} Questions)
                        </button>
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto overflow-x-auto text-[11px]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-zinc-50/70 border-b border-zinc-200 font-extrabold text-zinc-500 uppercase tracking-wider text-[9px] select-none">
                            <th className="p-3 pl-4">Q. Text Preview</th>
                            <th className="p-3">Options</th>
                            <th className="p-3">Ans</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Exam Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {csvUploadedQuestions.map((q, idx) => (
                            <tr key={idx} className="hover:bg-zinc-50/50 font-medium text-zinc-700">
                              <td className="p-3 pl-4 max-w-sm">
                                <span className="font-extrabold text-zinc-950 block truncate">{q.questionText}</span>
                                {q.question_hin && <span className="text-[10px] text-zinc-500 block truncate">{q.question_hin}</span>}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {q.options.map((opt, oIdx) => (
                                    <span key={oIdx} className="bg-zinc-100 border border-zinc-200/80 rounded px-1.5 py-0.5 text-[9px] font-black">
                                      {opt.label}: {opt.text || <span className="text-[8px] text-zinc-400">Empty</span>}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-3">
                                <span className="bg-emerald-100 text-emerald-800 rounded-md font-black px-1.5 py-0.5">{q.answer}</span>
                              </td>
                              <td className="p-3">
                                <div className="space-y-0.5 text-[10px]">
                                  {q.subject && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold block w-fit truncate max-w-28">{q.subject}</span>}
                                  {q.chapter && <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold block w-fit truncate max-w-28">{q.chapter}</span>}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="space-y-0.5 text-[10px]">
                                  {q.examName && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black block w-fit truncate max-w-28">{q.examName}</span>}
                                  {q.examYear && <span className="text-zinc-500 block font-bold">{q.examYear}</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Staging Area list view container */}
                <div className="bg-white border border-zinc-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs space-y-3 sm:space-y-4 font-sans">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <h3 className="text-sm font-black text-zinc-950 flex items-center gap-2">
                        <Database size={16} className="text-amber-500" />
                        Staging Area: Imported Mock Drafts Container ({filteredStaging.length})
                      </h3>
                      <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        These questions are stored separately in the Staging collection and will not appear in the live Question Bank or slide sets until finalized.
                      </p>
                    </div>

                    {/* Staging Search Input */}
                    <div className="relative w-full md:w-72">
                      <Search className="absolute left-3 top-2.5 text-zinc-400" size={14} />
                      <input
                        type="text"
                        value={stagingSearch}
                        onChange={e => setStagingSearch(e.target.value)}
                        placeholder="Search staging draft stack..."
                        className="w-full text-xs border border-zinc-250 focus:border-amber-500 bg-white py-1.8 pl-8 pr-4 rounded-xl font-bold placeholder-zinc-400 outline-hidden"
                      />
                    </div>
                  </div>

                  {isFetchingStaging ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-2 select-none">
                      <RefreshCw size={24} className="text-amber-500 animate-spin" />
                      <span className="text-xs text-zinc-500 font-extrabold animate-pulse">Loading your staging questions...</span>
                    </div>
                  ) : filteredStaging.length === 0 ? (
                    <div className="text-center py-12 bg-zinc-50/50 rounded-2xl border border-zinc-150">
                      <FileSpreadsheet size={32} className="text-zinc-350 mx-auto mb-2 animate-bounce" />
                      <h5 className="text-xs font-black text-zinc-650">No staging questions found.</h5>
                      <p className="text-[10px] text-zinc-400 font-semibold max-w-sm mx-auto mt-1 leading-relaxed">
                        Your bulk file transfers and AI parsed questions will be staged right here to allow previewing, detailed editing, and tag modification before final publishing!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {/* Checkbox Operations header bar */}
                      <div className="flex flex-wrap gap-2 items-center justify-between bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-650 font-bold select-none">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer pl-2">
                            <input
                              type="checkbox"
                              checked={selectedStagingQuestionIds.length === filteredStaging.length && filteredStaging.length > 0}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedStagingQuestionIds(filteredStaging.map(q => q.id));
                                } else {
                                  setSelectedStagingQuestionIds([]);
                                }
                              }}
                              className="rounded border-zinc-300 text-amber-500 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                            />
                            <span>Select All ({filteredStaging.length})</span>
                          </label>
                          {selectedStagingQuestionIds.length > 0 && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-md">
                              {selectedStagingQuestionIds.length} Selected
                            </span>
                          )}
                        </div>

                        {selectedStagingQuestionIds.length > 0 && (
                          <div className="flex items-center gap-1.5 self-stretch sm:self-auto select-none">
                            <button
                              type="button"
                              onClick={() => {
                                setBulkTagMeta({
                                  topic: "",
                                  subTopic: "",
                                  chapter: "",
                                  subSubject: "",
                                  subject: "",
                                  difficulty: "Medium",
                                  status: "Draft"
                                });
                                setShowStagingBulkTagModal(true);
                              }}
                              className="bg-white border border-zinc-250 p-1.5 px-3 rounded-lg text-[11px] font-black flex items-center gap-1 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 cursor-pointer transition shadow-2xs"
                            >
                              <Tag size={12} className="text-amber-500" />
                              Bulk Tag
                            </button>
                            <button
                              type="button"
                              disabled={isBulkStagingAiProcessing}
                              onClick={() => bulkAiFillStagingQuestions(selectedStagingQuestionIds)}
                              className="bg-amber-50 text-amber-800 border border-amber-100 p-1.5 px-3 rounded-lg text-[11px] font-black flex items-center gap-1 hover:bg-amber-100 hover:text-amber-900 cursor-pointer transition shadow-2xs disabled:opacity-50"
                            >
                              <Sparkles size={12} className={isBulkStagingAiProcessing ? "animate-spin" : ""} />
                              {isBulkStagingAiProcessing ? `AI Tagging (${stagingAiProgress?.current}/${stagingAiProgress?.total})...` : "AI Auto-Fill Tags"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteStagingQuestions(selectedStagingQuestionIds)}
                              className="bg-rose-50 text-rose-700 border border-rose-100 p-1.5 px-3 rounded-lg text-[11px] font-black flex items-center gap-1 hover:bg-rose-100 hover:text-rose-900 cursor-pointer transition shadow-2xs"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => finalizeStagingQuestions(selectedStagingQuestionIds)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[11px] p-1.5 px-4 rounded-lg flex items-center gap-1 hover:shadow-xs transition cursor-pointer shadow-2xs"
                            >
                              🚀 Approve & Publish to Bank
                            </button>
                          </div>
                        )}
                      </div>

                           {/* Staging List */}
                      <div className="space-y-3.5">
                        {filteredStaging.map((q, qIdx) => {
                          const isSelected = selectedStagingQuestionIds.includes(q.id);
                          return (
                            <div key={q.id || qIdx} className={`bg-white dark:bg-[var(--bg-card)] border rounded-xl p-3.5 sm:p-4.5 transition-all duration-300 shadow-3xs ${isSelected ? "border-amber-400 dark:border-amber-500 bg-amber-550/5 dark:bg-amber-550/10 ring-1 ring-amber-400/40 dark:ring-amber-500/30" : "border-zinc-200/85 dark:border-[var(--border-subtle)] hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-2xs"}`}>
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
                                <div className="flex items-start gap-2.5 sm:gap-3.5 flex-1">
                                  <div className="pt-0.5 shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSelectedStagingQuestionIds(prev => [...prev, q.id]);
                                        } else {
                                          setSelectedStagingQuestionIds(prev => prev.filter(id => id !== q.id));
                                        }
                                      }}
                                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                    />
                                  </div>

                                  <div className="flex-1 space-y-2.5 min-w-0">
                                    {/* Metadata badges */}
                                    <div className="flex flex-wrap gap-1 items-center">
                                      {q.subject && (
                                        <span className="bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-sky-100 dark:border-sky-900/40 uppercase flex items-center gap-1">
                                          {q.subject} {q.aiVerifiedFields?.includes('subject') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.subSubject && (
                                        <span className="bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-sky-100 dark:border-sky-900/40 uppercase flex items-center gap-1">
                                          {q.subSubject} {q.aiVerifiedFields?.includes('subSubject') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.chapter && (
                                        <span className="bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-purple-100 dark:border-purple-900/40 uppercase flex items-center gap-1">
                                          {q.chapter} {q.aiVerifiedFields?.includes('chapter') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.topic && (
                                        <span className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-zinc-200 dark:border-zinc-800/40 flex items-center gap-1">
                                          #{q.topic} {q.aiVerifiedFields?.includes('topic') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.subTopic && (
                                        <span className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-zinc-200 dark:border-zinc-800/40 flex items-center gap-1">
                                          #{q.subTopic} {q.aiVerifiedFields?.includes('subTopic') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.examName && (
                                        <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full font-black border border-amber-100 dark:border-amber-900/30 uppercase flex items-center gap-1">
                                          {q.examName} {q.examYear ? `(${q.examYear})` : ""} {q.aiVerifiedFields?.includes('examName') && <Sparkles size={10} className="text-amber-500" />}
                                        </span>
                                      )}
                                      {q.pyqStatus === "TRUE" && (
                                        <span className="bg-amber-500 text-zinc-950 text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider select-none flex items-center gap-1">
                                          ⭐️ OFFICIAL PYQ
                                        </span>
                                      )}
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                        q.difficultyLevel === "Easy" ? "bg-emerald-100/85 dark:bg-emerald-950/30 text-emerald-805 dark:text-emerald-300" :
                                        q.difficultyLevel === "Hard" ? "bg-rose-100/85 dark:bg-rose-950/30 text-rose-805 dark:text-rose-300" : "bg-blue-105/85 dark:bg-blue-950/30 text-blue-805 dark:text-blue-300"
                                      }`}>
                                        {q.difficultyLevel || "Medium"}
                                      </span>
                                    </div>

                                    {/* Bilingual question renderer */}
                                    {renderQuestionText(q)}

                                    {/* Options block */}
                                    {q.options && q.options.length > 0 && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 select-none font-sans">
                                        {q.options.map((opt, oIdx) => {
                                          const isCorrect = opt.label === q.answer;
                                          return (
                                            <div key={oIdx} className={`p-2 sm:p-2.5 rounded-xl border text-[11px] font-semibold flex items-center justify-between gap-1.5 ${
                                              isCorrect 
                                                ? "bg-emerald-555/10 dark:bg-emerald-950/20 border-emerald-400 text-emerald-900 dark:text-emerald-300 font-black shadow-3xs" 
                                                : "bg-zinc-50 dark:bg-[#0F172A] border-zinc-200 dark:border-[var(--border-subtle)] text-zinc-700 dark:text-[var(--text-secondary)]"
                                            }`}>
                                              <span className="truncate pr-1 font-sans">
                                                {renderOptionText(opt)}
                                              </span>
                                              {isCorrect && (
                                                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-row sm:flex-col gap-2 shrink-0 select-none justify-end pt-3 sm:pt-0 border-t sm:border-0 border-zinc-100">
                                  <button
                                    type="button"
                                    onClick={() => openEditDrawer(qIdx, "staging")}
                                    className="text-[11px] bg-zinc-50 hover:bg-zinc-100 p-2 sm:px-3 rounded-xl border border-zinc-200 hover:border-zinc-350 transition font-black text-zinc-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs flex-1 sm:flex-none"
                                  >
                                    <Edit2 size={13} className="text-amber-500" />
                                    Edit Card
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteStagingQuestions([q.id])}
                                    className="text-[11px] bg-rose-50 text-rose-700 hover:bg-rose-100 p-2 sm:px-3 rounded-xl border border-rose-100 hover:border-rose-200 transition font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs flex-1 sm:flex-none"
                                  >
                                    <Trash2 size={13} />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Staging Area Bulk Tag modal */}
              {showStagingBulkTagModal && (
                <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
                  <motion.div 
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="bg-white h-full shadow-2xl relative overflow-y-auto w-full max-w-sm flex flex-col"
                  >
                    <div className="px-5 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                      <h4 className="text-xs font-black uppercase text-amber-850 tracking-wider flex items-center gap-1.5">
                        <Tag size={14} className="text-amber-505" />
                        Bulk Tag Staging ({selectedStagingQuestionIds.length})
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowStagingBulkTagModal(false)}
                        className="text-zinc-400 hover:text-zinc-900 border border-zinc-200 bg-white p-1.5 rounded-full flex items-center justify-center cursor-pointer shadow-3xs"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="p-5 space-y-4 flex-1">
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-sub" className="text-[10px] font-black uppercase text-zinc-500">Subject</label>
                        <input
                          id="bulk-modal-sub"
                          value={bulkTagMeta.subject}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, subject: e.target.value }))}
                          placeholder="e.g. Mathematics"
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-subsub" className="text-[10px] font-black uppercase text-zinc-500">Sub Subject</label>
                        <input
                          id="bulk-modal-subsub"
                          value={bulkTagMeta.subSubject}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, subSubject: e.target.value }))}
                          placeholder="e.g. Arithmetic or Advance"
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-chap" className="text-[10px] font-black uppercase text-zinc-500">Chapter</label>
                        <input
                          id="bulk-modal-chap"
                          value={bulkTagMeta.chapter}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, chapter: e.target.value }))}
                          placeholder="e.g. Number System"
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-topic" className="text-[10px] font-black uppercase text-zinc-500">Topic</label>
                        <input
                          id="bulk-modal-topic"
                          value={bulkTagMeta.topic}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, topic: e.target.value }))}
                          placeholder="e.g. Divisibility Rule"
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-subtopic" className="text-[10px] font-black uppercase text-zinc-500">Sub Topic</label>
                        <input
                          id="bulk-modal-subtopic"
                          value={bulkTagMeta.subTopic}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, subTopic: e.target.value }))}
                          placeholder="e.g. Division by prime parts"
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="bulk-modal-diff" className="text-[10px] font-black uppercase text-zinc-500">Difficulty</label>
                        <select
                          id="bulk-modal-diff"
                          value={bulkTagMeta.difficulty}
                          onChange={e => setBulkTagMeta(prev => ({ ...prev, difficulty: e.target.value as any }))}
                          className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl bg-white font-black"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 select-none">
                      <button
                        type="button"
                        onClick={() => setShowStagingBulkTagModal(false)}
                        className="p-2 px-4 text-xs font-bold border border-zinc-200 rounded-xl hover:bg-zinc-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyStagingBulkTagging}
                        className="bg-amber-500 hover:bg-amber-600 text-zinc-950 p-2.5 px-5 text-xs font-black rounded-xl cursor-pointer"
                      >
                        Apply tags
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: GLOBAL QUESTION BANK */}
          {activeTab === "bank" && (
            <motion.div 
              key="bank-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col lg:flex-row overflow-hidden bg-zinc-50"
            >
              
              {/* MOBILE ONLY TOGGLE BAR FOR FILTERS */}
              <div className="lg:hidden p-2.5 bg-white border-b border-zinc-200 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 border border-zinc-200 hover:border-zinc-300 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-zinc-700 transition active:scale-98"
                >
                  <Filter size={14} className="text-amber-500" />
                  {showMobileFilters ? "Hide Filters & Stats" : "Show Filters & Stats"}
                  <span className="ml-1 bg-amber-500 text-zinc-950 px-2 py-0.5 rounded-md text-[10px] font-black">
                    {filteredBank.length} elements
                  </span>
                </button>
              </div>

              {/* LEFT COLUMN: FILTERS & STATISTICS SIDEBAR */}
              <div 
                id="bank-filters-sidebar" 
                className={`w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-zinc-200 bg-white flex flex-col overflow-y-auto shrink-0 p-5 space-y-5 ${
                  showMobileFilters ? "flex" : "hidden lg:flex"
                }`}
              >
                <div>
                  <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest mb-3 flex items-center gap-1.5">
                    <Database size={13} className="text-amber-500" />
                    Question Bank Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div id="bank-stat-total" className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Total Stored</span>
                      <strong className="text-base font-black text-zinc-900">{bankQuestions.length}</strong>
                    </div>
                    <div id="bank-stat-matched" className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Matched Items</span>
                      <strong className="text-base font-black text-amber-600">{filteredBank.length}</strong>
                    </div>
                  </div>

                  {/* MINI GRAPHIC PROGRESS BAR GROUP (PYQ & DIFFICULTY) */}
                  <div className="mt-4 bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                        <span>⭐️ PYQ Composition</span>
                        <span className="text-amber-600">
                          {bankQuestions.length > 0 
                            ? Math.round((bankQuestions.filter(q => q.pyqStatus === "TRUE" || q.pyqStatus === true).length / bankQuestions.length) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-205 rounded-full overflow-hidden bg-zinc-200">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-300" 
                          style={{ 
                            width: `${bankQuestions.length > 0 
                              ? (bankQuestions.filter(q => q.pyqStatus === "TRUE" || q.pyqStatus === true).length / bankQuestions.length) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                        <span>🔴 Hard Questions</span>
                        <span className="text-red-600">
                          {bankQuestions.length > 0 
                            ? Math.round((bankQuestions.filter(q => (q.difficultyLevel || q.difficulty) === "Hard").length / bankQuestions.length) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-205 rounded-full overflow-hidden bg-zinc-200">
                        <div 
                          className="h-full bg-red-500 transition-all duration-300" 
                          style={{ 
                            width: `${bankQuestions.length > 0 
                              ? (bankQuestions.filter(q => (q.difficultyLevel || q.difficulty) === "Hard").length / bankQuestions.length) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-100 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
                      <Filter size={13} className="text-amber-500" />
                      Filter Criteria
                    </h3>
                    {(filterSubject !== "All Subjects" || filterChapter !== "All Chapters" || filterTopic !== "All Topics" || filterExam !== "All" || filterDifficulty !== "All" || filterStatus !== "All" || filterPyqStatus !== "All" || filterLanguage !== "All" || filterQuestionType !== "All" || filterPdfName !== "All" || filterYear !== "All" || filterSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterSearch("");
                          setFilterSubject("All Subjects");
                          setFilterChapter("All Chapters");
                          setFilterTopic("All Topics");
                          setFilterExam("All");
                          setFilterDifficulty("All");
                          setFilterStatus("All");
                          setFilterPyqStatus("All");
                          setFilterLanguage("All");
                          setFilterQuestionType("All");
                          setFilterPdfName("All");
                          setFilterYear("All");
                        }}
                        className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer bg-transparent border-0"
                      >
                        Reset All
                      </button>
                    )}
                  </div>

                  {/* SUBJECT SELECT FILTER */}
                  <div className="space-y-1">
                    <label htmlFor="filter-subject-select" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Subject</label>
                    <select
                      id="filter-subject-select"
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                    >
                      <option>All Subjects</option>
                      {subjectsList.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* PYQ STATUS SELECT FILTER */}
                  <div className="space-y-1">
                    <label htmlFor="filter-pyq-select" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">⭐️ PYQ Status</label>
                    <select
                      id="filter-pyq-select"
                      value={filterPyqStatus}
                      onChange={(e) => setFilterPyqStatus(e.target.value)}
                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                    >
                      <option value="All">All Questions</option>
                      <option value="PYQ Only">PYQ Only (True)</option>
                      <option value="Non-PYQ Only">Non-PYQ Only (False)</option>
                    </select>
                  </div>

                  {/* DIFFICULTY LEVEL SELECT FILTER */}
                  <div className="space-y-1">
                    <label htmlFor="filter-difficulty-select" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Difficulty Level</label>
                    <select
                      id="filter-difficulty-select"
                      value={filterDifficulty}
                      onChange={(e) => setFilterDifficulty(e.target.value)}
                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                    >
                      <option value="All">All Difficulties</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>

                  {/* EXAM NAME SELECT FILTER */}
                  <div className="space-y-1">
                    <label htmlFor="filter-exam-select" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Exam Name</label>
                    <select
                      id="filter-exam-select"
                      value={filterExam}
                      onChange={(e) => setFilterExam(e.target.value)}
                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                    >
                      <option value="All">All Exams</option>
                      {examsList.map((e, idx) => <option key={idx} value={e}>{e}</option>)}
                    </select>
                  </div>

                  {/* TOGGLE ADVANCED DRAWER COLLAPSE BUTTON FOR SECONDARY FILTERS */}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="w-full text-xs py-2 border border-zinc-200 hover:bg-zinc-50 bg-white rounded-xl text-zinc-650 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Filter size={13} className="text-zinc-500" />
                    {showAdvancedFilters ? "Hide Extra Filters" : "More Metadata Filters"}
                  </button>

                  <AnimatePresence>
                    {showAdvancedFilters && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-3 pt-1"
                      >
                        {/* CHAPTER */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Chapter</span>
                          <select
                            value={filterChapter}
                            onChange={(e) => setFilterChapter(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option>All Chapters</option>
                            {chaptersList.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
                          </select>
                        </div>
                        {/* TOPIC */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Topic</span>
                          <select
                            value={filterTopic}
                            onChange={(e) => setFilterTopic(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option>All Topics</option>
                            {topicsList.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {/* LANGUAGE */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Language</span>
                          <select
                            value={filterLanguage}
                            onChange={(e) => setFilterLanguage(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option value="All">All Languages</option>
                            {languagesList.map((l, idx) => <option key={idx} value={l}>{l}</option>)}
                          </select>
                        </div>
                        {/* TYPE */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Question Type</span>
                          <select
                            value={filterQuestionType}
                            onChange={(e) => setFilterQuestionType(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option value="All">All Types</option>
                            {questionTypesList.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {/* YEAR */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Exam Year</span>
                          <select
                            value={filterYear}
                            onChange={(e) => setFilterYear(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option value="All">All Years</option>
                            {yearsList.map((y, idx) => <option key={idx} value={y}>{y}</option>)}
                          </select>
                        </div>
                        {/* DOCUMENT */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Source Document</span>
                          <select
                            value={filterPdfName}
                            onChange={(e) => setFilterPdfName(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden max-w-full truncate"
                          >
                            <option value="All">All PDFs</option>
                            {pdfNamesList.map((p, idx) => <option key={idx} value={p}>{p}</option>)}
                          </select>
                        </div>
                        {/* STATUS */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Publish Status</span>
                          <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden"
                          >
                            <option value="All">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Published">Published</option>
                          </select>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* RIGHT COLUMN: SEARCH & CONTENT ROWS */}
              <div id="bank-content-area" className="flex-1 flex flex-col overflow-hidden bg-white">
                
                {/* BANK HEADER BANNER */}
                <div className="bg-zinc-50 border-b border-zinc-200 p-4 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-500 shadow-xs border border-amber-500/10">
                      <Database size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-sm font-black text-zinc-900 tracking-tight">Question Bank Manager</h2>
                      </div>
                      <p className="text-[10.5px] text-zinc-500 leading-tight font-medium font-sans">
                        Manage, search, draft tests, and retrieve your finalized published multiple-choice questions.
                      </p>
                    </div>
                  </div>
                </div>

                {/* EXPANDED CREATOR HUB PANEL (MOVED TO IMPORTER SPACE TAB) */}
                <AnimatePresence>
                  {false && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden bg-zinc-50/50 border-b border-zinc-200 shrink-0"
                    >
                      <div className="p-5 border-b border-zinc-150 space-y-4">
                        
                        {/* Selector Tabs */}
                        <div className="flex gap-2">
                          <div className="bg-zinc-100 p-1 rounded-xl flex gap-1">
                            <button
                              type="button"
                              onClick={() => { setImporterMode("csv"); }}
                              className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                importerMode === "csv" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                              }`}
                            >
                              Bulk CSV Upload
                            </button>
                            <button
                              type="button"
                              onClick={() => { setImporterMode("single"); }}
                              className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                importerMode === "single" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                              }`}
                            >
                              AI Single Parser Form
                            </button>
                          </div>
                        </div>

                        {/* MODE 1: BULK CSV WORKSPACE */}
                        {importerMode === "csv" && (
                          <div className="space-y-4">
                            
                            {/* Question Type and Prefill Config Step */}
                            <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 space-y-4 shadow-2xs">
                              <div>
                                <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                                  <HelpCircle size={14} className="text-amber-600 animate-pulse" />
                                  Step 1: Select Question Type & Pre-fill Global Defaults
                                </h4>
                                <p className="text-[11px] text-amber-700/80 font-medium">
                                  Define if you are importing Past Year Questions (PYQs) or Practice MCQs, and pre-fill core fields automatically to ensure pristine database categorization.
                                </p>
                              </div>

                              <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                  type="button"
                                  onClick={() => setCsvUploadType("pyq")}
                                  className={`flex-1 p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                                    csvUploadType === "pyq" 
                                      ? "bg-amber-100/80 border-amber-400 text-amber-950 shadow-xs ring-1 ring-amber-400" 
                                      : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600"
                                  }`}
                                >
                                  <div className={`p-2 rounded-lg mt-0.5 ${csvUploadType === "pyq" ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-500"}`}>
                                    <Clock size={14} />
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold block">Previous Year Questions (PYQs)</span>
                                    <span className="text-[10px] text-zinc-500 leading-normal block mt-0.5">Applies Exam title, date, year & specific shift credentials.</span>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setCsvUploadType("new_mcq")}
                                  className={`flex-1 p-3 rounded-xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                                    csvUploadType === "new_mcq" 
                                      ? "bg-amber-100/80 border-amber-400 text-amber-950 shadow-xs ring-1 ring-amber-400" 
                                      : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-600"
                                  }`}
                                >
                                  <div className={`p-2 rounded-lg mt-0.5 ${csvUploadType === "new_mcq" ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-500"}`}>
                                    <Plus size={14} />
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold block">New Custom Practice MCQs</span>
                                    <span className="text-[10px] text-zinc-500 leading-normal block mt-0.5">Practice questions, reference textbook bank & mock papers.</span>
                                  </div>
                                </button>
                              </div>

                              {/* Pre-fill default input forms details */}
                              <div className="bg-white p-4.5 rounded-xl border border-zinc-200/60 shadow-2xs space-y-3.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-zinc-700 uppercase tracking-wide flex items-center gap-1.5">
                                    <Database size={12} className="text-amber-500" />
                                    {csvUploadType === "pyq" ? "PRE-FILL PREVIOUS YEAR QUESTIONS (PYQ) VALUES" : "PRE-FILL PRACTICE MCQ DEFAULT VALUES"}
                                  </span>
                                  <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-lg font-semibold font-sans">Automatic Fallback Values</span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
                                  <div>
                                    <label className="text-[10px] font-extrabold text-zinc-500 block mb-1">Org (Organization)</label>
                                    <input
                                      type="text"
                                      value={csvPreFillMeta.org || ""}
                                      onChange={(e) => setCsvPreFillMeta({ ...csvPreFillMeta, org: e.target.value })}
                                      placeholder="e.g. SSC, UPSC"
                                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 focus:bg-white rounded-xl p-2.5 transition"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-extrabold text-zinc-500 block mb-1">Exam {csvUploadType === "pyq" && <span className="text-red-500">*</span>}</label>
                                    <input
                                      type="text"
                                      value={csvPreFillMeta.examName}
                                      onChange={(e) => setCsvPreFillMeta({ ...csvPreFillMeta, examName: e.target.value })}
                                      placeholder="e.g. CGL, CHSL"
                                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 focus:bg-white rounded-xl p-2.5 transition"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-extrabold text-zinc-500 block mb-1">Question Type</label>
                                    <input
                                      type="text"
                                      value={csvPreFillMeta.questionType || ""}
                                      onChange={(e) => setCsvPreFillMeta({ ...csvPreFillMeta, questionType: e.target.value })}
                                      placeholder="e.g. PYQs, Practice"
                                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 focus:bg-white rounded-xl p-2.5 transition"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-extrabold text-zinc-500 block mb-1">Date with Year</label>
                                    <input
                                      type="date"
                                      value={csvPreFillMeta.examDate}
                                      onChange={(e) => setCsvPreFillMeta({ ...csvPreFillMeta, examDate: e.target.value })}
                                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 focus:bg-white rounded-xl p-2.5 transition"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-extrabold text-zinc-500 block mb-1">Shift</label>
                                    <select
                                      value={csvPreFillMeta.shift}
                                      onChange={(e) => setCsvPreFillMeta({ ...csvPreFillMeta, shift: e.target.value })}
                                      className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 focus:bg-white rounded-xl p-2.5 transition cursor-pointer outline-none"
                                    >
                                      <option value="Shift 1">Shift 1</option>
                                      <option value="Shift 2">Shift 2</option>
                                      <option value="Shift 3">Shift 3</option>
                                      <option value="Shift 4">Shift 4</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3 shadow-2xs">
                                <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                  <FileSpreadsheet size={13} className="text-amber-500" />
                                  CSV Upload Guidelines & Headers
                                </h3>
                                <p className="text-[11px] text-zinc-500 leading-relaxed font-semibold font-sans">
                                  Design and prepare a `.csv` log with headers. Supported columns match your production schema automatically:
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                                  <div>
                                    <strong className="text-zinc-700 block">Required:</strong>
                                    <span className="text-zinc-500 block">• question_en / questionText</span>
                                    <span className="text-zinc-500 block">• option1_en, option2_en, etc.</span>
                                    <span className="text-zinc-500 block">• answer (A, B, C, or D)</span>
                                  </div>
                                  <div>
                                    <strong className="text-zinc-700 block">Optional Meta:</strong>
                                    <span className="text-zinc-500 block">• question_hi</span>
                                    <span className="text-zinc-500 block">• solution / solution_en / hi</span>
                                    <span className="text-zinc-500 block">• difficulty_level / set_name</span>
                                  </div>
                                </div>
                                <div className="pt-1 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const sampleCsvText = `question_en,question_hi,option1_en,option1_hi,option2_en,option2_hi,option3_en,option3_hi,option4_en,option4_hi,answer,solution,difficulty_level,set_name\n"Simplify: \\\\( \\\\frac{\\\\tan^2 \\\\theta - \\\\sin^2 \\\\theta}{2 + \\\\tan^2 \\\\theta + \\\\cot^2 \\\\theta} \\\\)","सरल कीजिए: \\\\( \\\\frac{\\\\tan^2 \\\\theta - \\\\sin^2 \\\\theta}{2 + \\\\tan^2 \\\\theta + \\\\cot^2 \\\\theta} \\\\)","\\\\( \\\\sec^6 \\\\theta \\\\)","\\\\( \\\\sec^6 \\\\theta \\\\)","\\\\( \\\\sin^2 \\\\theta \\\\)","\\\\( \\\\sin^2 \\\\theta \\\\)","\\\\( \\\\sin^6 \\\\theta \\\\)","\\\\( \\\\sin^6 \\\\theta \\\\)","\\\\( \\\\cos^2 \\\\theta \\\\)","\\\\( \\\\cos^2 \\\\theta \\\\)","3","Detailed solutions with substitution...","3","Set 1"`;
                                      const blob = new Blob([sampleCsvText], { type: "text/csv;charset=utf-8" });
                                      const url = URL.createObjectURL(blob);
                                      const link = document.createElement("a");
                                      link.href = url;
                                      link.download = "question_bank_template.csv";
                                      link.click();
                                    }}
                                    className="text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1.5 transition bg-amber-50 hover:bg-amber-100/50 p-2 rounded-lg border border-amber-500/10 w-full justify-center"
                                  >
                                    <FileSpreadsheet size={12} />
                                    Download Starter CSV Template
                                  </button>
                                </div>
                              </div>

                              {/* Dropzone Container */}
                              <div className="flex-1">
                                <label className={`flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed border-zinc-200 hover:border-amber-500/50 rounded-2xl transition-all select-none min-h-[160px] text-center w-full h-full ${!isCsvFormValid ? "opacity-50 cursor-not-allowed bg-zinc-50" : "cursor-pointer hover:bg-amber-50/10"}`}>
                                  <div className={`p-3 rounded-full mb-2 ${!isCsvFormValid ? "bg-zinc-200 text-zinc-400" : "bg-amber-500/10 text-amber-500"}`}>
                                    <FileSpreadsheet size={24} />
                                  </div>
                                  <span className={`text-xs font-bold ${!isCsvFormValid ? "text-zinc-500" : "text-zinc-700"}`}>Choose CSV File</span>
                                  <span className="text-[10px] text-zinc-400 mt-1 max-w-[200px]">
                                    {!isCsvFormValid ? "Please fill in all metadata fields to enable CSV upload." : "Maximum 20MB files accepted for blazing-fast indexing"}
                                  </span>
                                  <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleCsvFileSelect}
                                    disabled={!isCsvFormValid}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </div>

                            {/* CSV Error */}
                            {csvFileError && (
                              <div className="bg-red-50 border border-red-500/10 text-red-600 text-xs p-3.5 rounded-xl font-medium flex items-center gap-2">
                                <AlertTriangle size={15} />
                                {csvFileError}
                              </div>
                            )}

                            {/* Preview Table of Uploaded CSV */}
                            {csvUploadedQuestions.length > 0 && (
                              <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs space-y-3 p-4">
                                <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                                    <h4 className="text-xs font-black text-zinc-700">Parsed CSV Question Database Logs ({csvUploadedQuestions.length} Questions)</h4>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setCsvUploadedQuestions([])}
                                      className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 p-1.5 px-3 hover:bg-zinc-100 transition rounded-lg border border-zinc-200"
                                    >
                                      Clear List
                                    </button>
                                    <button
                                      type="button"
                                      onClick={saveAllCsvQuestionsToDb}
                                      disabled={isImportingCsv}
                                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[10px] p-1.5 px-4 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition cursor-pointer"
                                    >
                                      {isImportingCsv ? <RefreshCw className="animate-spin" size={11} /> : <CheckCircle2 size={11} />}
                                      Upload & Publish All to DB
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="overflow-x-auto max-h-60 rounded-xl border border-zinc-100 text-[11px] bg-zinc-50">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[9px] font-bold border-b border-zinc-100">
                                        <th className="p-3">#</th>
                                        <th className="p-3">Question Text</th>
                                        <th className="p-3">Options</th>
                                        <th className="p-2.5 text-center">Correct Option</th>
                                        <th className="p-3">Subject / Exam</th>
                                        <th className="p-3">Difficulty</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 text-zinc-700 bg-white">
                                      {csvUploadedQuestions.map((q, qK) => (
                                        <tr key={qK} className="hover:bg-zinc-50/50">
                                          <td className="p-3 font-mono text-zinc-400 font-bold">{qK + 1}</td>
                                          <td className="p-3 max-w-xs truncate font-medium">{q.questionText}</td>
                                          <td className="p-3">
                                            <div className="flex gap-1.5 max-w-sm overflow-hidden text-[10px]">
                                              {q.options.map((opt, oK) => (
                                                <span key={oK} className="bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/50 block shrink-0 font-medium">
                                                  {opt.label}: {opt.text.slice(0, 15)}...
                                                </span>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="p-3 text-center font-black text-emerald-600">{q.answer}</td>
                                          <td className="p-3">
                                            <span className="bg-amber-500/5 border border-amber-500/10 text-amber-600 p-0.5 px-2 rounded block w-fit font-bold font-mono text-[9px] uppercase tracking-wide">
                                              {q.subject || "N/A"}
                                            </span>
                                          </td>
                                          <td className="p-3">
                                            <span className={`p-0.5 px-2 rounded font-black text-[9px] w-fit block uppercase ${
                                              q.difficultyLevel === "Hard" ? "bg-red-50 text-red-600" : q.difficultyLevel === "Medium" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                                            }`}>
                                              {q.difficultyLevel}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                          </div>
                        )}

                        {/* MODE 2: AI SINGLE QUESTION PARSER & EDITOR */}
                        {importerMode === "single" && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                              
                              {/* Left Raw Text Paste Column */}
                              <div className="lg:col-span-2 space-y-3">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                                  🧠 Raw Pasters / Rough Draft Drawer
                                </label>
                                <textarea
                                  value={rawPasteText}
                                  onChange={(e) => setRawPasteText(e.target.value)}
                                  placeholder="Paste any raw question text here, e.g.
Which is the highest peak in India?
A) K2
B) Kanchenjunga
C) Nanda Devi
D) Anamudi
Answer: B
Solution: Kanchenjunga is the highest mountain peak in India..."
                                  className="w-full text-xs border border-zinc-200 hover:border-zinc-350 focus:border-amber-500 bg-white p-3.5 rounded-2xl min-h-[220px] transition-all duration-200 outline-hidden font-semibold text-zinc-700"
                                />
                                <button
                                  type="button"
                                  onClick={handleParseRawQuestionWithAi}
                                  disabled={isParsingRawText || !rawPasteText.trim()}
                                  className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                  {isParsingRawText ? <RefreshCw className="animate-spin" size={13} /> : <Sparkles size={13} />}
                                  {isParsingRawText ? "AI Reading & Processing..." : "AI Interpret to Structured MCQ"}
                                </button>
                              </div>

                              {/* Right Interactive Structured Form Column */}
                              <div className="lg:col-span-3 bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs grid grid-cols-1 gap-3.5">
                                <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1 border-b border-zinc-100 pb-2">
                                  <Sliders size={13} className="text-amber-500" />
                                  Structured MCQ Editor Fields
                                </h3>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block">Primary Question Text (Bilingual/English)</label>
                                  <textarea
                                    value={singleImportForm.questionText}
                                    onChange={(e) => setSingleImportForm(prev => ({ ...prev, questionText: e.target.value }))}
                                    placeholder="Enter the main question text..."
                                    className="w-full text-xs border border-zinc-200 hover:border-zinc-300 focus:border-amber-500 bg-zinc-50/50 hover:bg-white focus:bg-white p-2.5 rounded-xl transition outline-hidden font-semibold"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase block">Hindi Translation (Optional)</label>
                                    <textarea
                                      value={singleImportForm.question_hin || ""}
                                      onChange={(e) => setSingleImportForm(prev => ({ ...prev, question_hin: e.target.value }))}
                                      placeholder="Hindi text..."
                                      className="w-full text-xs border border-zinc-200 hover:border-zinc-300 focus:border-amber-500 bg-zinc-50/50 hover:bg-white focus:bg-white p-2 rounded-xl transition outline-hidden"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase block">English Translation (Optional)</label>
                                    <textarea
                                      value={singleImportForm.question_eng || ""}
                                      onChange={(e) => setSingleImportForm(prev => ({ ...prev, question_eng: e.target.value }))}
                                      placeholder="English text..."
                                      className="w-full text-xs border border-zinc-200 hover:border-zinc-300 focus:border-amber-500 bg-zinc-50/50 hover:bg-white focus:bg-white p-2 rounded-xl transition outline-hidden"
                                    />
                                  </div>
                                </div>

                                {/* Options Array Editor */}
                                <div className="space-y-2 border-t border-zinc-100 pt-3">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Multiple Choice Options</span>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {singleImportForm.options.map((opt, idx) => (
                                      <div key={idx} className="flex items-center gap-2 border border-zinc-150 p-2 rounded-xl bg-zinc-50/30 hover:border-zinc-250 transition-colors">
                                        <span className="font-extrabold text-xs text-zinc-500 w-5 text-center">{opt.label}</span>
                                        <input
                                          type="text"
                                          value={opt.text}
                                          onChange={(e) => {
                                            const updatedOptions = [...singleImportForm.options];
                                            updatedOptions[idx].text = e.target.value;
                                            setSingleImportForm(prev => ({ ...prev, options: updatedOptions }));
                                          }}
                                          placeholder={`Text Option ${opt.label}...`}
                                          className="flex-1 bg-transparent text-xs outline-hidden font-medium text-zinc-700"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 border-t border-zinc-100 pt-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase block">Correct Answer</label>
                                    <select
                                      value={singleImportForm.answer}
                                      onChange={(e) => setSingleImportForm(prev => ({ ...prev, answer: e.target.value }))}
                                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden cursor-pointer"
                                    >
                                      {singleImportForm.options.map((opt, oIdx) => (
                                        <option key={oIdx} value={opt.label}>Option {opt.label}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase block">Subject</label>
                                    <input
                                      type="text"
                                      value={singleImportForm.subject || ""}
                                      onChange={(e) => setSingleImportForm(prev => ({ ...prev, subject: e.target.value }))}
                                      placeholder="e.g. Physics"
                                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 focus:border-amber-500 outline-hidden font-semibold"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase block">Difficulty</label>
                                    <select
                                      value={singleImportForm.difficultyLevel}
                                      onChange={(e) => setSingleImportForm(prev => ({ ...prev, difficultyLevel: e.target.value as any }))}
                                      className="w-full text-xs border border-zinc-200 bg-white p-2 rounded-xl text-zinc-700 font-semibold focus:border-amber-500 outline-hidden cursor-pointer"
                                    >
                                      <option value="Easy">Easy</option>
                                      <option value="Medium">Medium</option>
                                      <option value="Hard">Hard</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-400 uppercase block">Step-By-Step Solution Hint (Bilingual / Markdown supported)</label>
                                  <textarea
                                    value={singleImportForm.solution || ""}
                                    onChange={(e) => setSingleImportForm(prev => ({ ...prev, solution: e.target.value }))}
                                    placeholder="Provide detailed explanation steps here..."
                                    className="w-full text-xs border border-zinc-200 hover:border-zinc-300 focus:border-amber-500 bg-zinc-50/50 p-2 rounded-xl transition outline-hidden min-h-[60px]"
                                  />
                                </div>

                                <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3.1 select-none">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSingleImportForm({
                                        id: "",
                                        questionText: "",
                                        question_hin: "",
                                        question_eng: "",
                                        options: [
                                          { label: "A", text: "" },
                                          { label: "B", text: "" },
                                          { label: "C", text: "" },
                                          { label: "D", text: "" }
                                        ],
                                        answer: "A",
                                        solution: "",
                                        solution_hin: "",
                                        solution_eng: "",
                                        subject: "",
                                        chapter: "",
                                        topic: "",
                                        difficultyLevel: "Medium",
                                        questionType: "Multiple Choice",
                                        status: "Published"
                                      });
                                    }}
                                    className="text-xs font-bold text-zinc-500 hover:text-zinc-800 p-2 px-4 hover:bg-zinc-100 transition rounded-xl border border-zinc-200 cursor-pointer"
                                  >
                                    Reset Form
                                  </button>
                                  <button
                                    type="button"
                                    onClick={saveSingleImportedQuestion}
                                    disabled={isImportingCsv || !singleImportForm.questionText.trim()}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-2 px-6 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                                  >
                                    {isImportingCsv ? <RefreshCw className="animate-spin" size={13} /> : <Check size={13} />}
                                    Save Question to Bank
                                  </button>
                                </div>

                              </div>

                            </div>
                          </div>
                        )}

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* SEARCH INPUT PANEL */}
                <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex flex-col md:flex-row justify-between items-center gap-3 shrink-0">
                  <div className="relative flex-1 w-full max-w-lg">
                    <Search className="absolute left-3 top-2.5 text-zinc-400" size={16} />
                    <input
                      type="text"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="Type keywords, topics, formulas or codes to search..."
                      className="w-full text-xs border border-zinc-200 hover:border-zinc-300 focus:border-amber-500 bg-white py-2 pl-9 pr-4 rounded-xl transition shadow-xs focus:ring-1 focus:ring-amber-500/20 outline-hidden font-medium"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 font-semibold">
                      {selectedBankQuestionIds.length} select items
                    </span>
                    {selectedBankQuestionIds.length > 0 && (
                      <div className="flex gap-1.5 animate-fade-in">
                        <button
                          type="button"
                          onClick={handleBulkAiFill}
                          disabled={isBulkAiProcessing}
                          className="bg-amber-500 hover:bg-amber-600 text-zinc-950 py-1.5 px-3 rounded-lg text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {isBulkAiProcessing ? <RefreshCw className="animate-spin" size={13} /> : <Sparkles size={13} />}
                          {isBulkAiProcessing ? "Enriching..." : "Bulk AI Fix"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkTagMeta({
                              topic: "",
                              subTopic: "",
                              chapter: "",
                              subSubject: "",
                              subject: "",
                              difficulty: "Medium",
                              status: "Draft"
                            });
                            setShowBulkTagModal(true);
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Tag size={13} />
                          Bulk Tag
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: "Bulk Delete Questions",
                              message: `Are you sure you want to delete ${selectedBankQuestionIds.length} questions from the bank?`,
                              confirmText: "Yes, Bulk Delete",
                              onConfirm: () => {
                                selectedBankQuestionIds.forEach((id, qK) => {
                                  deleteDoc(doc(db, "questions", id)).then(() => {
                                    if (qK === selectedBankQuestionIds.length - 1) {
                                      alert("Bulk deleted successfully!");
                                      fetchBankFromFirestore();
                                      setSelectedBankQuestionIds([]);
                                    }
                                  });
                                });
                              }
                            });
                          }}
                          className="bg-red-650 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-sans"
                        >
                          <Trash2 size={13} />
                          Bulk Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* FILTER & SORT SECTION (TOP DASHBOARD) */}
                <div className="p-4 border-b border-zinc-200 bg-white shrink-0 flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Filter size={14} className="text-amber-500" />
                    <span className="text-xs font-black uppercase text-zinc-600 tracking-wider">Filter & Sort</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Subject</label>
                      <select
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                        className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 rounded-lg p-2 transition outline-hidden"
                      >
                        <option>All Subjects</option>
                        {subjectsList.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Chapter</label>
                      <select
                        value={filterChapter}
                        onChange={(e) => setFilterChapter(e.target.value)}
                        className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 rounded-lg p-2 transition outline-hidden"
                      >
                        <option>All Chapters</option>
                        {chaptersList.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Topic</label>
                      <select
                        value={filterTopic}
                        onChange={(e) => setFilterTopic(e.target.value)}
                        className="w-full text-xs font-semibold bg-zinc-50 border border-zinc-200 focus:border-amber-500 rounded-lg p-2 transition outline-hidden"
                      >
                        <option>All Topics</option>
                        {topicsList.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[140px] border-l border-zinc-200 pl-3">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Sort By</label>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="w-full text-xs font-bold bg-amber-50/50 text-amber-800 border border-amber-200 focus:border-amber-500 rounded-lg p-2 transition outline-hidden"
                      >
                        <option value="Date (Newest)">Date (Newest)</option>
                        <option value="Date (Oldest)">Date (Oldest)</option>
                        <option value="Name (A-Z)">Name (A-Z)</option>
                        <option value="Name (Z-A)">Name (Z-A)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* QUESTIONS LIST ROWS */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/40">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">
                    Saved Questions List ({filteredBank.length} items matched)
                  </span>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleDownloadWord}
                      disabled={isExportingWord}
                      className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {isExportingWord ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
                      {selectedBankQuestionIds.length > 0 ? `Export (${selectedBankQuestionIds.length}) as Word` : `Export All (${filteredBank.length}) as Word`}
                    </button>
                    <button 
                      type="button"
                      onClick={() => selectAllFilteredBankQuestions(filteredBank)}
                      className="text-xs text-amber-500 font-bold hover:underline"
                    >
                      {selectedBankQuestionIds.length === filteredBank.length ? "Deselect All" : "Select All Match"}
                    </button>
                  </div>
                </div>

                {isFetchingBank ? (
                  <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                    <RefreshCw className="animate-spin text-amber-500 mb-3" size={24} />
                    <p className="text-xs">Fetching Question Bank elements from secure Cloud database...</p>
                  </div>
                ) : filteredBank.length > 0 ? (
                  [...filteredBank].sort((a, b) => {
                    if (sortOrder === "Date (Newest)") {
                      const aDate = a.updatedDate ? new Date(a.updatedDate).getTime() : 0;
                      const bDate = b.updatedDate ? new Date(b.updatedDate).getTime() : 0;
                      return bDate - aDate;
                    } else if (sortOrder === "Date (Oldest)") {
                      const aDate = a.updatedDate ? new Date(a.updatedDate).getTime() : 0;
                      const bDate = b.updatedDate ? new Date(b.updatedDate).getTime() : 0;
                      return aDate - bDate;
                    } else if (sortOrder === "Name (A-Z)") {
                      return (a.questionText || "").localeCompare(b.questionText || "");
                    } else if (sortOrder === "Name (Z-A)") {
                      return (b.questionText || "").localeCompare(a.questionText || "");
                    }
                    return 0;
                  }).map((q, qK) => {
                    const isSelected = selectedBankQuestionIds.includes(q.id);
                    const requiredFields = [
                      'subject', 'subSubject', 'chapter', 'topic', 'subTopic', 
                      'examName', 'examYear', 'examDate', 'shift', 
                      'difficultyLevel', 'questionType', 'language', 'pyqStatus'
                    ];
                    const emptyFieldsCount = requiredFields.filter(f => !q[f as keyof typeof q]).length;

                    return (
                      <div 
                        key={q.id} 
                        className={`border rounded-xl bg-white dark:bg-[var(--bg-card)] p-3.5 shadow-xs space-y-3 transition relative group flex items-start gap-2.5 sm:gap-3.5 ${
                          isSelected ? "border-amber-400 dark:border-amber-500 bg-amber-550/5 dark:bg-amber-550/10 ring-1 ring-amber-400/40 dark:ring-amber-500/30" : emptyFieldsCount > 0 ? "border-amber-200/60 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-800/60" : "border-zinc-200/80 dark:border-[var(--border-subtle)] hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-2xs"
                        }`}
                      >
                        
                        {/* Selected indicator */}
                        <div className="pt-0.5 select-none animate-fade-in">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBankSelection(q.id)}
                            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                          />
                        </div>

                        {/* Card Content Details */}
                        <div className="flex-1 space-y-2.5 min-w-0">
                          <div className="flex flex-wrap justify-between items-center pb-2 border-b border-zinc-100 dark:border-[var(--border-subtle)] gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {emptyFieldsCount > 0 && (
                                <span className="flex items-center gap-1 text-[9px] bg-amber-50 dark:bg-amber-955/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold p-0.5 px-2 rounded" title="Missing metadata fields that can be AI-filled">
                                  <AlertCircle size={10} />
                                  {emptyFieldsCount} Empty Field{emptyFieldsCount !== 1 ? 's' : ''}
                                </span>
                              )}
                              {q.subject && (
                                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-extrabold p-0.5 px-2 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                                  {q.subject} {q.aiVerifiedFields?.includes('subject') && <Sparkles size={10} className="text-amber-500" />}
                                </span>
                              )}
                              {q.chapter && (
                                <span className="text-[10px] bg-amber-50 dark:bg-amber-955/20 border border-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold p-0.5 px-2 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                                  {q.chapter} {q.aiVerifiedFields?.includes('chapter') && <Sparkles size={10} className="text-amber-500" />}
                                </span>
                              )}
                              {q.topic && (
                                <span className="text-[10px] bg-purple-50 dark:bg-purple-955/20 text-purple-600 dark:text-purple-308 font-bold p-0.5 px-2 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                                  #{q.topic} {q.aiVerifiedFields?.includes('topic') && <Sparkles size={10} className="text-amber-500" />}
                                </span>
                              )}
                              {q.subTopic && (
                                <span className="text-[10px] bg-purple-50 dark:bg-purple-955/20 text-purple-600 dark:text-purple-308 font-bold p-0.5 px-2 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                                  #{q.subTopic} {q.aiVerifiedFields?.includes('subTopic') && <Sparkles size={10} className="text-amber-500" />}
                                </span>
                              )}
                              {q.exam && (
                                <span className="text-[10px] bg-blue-50 dark:bg-blue-955/20 text-blue-600 dark:text-blue-300 p-0.5 px-2 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                                  {q.exam} {q.aiVerifiedFields?.includes('exam') && <Sparkles size={10} className="text-amber-500" />}
                                </span>
                              )}
                              {q.shift && (
                                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 p-0.5 px-2 rounded-md font-mono font-black">
                                  {q.shift}
                                </span>
                              )}
                              {(q.examDate || q.date) && (
                                <span className="text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-650 dark:text-sky-305 p-0.5 px-2 rounded-md font-mono font-black">
                                  {q.examDate || q.date}
                                </span>
                              )}
                              {q.stage && (
                                <span className="text-[10px] bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 p-0.5 px-2 rounded-md font-mono font-black uppercase">
                                  {q.stage}
                                </span>
                              )}
                              {(q.difficultyLevel || q.difficulty) && (
                                <span className={`text-[10px] font-black p-0.5 px-2 rounded-md uppercase ${
                                  (q.difficultyLevel || q.difficulty) === "Hard"
                                    ? "bg-rose-100/85 dark:bg-rose-950/30 text-rose-805 dark:text-rose-300"
                                    : (q.difficultyLevel || q.difficulty) === "Medium"
                                    ? "bg-blue-105/85 dark:bg-blue-950/30 text-blue-850 dark:text-blue-300"
                                    : "bg-emerald-100/85 dark:bg-emerald-950/30 text-emerald-805 dark:text-emerald-300"
                                }`}>
                                  {q.difficultyLevel || q.difficulty}
                                </span>
                              )}
                              {q.questionType && (
                                <span className="text-[10px] bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-300 p-0.5 px-2 rounded-md font-black uppercase">
                                  {q.questionType}
                                </span>
                              )}
                              {q.sourceBook && (
                                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-300 p-0.5 px-2 rounded-md font-extrabold flex items-center gap-1">
                                  📖 {q.sourceBook}
                                </span>
                              )}
                              {q.pdfName && (
                                <span className="text-[10px] bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/55 text-zinc-500 dark:text-zinc-400 p-0.5 px-2 rounded-md max-w-[124px] truncate" title={q.pdfName}>
                                  📄 {q.pdfName}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 text-[10px] font-mono">
                              <span className="text-zinc-400">Idx: {qK + 1}</span>
                              <span className={`${q.status === "Published" ? "text-emerald-600 font-bold" : "text-zinc-400 font-semibold"}`}>
                                {q.status || "Draft"}
                              </span>
                            </div>
                          </div>

                          {/* Text content details */}
                          <div className="text-xs text-zinc-900 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                            {renderQuestionText(q)}
                          </div>

                          {/* Image preview */}
                          {q.imageUrl && (
                            <div className="relative border border-zinc-200 rounded-lg overflow-hidden group/bankImg max-w-xs bg-zinc-100">
                              <img referrerPolicy="no-referrer" src={q.imageUrl} alt="Question Diagram" className="max-h-24 object-contain" />
                              <button
                                type="button"
                                onClick={() => setPaintTargetIndex({ qIdx: qK, source: "bank" })}
                                className="absolute inset-0 bg-black/40 text-white text-[10px] font-bold uppercase opacity-0 group-hover/bankImg:opacity-100 transition flex items-center justify-center gap-1"
                              >
                                <Edit2 size={12} />
                                Edit Snip canvas
                              </button>
                            </div>
                          )}

                          {/* Options list */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-50 dark:bg-[#0F172A] p-2 rounded-xl">
                            {q.options.map((opt, oK) => (
                              <div key={oK} className={`text-[11px] p-2 px-2.5 rounded-lg border flex items-center justify-between font-medium ${
                                q.answer === opt.label 
                                  ? "bg-emerald-555/10 dark:bg-emerald-950/20 border-emerald-400 text-emerald-950 dark:text-emerald-305 font-black shadow-3xs" 
                                  : "bg-white dark:bg-[var(--bg-card)] border-zinc-200 dark:border-[var(--border-subtle)] text-zinc-650 dark:text-[var(--text-secondary)]"
                              }`}>
                                <span>{renderOptionText(opt)}</span>
                                {q.answer === opt.label && <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />}
                              </div>
                            ))}
                          </div>

                          {/* Explanation block */}
                          {renderExplanationText(q)}

                          {/* Actions */}
                          <div className="flex justify-end gap-2 border-t border-zinc-100 dark:border-[var(--border-subtle)] pt-2.5">
                            <button
                              type="button"
                              onClick={() => setPaintTargetIndex({ qIdx: qK, source: "bank" })}
                              className="text-[10px] font-bold text-zinc-600 dark:text-[var(--text-secondary)] hover:text-zinc-950 dark:hover:text-white p-1.5 px-3 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-105 rounded-lg border border-zinc-200 dark:border-zinc-700/60 transition flex items-center gap-1 cursor-pointer shadow-3xs"
                            >
                              <ImageIcon size={10} />
                              Edit Graphic Image
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditDrawer(qK, "bank")}
                              className="text-[10px] font-bold text-zinc-800 dark:text-[var(--text-primary)] hover:text-zinc-955 dark:hover:text-white p-1.5 px-3 bg-zinc-50 dark:bg-zinc-800/45 hover:bg-zinc-105 rounded-lg border border-zinc-200 dark:border-zinc-700/60 transition flex items-center gap-1 cursor-pointer shadow-3xs"
                            >
                              <Edit2 size={10} />
                              Quick Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBankDelete(q.id, qK)}
                              className="text-[10px] font-bold text-rose-500 hover:text-rose-700 p-1.5 px-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer transition flex items-center justify-center shrink-0"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-zinc-200 rounded-2xl p-12 text-center text-zinc-500">
                    <Database className="mx-auto text-zinc-400 mb-2" size={28} />
                    <h4 className="text-sm font-bold text-zinc-700">Database matches is empty</h4>
                    <p className="text-xs text-zinc-400 mt-1">There are no matching questions currently saved. Go to PDF Extractor to import elements or clear filters to view default bank.</p>
                  </div>
                )}
              </div>

              </div>

              {/* DOCK BAR AT THE BOTTOM TO INITIATE TEST GENERATION FROM CHECKS */}
              {selectedBankQuestionIds.length > 0 && (
                <div className="border-t border-zinc-200 bg-zinc-900 text-white p-4 px-6 flex flex-col sm:flex-row justify-between sm:items-center gap-3 animate-slide-up">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="text-amber-500" size={20} />
                    <div>
                      <h4 className="text-xs font-black uppercase text-zinc-300">Set Creation active</h4>
                      <p className="text-[11px] text-zinc-400">Created set containing {selectedBankQuestionIds.length} exam items simultaneously.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      value={testForm.name}
                      onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
                      placeholder="Test name..."
                      className="text-xs bg-zinc-800 border border-zinc-700 placeholder-zinc-500 py-2 px-3 rounded-xl focus:border-amber-500 text-white transition max-w-xs"
                    />

                    <button
                      type="button"
                      onClick={handleCreateTest}
                      disabled={isCreatingTest}
                      className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-2.5 px-4 rounded-xl text-xs font-sans shadow-lg shadow-amber-500/10 transition"
                    >
                      {isCreatingTest ? "Creating Set..." : "Create Test (Set)"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: TESTS / CREATED ASSESSMENT SETS */}
          {activeTab === "tests" && (
            <motion.div 
              key="tests-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col overflow-y-auto p-6 space-y-6"
            >
              
              {/* INTRO SUMMARY */}
              <div className="border border-zinc-200 rounded-2xl bg-white p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Lock className="text-amber-500" size={18} />
                    Secure Mock Assessment Sets
                  </h3>
                  <p className="text-xs text-zinc-500">
                    A secure cryptographic credentials-based test dashboard. Share Set IDs and passcode keys to grant student credentials in subsequent components.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setActiveTab("bank")}
                  className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
                >
                  Create Set from Bank questions
                </button>
              </div>

              {/* LIST OF CREATED TESTS */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">
                  Active Practice Tests ({createdTests.length} Sets created)
                </span>

                {isFetchingTests ? (
                  <p className="text-xs text-zinc-500">Loading assessments...</p>
                ) : createdTests.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {createdTests.map((t, tIdx) => (
                      <div key={t.id || tIdx} className="border border-zinc-200/80 rounded-2xl bg-white p-4 shadow-xs space-y-3 hover:border-zinc-300 transition">
                        
                        {/* Title bar */}
                        <div className="flex justify-between items-start pb-2 border-b border-zinc-100 gap-2">
                          <div>
                            <h4 className="font-bold text-zinc-900 text-sm">{t.name}</h4>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Pattern: {t.examPattern || "SSC GD"}
                            </span>
                          </div>
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-black font-mono py-0.5 px-2 rounded-full">
                            {t.questionsCount || 0} Questions
                          </span>
                        </div>

                        {/* Credentials Credentials */}
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/50 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-medium">Set ID:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-bold text-zinc-800 bg-white border border-zinc-200 p-0.5 px-2 rounded">
                                {t.setId}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(t.setId);
                                }}
                                className="text-zinc-400 hover:text-zinc-600 p-0.5"
                                title="Copy Set ID"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-medium">Password:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-bold text-zinc-800 bg-white border border-zinc-200 p-0.5 px-2 rounded">
                                {t.password}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(t.password);
                                }}
                                className="text-zinc-400 hover:text-zinc-600 p-0.5"
                                title="Copy Password"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Metadata details */}
                        <div className="flex justify-between items-center pt-2 text-[10px] text-zinc-400">
                          <span>Created {new Date(t.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: "Delete Mock Exam Set",
                                message: "Are you sure you want to delete this mock exam set credentials?",
                                confirmText: "Yes, Delete",
                                onConfirm: () => {
                                  deleteDoc(doc(db, "tests", t.id)).then(() => {
                                    setCreatedTests(prev => prev.filter(x => x.id !== t.id));
                                  });
                                }
                              });
                            }}
                            className="text-red-500 hover:text-red-700 hover:underline"
                          >
                            Delete Set
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-zinc-200 rounded-2xl p-12 text-center text-zinc-500 bg-white">
                    <Key className="mx-auto text-zinc-400 mb-2" size={28} />
                    <h4 className="text-sm font-bold text-zinc-700">No mock sets created yet</h4>
                    <p className="text-xs text-zinc-400 mt-1">To generate credentials, navigate to the Question Bank tab, select multiple question items using checkbox, and use the Bottom bar suite.</p>
                  </div>
                )}
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* EDIT SINGLE QUESTION DETAILED MODAL DRAWER */}
      <AnimatePresence>
        {editingQuestion && (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`bg-white h-full flex flex-col shadow-2xl relative overflow-hidden transition-all duration-300 ${
                isEditorMaximized ? 'w-full max-w-full' : 'w-full max-w-2xl'
              }`}
            >
              
              {/* Header drawer */}
              <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <div>
                  <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                    <span>Edit Question Statement</span>
                    {isEditorMaximized && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">Immersive Workspace</span>
                    )}
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">Bilingual support & LaTeX formula previewer {isEditorMaximized ? "• Fully expanded side-by-side editing panel" : "• Compact editing panel"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditorMaximized(!isEditorMaximized)}
                    className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 transition flex items-center gap-1 border border-zinc-200/60 bg-white shadow-3xs cursor-pointer"
                    title={isEditorMaximized ? "Collapse to compact drawer" : "Maximize to full screen"}
                  >
                    {isEditorMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline px-0.5">{isEditorMaximized ? "Compact" : "Full Screen"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-650 hover:bg-zinc-100 transition cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Scroll form elements */}
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/40">
                
                <div className={isEditorMaximized ? "grid grid-cols-1 lg:grid-cols-12 gap-8 items-start align-stretch" : "space-y-5 max-w-2xl mx-auto bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs"}>
                  
                  {/* LEFT PANE (Question Content and Options) */}
                  <div className={isEditorMaximized ? "lg:col-span-7 space-y-5 bg-white p-6 rounded-2xl border border-zinc-150 shadow-2xs" : "space-y-5"}>
                    
                    {/* section header */}
                    {isEditorMaximized && (
                      <div className="border-b border-zinc-200/80 pb-2.5">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">Part A • Question Design</span>
                        <h4 className="text-xs font-extrabold text-zinc-700">Question Statements & Option Labels</h4>
                      </div>
                    )}

                    {/* AI Assistant Edit block */}
                    <div className="flex flex-col border border-amber-500/20 rounded-2xl bg-amber-500/5 overflow-hidden">
                      <div className="p-3.5 flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="text-amber-500 animate-pulse" size={16} />
                          <div className="text-xs">
                            <strong className="text-zinc-900 block font-bold">Veda Translation & Metadata AI</strong>
                            <span className="text-zinc-500 text-[11px]">Generate missing metadata and translations instantly.</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={toggleAiFieldsMenu}
                            className="text-amber-700 hover:bg-amber-500/10 text-xs font-semibold py-1.5 px-3 rounded-lg transition"
                          >
                            {aiFieldsMenuOpen ? "Hide Options" : "Select Fields"}
                          </button>
                          <button
                            type="button"
                            onClick={runAiAssistImprove}
                            disabled={isAiEditing}
                            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-xs font-extrabold py-1.5 px-3 rounded-lg transition cursor-pointer"
                          >
                            {isAiEditing ? "Filling..." : "AI Fill"}
                          </button>
                        </div>
                      </div>
                      
                      {aiFieldsMenuOpen && (
                        <div className="px-4 pb-4 pt-1 border-t border-amber-500/10 bg-amber-500/10">
                          <p className="text-[11px] font-semibold text-amber-800 mb-2">Select fields to fill (empty fields selected by default):</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {AI_FILLABLE_FIELDS.map((f) => (
                              <label key={f.key} className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={aiFieldsToFill[f.key] || false}
                                  onChange={(e) => setAiFieldsToFill({...aiFieldsToFill, [f.key]: e.target.checked})}
                                  className="w-3 h-3 text-amber-500 rounded border-amber-300 focus:ring-amber-500"
                                />
                                <span className="text-[10px] text-zinc-700">{f.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Main Question textbox (General statement) */}
                    <div>
                      <label className="text-xs font-bold text-zinc-700 block mb-1 flex justify-between items-center">
                        <span>Question Content</span>
                        <span className="text-[10px] text-zinc-400 font-mono">Bilingual or General text</span>
                      </label>
                      <textarea
                        rows={isEditorMaximized ? 6 : 4}
                        value={editingQuestion.questionText}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, questionText: e.target.value })}
                        className="w-full text-xs border border-zinc-200 p-3 rounded-xl bg-zinc-50 font-sans leading-relaxed focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                      />
                    </div>

                    {/* Language specific statement translations */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-650 block mb-1">Hindi Script Translation (optional)</label>
                        <textarea
                          rows={3}
                          value={editingQuestion.question_hin || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, question_hin: e.target.value })}
                          className="w-full text-xs border border-zinc-200 p-2.5 rounded-xl bg-zinc-50 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                          placeholder="हिंदी में प्रश्न..."
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-zinc-650 block mb-1">English Script Translation (optional)</label>
                        <textarea
                          rows={3}
                          value={editingQuestion.question_eng || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, question_eng: e.target.value })}
                          className="w-full text-xs border border-zinc-200 p-2.5 rounded-xl bg-zinc-50 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                          placeholder="Question in English..."
                        />
                      </div>
                    </div>

                    {/* LaTeX Formula Live Previewer Helper banner */}
                    <div className="p-3 bg-zinc-100/60 border border-zinc-200 rounded-xl">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">LaTeX Live Math Render Preview</span>
                      <div className="p-2 bg-white rounded-lg border border-zinc-150 min-h-[40px] text-zinc-750 leading-relaxed font-sans text-xs overflow-x-auto">
                        <MathRenderer text={editingQuestion.questionText || ""} />
                      </div>
                    </div>

                    {/* OPTIONS (A, B, C, D) FIELDS */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-zinc-700 block">Multiple Choice Option Labels & Answers</label>
                        <span className="text-[10px] text-zinc-400 font-bold">Select radio for correct answer</span>
                      </div>
                      {editingQuestion.options.map((opt, oK) => (
                        <div key={oK} className={`flex flex-col gap-2 p-3 border rounded-xl transition-all ${
                          editingQuestion.answer === opt.label 
                            ? "bg-emerald-50/50 border-emerald-300 text-emerald-950 ring-1 ring-emerald-350" 
                            : "bg-zinc-50 border-zinc-200/60 text-zinc-650 hover:bg-zinc-100/50"
                        }`}>
                          <div className="flex gap-3 items-center">
                            <input
                              type="radio"
                              name="correct-answer-select"
                              checked={editingQuestion.answer === opt.label}
                              onChange={() => setEditingQuestion({ ...editingQuestion, answer: opt.label })}
                              className="w-4.5 h-4.5 text-emerald-600 focus:ring-emerald-50 accent-emerald-600 cursor-pointer"
                              title="Mark correct answer option"
                              id={`opt-radio-${oK}`}
                            />
                            <span className="font-mono text-xs font-extrabold text-zinc-500 w-4">{opt.label}</span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => {
                                const copyOpts = [...editingQuestion.options];
                                copyOpts[oK].text = e.target.value;
                                setEditingQuestion({ ...editingQuestion, options: copyOpts });
                              }}
                              className="flex-1 text-xs bg-white border border-zinc-200 focus:border-amber-500 py-1.5 px-3 rounded-lg"
                              placeholder="Base option body"
                            />
                          </div>

                          {/* Option translation inputs */}
                          <div className="grid grid-cols-2 gap-2 pl-12">
                            <div>
                              <input
                                type="text"
                                value={opt.text_hin || ""}
                                onChange={(e) => {
                                  const copyOpts = [...editingQuestion.options];
                                  copyOpts[oK].text_hin = e.target.value;
                                  setEditingQuestion({ ...editingQuestion, options: copyOpts });
                                }}
                                className="w-full text-[11px] bg-white border border-zinc-200 focus:border-amber-500 py-1 px-2 rounded"
                                placeholder="Hindi translation"
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                value={opt.text_eng || ""}
                                onChange={(e) => {
                                  const copyOpts = [...editingQuestion.options];
                                  copyOpts[oK].text_eng = e.target.value;
                                  setEditingQuestion({ ...editingQuestion, options: copyOpts });
                                }}
                                className="w-full text-[11px] bg-white border border-zinc-200 focus:border-amber-500 py-1 px-2 rounded"
                                placeholder="English translation"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>

                  {/* RIGHT PANE (Exams, Solutions, metadata, and variables) */}
                  <div className={isEditorMaximized ? "lg:col-span-5 space-y-5 bg-white p-6 rounded-2xl border border-zinc-150 shadow-2xs h-full" : "space-y-5"}>
                    
                    {/* section header */}
                    {isEditorMaximized && (
                      <div className="border-b border-zinc-200/80 pb-2.5">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">Part B • Categorization & Answer Solution</span>
                        <h4 className="text-xs font-extrabold text-zinc-700">Detailed Explanations & Metadata Tags</h4>
                      </div>
                    )}

                    {/* SOLUTION BODY */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-zinc-700 block">Solution / Explanation</label>
                        <button
                          type="button"
                          onClick={() => performAiEdit(["solution", "solution_hin", "solution_eng"])}
                          disabled={isAiEditing}
                          className="flex items-center gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold transition disabled:opacity-50"
                        >
                          {isAiEditing ? <RefreshCw className="animate-spin" size={10} /> : <Sparkles size={10} />}
                          Regenerate Explanation
                        </button>
                      </div>
                      <textarea
                        rows={isEditorMaximized ? 4 : 3}
                        value={editingQuestion.solution || ""}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, solution: e.target.value })}
                        className="w-full text-xs border border-zinc-200 p-2.5 rounded-xl bg-zinc-50 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition leading-relaxed"
                        placeholder="Provide deep explanation steps..."
                      />
                    </div>

                    {/* Language specific solution translations */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-650 block mb-1">Hindi Solution (optional)</label>
                        <textarea
                          rows={2.5}
                          value={editingQuestion.solution_hin || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, solution_hin: e.target.value })}
                          className="w-full text-xs border border-zinc-200 p-2 rounded-xl bg-zinc-50 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                          placeholder="हिंदी में उत्तर व्याख्या..."
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-650 block mb-1">English Solution (optional)</label>
                        <textarea
                          rows={2.5}
                          value={editingQuestion.solution_eng || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, solution_eng: e.target.value })}
                          className="w-full text-xs border border-zinc-200 p-2 rounded-xl bg-zinc-50 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition"
                          placeholder="Solution in English..."
                        />
                      </div>
                    </div>

                    {/* Subject chapters topics */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-150">
                      <div className="sm:col-span-3 pb-1 border-b border-zinc-200 flex justify-between items-center">
                        <span className="text-[10px] font-black text-zinc-600 block uppercase tracking-wide">Category Hierarchy</span>
                        <button
                          type="button"
                          onClick={() => triggerAiCategoriesAutoFill()}
                          className="flex items-center gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold"
                        >
                          {isAiEditing ? <RefreshCw className="animate-spin" size={10} /> : <Sparkles size={10} />}
                          AI Auto-Fill Categories
                        </button>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                          Subject {editingQuestion.aiVerifiedFields?.includes('subject') && <Sparkles size={10} className="text-amber-500" />}
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.subject || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, subject: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                          Sub Subject {editingQuestion.aiVerifiedFields?.includes('subSubject') && <Sparkles size={10} className="text-amber-500" />}
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.subSubject || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, subSubject: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                          Chapter {editingQuestion.aiVerifiedFields?.includes('chapter') && <Sparkles size={10} className="text-amber-500" />}
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.chapter || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, chapter: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                          Topic {editingQuestion.aiVerifiedFields?.includes('topic') && <Sparkles size={10} className="text-amber-500" />}
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.topic || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, topic: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1 flex items-center gap-1">
                          Sub Topic {editingQuestion.aiVerifiedFields?.includes('subTopic') && <Sparkles size={10} className="text-amber-500" />}
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.subTopic || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, subTopic: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Question Type</label>
                        <input
                          type="text"
                          value={editingQuestion.questionType || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, questionType: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                    </div>

                    {/* Exam Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-150">
                      <div className="sm:col-span-4 pb-1 border-b border-zinc-200">
                        <span className="text-[10px] font-black text-zinc-600 block uppercase tracking-wide">Exam & Shift Identifiers</span>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Org (Organization)</label>
                        <input
                          type="text"
                          value={editingQuestion.org || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, org: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                          placeholder="e.g. SSC"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Exam Name</label>
                        <input
                          type="text"
                          value={editingQuestion.examName || editingQuestion.exam || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, examName: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Exam Year</label>
                        <input
                          type="text"
                          value={editingQuestion.examYear || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, examYear: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Exam Date</label>
                        <input
                          type="text"
                          value={editingQuestion.examDate || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, examDate: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-white font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 dark:text-[var(--text-muted)] block mb-1">Shift / Slot</label>
                        <input
                          type="text"
                          value={editingQuestion.shift || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, shift: e.target.value })}
                          className="w-full text-xs border border-zinc-200 dark:border-[var(--border-subtle)] py-1.5 px-2.5 rounded-lg bg-white dark:bg-[var(--bg-secondary)] text-zinc-805 dark:text-[var(--text-primary)] font-semibold outline-hidden"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 dark:text-[var(--text-muted)] block mb-1">Exam Category</label>
                        <input
                          type="text"
                          value={editingQuestion.examCategory || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, examCategory: e.target.value })}
                          className="w-full text-xs border border-zinc-200 dark:border-[var(--border-subtle)] py-1.5 px-2.5 rounded-lg bg-white dark:bg-[var(--bg-secondary)] text-zinc-805 dark:text-[var(--text-primary)] font-semibold outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-zinc-500 dark:text-[var(--text-muted)] block mb-1">Session</label>
                        <input
                          type="text"
                          value={editingQuestion.session || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, session: e.target.value })}
                          className="w-full text-xs border border-zinc-200 dark:border-[var(--border-subtle)] py-1.5 px-2.5 rounded-lg bg-white dark:bg-[var(--bg-secondary)] text-zinc-805 dark:text-[var(--text-primary)] font-semibold outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-zinc-505 dark:text-[var(--text-muted)] block mb-1">Stage</label>
                        <select
                          value={editingQuestion.stage || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, stage: e.target.value })}
                          className="w-full text-xs border border-zinc-200 dark:border-[var(--border-subtle)] py-1.5 px-2 rounded-lg bg-white dark:bg-[var(--bg-secondary)] text-zinc-805 dark:text-[var(--text-primary)] font-semibold cursor-pointer outline-hidden focus:border-amber-500"
                        >
                          <option value="">No Stage assigned</option>
                          <option value="Stage 1">Stage 1</option>
                          <option value="Stage 2">Stage 2</option>
                          <option value="Stage 3">Stage 3</option>
                        </select>
                      </div>
                    </div>

                    {/* Source Book Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50/50 p-3 rounded-xl border border-zinc-150">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 block mb-1">Book Name</label>
                        <input
                          type="text"
                          value={editingQuestion.bookName || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, bookName: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1 px-2 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 block mb-1">Source Book</label>
                        <input
                          type="text"
                          value={editingQuestion.sourceBook || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, sourceBook: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1 px-2 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 block mb-1">Publisher</label>
                        <input
                          type="text"
                          value={editingQuestion.publisher || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, publisher: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1 px-2 rounded-lg bg-white"
                        />
                      </div>
                    </div>

                    {/* Additional parameters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50/50 p-3 rounded-xl border border-zinc-150">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Difficulty</label>
                        <select
                          value={editingQuestion.difficultyLevel || editingQuestion.difficulty || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, difficultyLevel: e.target.value, difficulty: e.target.value as any })}
                          className="w-full text-xs border border-zinc-200 py-1 px-1.5 rounded-lg bg-white"
                        >
                          <option value="">Select</option>
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">PYQ Status</label>
                        <select
                          value={String(editingQuestion.pyqStatus ?? "")}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, pyqStatus: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1 px-1.5 rounded-lg bg-white"
                        >
                          <option value="">Select</option>
                          <option value="TRUE">TRUE</option>
                          <option value="FALSE">FALSE</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Language</label>
                        <input
                          type="text"
                          value={editingQuestion.language || ""}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, language: e.target.value })}
                          className="w-full text-xs border border-zinc-200 py-1 px-2 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block mb-1">Status</label>
                        <select
                          value={editingQuestion.status || "Draft"}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, status: e.target.value as any })}
                          className="w-full text-xs border border-zinc-200 py-1 px-1.5 rounded-lg bg-white"
                        >
                          <option value="Draft">Draft</option>
                          <option value="Published">Published</option>
                        </select>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

              {/* Dialog Action bar */}
              <div className="p-4 px-6 border-t border-zinc-200 bg-zinc-50 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-4 py-2 text-xs bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl font-bold transition"
                >
                  Discard Changes
                </button>
                <button
                  type="button"
                  onClick={saveEditedQuestion}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-extrabold rounded-xl shadow-xs transition"
                >
                  Save Question changes
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK TAGS APPLICATOR DRAWER */}
      <AnimatePresence>
        {showBulkTagModal && (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white h-full shadow-2xl relative overflow-y-auto w-full max-w-sm flex flex-col"
            >
              <div className="px-5 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <div className="flex items-center gap-1.5">
                  <Tag className="text-amber-500" size={17} />
                  <h3 className="font-bold text-zinc-900 text-sm">Bulk Tag Selected Elements ({selectedBankQuestionIds.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkTagModal(false)}
                  className="text-zinc-400 hover:text-zinc-900 border border-zinc-200 bg-white p-1.5 rounded-full flex items-center justify-center cursor-pointer shadow-3xs"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1">
                <p className="text-[11px] text-zinc-400">
                  Apply tags immediately to all {selectedBankQuestionIds.length} checked questions in this batch. Empty fields will remain untouched.
                </p>

                <div>
                  <label className="text-xs font-bold text-zinc-500 block mb-1">Subject</label>
                  <input
                    type="text"
                    value={bulkTagMeta.subject}
                    onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, subject: e.target.value })}
                    className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-zinc-50"
                    placeholder="e.g. Mathematics"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 block mb-1">Sub Subject</label>
                  <input
                    type="text"
                    value={bulkTagMeta.subSubject}
                    onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, subSubject: e.target.value })}
                    className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-zinc-50"
                    placeholder="e.g. Arithmetic or Advance"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 block mb-1">Chapter</label>
                  <input
                    type="text"
                    value={bulkTagMeta.chapter}
                    onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, chapter: e.target.value })}
                    className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-zinc-50"
                    placeholder="e.g. Number System"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 block mb-1">Topic</label>
                  <input
                    type="text"
                    value={bulkTagMeta.topic}
                    onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, topic: e.target.value })}
                    className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-zinc-50"
                    placeholder="e.g. Divisibility Rule"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 block mb-1">Sub Topic</label>
                  <input
                    type="text"
                    value={bulkTagMeta.subTopic}
                    onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, subTopic: e.target.value })}
                    className="w-full text-xs border border-zinc-200 py-1.5 px-2.5 rounded-lg bg-zinc-50"
                    placeholder="e.g. Division by prime parts"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-500 block mb-1">Difficulty</label>
                    <select
                      value={bulkTagMeta.difficulty}
                      onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, difficulty: e.target.value as any })}
                      className="w-full text-xs border border-zinc-200 py-1.5 px-2 rounded-lg bg-zinc-50"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 block mb-1">Workflow Status</label>
                    <select
                      value={bulkTagMeta.status}
                      onChange={(e) => setBulkTagMeta({ ...bulkTagMeta, status: e.target.value as any })}
                      className="w-full text-xs border border-zinc-200 py-1.5 px-2 rounded-lg bg-zinc-50"
                    >
                      <option value="Draft">Draft (Offline)</option>
                      <option value="Published">Published (Active)</option>
                    </select>
                  </div>
                </div>

              </div>

              <div className="px-5 py-4 border-t border-zinc-100 bg-white flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBulkTagModal(false)}
                  className="px-4 py-2 border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyBulkTagging}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-black rounded-xl"
                >
                  Apply Tags
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MOCK GENERATOR SUCCESS CREDENTIALS POPUP */}
      <AnimatePresence>
        {newlyCreatedTestCredentials && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Check className="text-emerald-500 w-5 h-5 bg-emerald-500/10 p-1 rounded-full" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-300">Set Credentials provisioned</h3>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-zinc-200">Set ID & Passcode Generated!</h4>
                <p className="text-[11px] text-zinc-400">Save and distribute these credentials key-pairs dynamically to allow student portal entrance.</p>
              </div>

              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">SET ID Code:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-500 select-all">
                      {newlyCreatedTestCredentials.setId}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedTestCredentials.setId);
                        alert("Set ID Copied!");
                      }}
                      className="p-1 hover:bg-zinc-800 rounded transition text-zinc-400 hover:text-white"
                      title="Copy Key"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Security Passcode:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-500 select-all">
                      {newlyCreatedTestCredentials.password}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedTestCredentials.password);
                        alert("Password Copied!");
                      }}
                      className="p-1 hover:bg-zinc-800 rounded transition text-zinc-400 hover:text-white"
                      title="Copy Passcode"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewlyCreatedTestCredentials(null);
                  setActiveTab("tests");
                }}
                className="w-full py-2 bg-amber-500 font-black text-zinc-950 rounded-xl text-xs text-center hover:bg-amber-600 transition"
              >
                Go to Tests list Dashboard
              </button>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK VERIFICATION OVERLAY SCREEN */}
      <AnimatePresence>
        {showBulkVerifyScreen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 md:p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-zinc-200 rounded-3xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl relative overflow-hidden text-zinc-900"
            >
              
              {/* Header */}
              <div className="p-6 border-b border-zinc-200 bg-zinc-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 px-2.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-[10px] font-black uppercase font-mono tracking-widest flex items-center gap-1.5 flex-wrap">
                      Audit Desk
                    </span>
                    <span className="p-1 px-2.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold uppercase font-mono">
                      {verifySource === "page" ? `Page ${verifyPageIdx + 1} Batch` : "Full PDF Bulk Batch"}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-zinc-900 tracking-tight mt-1 flex items-center gap-2">
                    <Database size={18} className="text-amber-500" />
                    Intelligent Metadata Bulk Verification Studio
                  </h2>
                  <p className="text-xs text-zinc-500 font-medium">
                    Review and refine auto-detected Exam & Subject details. Low confidence cells (<span className="text-amber-600 font-bold font-mono">85%</span>) are highlighted in amber for visual auditing.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isAiRepairing}
                    onClick={handleAiFillMissingMetadata}
                    className={`p-2 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
                      isAiRepairing 
                        ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                        : "bg-indigo-650 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/10 cursor-pointer"
                    }`}
                  >
                    {isAiRepairing ? (
                      <>
                        <RefreshCw className="animate-spin" size={14} />
                        AI Repairing ({aiRepairProgress.current}/{aiRepairProgress.total})...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} className="text-amber-300" />
                        ✨ AI Fill Missing Metadata
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={saveVerifiedQuestionsToDb}
                    className="p-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition shadow-sm shadow-emerald-600/15 cursor-pointer"
                  >
                    Confirm & Save to Bank
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkVerifyScreen(false);
                      setVerifyQuestionsList([]);
                    }}
                    className="p-2 px-4 border border-zinc-200 hover:bg-zinc-100 text-zinc-500 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Table wrapper */}
              <div className="flex-1 overflow-auto p-6">
                <table className="w-full text-left border-collapse font-sans min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-400 text-[10px] uppercase font-black tracking-wider">
                      <th className="py-3 px-3 w-12">No</th>
                      <th className="py-3 px-3 w-72">Question Preview</th>
                      <th className="py-3 px-3 w-40">Subject</th>
                      <th className="py-3 px-3 w-40">Chapter</th>
                      <th className="py-3 px-3 w-40">Topic</th>
                      <th className="py-3 px-3 w-40">Exam Name</th>
                      <th className="py-3 px-3 w-32">Date</th>
                      <th className="py-3 px-3 w-32">Shift</th>
                      <th className="py-3 px-3 w-32">Difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifyQuestionsList.map((q, idx) => {
                      const confidence = q.confidenceScores || {};
                      
                      // Highlight handlers
                      const isLowSubject = !q.subject || (confidence.subject !== undefined && confidence.subject < 85);
                      const isLowChapter = !q.chapter || (confidence.chapter !== undefined && confidence.chapter < 85);
                      const isLowTopic = !q.topic || (confidence.topic !== undefined && confidence.topic < 85);
                      const isLowExam = !q.examName || (confidence.examName !== undefined && confidence.examName < 85);
                      const isLowDate = !q.examDate || (confidence.examDate !== undefined && confidence.examDate < 85);
                      const isLowShift = !q.shift || (confidence.shift !== undefined && confidence.shift < 85);
                      const isLowDifficulty = !q.difficultyLevel || (confidence.difficultyLevel !== undefined && confidence.difficultyLevel < 85);

                      return (
                        <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50/50 text-xs text-zinc-800 transition">
                          {/* No */}
                          <td className="py-4 px-3 font-mono font-bold text-zinc-400">
                            {idx + 1}
                          </td>

                          {/* Question Text preview */}
                          <td className="py-4 px-3 pr-6">
                            <div className="line-clamp-2 leading-relaxed text-zinc-700 font-medium" title={q.questionText}>
                              <MathRenderer text={q.questionText} />
                            </div>
                          </td>

                          {/* Subject */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowSubject ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.subject || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].subject = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowSubject ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowSubject ? "Low (" : ""}{confidence.subject !== undefined ? `${confidence.subject}%` : "Inferred"}{isLowSubject ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Chapter */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowChapter ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.chapter || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].chapter = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowChapter ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowChapter ? "Low (" : ""}{confidence.chapter !== undefined ? `${confidence.chapter}%` : "Inferred"}{isLowChapter ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Topic */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowTopic ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.topic || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].topic = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowTopic ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowTopic ? "Low (" : ""}{confidence.topic !== undefined ? `${confidence.topic}%` : "Inferred"}{isLowTopic ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Exam Name */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowExam ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.examName || q.exam || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].examName = e.target.value;
                                  copy[idx].exam = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowExam ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowExam ? "Low (" : ""}{confidence.examName !== undefined ? `${confidence.examName}%` : "Inferred"}{isLowExam ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Date */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowDate ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.examDate || q.date || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].examDate = e.target.value;
                                  copy[idx].date = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-medium bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowDate ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowDate ? "Low (" : ""}{confidence.examDate !== undefined ? `${confidence.examDate}%` : "Inferred"}{isLowDate ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Shift */}
                          <td className={`py-4 px-3 border-r border-zinc-100/50 ${isLowShift ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={q.shift || ""}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].shift = e.target.value;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-medium bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                                placeholder="..."
                              />
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowShift ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {isLowShift ? "Low (" : ""}{confidence.shift !== undefined ? `${confidence.shift}%` : "Inferred"}{isLowShift ? ")" : ""}
                              </span>
                            </div>
                          </td>

                          {/* Difficulty */}
                          <td className={`py-4 px-3 ${isLowDifficulty ? "bg-amber-50/40 border-l-2 border-l-amber-400" : ""}`}>
                            <div className="space-y-1">
                              <select
                                value={q.difficultyLevel || q.difficulty || "Medium"}
                                onChange={(e) => {
                                  const copy = [...verifyQuestionsList];
                                  copy[idx].difficultyLevel = e.target.value;
                                  copy[idx].difficulty = e.target.value as any;
                                  setVerifyQuestionsList(copy);
                                }}
                                className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-zinc-200 focus:border-amber-500 py-0.5 outline-hidden"
                              >
                                <option value="Easy">Easy</option>
                                <option value="Medium">Medium</option>
                                <option value="Hard">Hard</option>
                              </select>
                              <span className={`text-[9px] font-bold font-mono px-1 rounded inline-block ${
                                isLowDifficulty ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-50"
                              }`}>
                                {confidence.difficultyLevel !== undefined ? `${confidence.difficultyLevel}%` : "Inferred"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RENDER DYNAMIC CANVAS EDITING POPUP SCREEN */}
      {paintTargetIndex && (
        <ImagePainterEditor
          imageUrl={
            paintTargetIndex.source === "extract"
              ? extractedQuestions[activePageIdx]?.[paintTargetIndex.qIdx]?.imageUrl || extractedQuestions[activePageIdx]?.[paintTargetIndex.qIdx]?.imageUrl || pdfPages[activePageIdx] || ""
              : bankQuestions[paintTargetIndex.qIdx]?.imageUrl || ""
          }
          onSave={handleCanvasSaved}
          onClose={() => setPaintTargetIndex(null)}
        />
      )}

      {/* CSV UPLOAD MODAL */}
      {showCsvModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 font-sans">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-50 rounded-2xl shadow-xl border border-zinc-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-zinc-200 bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2 tracking-tight">
                  <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-600">
                    <FileSpreadsheet size={16} />
                  </div>
                  CSV Configuration & Upload
                </h3>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-500 hover:text-zinc-900 transition outline-hidden cursor-pointer">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto w-full max-w-full">
              
              {/* MODAL Tabs for Import Source */}
              <div className="bg-zinc-100 p-1.5 rounded-2xl flex gap-1 justify-center w-fit mx-auto">
                <button
                  type="button"
                  onClick={() => setImporterMode("csv")}
                  className={`flex-initial px-6 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    importerMode === "csv" 
                      ? "bg-white text-zinc-950 shadow-xs" 
                      : "text-zinc-500 hover:text-zinc-850"
                  }`}
                >
                  📥 Bulk CSV Upload
                </button>
                <button
                  type="button"
                  onClick={() => setImporterMode("single")}
                  className={`flex-initial px-6 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    importerMode === "single" 
                      ? "bg-white text-zinc-950 shadow-xs" 
                      : "text-zinc-500 hover:text-zinc-850"
                  }`}
                >
                  🔮 AI Single Parser Form
                </button>
              </div>

              {/* TAB 1: CSV Bulk Uploader */}
              {importerMode === "csv" && (
                <div className="space-y-4">
                  {/* Stages Timeline Navigation bar */}
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-3 mb-4 select-none">
                    {[
                      { num: 1, title: "Stage 1: Setup Meta" },
                      { num: 2, title: "Stage 2: Upload CSV" },
                      { num: 3, title: "Stage 3: Preview & Confirm" }
                    ].map((st) => {
                      const isDone = csvUploadStage > st.num;
                      const isActive = csvUploadStage === st.num;
                      const canClick = 
                        st.num === 1 || 
                        (st.num === 2 && isCsvFormValid) || 
                        (st.num === 3 && isCsvFormValid && csvUploadedQuestions.length > 0);
                      
                      return (
                        <div key={st.num} className="flex-1 flex items-center gap-1.5 last:flex-initial">
                          <button
                            type="button"
                            disabled={!canClick}
                            onClick={() => setCsvUploadStage(st.num)}
                            className={`flex items-center gap-1.5 text-left text-[11px] font-black transition cursor-pointer disabled:cursor-not-allowed select-none ${
                              isActive ? "text-zinc-955 font-black" : isDone ? "text-emerald-600" : "text-zinc-400 font-bold"
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition ${
                              isActive 
                                ? "bg-amber-500 text-zinc-950 ring-2 ring-amber-500/20" 
                                : isDone 
                                  ? "bg-emerald-500 text-white" 
                                  : "bg-zinc-200 text-zinc-500"
                            }`}>
                              {isDone ? "✓" : st.num}
                            </span>
                            <span className="hidden md:inline">{st.title}</span>
                          </button>
                          {st.num < 3 && (
                            <div className={`h-0.5 flex-1 mx-2 rounded-full hidden sm:block ${isDone ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* STAGE 1: METADATA DEFAULTS COVERS */}
                  {csvUploadStage === 1 && (
                    <div className="space-y-4">
                      <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-4">
                        <div>
                          <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5 select-none">
                            <HelpCircle size={14} className="text-amber-600 animate-pulse" />
                            Stage 1: Select Question Type & Pre-fill Global Defaults
                          </h4>
                          <p className="text-[11px] text-amber-700/80 font-semibold mt-0.5 select-none">
                            Define if you are importing Past Year Questions (PYQs) or Practice MCQs, and pre-fill core fields automatically to ensure pristine database categorization.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 select-none">
                          <label className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-zinc-200 hover:border-amber-500 bg-white cursor-pointer transition shadow-xs">
                            <input 
                              type="radio" 
                              name="stagingCsvTypeModal" 
                              checked={csvUploadType === "pyq"} 
                              onChange={() => setCsvUploadType("pyq")}
                              className="mt-1 text-amber-500 focus:ring-amber-500 h-4 w-4 shrink-0"
                            />
                            <div>
                              <span className="text-xs font-extrabold text-zinc-955 block">Past Year Paper MCQ (PYQ)</span>
                              <span className="text-[10px] text-zinc-500 font-semibold leading-relaxed block mt-0.5">Pre-fills shift patterns, real exam years, specific dates and official year attributes instantly.</span>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-zinc-200 hover:border-amber-500 bg-white cursor-pointer transition shadow-xs">
                            <input 
                              type="radio" 
                              name="stagingCsvTypeModal" 
                              checked={csvUploadType === "new_mcq"} 
                              onChange={() => setCsvUploadType("new_mcq")}
                              className="mt-1 text-amber-500 focus:ring-amber-500 h-4 w-4 shrink-0"
                            />
                            <div>
                              <span className="text-xs font-extrabold text-zinc-955 block">New Quality MCQ (Practice Set)</span>
                              <span className="text-[10px] text-zinc-500 font-semibold leading-relaxed block mt-0.5">Creates standard practice entries with mock attributes, difficulty tags and custom topics.</span>
                            </div>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Org</label>
                            <input 
                              value={csvPreFillMeta.org || ""}
                              onChange={e => setCsvPreFillMeta(prev => ({ ...prev, org: e.target.value }))}
                              placeholder="Org (e.g. SSC)" 
                              className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl outline-hidden focus:border-amber-500 bg-white text-zinc-850 font-extrabold shadow-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Exam</label>
                            <input 
                              value={csvPreFillMeta.examName}
                              onChange={e => setCsvPreFillMeta(prev => ({ ...prev, examName: e.target.value }))}
                              placeholder="Exam (e.g. CGL)" 
                              className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl outline-hidden focus:border-amber-500 bg-white text-zinc-850 font-extrabold shadow-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Question Type</label>
                            <input 
                              value={csvPreFillMeta.questionType || ""}
                              onChange={e => setCsvPreFillMeta(prev => ({ ...prev, questionType: e.target.value }))}
                              placeholder="Type (e.g. PYQs)" 
                              className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl outline-hidden focus:border-amber-500 bg-white text-zinc-850 font-extrabold shadow-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Date with Year</label>
                            <input 
                              type="date"
                              value={csvPreFillMeta.examDate}
                              onChange={e => setCsvPreFillMeta(prev => ({ ...prev, examDate: e.target.value }))}
                              className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl outline-hidden focus:border-amber-500 bg-white text-zinc-850 font-extrabold shadow-xs shadow-zinc-100"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">Shift</label>
                            <select
                              value={csvPreFillMeta.shift}
                              onChange={e => setCsvPreFillMeta(prev => ({ ...prev, shift: e.target.value }))}
                              className="w-full text-xs p-2.5 border border-zinc-250 rounded-xl outline-hidden focus:border-amber-500 bg-white text-zinc-850 font-extrabold shadow-xs shadow-zinc-100 cursor-pointer"
                            >
                              <option value="Shift 1">Shift 1</option>
                              <option value="Shift 2">Shift 2</option>
                              <option value="Shift 3">Shift 3</option>
                              <option value="Shift 4">Shift 4</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center select-none pt-2">
                        <p className="text-[10px] text-zinc-400 font-bold">
                          {!isCsvFormValid && "⚠️ Setup all required credentials to trigger CSV file selection state."}
                        </p>
                        <button
                          type="button"
                          onClick={() => setCsvUploadStage(2)}
                          disabled={!isCsvFormValid}
                          className={`font-black text-xs py-2.5 px-6 rounded-xl transition shadow-xs flex items-center justify-center gap-2 select-none ${
                            !isCsvFormValid ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600 text-zinc-950 cursor-pointer"
                          }`}
                        >
                          Next: Upload CSV File
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 2: UPLOAD CSV FILE SHAPE */}
                  {csvUploadStage === 2 && (
                    <div className="space-y-4">
                      {/* File Input container */}
                      <div className="bg-white p-6 sm:p-8 rounded-xl sm:rounded-2xl border border-dashed border-zinc-300 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
                        <div className="p-3 bg-amber-500/10 text-amber-600 rounded-full shadow-inner">
                          <FileSpreadsheet size={28} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-zinc-900 mb-1">Stage 2: Select & Process CSV File</h3>
                          <p className="text-[11px] text-zinc-500 font-semibold max-w-md mx-auto">
                            Ensure headers match correctly: <code className="bg-zinc-100 p-0.5 px-1 rounded text-zinc-700">question_en/question_hi, option1_en, answer, solution_en</code>, etc.
                          </p>
                        </div>
                        
                        <label className={`mt-2 cursor-pointer`}>
                          <span className="font-black text-xs py-3 px-8 rounded-xl transition shadow-xs flex items-center justify-center gap-2 select-none bg-amber-500 hover:bg-amber-600 text-zinc-955">
                            Select CSV Sheet & Process
                          </span>
                          <input 
                            type="file" 
                            accept=".csv" 
                            onChange={handleCsvFileSelect} 
                            className="hidden" 
                          />
                        </label>

                        {csvUploadedQuestions.length > 0 && (
                          <div className="bg-emerald-50 text-emerald-800 p-2.5 px-4 rounded-xl text-[11px] font-bold border border-emerald-100/50 mt-2 select-none">
                            ✓ Currently Parsed: {csvUploadedQuestions.length} Questions loaded from latest import
                          </div>
                        )}

                        {csvFileError && (
                          <p className="text-xs text-rose-600 font-bold flex items-center gap-1.5 justify-center bg-rose-50 p-3 rounded-lg border border-rose-100 max-w-md w-full mt-2">
                            <AlertCircle size={14} className="shrink-0" />
                            <span className="text-left">{csvFileError}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between items-center select-none pt-2">
                        <button
                          type="button"
                          onClick={() => setCsvUploadStage(1)}
                          className="px-5 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-black text-xs rounded-xl cursor-pointer transition select-none"
                        >
                          Back to Metadata
                        </button>
                        <button
                          type="button"
                          onClick={() => setCsvUploadStage(3)}
                          disabled={csvUploadedQuestions.length === 0}
                          className={`font-black text-xs py-2.5 px-6 rounded-xl transition shadow-xs flex items-center justify-center gap-2 select-none ${
                            csvUploadedQuestions.length === 0 ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600 text-zinc-955 cursor-pointer"
                          }`}
                        >
                          Next: Preview & Store ({csvUploadedQuestions.length})
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 3: PREVIEW & STORE SHAPE */}
                  {csvUploadStage === 3 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="bg-white p-4 sm:p-5 border border-zinc-200 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center select-none">
                          <div>
                            <h4 className="text-xs font-black text-zinc-900">Stage 3: Verify Mapped Question Rows ({csvUploadedQuestions.length})</h4>
                            <p className="text-[10px] text-zinc-550 font-semibold mt-0.5">Please review your structured layout before exporting into the importing area logs.</p>
                          </div>
                        </div>

                        <div className="max-h-72 overflow-y-auto overflow-x-auto text-[11px] rounded-xl border border-zinc-200 bg-zinc-50/50">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-100/80 border-b border-zinc-200 font-extrabold text-zinc-500 uppercase tracking-wider text-[9px] select-none sticky top-0">
                                <th className="p-2.5 pl-4">Q. Text Preview</th>
                                <th className="p-2.5">Options</th>
                                <th className="p-2.5 text-center">Ans</th>
                                <th className="p-2.5">Category</th>
                                <th className="p-2.5 text-right pr-4">Exam Detail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/60 bg-white">
                              {csvUploadedQuestions.map((q, idx) => (
                                <tr key={idx} className="hover:bg-zinc-50/40 font-medium text-zinc-700">
                                  <td className="p-2.5 pl-4 max-w-sm">
                                    <span className="font-extrabold text-zinc-900 block truncate">{q.questionText}</span>
                                    {q.question_hin && <span className="text-[10px] text-zinc-500 block truncate">{q.question_hin}</span>}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex gap-1">
                                      {q.options.map((opt, oIdx) => (
                                        <span key={oIdx} className="bg-zinc-100 border border-zinc-200 text-[8px] font-black px-1 rounded">
                                          {opt.label}: {opt.text || "Empty"}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className="bg-emerald-100 text-emerald-800 rounded font-black px-1.5 py-0.5">{q.answer}</span>
                                  </td>
                                  <td className="p-2.5">
                                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold block w-fit truncate max-w-24">{q.subject || csvPreFillMeta.subject || "N/A"}</span>
                                  </td>
                                  <td className="p-2.5 text-right pr-4 font-bold text-zinc-500">
                                    <span className="text-zinc-850 block">{q.examName || csvPreFillMeta.examName}</span>
                                    {q.examYear && <span className="text-[9px] block">{q.examYear}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-3 border-t border-zinc-200 select-none">
                        <button
                          type="button"
                          onClick={() => setCsvUploadStage(2)}
                          className="px-5 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-black text-xs rounded-xl cursor-pointer transition text-center"
                        >
                          Back to Upload
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCsvUploadedQuestions([]);
                              setCsvUploadStage(1);
                            }}
                            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl cursor-pointer transition text-center"
                          >
                            Clear & Reset
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await saveAllCsvQuestionsToDb();
                              setShowCsvModal(false);
                            }}
                            disabled={isImportingCsv}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-2.5 px-6 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm justify-center"
                          >
                            {isImportingCsv ? <RefreshCw className="animate-spin" size={13} /> : <Check size={13} />}
                            Store to Staging Area ({csvUploadedQuestions.length} Questions)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: AI SINGLE QUESTION PARSER */}
              {importerMode === "single" && (
                <div className="grid grid-cols-1 gap-6">
                  {/* Top: Input Textbox */}
                  <div className="space-y-2.5 flex flex-col">
                    <div className="flex-1 space-y-1">
                      <label htmlFor="staging-raw-paste" className="text-[10px] font-black uppercase text-zinc-500 tracking-wider flex items-center justify-between">
                        <span>Raw Messy Question Text</span>
                        <span className="text-[9px] text-amber-600 font-extrabold">SUPPORT HINDI & ENGLISH</span>
                      </label>
                      <textarea
                        id="staging-raw-paste"
                        value={rawPasteText}
                        onChange={e => setRawPasteText(e.target.value)}
                        placeholder="Paste unformatted questions from web page, PDF snip or whatsapp log...
e.g. Q.1 Carbon has how many allotropes? (a) two (b) three (c) four (d) five"
                        className="w-full h-32 sm:h-40 text-xs p-2.5 sm:p-3.5 border border-zinc-250 hover:border-zinc-350 rounded-xl sm:rounded-2xl outline-hidden font-semibold bg-white text-zinc-850 resize-none font-mono focus:ring-1 focus:ring-amber-500/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleParseRawQuestionWithAi}
                      disabled={isParsingRawText || !rawPasteText.trim()}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs select-none text-xs"
                    >
                      {isParsingRawText ? <RefreshCw className="animate-spin" size={12} /> : <Wand2 size={12} />}
                      AI Intelligent Autotag & Bilingual Translate
                    </button>
                  </div>

                  {/* Bottom: Parsed Fields Editor Form */}
                  <div className="bg-white border border-zinc-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-2xs space-y-3 sm:space-y-4">
                    <h5 className="text-xs font-black text-zinc-955 border-b border-zinc-100 pb-2 flex items-center justify-between select-none">
                      <span>Parsed Results Form Editor</span>
                      <span className="bg-emerald-500/15 text-emerald-805 text-[9px] px-2 py-0.5 rounded-md uppercase font-black">Interactive Form</span>
                    </h5>

                    <div className="space-y-3 sm:space-y-4 max-h-[350px] overflow-y-auto pr-1">
                      
                      {/* Bilingual translation fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">English Question Text</label>
                          <textarea
                            value={singleImportForm.questionText}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, questionText: e.target.value }))}
                            className="w-full h-16 text-xs p-2 border border-zinc-200 rounded-lg outline-hidden font-medium"
                          />
                          {singleImportForm.questionText && (
                            <div className="p-1 px-1.5 bg-zinc-50 border border-zinc-150 rounded text-[10px] font-medium text-zinc-650 overflow-x-auto">
                              <MathRenderer text={singleImportForm.questionText} />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Hindi Question Text (optional)</label>
                          <textarea
                            value={singleImportForm.question_hin || ""}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, question_hin: e.target.value }))}
                            className="w-full h-16 text-xs p-2 border border-zinc-200 rounded-lg outline-hidden font-medium"
                          />
                          {singleImportForm.question_hin && (
                            <div className="p-1 px-1.5 bg-zinc-50 border border-zinc-150 rounded text-[10px] font-medium text-zinc-650 overflow-x-auto">
                              <MathRenderer text={singleImportForm.question_hin} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Options mapping */}
                      <div className="space-y-1.5 select-none">
                        <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Question Options and Answer</label>
                        <div className="grid grid-cols-2 gap-3">
                          {singleImportForm.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <span className="text-xs font-black p-2 bg-amber-500/10 text-amber-700 border border-amber-500/10 rounded-lg w-8 h-8 flex items-center justify-center">
                                {opt.label}
                              </span>
                              <input
                                value={opt.text}
                                onChange={e => setSingleImportForm(prev => {
                                  const opts = [...prev.options];
                                  opts[oIdx].text = e.target.value;
                                  return { ...prev, options: opts };
                                })}
                                className="flex-1 text-xs p-1.5 border border-zinc-200 rounded-lg outline-hidden text-zinc-800 font-medium"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Options metadata */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Correct Option</label>
                          <select
                            value={singleImportForm.answer}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, answer: e.target.value as "A"|"B"|"C"|"D" }))}
                            className="w-full text-xs p-2 border border-zinc-200 rounded-lg outline-hidden bg-white text-zinc-800 font-black h-9"
                          >
                            <option value="A">Option A</option>
                            <option value="B">Option B</option>
                            <option value="C">Option C</option>
                            <option value="D">Option D</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Subject</label>
                          <input
                            value={singleImportForm.subject || ""}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, subject: e.target.value }))}
                            className="w-full text-xs p-2 border border-zinc-200 rounded-lg outline-hidden font-medium"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Exam Name (opt)</label>
                          <input
                            value={singleImportForm.examName || ""}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, examName: e.target.value }))}
                            className="w-full text-xs p-2 border border-zinc-200 rounded-lg outline-hidden font-medium text-amber-900 bg-amber-50"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Exam Year (opt)</label>
                          <input
                            value={singleImportForm.examYear || ""}
                            onChange={e => setSingleImportForm(prev => ({ ...prev, examYear: e.target.value }))}
                            className="w-full text-xs p-2 border border-zinc-200 rounded-lg outline-hidden font-medium text-amber-900 bg-amber-50"
                          />
                        </div>
                      </div>

                    </div>

                    <div className="pt-2 border-t border-zinc-100 flex justify-end gap-2">
                       <button
                        type="button"
                        onClick={() => setSingleImportForm({ ...singleImportForm, questionText: "", question_hin: "", answer: "A", subject: "", examName: "", examYear: "", options: [{label: "A", text: ""}, {label: "B", text: ""}, {label: "C", text: ""}, {label: "D", text: ""}] })}
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold text-xs py-2 px-4 flex items-center justify-center gap-1.5 rounded-xl transition cursor-pointer shadow-xs"
                      >
                        <Trash2 size={13} /> Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveSingleImportedQuestion();
                          setShowCsvModal(false); // Auto close after placing into staging
                        }}
                        disabled={isImportingCsv || !singleImportForm.questionText.trim()}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-2 px-6 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isImportingCsv ? <RefreshCw className="animate-spin" size={13} /> : <Check size={13} />}
                        Store to Staging Area
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </div>
      )}

      {/* GLOBAL AI PROGRESS MONITOR DRAWER */}
      <AnimatePresence>
        {aiProgressMonitor && aiProgressMonitor.isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-zinc-50 h-full shadow-2xl relative overflow-hidden w-full max-w-sm flex flex-col font-sans border-l border-amber-500/20"
            >
              <div className="p-5 border-b border-zinc-200 flex justify-between items-center bg-white shadow-xs z-10">
                <div className="flex items-center gap-2 text-amber-600 font-black">
                  <Sparkles size={18} className="animate-pulse" />
                  <span className="text-sm uppercase tracking-wider">{aiProgressMonitor.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiProgressMonitor(prev => prev ? { ...prev, isOpen: false } : null)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* Progress Ring / Bar */}
                <div className="bg-white p-5 rounded-2xl border border-zinc-150 shadow-sm text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 border-4 border-amber-200 text-amber-600">
                    {aiProgressMonitor.current >= aiProgressMonitor.total ? (
                      <CheckCircle2 size={32} />
                    ) : (
                      <RefreshCw size={28} className="animate-spin" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-zinc-800">
                      Processing {aiProgressMonitor.current} of {aiProgressMonitor.total}
                    </h3>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Questions</p>
                  </div>
                  
                  <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, (aiProgressMonitor.current / aiProgressMonitor.total) * 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Current Item Processing */}
                <div className="bg-white p-4 rounded-xl border border-zinc-150 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <h4 className="text-[10px] font-black uppercase text-blue-500 tracking-wider">Live Target</h4>
                  <p className="text-xs text-zinc-600 font-medium leading-relaxed italic line-clamp-3">
                    "{aiProgressMonitor.currentTextSnippet}"
                  </p>
                </div>

                {/* System Logs */}
                <div className="bg-zinc-900 rounded-xl p-4 shadow-inner space-y-2">
                  <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider flex items-center gap-1.5 mb-3">
                    <Terminal size={12} /> Console Output
                  </h4>
                  <div className="space-y-1.5 flex flex-col font-mono text-[10px] text-emerald-400">
                    {aiProgressMonitor.logs.slice(-6).map((log, i) => (
                      <div key={i} className="flex gap-2 opacity-90 truncate">
                        <span className="text-zinc-500 shrink-0">&gt;</span>
                        <span className="truncate">{log}</span>
                      </div>
                    ))}
                    {aiProgressMonitor.current < aiProgressMonitor.total && (
                      <div className="flex gap-2 animate-pulse mt-1">
                        <span className="text-zinc-500">&gt;</span>
                        <span className="text-amber-400">waiting for completion...</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GLOBAL CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-zinc-200 max-w-sm w-full overflow-hidden"
            >
              <div className="p-5 sm:p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-zinc-900 leading-tight">
                    {confirmDialog.title}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium mt-2 leading-relaxed">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>
              <div className="flex border-t border-zinc-100 bg-zinc-50">
                <button
                  type="button"
                  onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                  className="flex-1 py-3.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition border-r border-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDialog({ ...confirmDialog, isOpen: false });
                    confirmDialog.onConfirm();
                  }}
                  className="flex-1 py-3.5 text-xs font-black text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition"
                >
                  {confirmDialog.confirmText || "Yes, Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Custom simple fallback close SVG
function X({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
