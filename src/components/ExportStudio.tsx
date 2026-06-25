import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  FileText, 
  Database, 
  Download, 
  FileCode, 
  Copy, 
  Sparkles, 
  Check, 
  HelpCircle, 
  Maximize2, 
  Minimize2, 
  Languages, 
  QrCode, 
  Printer, 
  Tag, 
  Book,
  Undo,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { McqQuestion, OptionArrangement, OptionPatternFormat, AnswerLength, stripQuestionNumberPrefix, stripOptionPrefix } from "../types";
import { generateDocx } from "../services/docxService";
import { db, auth } from "../services/firebase";
import { collection, addDoc, query, getDocs } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export default function ExportStudio() {
  const [user] = useAuthState(auth);
  const location = useLocation();
  const navigate = useNavigate();

  // Load questions from router state OR localStorage fallback
  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [fileName, setFileName] = useState("examination_paper");

  useEffect(() => {
    let qs: McqQuestion[] = [];
    if (location.state?.questions) {
      qs = location.state.questions;
    } else {
      const stored = localStorage.getItem("veda_export_questions");
      if (stored) {
        try {
          qs = JSON.parse(stored);
        } catch (_) {}
      }
    }
    
    // Fallback default mock questions if none are loaded
    if (!qs || qs.length === 0) {
      qs = [
        {
          id: "m1",
          questionText: "What is the primary gas found in Earth's atmosphere? / पृथ्वी के वायुमंडल में पाई जाने वाली प्राथमिक गैस कौन सी है?",
          options: [
            { label: "A", text: "Oxygen / ऑक्सीजन" },
            { label: "B", text: "Nitrogen / नाइट्रोजन" },
            { label: "C", text: "Carbon Dioxide / कार्बन डाइऑक्साइड" },
            { label: "D", text: "Argon / आर्गन" }
          ],
          answer: "B",
          solution: "Nitrogen makes up approximately 78% of the Earth's atmosphere. / नाइट्रोजन पृथ्वी के वायुमंडल का लगभग 78% हिस्सा बनाती है।",
          subject: "Science",
          difficulty: "Easy"
        },
        {
          id: "m2",
          questionText: "Which formula represents Newton's Second Law of Motion? / कौन सा सूत्र न्यूटन के गति के दूसरे नियम को दर्शाता है?",
          options: [
            { label: "A", text: "E = mc² / ई = एमसी²" },
            { label: "B", text: "F = ma / एफ = एमए" },
            { label: "C", text: "v = u + at / वी = यू + एटी" },
            { label: "D", text: "p = mv / पी = एमवी" }
          ],
          answer: "B",
          solution: "Newton's second law states that Force is equal to mass multiplied by acceleration (F = ma). / न्यूटन का दूसरा नियम बताता है कि बल द्रव्यमान और त्वरण के गुणनफल के बराबर होता है (एफ = एमए)।",
          subject: "Physics",
          difficulty: "Medium"
        }
      ];
    }
    // Deeply sanitize questions to replace any escaped double-newlines or double-slashes before setting state
    const sanitizedQs = qs.map((q) => {
      const cleanField = (s: string | undefined): string => {
        if (!s) return "";
        return s.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      };
      return {
        ...q,
        questionText: cleanField(q.questionText),
        solution: cleanField(q.solution),
        options: q.options ? q.options.map((opt) => ({
          ...opt,
          text: cleanField(opt.text)
        })) : []
      };
    });
    setQuestions(sanitizedQs);

    const storedFileName = localStorage.getItem("veda_export_filename") || "examination_paper";
    setFileName(storedFileName);
  }, [location]);

  // View state: export format (pdf print vs docx vs raw data)
  const [activeFormat, setActiveFormat] = useState<"pdf" | "docx">("pdf");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  // Column 1: PDF Configuration States
  const [fontSize, setFontSize] = useState(13);
  const [lineSpacing, setLineSpacing] = useState(12);
  const [optionSpacing, setOptionSpacing] = useState(10);
  const [answerBold, setAnswerBold] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [showRelevantQs, setShowRelevantQs] = useState(false);
  const [questionOpacity, setQuestionOpacity] = useState(true);
  const [optionOpacity, setOptionOpacity] = useState(true);
  const [logo1, setLogo1] = useState("VedaTool Board");

  // Advanced Export Settings for 3-Card structure
  const [optionArrangement, setOptionArrangement] = useState<OptionArrangement>(OptionArrangement.VERTICAL);
  const [wordFontFamily, setWordFontFamily] = useState("Arial (Clean Modern)");
  const [includeNameRoll, setIncludeNameRoll] = useState(true);
  const [extractAnswerKeys, setExtractAnswerKeys] = useState(true);
  const [answerKeyStyle, setAnswerKeyStyle] = useState("correct_only");
  const [questionWeight, setQuestionWeight] = useState("700");
  const [newHeader, setNewHeader] = useState(true);
  const [logo2, setLogo2] = useState("");

  // Column 2: General Switches & Layout Configurations
  const [showAnswerWidget, setShowAnswerWidget] = useState(false);
  const [showQuestionStatement, setShowQuestionStatement] = useState(true);
  const [showOptionItems, setShowOptionItems] = useState(true);
  const [showExplanationBox, setShowExplanationBox] = useState(true);
  const [showSolution, setShowSolution] = useState(true);
  const [bilingualPdf, setBilingualPdf] = useState(true);
  const [previousYearTag, setPreviousYearTag] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [showAnswerWithDesc, setShowAnswerWithDesc] = useState(true);
  const [optionWeight, setOptionWeight] = useState("600");
  const [solutionWeight, setSolutionWeight] = useState("500");
  const [subjectFilter, setSubjectFilter] = useState("All");

  // Specific Question Prefix settings
  const [exportPrefix, setExportPrefix] = useState("Q.%d.");
  const [optionPattern, setOptionPattern] = useState<OptionPatternFormat>(OptionPatternFormat.A_B_C_D);
  const [pageSize, setPageSize] = useState<"A4" | "Letter">("A4");
  const [marginType, setMarginType] = useState<"narrow" | "normal" | "wide">("narrow");
  const [includeSerialNumber, setIncludeSerialNumber] = useState(true);
  const [showMcqPrefixes, setShowMcqPrefixes] = useState(false);

  // Column 3: Specific Question Config
  const [targetQuestionIdx, setTargetQuestionIdx] = useState("1");
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({}); // Mapping question index -> Section header name
  const [specificFontSizes, setSpecificFontSizes] = useState<Record<string, number>>({});
  const [specificSpacings, setSpecificSpacings] = useState<Record<string, number>>({});
  const [specificOptionSpacings, setSpecificOptionSpacings] = useState<Record<string, number>>({});

  // Zoom state for preview pane inspector & gesture handler
  const [zoom, setZoom] = useState(100);
  const previewOuterRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const element = previewOuterRef.current;
    if (!element) return;

    let initialDistance = 0;
    let initialZoomVal = 100;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleWheelOrPinch = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY;
        setZoom((prev) => {
          const next = prev - delta * 0.4;
          return Math.max(50, Math.min(250, Math.round(next)));
        });
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance = getDistance(e.touches);
        initialZoomVal = zoomRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance > 0) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches);
        if (currentDistance > 0) {
          const factor = currentDistance / initialDistance;
          setZoom(() => {
            const next = initialZoomVal * factor;
            return Math.max(50, Math.min(250, Math.round(next)));
          });
        }
      }
    };

    const handleTouchEnd = () => {
      initialDistance = 0;
    };

    element.addEventListener("wheel", handleWheelOrPinch, { passive: false });
    element.addEventListener("touchstart", handleTouchStart, { passive: false });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);

    return () => {
      element.removeEventListener("wheel", handleWheelOrPinch);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Column 4: QR Code Data & Custom Colors
  const [qrAction, setQrAction] = useState("Save Set");
  const [qrSetId, setQrSetId] = useState("SET-827364");
  const [qrGeneratedData, setQrGeneratedData] = useState("Save Set ID: SET-827364");
  const [headerBgColor, setHeaderBgColor] = useState("#FF6B2B");
  const [footerBgColor, setFooterBgColor] = useState("#111111");
  const [questionColor, setQuestionColor] = useState("#FF6B2B");
  const [optionColor, setOptionColor] = useState("#555555");
  const [numberColor, setNumberColor] = useState("#111111");

  // Local document state
  const [pageHeaderTitle, setPageHeaderTitle] = useState("EXAMINATION TEST PAPER");
  const [pageHeaderSubtitle, setPageHeaderSubtitle] = useState("Duration: 3 Hours | Total Marks: 100");

  const getFontFamilyCss = (font: string) => {
    if (font.includes("Times")) {
      return "'Times New Roman', Times, serif, 'Noto Sans Devanagari'";
    } else if (font.includes("Courier")) {
      return "'Courier New', Courier, monospace, 'Noto Sans Devanagari'";
    } else if (font.includes("Calibri")) {
      return "Calibri, Candara, sans-serif, 'Noto Sans Devanagari'";
    } else {
      return "Arial, Helvetica, sans-serif, 'Noto Sans Devanagari'";
    }
  };

  const getOptionGridClass = (arrangement: OptionArrangement) => {
    switch (arrangement) {
      case OptionArrangement.HORIZONTAL:
        return "mt-2 pl-6 grid grid-cols-1 sm:grid-cols-4 gap-2";
      case OptionArrangement.GRID:
        return "mt-2 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2";
      case OptionArrangement.VERTICAL:
      default:
        return "mt-2 pl-6 grid grid-cols-1 gap-1.5";
    }
  };

  const getWordOptionGridClass = (arrangement: OptionArrangement) => {
    switch (arrangement) {
      case OptionArrangement.HORIZONTAL:
        return "pl-4 mt-1.5 grid grid-cols-1 sm:grid-cols-4 gap-2 font-serif text-zinc-800 text-[11.5px]";
      case OptionArrangement.GRID:
        return "pl-4 mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 font-serif text-zinc-800 text-[11.5px]";
      case OptionArrangement.VERTICAL:
      default:
        return "pl-4 mt-1.5 space-y-1 font-serif text-zinc-800 text-[11.5px]";
    }
  };

  const showLocalToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  const cleanEol = (s: string | undefined): string => {
    if (!s) return "";
    return s.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  };

  // Helper function to extract bilingual texts
  const getBilingualParts = (txt: string | undefined): { hi: string; en: string } => {
    if (!txt) return { hi: "", en: "" };
    const sanitizedVal = cleanEol(txt);
    if (sanitizedVal.includes(" / ")) {
      const parts = sanitizedVal.split(" / ");
      return { hi: parts[0]?.trim() || "", en: parts[1]?.trim() || "" };
    }
    return { hi: sanitizedVal, en: sanitizedVal };
  };

  // Setup QR codes
  const handleSetQr = () => {
    setQrGeneratedData(`${qrAction} Action | Set Code: ${qrSetId}`);
    showLocalToast("QR Code payload generated & applied to header.");
  };

  // Clear specific section headings
  const handleDeleteSection = (index: string) => {
    const nextOverrides = { ...sectionInputs };
    delete nextOverrides[index];
    setSectionInputs(nextOverrides);
    showLocalToast(`Section boundary removed.`);
  };

  // Available subjects for filtering
  const availableSubjects = Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))) as string[];

  // Filtered list
  const filteredQuestions = questions.filter((q) => {
    if (subjectFilter !== "All" && q.subject !== subjectFilter) return false;
    return true;
  });

  // Dynamic values helper per item (with specific overrides)
  const getItemFontSize = (idx: number) => {
    const key = String(idx + 1);
    return specificFontSizes[key] || fontSize;
  };

  const getItemSpacing = (idx: number) => {
    const key = String(idx + 1);
    return specificSpacings[key] || lineSpacing;
  };

  const getItemOptionSpacing = (idx: number) => {
    const key = String(idx + 1);
    return specificOptionSpacings[key] || optionSpacing;
  };

  // Build serial number label
  const getFormattedQuestionLabel = (index: number) => {
    if (!includeSerialNumber) {
      if (exportPrefix.includes("%d")) {
        let cleaned = exportPrefix.replace("%d", "");
        cleaned = cleaned.replace(/\.{2,}/g, ".");
        return cleaned;
      }
      return exportPrefix;
    }
    const num = index + 1;
    if (exportPrefix.includes("%d")) {
      return exportPrefix.replace("%d", String(num));
    }
    return `${exportPrefix} ${num}`;
  };

  // Option alphabet generator
  const getOptionLabelChar = (blockIdx: number, idx: number) => {
    switch (optionPattern) {
      case OptionPatternFormat.a_b_c_d:
        return String.fromCharCode(97 + idx); // a, b, c, d
      case OptionPatternFormat.NUM_1_2_3_4:
        return String(idx + 1);
      case OptionPatternFormat.ROMAN_i_ii_iii_iv:
        const romanLower = ["i", "ii", "iii", "iv", "v", "vi"];
        return romanLower[idx] || String(idx + 1);
      case OptionPatternFormat.ROMAN_I_II_III_IV:
        const romanUpper = ["I", "II", "III", "IV", "V", "VI"];
        return romanUpper[idx] || String(idx + 1);
      case OptionPatternFormat.A_B_C_D:
      default:
        return String.fromCharCode(65 + idx); // A, B, C, D
    }
  };

  // Print PDF
  const handlePrintPdf = () => {
    window.print();
  };

  // Raw plain text download
  const handleDownloadTxt = () => {
    if (filteredQuestions.length === 0) return;
    const formatted = filteredQuestions
      .map((q, idx) => {
        const qLabel = getFormattedQuestionLabel(idx);
        let output = `${qLabel} ${cleanEol(bilingualPdf ? q.questionText : getBilingualParts(q.questionText).hi)}\n`;
        q.options.forEach((opt, oIdx) => {
          const optLabel = getOptionLabelChar(idx, oIdx);
          output += `(${optLabel}) ${cleanEol(bilingualPdf ? opt.text : getBilingualParts(opt.text).hi)}\n`;
        });
        if (showSolution && q.answer) {
          output += `Answer Key: (${q.answer.toUpperCase()})\n`;
        }
        if (showSolution && q.solution) {
          output += `Explanation: ${cleanEol(bilingualPdf ? q.solution : getBilingualParts(q.solution).hi)}\n`;
        }
        return output;
      })
      .join("\n\n");

    const blob = new Blob([formatted], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}_mcqs.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showLocalToast("TXT Exam sheet downloaded.");
  };

  // JSON schema export
  const handleDownloadJson = () => {
    if (filteredQuestions.length === 0) return;
    const formatted = JSON.stringify(filteredQuestions, null, 2);
    const blob = new Blob([formatted], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}_mcqs.json`;
    link.click();
    URL.revokeObjectURL(url);
    showLocalToast("JSON Schema downloaded.");
  };

  // Export CSV
  const handleDownloadCSV = () => {
    if (filteredQuestions.length === 0) return;
    const headers = [
      "record_id", "question_no", "question_hin", "question_eng", "subject", "chapter",
      "option1_hin", "option1_eng", "option2_hin", "option2_eng", "option3_hin", "option3_eng", "option4_hin", "option4_eng", "option5_hin", "option5_eng",
      "answer", "solution_hin", "solution_eng", "set_name", "collection", "previous_of", "video", "type", "related_exam", "action", "current_status", "sync_code", "error_report", "error_description", "check box", "question_no copy"
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '""';
      return `"${str.replace(/"/g, '""').replace(/\n/g, '<br>')}"`;
    };

    const rows = filteredQuestions.map((q, idx) => {
      const qHi = q.question_hin || getBilingualParts(q.questionText).hi;
      const qEn = q.question_eng || getBilingualParts(q.questionText).en;
      
      const solRaw = q.solution || "";
      const solPart = showSolution ? {
        hi: q.solution_hin || getBilingualParts(solRaw).hi,
        en: q.solution_eng || getBilingualParts(solRaw).en
      } : { hi: "", en: "" };
      
      const getOptParts = (optIndex: number) => {
        const opt = q.options[optIndex];
        if (!opt) return { hi: "", en: "" };
        return {
           hi: opt.text_hin || getBilingualParts(opt.text).hi,
           en: opt.text_eng || getBilingualParts(opt.text).en
        };
      };

      const opt1 = getOptParts(0);
      const opt2 = getOptParts(1);
      const opt3 = getOptParts(2);
      const opt4 = getOptParts(3);
      const opt5 = getOptParts(4);

      const cleanAnswer = showSolution ? q.answer?.replace(/[\(\)\.]/g, "")?.toUpperCase() : "";

      return [
        "", // record_id
        idx + 1, // question_no
        escapeCsv(qHi), // question_hin
        escapeCsv(qEn), // question_eng
        escapeCsv(q.subject || "General Studies"), // subject
        escapeCsv(q.chapter || q.topic || ""), // chapter
        escapeCsv(opt1.hi), escapeCsv(opt1.en), 
        escapeCsv(opt2.hi), escapeCsv(opt2.en), 
        escapeCsv(opt3.hi), escapeCsv(opt3.en), 
        escapeCsv(opt4.hi), escapeCsv(opt4.en),
        escapeCsv(opt5.hi), escapeCsv(opt5.en),
        escapeCsv(cleanAnswer), // answer
        escapeCsv(solPart.hi), // solution_hin
        escapeCsv(solPart.en), // solution_eng
        escapeCsv(q.set_name || fileName || "Default Set"), // set_name
        escapeCsv(q.collection || fileName || ""), // collection
        escapeCsv(q.previous_of || q.year || ""), // previous_of
        escapeCsv(q.video || ""), // video
        escapeCsv(q.type || "Objective"), // type
        escapeCsv(q.related_exam || q.exam || ""), // related_exam
        "", // action
        escapeCsv(q.status || "Published"), // current_status
        "", // sync_code
        "", // error_report
        "", // error_description
        "", // check box
        escapeCsv(q.id) // question_no copy
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}_database_format.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showLocalToast("CSV Database package downloaded.");
  };

  // Download DOCX
  const handleDownloadDocx = async () => {
    if (filteredQuestions.length === 0) return;

    const elements = filteredQuestions.map((q, idx) => {
      const qPrefixLabel = getFormattedQuestionLabel(idx);
      const spacing = qPrefixLabel ? " " : "";
      
      // Select statement depending on bilingual setting
      let stmt = "";
      if (bilingualPdf) {
        if (q.question_hin && q.question_eng) {
          stmt = `${q.question_hin} / ${q.question_eng}`;
        } else {
          stmt = q.questionText;
        }
      } else {
        stmt = q.question_hin || getBilingualParts(q.questionText).hi;
      }

      let runText = `${qPrefixLabel}${spacing}${cleanEol(stmt)}\n`;
      q.options.forEach((opt, oIdx) => {
        const optLabel = getOptionLabelChar(idx, oIdx);
        let optTxt = "";
        if (bilingualPdf) {
          if (opt.text_hin && opt.text_eng) {
            optTxt = `${opt.text_hin} / ${opt.text_eng}`;
          } else {
            optTxt = opt.text;
          }
        } else {
          optTxt = opt.text_hin || getBilingualParts(opt.text).hi;
        }
        runText += `(${optLabel}) ${cleanEol(optTxt)}\n`;
      });

      if (showSolution && q.answer) {
        runText += `Code Answer Key: (${q.answer})\n`;
      }

      if (showSolution && q.solution) {
        let solTxt = "";
        if (bilingualPdf) {
          if (q.solution_hin && q.solution_eng) {
            solTxt = `${q.solution_hin} / ${q.solution_eng}`;
          } else {
            solTxt = q.solution || "";
          }
        } else {
          solTxt = q.solution_hin || getBilingualParts(q.solution).hi;
        }
        runText += `Explanation Elaboration: ${cleanEol(solTxt)}\n`;
      }

      return {
        type: "text" as const,
        content: runText,
        id: `el-${q.id}`,
      };
    });

    try {
      const blob = await generateDocx(elements, optionArrangement, {
        pageHeaderTitle,
        pageHeaderSubtitle,
        pageSize,
        fontFamily: wordFontFamily,
        marginType,
        showNameRollNoFields: includeNameRoll,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      showLocalToast("Microsoft Word DOCX files generated.");
    } catch (e) {
      console.error(e);
      alert("DOCX generation crash occurred.");
    }
  };

  // Push to Cloud Question Bank
  const handlePushToCollection = async () => {
    if (!user) {
      alert("Please login via Google Sign-In to sync questions to your Master Question Bank.");
      return;
    }
    if (filteredQuestions.length === 0) return;
    try {
      let maxQid = 100000;
      const bankQuery = query(collection(db, "question_bank"));
      const snap = await getDocs(bankQuery);
      if (!snap.empty) {
        const qids = snap.docs.map(doc => doc.data().qid).filter(v => typeof v === "number") as number[];
        if (qids.length > 0) {
          maxQid = Math.max(...qids);
        }
      }

      for (let i = 0; i < filteredQuestions.length; i++) {
        const mq = filteredQuestions[i];
        const newEntryId = Math.random().toString(36).substring(2, 11);
        const qidVal = maxQid + 1 + i;

        const statementParts = getBilingualParts(mq.questionText || "");
        const choice1Parts = getBilingualParts(mq.options[0]?.text || "");
        const choice2Parts = getBilingualParts(mq.options[1]?.text || "");
        const choice3Parts = getBilingualParts(mq.options[2]?.text || "");
        const choice4Parts = getBilingualParts(mq.options[3]?.text || "");
        const choice5Parts = getBilingualParts(mq.options[4]?.text || "");
        const explanationParts = getBilingualParts(mq.solution || "");

        const hasSlash = (mq.questionText || "").includes(" / ") || 
                         mq.options.some(opt => (opt.text || "").includes(" / "));

        const translation: any = {
          entry_id: newEntryId,
          qid: qidVal,
          statement_hi: mq.passageText ? `<div>${mq.passageText}</div><p>${statementParts.hi}</p>` : statementParts.hi,
          statement_en: mq.passageText ? `<div>${mq.passageText}</div><p>${statementParts.en}</p>` : statementParts.en,
          subject_tag: mq.subject || mq.topic || "General Studies",
          topic_tag: mq.chapter || mq.topic || "Mixed",
          choice1_hi: choice1Parts.hi,
          choice1_en: choice1Parts.en,
          choice2_hi: choice2Parts.hi,
          choice2_en: choice2Parts.en,
          choice3_hi: choice3Parts.hi,
          choice3_en: choice3Parts.en,
          choice4_hi: choice4Parts.hi,
          choice4_en: choice4Parts.en,
          choice5_hi: choice5Parts.hi,
          choice5_en: choice5Parts.en,
          correct_choice: mq.answer || "",
          explanation_hi: explanationParts.hi,
          explanation_en: explanationParts.en,
          question_type: mq.type === "MSQ" ? "MSQ" : "MCQ",
          publish_status: mq.status === "Published" ? "PUBLISHED_PRIVATE" : "DRAFT",
          difficulty: mq.difficulty === "Easy" ? "EASY" : mq.difficulty === "Hard" ? "HARD" : "MEDIUM",
          created_at: Date.now(),
          visibility: "PRIVATE",
          source: "SELF_CREATED",
          user_id: user.uid,
          is_bilingual: hasSlash,
          pack_name: mq.collection || fileName,
          exam_target: mq.exam || "",
          section_tag: mq.section || "",
          source_ref: mq.previous_of || ""
        };

        const parsedYear = mq.year ? parseInt(mq.year) : NaN;
        if (!isNaN(parsedYear)) {
          translation.exam_year = parsedYear;
        }

        // Deep/shallow clean any undefined properties before sending to Firestore
        const cleanPayload: any = {};
        Object.keys(translation).forEach((key) => {
          const val = translation[key];
          if (val !== undefined) {
            cleanPayload[key] = val;
          }
        });

        await addDoc(collection(db, "question_bank"), cleanPayload);
      }
      showLocalToast(`Successfully cataloged ${filteredQuestions.length} items to Master DB!`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to push documents to Cloud Firestore: " + err.message);
    }
  };

  // Copy structured exams content
  const handleCopyClipboard = () => {
    if (filteredQuestions.length === 0) return;
    const formatted = filteredQuestions
      .map((q, idx) => {
        const qLabel = getFormattedQuestionLabel(idx);
        let output = `${qLabel} ${cleanEol(bilingualPdf ? q.questionText : getBilingualParts(q.questionText).hi)}\n`;
        q.options.forEach((opt, oIdx) => {
          const optLabel = getOptionLabelChar(idx, oIdx);
          output += `(${optLabel}) ${cleanEol(bilingualPdf ? opt.text : getBilingualParts(opt.text).hi)}\n`;
        });
        if (showSolution && q.answer) {
          output += `Answer: (${q.answer})\n`;
        }
        if (showSolution && q.solution) {
          output += `Explanation: ${cleanEol(bilingualPdf ? q.solution : getBilingualParts(q.solution).hi)}\n`;
        }
        return output;
      })
      .join("\n\n");

    navigator.clipboard.writeText(formatted);
    showLocalToast("Exam sheet copied to keyboard buffer.");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)] font-sans flex flex-col pt-[72px]">
      {/* Toast Alert Banner */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-[200] px-3.5 py-2 bg-[var(--accent)] text-white shadow-lg rounded-[6px] flex items-center gap-2 text-[11px] font-black uppercase tracking-wider animate-bounce">
          <Check size={14} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="max-w-[1800px] w-full mx-auto px-4 pb-3 flex flex-col md:flex-row md:items-center justify-between border-b border-[var(--divider)] mb-4 gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 px-2.5 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[6px] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center gap-1 text-[11px] font-bold uppercase transition-all cursor-pointer"
          >
            <ArrowLeft size={12} />
            <span>Back to Editor Workspace</span>
          </button>
          <div>
            <h1 className="text-[18px] font-extrabold uppercase tracking-tight flex items-center gap-2">
              <span className="p-1 px-1.5 bg-[#FF6B2B]/10 text-[var(--accent)] rounded animate-pulse">🎯</span>
              <span>Advanced Document Export Desk</span>
            </h1>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              Refined layout customization suite for exams PDF printing and DOCX (MS Word) creation.
            </p>
          </div>
        </div>

        {/* General stats & top controls */}
        <div className="flex items-center gap-1.5 self-end md:self-center">
          <span className="text-[10px] font-bold uppercase bg-[var(--bg-card)] border border-[var(--border-card)] px-2.5 py-1 rounded-[6px] text-[var(--text-secondary)]">
            Total Target Questions: {filteredQuestions.length}
          </span>
          <button
            onClick={handlePushToCollection}
            className="px-3 py-1 bg-[var(--accent)] hover:bg-[#E55A1A] text-white text-[10px] font-black uppercase rounded-[6px] flex items-center gap-1 transition-all cursor-pointer"
          >
            <Sparkles size={11} />
            <span>Sync to Master DB</span>
          </button>
        </div>
      </div>

      {/* 3:7 SPLIT LAYOUT IN AN 1800PX OR FULL CONTAINER FOR LIVE PREVIEW */}
      <div className="max-w-[1800px] w-full mx-auto px-4 pb-12 flex-1 grid grid-cols-1 lg:grid-cols-10 gap-4 items-start">
        
        {/* PARAMETER CONFIGURATION PANEL (LEFT COLUMN - lg:col-span-3) */}
        <div className="lg:col-span-3 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-3 shadow-md flex flex-col gap-3 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto style-scrollbar">
          <div className="pb-2 border-b border-[var(--divider)] flex flex-col gap-2 mb-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
              <span>📋 Parameter Panel</span>
            </h3>
            <div className="flex w-full gap-1 bg-[var(--bg-body)] p-0.5 rounded-[6px] border border-[var(--border-card)]">
              <button
                onClick={() => setActiveFormat("pdf")}
                className={`flex-1 py-1 rounded-[4px] text-[9.5px] font-black uppercase transition-all cursor-pointer ${
                  activeFormat === "pdf"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                📕 PDF Layout Mode
              </button>
              <button
                onClick={() => setActiveFormat("docx")}
                className={`flex-1 py-1 rounded-[4px] text-[9.5px] font-black uppercase transition-all cursor-pointer ${
                  activeFormat === "docx"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                📘 MS Word Mode
              </button>
            </div>
          </div>

          {/* STACKED CONFIGURATION COLUMNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3.5 text-left">
            
            {/* CARD 1: 1. PREFIXES & NUMBERING */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[8px] border border-[var(--border-card)] space-y-3 shadow-xs">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>1. Prefixes & Numbering</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">CRD 01</span>
              </h4>

              {/* Question Prefix Label Input */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Question Prefix Label:</span>
                <input
                  type="text"
                  value={exportPrefix}
                  onChange={(e) => setExportPrefix(e.target.value)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] font-medium font-sans"
                  placeholder="e.g. Q."
                />
                <span className="text-[8px] text-[var(--text-muted)] leading-tight italic font-medium">
                  Use %d to replace with the question number dynamically.
                </span>
              </div>

              {/* Option Alphabetic Format selection */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Option Alphabetic Format:</span>
                <select
                  value={optionPattern}
                  onChange={(e) => setOptionPattern(e.target.value as OptionPatternFormat)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1.5 focus:outline-none focus:border-[var(--accent)] font-bold font-sans"
                >
                  <option value={OptionPatternFormat.A_B_C_D}>A, B, C, D (Uppercase)</option>
                  <option value={OptionPatternFormat.a_b_c_d}>a, b, c, d (Lowercase)</option>
                  <option value={OptionPatternFormat.NUM_1_2_3_4}>1, 2, 3, 4 (Numeric)</option>
                  <option value={OptionPatternFormat.ROMAN_I_II_III_IV}>I, II, III, IV (Roman Upper)</option>
                  <option value={OptionPatternFormat.ROMAN_i_ii_iii_iv}>i, ii, iii, iv (Roman Lower)</option>
                </select>
              </div>

              <div className="space-y-1.5 pt-1.5 border-t border-[var(--divider)]">
                {/* Render Serial Number */}
                <label className="flex items-center gap-2 cursor-pointer text-[10.5px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={includeSerialNumber}
                    onChange={(e) => setIncludeSerialNumber(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] rounded-[3px] cursor-pointer"
                  />
                  <span>Render Serial Number (1, 2, 3)</span>
                </label>

                {/* Keep/Include MCQ Prefixes */}
                <label className="flex items-center gap-2 cursor-pointer text-[10.5px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={showMcqPrefixes}
                    onChange={(e) => setShowMcqPrefixes(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] rounded-[3px] cursor-pointer"
                  />
                  <span>Keep/Include MCQ Prefixes</span>
                </label>
              </div>
            </div>

            {/* CARD 2: 2. LAYOUT & TYPOGRAPHY */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[8px] border border-[var(--border-card)] space-y-3 shadow-xs">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>2. Layout & Typography</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">CRD 02</span>
              </h4>

              {/* Option Alignment Style selection */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Option Alignment Style:</span>
                <select
                  value={optionArrangement}
                  onChange={(e) => setOptionArrangement(e.target.value as OptionArrangement)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1.5 focus:outline-none focus:border-[var(--accent)] font-bold font-sans"
                >
                  <option value={OptionArrangement.VERTICAL}>VERT (1 Item / Line)</option>
                  <option value={OptionArrangement.GRID}>GRID (2 Items / Line)</option>
                  <option value={OptionArrangement.HORIZONTAL}>HORIZ (4 Items / Line)</option>
                </select>
              </div>

              {/* Base Word Font Family selection */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Base Word Font Family:</span>
                <select
                  value={wordFontFamily}
                  onChange={(e) => setWordFontFamily(e.target.value)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1.5 focus:outline-none focus:border-[var(--accent)] font-bold font-sans"
                >
                  <option value="Arial (Clean Modern)">Arial (Clean Modern)</option>
                  <option value="Times New Roman (Classic Editorial)">Times New Roman (Classic Editorial)</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Courier New">Courier New (Technical)</option>
                </select>
              </div>

              {/* Paper Size and Margins Side-by-side */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Paper Size:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as "A4" | "Letter")}
                    className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1.5 focus:outline-none focus:border-[var(--accent)] font-bold font-sans"
                  >
                    <option value="A4">A4 (Standard)</option>
                    <option value="Letter">Letter (US)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Margins:</span>
                  <select
                    value={marginType}
                    onChange={(e) => setMarginType(e.target.value as "narrow" | "normal" | "wide")}
                    className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1.5 focus:outline-none focus:border-[var(--accent)] font-bold font-sans"
                  >
                    <option value="narrow">Narrow (0.5")</option>
                    <option value="normal">Normal (1.0")</option>
                    <option value="wide">Wide (1.5")</option>
                  </select>
                </div>
              </div>

              {/* Bilingual Hindi/English ON/OFF Banner */}
              <div className="flex items-center justify-between bg-[var(--input-bg)] p-1.5 px-3 rounded-sm border border-[var(--input-border)] select-none mt-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Bilingual Hindi/English:</span>
                <button
                  type="button"
                  onClick={() => setBilingualPdf(!bilingualPdf)}
                  className={`px-3 py-0.5 rounded text-[9px] uppercase font-serif font-black transition-all cursor-pointer ${
                    bilingualPdf 
                      ? "bg-[var(--accent)] text-white" 
                      : "bg-zinc-200 text-zinc-500"
                  }`}
                >
                  {bilingualPdf ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* CARD 3: 3. HEADER INFORMATION & KEY */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[8px] border border-[var(--border-card)] space-y-3 shadow-xs">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>3. Header Information & Key</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">CRD 03</span>
              </h4>

              {/* Header Title Text field */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Printable Main Title Header:</span>
                <input
                  type="text"
                  value={pageHeaderTitle}
                  onChange={(e) => setPageHeaderTitle(e.target.value)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] font-medium font-sans"
                  placeholder="e.g. EXAMINATION TEST PAPER"
                />
              </div>

              {/* Header Subtitle Text field */}
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)] font-bold text-[9px] uppercase tracking-wider">Subtitle / Exam Instructions:</span>
                <input
                  type="text"
                  value={pageHeaderSubtitle}
                  onChange={(e) => setPageHeaderSubtitle(e.target.value)}
                  className="w-full bg-[var(--input-bg)] text-[11px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] font-medium font-sans"
                  placeholder="e.g. Duration or details..."
                />
              </div>

              <div className="space-y-1.5 pt-1.5 border-t border-[var(--divider)]">
                {/* Include Name & Roll No fields */}
                <label className="flex items-center gap-2 cursor-pointer text-[10.5px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={includeNameRoll}
                    onChange={(e) => setIncludeNameRoll(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] rounded-[3px] cursor-pointer"
                  />
                  <span>Include Name & Roll No Fields</span>
                </label>

                {/* Extract Answer Keys & Solutions */}
                <label className="flex items-center gap-2 cursor-pointer text-[10.5px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={extractAnswerKeys}
                    onChange={(e) => setExtractAnswerKeys(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] rounded-[3px] cursor-pointer"
                  />
                  <span>Extract Answer Keys & Solutions</span>
                </label>

                {/* Style Dropdown combo */}
                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--divider)] text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)] uppercase text-[9px]">Style:</span>
                  <select
                    value={answerKeyStyle}
                    disabled={!extractAnswerKeys}
                    onChange={(e) => setAnswerKeyStyle(e.target.value)}
                    className="flex-1 bg-[var(--input-bg)] text-[10.5px] text-[var(--text-primary)] border border-[var(--input-border)] rounded-sm p-1 max-w-[150px] disabled:opacity-40"
                  >
                    <option value="correct_only">Correct Key Option Only</option>
                    <option value="full_sol">Full Solution & Code</option>
                  </select>
                </div>
              </div>
            </div>

            {/* CARD 4: GLOBAL DESIGN VARIABLES & DESIGN TOGGLES */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[8px] border border-[var(--border-card)] space-y-3 shadow-xs">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>4. Global Design Variables</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">CRD 04</span>
              </h4>

              {/* Font Size slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Font Size:</span>
                  <span className="text-[var(--accent)]">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="9"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* Spacing slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Spacing:</span>
                  <span className="text-[var(--accent)]">{lineSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* Object Spacing slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Spacing (Option):</span>
                  <span className="text-[var(--accent)]">{optionSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={optionSpacing}
                  onChange={(e) => setOptionSpacing(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* Visual Toggles checklist */}
              <div className="space-y-1.5 pt-1.5 border-t border-[var(--divider)]">
                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Answer Bold:</span>
                  <input
                    type="checkbox"
                    checked={answerBold}
                    onChange={(e) => setAnswerBold(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Watermark:</span>
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Relevant Questions:</span>
                  <input
                    type="checkbox"
                    checked={showRelevantQs}
                    onChange={(e) => setShowRelevantQs(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Question Opacity:</span>
                  <input
                    type="checkbox"
                    checked={questionOpacity}
                    onChange={(e) => setQuestionOpacity(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Option Opacity:</span>
                  <input
                    type="checkbox"
                    checked={optionOpacity}
                    onChange={(e) => setOptionOpacity(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Question Statement:</span>
                  <input
                    type="checkbox"
                    checked={showQuestionStatement}
                    onChange={(e) => setShowQuestionStatement(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Option Items:</span>
                  <input
                    type="checkbox"
                    checked={showOptionItems}
                    onChange={(e) => setShowOptionItems(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Explanation Box:</span>
                  <input
                    type="checkbox"
                    checked={showExplanationBox}
                    onChange={(e) => setShowExplanationBox(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Full Solution Keys:</span>
                  <input
                    type="checkbox"
                    checked={showSolution}
                    onChange={(e) => setShowSolution(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show QR Icon:</span>
                  <input
                    type="checkbox"
                    checked={showQr}
                    onChange={(e) => setShowQr(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-[10px] font-bold">
                  <span className="text-[var(--text-secondary)]">Show Book Icon:</span>
                  <input
                    type="checkbox"
                    checked={showBook}
                    onChange={(e) => setShowBook(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>
              </div>

              {/* Subject Scope Filter selection */}
              <div className="pt-2 border-t border-[var(--divider)] font-bold text-[10px]">
                <span className="text-[8px] font-black uppercase text-[var(--accent)] block mb-1">Subject Scope Filter:</span>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="w-full bg-[var(--accent)] hover:bg-[#E55A1A] text-white rounded p-1.5 text-[10px] cursor-pointer text-center font-bold font-sans transition-all"
                >
                  <option value="All">All Subjects ({questions.length})</option>
                  {availableSubjects.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* COLUMN 3: SPECIFIC QUESTION CONFIG */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[6px] border border-[var(--border-card)] space-y-2.5">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>Specific Question Config</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">COL 03</span>
              </h4>

              {/* Target Question selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block">
                  Select Target Question No:
                </label>
                <select
                  value={targetQuestionIdx}
                  onChange={(e) => setTargetQuestionIdx(e.target.value)}
                  className="w-full bg-[var(--input-bg)] text-[10px] font-bold border border-[var(--input-border)] rounded p-1"
                >
                  {filteredQuestions.map((_, qIndex) => (
                    <option key={qIndex} value={qIndex + 1}>
                      Question #{qIndex + 1}
                    </option>
                  ))}
                </select>
                <p className="text-[8px] text-[var(--text-muted)] leading-normal">
                  Define structural sections, unique typography or margins specifically for the chosen item below!
                </p>
              </div>

              {/* Enter Section Name */}
              <div className="space-y-1 pt-1.5 border-t border-[var(--divider)] font-bold text-[10px]">
                <span className="text-[var(--text-secondary)]">Enter Section Name:</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={sectionInputs[targetQuestionIdx] || ""}
                    onChange={(e) => {
                      setSectionInputs({
                        ...sectionInputs,
                        [targetQuestionIdx]: e.target.value
                      });
                    }}
                    placeholder="e.g. PART II: SCIENCE"
                    className="flex-1 bg-[var(--input-bg)] text-[10px] text-[var(--text-primary)] border border-[var(--input-border)] rounded px-1.5 py-1"
                  />
                  <button
                    onClick={() => handleDeleteSection(targetQuestionIdx)}
                    className="px-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-[10px]"
                    title="Delete section header boundary"
                  >
                    X
                  </button>
                </div>
                <p className="text-[8.5px] text-[var(--text-muted)] mt-0.5 font-medium leading-tight">
                  This draws a gorgeous upper section banner exactly preceding this specific question item!
                </p>
              </div>

              {/* Specific FontSize override */}
              <div className="space-y-1.5 pt-1 border-t border-[var(--divider)] text-[10px] font-bold">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Font Size Override:</span>
                  <span className="text-[var(--accent)] font-mono">{specificFontSizes[targetQuestionIdx] || fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="9"
                  max="24"
                  value={specificFontSizes[targetQuestionIdx] || fontSize}
                  onChange={(e) => {
                    setSpecificFontSizes({
                      ...specificFontSizes,
                      [targetQuestionIdx]: Number(e.target.value)
                    });
                  }}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* Specific LineSpacing Override */}
              <div className="space-y-1.5 text-[10px] font-bold">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Spacing Override:</span>
                  <span className="text-[var(--accent)] font-mono">{specificSpacings[targetQuestionIdx] || lineSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="35"
                  value={specificSpacings[targetQuestionIdx] || lineSpacing}
                  onChange={(e) => {
                    setSpecificSpacings({
                      ...specificSpacings,
                      [targetQuestionIdx]: Number(e.target.value)
                    });
                  }}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* Specific Option spacing override */}
              <div className="space-y-1.5 text-[10px] font-bold">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Option Spacing Override:</span>
                  <span className="text-[var(--accent)] font-mono">{specificOptionSpacings[targetQuestionIdx] || optionSpacing}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="35"
                  value={specificOptionSpacings[targetQuestionIdx] || optionSpacing}
                  onChange={(e) => {
                    setSpecificOptionSpacings({
                      ...specificOptionSpacings,
                      [targetQuestionIdx]: Number(e.target.value)
                    });
                  }}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer"
                />
              </div>

              {/* MathJax Refresh trigger block */}
              <div className="pt-2 border-t border-[var(--divider)] flex items-center justify-between text-[10px] font-bold">
                <span className="text-[var(--text-secondary)]">MathJax Engine:</span>
                <button
                  onClick={() => {
                    showLocalToast("MathJax typesetting queued successfully.");
                  }}
                  className="px-2.5 py-0.5 bg-[var(--accent)] text-white text-[9px] font-bold uppercase rounded-[4px] cursor-pointer hover:bg-[#E55A1A]"
                >
                  REFRESH
                </button>
              </div>
            </div>

            {/* COLUMN 4: QR CODE DATA, COLORS & FULLSCREEN */}
            <div className="bg-[var(--bg-body)] p-3 rounded-[6px] border border-[var(--border-card)] space-y-2.5">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] border-b border-[var(--divider)] pb-1.5 flex items-center justify-between">
                <span>QR Code & Colors</span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">COL 04</span>
              </h4>

              {/* QR Code controls */}
              <div className="space-y-1 text-[10px] font-semibold">
                <span className="font-bold text-[var(--text-secondary)] block">QR Code Data:</span>
                
                <div className="space-y-0.5">
                  <span className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Action</span>
                  <select
                    value={qrAction}
                    onChange={(e) => setQrAction(e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[10px] p-1 rounded font-bold"
                  >
                    <option value="Save Set">Save Set</option>
                    <option value="Load Set">Load Set</option>
                    <option value="Custom API Url">Custom API Url</option>
                  </select>
                </div>

                <div className="space-y-0.5 pt-0.5">
                  <span className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Set ID / Text:</span>
                  <input
                    type="text"
                    value={qrSetId}
                    onChange={(e) => setQrSetId(e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[10px] p-1 rounded"
                    placeholder="Enter set ID..."
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSetQr}
                  className="w-full py-1 bg-zinc-800 text-white rounded cursor-pointer hover:bg-zinc-700 text-[9.5px] font-black uppercase mt-1 transition-all"
                >
                  SET QR CODE
                </button>
              </div>

              {/* Change Colors */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--divider)] text-[10px] font-bold">
                <span className="text-[var(--accent)] uppercase text-[9px] font-black tracking-wider block mb-1">
                  Change Colors (Brand Preview):
                </span>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Header Bg-Color:</span>
                  <input
                    type="color"
                    value={headerBgColor}
                    onChange={(e) => setHeaderBgColor(e.target.value)}
                    className="w-6 h-5 rounded cursor-pointer border border-[#E0E0E0] p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Footer Bg-Color:</span>
                  <input
                    type="color"
                    value={footerBgColor}
                    onChange={(e) => setFooterBgColor(e.target.value)}
                    className="w-6 h-5 rounded cursor-pointer border border-[#E0E0E0] p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)] font-sans">Question Color:</span>
                  <input
                    type="color"
                    value={questionColor}
                    onChange={(e) => setQuestionColor(e.target.value)}
                    className="w-6 h-5 rounded cursor-pointer border border-[#E0E0E0] p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Option Color:</span>
                  <input
                    type="color"
                    value={optionColor}
                    onChange={(e) => setOptionColor(e.target.value)}
                    className="w-6 h-5 rounded cursor-pointer border border-[#E0E0E0] p-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Question Number Color:</span>
                  <input
                    type="color"
                    value={numberColor}
                    onChange={(e) => setNumberColor(e.target.value)}
                    className="w-6 h-5 rounded cursor-pointer border border-[#E0E0E0] p-0"
                  />
                </div>
              </div>

              {/* Fullscreen Toggle */}
              <div className="pt-2 border-t border-[var(--divider)]">
                <button
                  type="button"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="w-full py-1 text-[#FF6B2B] bg-[#FF6B2B]/10 hover:bg-[#FF6B2B]/15 text-[10px] font-black uppercase text-center rounded-[6px] transition-all cursor-pointer border border-[#FF6B2B]/20 flex items-center justify-center gap-1.5"
                >
                  <Maximize2 size={11} />
                  <span>{isFullscreen ? "Exit Fullscreen" : "Go FullScreen"}</span>
                </button>
              </div>
            </div>

          </div>

          {/* DYNAMIC DOCUMENT DOWNLOAD ACTIONS */}
          <div className="mt-3 pt-3 border-t border-[var(--divider)] flex flex-col gap-2.5 text-left">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] block">Ready to Download?</span>
              <p className="text-[9px] text-[var(--text-muted)] leading-tight">All layout edits are compiled in real-time instantly.</p>
            </div>
            
            <div className="flex flex-col gap-1.5 w-full">
              <button
                onClick={handleDownloadDocx}
                className="w-full px-3 py-1.5 bg-[#2b579a] hover:bg-[#1e3d6e] text-white rounded-[6px] text-[10px] font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow font-sans"
                title="Download perfectly styled MS Word .docx document"
              >
                <FileText size={12} />
                <span>Download DOCX</span>
              </button>

              <button
                onClick={handlePrintPdf}
                className="w-full px-3 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-[6px] text-[10px] font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow"
                title="Open browser system print manager"
              >
                <Printer size={12} />
                <span>Print / SAVE PDF</span>
              </button>

              <button
                onClick={handleDownloadCSV}
                className="w-full px-3 py-1.5 bg-[#107C41] hover:bg-[#0b5c2f] text-white rounded-[6px] text-[10px] font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow font-sans"
                title="Export sheet as layout-preserved CSV format"
              >
                <Database size={12} />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleDownloadTxt}
                className="w-full px-3 py-1.5 bg-[var(--bg-sidebar)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-card)] rounded-[6px] text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                title="Download plain text exam package"
              >
                <Download size={12} />
                <span>Plain TXT</span>
              </button>

              <button
                onClick={handleDownloadJson}
                className="w-full px-3 py-1.5 bg-[var(--bg-sidebar)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-card)] rounded-[6px] text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                title="Download JSON structured representation"
              >
                <FileCode size={12} />
                <span>JSON Schema</span>
              </button>

              <button
                onClick={handleCopyClipboard}
                className="w-full px-3 py-1.5 bg-[var(--bg-sidebar)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-card)] rounded-[6px] text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                title="Copy exam text content"
              >
                <Copy size={12} />
                <span>Copy to Clipboard</span>
              </button>
            </div>
          </div>

        </div>

        {/* LIVE INTERACTIVE ASSESSMENT PREVIEW (RIGHT COLUMN - lg:col-span-7) */}
        <div className={`lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-4 flex flex-col items-center ${isFullscreen ? "fixed inset-0 bg-[var(--bg-body)] z-[300] p-6 overflow-y-auto" : ""}`}>
          
          {isFullscreen && (
            <div className="w-full flex justify-between items-center bg-[var(--bg-card)] border border-[var(--border-card)] p-2.5 rounded-[8px] mb-4 shadow">
              <div className="flex items-center gap-2">
                <span className="p-1 px-2 bg-[var(--accent)] text-white text-[9.5px] font-black rounded-full uppercase">Fullscreen Mode</span>
                <span className="text-[11px] font-bold text-[var(--text-primary)]">Exam Page Printing Simulator</span>
              </div>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-1 px-3 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase rounded-[4px] cursor-pointer"
              >
                Close Fullscreen
              </button>
            </div>
          )}
          <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between border-b border-[var(--divider)] pb-2.5 mb-4 select-none gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-[11px] font-black uppercase text-[var(--text-primary)] tracking-wide">
                Live Interactive Assessment Preview:
              </span>
              <span className="px-2 py-0.2 bg-[var(--bg-body)] text-[9px] uppercase border border-[var(--border-card)] rounded text-[var(--text-muted)] font-bold">
                {activeFormat === "pdf" ? "PRINTABLE PDF (A4 SHEET)" : "MS WORD (DOCX EDITOR)"}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[10px] text-[var(--text-muted)] hidden xl:block">
                Margin: <strong className="text-[var(--accent)]">{marginType}</strong> | Size: <strong className="text-[var(--accent)]">{pageSize}</strong>
              </p>

              {/* Advanced Zoom Slider Widget */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-body)] p-1 px-2 border border-[var(--border-card)] rounded-[6px] shadow-sm">
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(50, prev - 10))}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-card)] rounded transition-all cursor-pointer"
                  title="Zoom Out (Ctrl + Scroll Down / Touch Pinch-In)"
                >
                  <ZoomOut size={12} />
                </button>

                <input
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-16 sm:w-24 accent-[var(--accent)] h-1 bg-[var(--scrollbar-track)] rounded-lg cursor-pointer transition-all"
                  title="Slide to Zoom"
                  id="preview-zoom-slider"
                />

                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(250, prev + 10))}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-card)] rounded transition-all cursor-pointer"
                  title="Zoom In (Ctrl + Scroll Up / Touch Pinch-Out)"
                >
                  <ZoomIn size={12} />
                </button>

                <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] min-w-[34px] bg-[var(--bg-card)] px-1 py-0.5 rounded border border-[var(--border-card)] text-center">
                  {zoom}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="p-0.5 px-1.5 bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[9px] uppercase font-bold text-[var(--text-secondary)] rounded transition-all cursor-pointer"
                  title="Reset Zoom to 100%"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* ZOOM SCROLLER AREA BOUNDS */}
          <div 
            ref={previewOuterRef} 
            className="w-full flex-1 overflow-auto flex justify-center p-2 min-h-[600px] select-text style-scrollbar"
            style={{
              maxHeight: isFullscreen ? "calc(100vh - 120px)" : "max(800px, 75vh)",
            }}
          >
            <div
              className="w-full flex flex-col items-center"
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top center",
                width: "100%",
                maxWidth: "840px",
                height: "fit-content",
                transition: "transform 0.1s ease-out",
                marginBottom: zoom > 100 ? `${(zoom / 100 - 1) * 1180}px` : "0px",
              }}
            >
              {/* DUAL MODE PREVIEWS */}
          {activeFormat === "pdf" ? (
            /* PDF PRINT PREVIEW CANVAS */
            <div 
              ref={previewRef}
              id="printed-pdf-content"
              className="w-full max-w-[840px] bg-white text-zinc-900 shadow-xl border border-zinc-200 rounded-[4px] p-6 sm:p-12 text-left relative overflow-hidden transition-all select-text print:shadow-none print:border-none print:p-0 my-2"
              style={{
                fontFamily: getFontFamilyCss(wordFontFamily),
                fontSize: `${fontSize}px`,
                lineHeight: "1.5",
                minHeight: "1180px", // A4 paper ratio style
                paddingLeft: marginType === "narrow" ? "24px" : marginType === "normal" ? "48px" : "72px",
                paddingRight: marginType === "narrow" ? "24px" : marginType === "normal" ? "48px" : "72px",
              }}
            >
              {/* WATERMARK OVERLAY */}
              {showWatermark && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[1] overflow-hidden opacity-[0.04]">
                  <span className="text-[82px] font-black text-gray-900 border-8 border-gray-900 px-8 rounded-xl rotate-45 uppercase font-sans tracking-widest leading-none">
                    VedaTool App
                  </span>
                </div>
              )}

              {/* FIRST HEADER BLOCK */}
              {newHeader && (
                <div 
                  className="p-3 text-white rounded-[6px] border border-transparent flex justify-between items-center gap-3 relative z-[2] mb-6 shadow-sm"
                  style={{ backgroundColor: headerBgColor }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-0.2 rounded">
                        {logo1 || "EXAM BOARD"}
                      </span>
                      {logo2 && (
                        <span className="text-[10.5px] uppercase font-bold italic tracking-wide text-zinc-200">
                          - {logo2}
                        </span>
                      )}
                    </div>
                    
                    <h2 className="text-[15px] font-black uppercase tracking-wide">
                      {pageHeaderTitle}
                    </h2>
                    <p className="text-[10px] font-medium text-zinc-200">
                      {pageHeaderSubtitle}
                    </p>
                  </div>

                  {/* QR Code Graphic preview */}
                  {showQr && (
                    <div className="bg-white p-1 rounded border border-zinc-200 shadow shrink-0 flex flex-col items-center gap-0.5 text-zinc-950">
                      <QrCode size={40} className="stroke-zinc-900" />
                      <span className="text-[6.5px] font-mono font-bold leading-none select-all">
                        {qrSetId}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* NAME & ROLL NUMBER CARD */}
              {includeNameRoll && (
                <div className="border border-zinc-300 rounded-[5px] p-2 bg-zinc-50 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 text-[10px] uppercase font-bold select-none mb-6 relative z-[2] text-zinc-800">
                  <div className="flex-1 flex gap-1.5 items-center">
                    <span>Candidate Name:</span>
                    <div className="flex-1 border-b border-dashed border-zinc-400 mb-1" />
                  </div>
                  <div className="w-[180px] flex gap-1.5 items-center">
                    <span>Roll Number:</span>
                    <div className="flex-1 border-b border-dashed border-zinc-400 mb-1" />
                  </div>
                  <div className="w-[120px] flex gap-1.5 items-center">
                    <span>Center Code:</span>
                    <div className="flex-1 border-b border-dashed border-zinc-400 mb-1" />
                  </div>
                </div>
              )}

              {/* EXAM QUESTIONS CONTAINER */}
              <div className="space-y-4 relative z-[2]">
                {filteredQuestions.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400">
                    <HelpCircle className="w-10 h-10 mx-auto animate-pulse mb-2 text-zinc-300" />
                    <h4 className="text-[12px] uppercase font-bold">No Questions in Current Scope</h4>
                    <p className="text-[10px]">Verify your subject filter scope or append items in the editor workspace.</p>
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const qIdxKey = String(idx + 1);
                    const specificFontSize = getItemFontSize(idx);
                    const specificSpc = getItemSpacing(idx);
                    const specificOptSpc = getItemOptionSpacing(idx);

                    const sectionHeader = sectionInputs[qIdxKey];
                    const qLabel = getFormattedQuestionLabel(idx);

                    // Deconstruct Statement / Bilingual parts
                    const { hi: qHi, en: qEn } = getBilingualParts(q.questionText);

                    return (
                      <div 
                        key={`${q.id}-${idx}`} 
                        className="transition-all text-zinc-800 text-left"
                        style={{ 
                          fontSize: `${specificFontSize}px`,
                          marginBottom: `${specificSpc}px`
                        }}
                      >
                        {/* CUSTOM SECTION BANNER */}
                        {sectionHeader && (
                          <div className="mt-5 mb-3 border-b-2 border-zinc-900 pb-0.5 flex justify-between items-center bg-zinc-100 p-1 px-2 rounded font-sans select-none">
                            <span className="text-[10px] font-black uppercase text-zinc-900 tracking-wider">
                              Section boundary: {sectionHeader}
                            </span>
                            <span className="text-[8px] font-mono text-zinc-500 uppercase font-black">Question Index #{idx + 1}</span>
                          </div>
                        )}

                        {/* STATEMENT UNIT */}
                        {showQuestionStatement && (
                          <div 
                            className="flex gap-2 font-sans select-all"
                            style={{ 
                              fontWeight: questionWeight as any,
                              color: questionColor,
                              opacity: questionOpacity ? "1" : "0.75"
                            }}
                          >
                            {/* Question Serial Label */}
                            <span className="shrink-0" style={{ color: numberColor }}>{qLabel}</span>
                            
                            <div className="flex-1 flex flex-col gap-0.5">
                              {/* Display according to layout modes */}
                              {bilingualPdf ? (
                                <>
                                  <div className="text-zinc-950 font-sans markdown-body prose prose-sm max-w-none">
                                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{qHi}</Markdown>
                                  </div>
                                  <div className="text-zinc-500 font-sans italic text-[0.9em] markdown-body prose prose-sm max-w-none">
                                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{qEn}</Markdown>
                                  </div>
                                </>
                              ) : (
                                <div className="text-zinc-950 font-sans markdown-body prose prose-sm max-w-none">
                                  <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{qHi}</Markdown>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* OPTIONS SET */}
                        {showOptionItems && (
                          <div 
                            className={getOptionGridClass(optionArrangement)}
                            style={{ 
                              fontWeight: optionWeight as any,
                              color: optionColor,
                              opacity: optionOpacity ? "1" : "0.75",
                              rowGap: `${specificOptSpc}px`
                            }}
                          >
                            {q.options.map((opt, oIdx) => {
                              const optLabel = getOptionLabelChar(idx, oIdx);
                              const isCorrect = q.answer?.toLowerCase() === opt.label.toLowerCase();
                              
                              const { hi: oHi, en: oEn } = getBilingualParts(opt.text);

                              return (
                                <div 
                                  key={oIdx} 
                                  className={`flex items-start gap-1.5 p-1 rounded transition-colors ${
                                    isCorrect && answerBold 
                                      ? "bg-green-50/50 font-bold border-l-2 border-green-500 pl-1.5" 
                                      : ""
                                  }`}
                                >
                                  {/* Letter option prefix style */}
                                  <span className="font-mono text-zinc-500 min-w-[15px] shrink-0">
                                    ({optLabel})
                                  </span>
                                  
                                  <div className="flex-1 flex flex-col text-[0.95em]">
                                    {bilingualPdf ? (
                                      <>
                                        <div className="text-zinc-900 markdown-body prose prose-sm max-w-none">
                                          <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{oHi}</Markdown>
                                        </div>
                                        <div className="text-zinc-500 italic text-[0.9em] markdown-body prose prose-sm max-w-none">
                                          <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{oEn}</Markdown>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-zinc-900 markdown-body prose prose-sm max-w-none">
                                        <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{oHi}</Markdown>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* METADATA PREVIOUS YEAR TAGS */}
                        {previousYearTag && (q.previous_of || q.year || q.difficulty || q.subject) && (
                          <div className="mt-1 pl-6 flex flex-wrap gap-1 select-none">
                            {q.previous_of && (
                              <span className="text-[8.5px] uppercase font-bold tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                                <Tag size={8} />
                                <span>Exam Reference: {q.previous_of}</span>
                              </span>
                            )}
                            {q.year && (
                              <span className="text-[8.5px] uppercase font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded-full font-mono">
                                📅 Year {q.year}
                              </span>
                            )}
                            {q.difficulty && (
                              <span className="text-[8.5px] uppercase font-black bg-zinc-50 text-zinc-600 border border-zinc-200 px-1.5 py-0.2 rounded-full">
                                {q.difficulty} level
                              </span>
                            )}
                          </div>
                        )}

                        {/* EXPLANATIONS BOX */}
                        {showExplanationBox && showSolution && q.solution && (
                          <div 
                            className="mt-3 ml-6 p-2 rounded-[5px] border border-dashed text-[0.9em] space-y-1 select-all"
                            style={{ 
                              backgroundColor: showAnswerWithDesc ? "#fcfcfc" : "transparent",
                              borderColor: showAnswerWithDesc ? "#e0e0e0" : "transparent",
                              fontWeight: solutionWeight as any
                            }}
                          >
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#FF6B2B] block">
                              🔑 STEPWISE EXPLANATION SOLUTION:
                            </span>
                            {bilingualPdf ? (
                              <>
                                <div className="text-zinc-800 leading-relaxed font-sans markdown-body prose prose-sm max-w-none">
                                  <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{getBilingualParts(q.solution).hi}</Markdown>
                                </div>
                                <div className="text-zinc-500 italic leading-relaxed text-[0.9em] pt-0.5 font-sans border-t border-zinc-100 mt-1 markdown-body prose prose-sm max-w-none">
                                  <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{getBilingualParts(q.solution).en}</Markdown>
                                </div>
                              </>
                            ) : (
                              <div className="text-zinc-800 leading-relaxed font-sans markdown-body prose prose-sm max-w-none">
                                <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{getBilingualParts(q.solution).hi}</Markdown>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ANSWER KEY WIDGET CHECKLIST CELL TABLE */}
              {showAnswerWidget && filteredQuestions.length > 0 && (
                <div className="mt-8 border-t-2 border-zinc-950 pt-4 text-zinc-900 pr-2">
                  <div className="flex items-center gap-1.5 mb-2 select-none">
                    {showBook && <Book size={12} className="text-zinc-800" />}
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-950">
                      🎯 EXAM QUICK ANSWER RESPONSE BUBBLE GRID WIDGET
                    </span>
                  </div>
                  <p className="text-[8.5px] text-zinc-500 mb-2 leading-none">Scoring key of correct options for fast diagnostic assessment evaluation!</p>
                  
                  <div className="grid grid-cols-10 gap-1 border border-zinc-300 p-2 bg-zinc-50 rounded">
                    {filteredQuestions.map((q, qK) => (
                      <div key={`${q.id}-${qK}`} className="border border-zinc-200 bg-white rounded p-1 text-center font-mono select-none flex flex-col gap-0.5 shadow-xs">
                        <span className="text-[7.5px] text-zinc-400 font-bold block bg-zinc-100 p-0.2 rounded-xs">Q.{qK+1}</span>
                        <strong className="text-[10.5px] text-zinc-950 uppercase">{q.answer?.toUpperCase() || "-"}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PRINT FOOTER BANNER */}
              <div 
                className="mt-12 pt-2 border-t text-[8.5px] uppercase font-bold text-white py-1 px-3 rounded-[3px] flex justify-between items-center relative z-[2] select-none"
                style={{ backgroundColor: footerBgColor }}
              >
                <span>Exam compilation generated via VedaTool Intelligent Desk</span>
                <span>Page 1 of 1</span>
              </div>
            </div>
          ) : (
            
            /* MS WORD DOCX PREVIEW WINDOW */
            <div className="w-full max-w-[840px] bg-zinc-100 border border-zinc-300 rounded-[6px] p-4 text-left font-serif relative min-h-[800px] shadow-inner select-text my-2">
              <div 
                className="bg-white border border-zinc-200 mx-auto max-w-[760px] p-10 min-h-[800px] shadow-lg relative text-zinc-800"
                style={{ fontFamily: getFontFamilyCss(wordFontFamily) }}
              >
                {/* Word Ruler decoration line */}
                <div className="absolute top-0 inset-x-0 h-1 bg-[#2b579a]" />
                
                <div className="border-b border-zinc-400 pb-2 mb-4 text-[#2b579a] flex justify-between items-center font-sans text-[11px] font-black uppercase select-none">
                  <span>Draft Preview - Microsoft Word Layout Grid</span>
                  <span>Times New Roman 11pt, Double Spacing</span>
                </div>

                <div className="text-center font-bold text-[14px] font-sans text-zinc-900 border-b border-zinc-300 pb-3 mb-6">
                  <h3 className="uppercase text-[16px] tracking-wide">{pageHeaderTitle}</h3>
                  <p className="text-[12px] font-normal italic text-zinc-500 mt-1">{pageHeaderSubtitle}</p>
                </div>

                {/* Question structures in dynamic selected font family style */}
                <div className="space-y-6" style={{ fontFamily: getFontFamilyCss(wordFontFamily) }}>
                  {filteredQuestions.map((q, idx) => {
                    const qLabel = getFormattedQuestionLabel(idx);
                    const { hi, en } = getBilingualParts(q.questionText);
                    const statement = cleanEol(bilingualPdf ? q.questionText : hi);

                    return (
                      <div key={idx} className="leading-relaxed font-serif text-[12px]">
                        {/* Section Header */}
                        {sectionInputs[String(idx + 1)] && (
                          <p className="font-bold border-b border-zinc-400 uppercase text-[11px] mb-2 tracking-wide font-sans text-[#2b579a]">
                            [{sectionInputs[String(idx + 1)]}]
                          </p>
                        )}

                        <div className="text-zinc-950 font-serif flex gap-1.5 items-start">
                          <strong className="shrink-0">{qLabel}</strong>
                          <div className="flex-1 markdown-body prose prose-sm max-w-none font-serif text-[12px] leading-relaxed">
                            <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{statement}</Markdown>
                          </div>
                        </div>

                        <div className={getWordOptionGridClass(optionArrangement)}>
                          {q.options.map((opt, oIdx) => {
                            const optLabel = getOptionLabelChar(idx, oIdx);
                            const optTxt = cleanEol(bilingualPdf ? opt.text : getBilingualParts(opt.text).hi);
                            return (
                              <div key={oIdx} className="flex gap-1.5 items-start">
                                <span className="shrink-0">({optLabel})</span>
                                <div className="flex-1 markdown-body prose prose-sm max-w-none font-serif text-[11.5px] leading-normal">
                                  <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{optTxt}</Markdown>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {showSolution && q.answer && (
                          <p className="mt-1 pl-4 text-zinc-500 italic text-[11px] font-sans">
                            Answer: ({q.answer.toUpperCase()})
                          </p>
                        )}
                        {showSolution && q.solution && (
                          <div className="mt-2 pl-4 border-l border-zinc-300 text-zinc-500 italic text-[11px] font-sans flex gap-1.5 items-start">
                            <strong className="shrink-0">Explanation:</strong>
                            <div className="flex-1 markdown-body prose prose-sm max-w-none text-[11px] leading-normal">
                              <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {cleanEol(bilingualPdf ? q.solution : getBilingualParts(q.solution).hi)}
                              </Markdown>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-12 text-center text-zinc-400 text-[10px] select-none border-t border-dashed border-zinc-300 pt-3">
                  ------------------------- [End of Document] -------------------------
                </div>
              </div>
            </div>
          )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
