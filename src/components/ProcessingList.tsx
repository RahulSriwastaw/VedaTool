import React, { useState, useEffect, useRef } from "react";
import { ScannedPage } from "../types";
import { Check, FileText, AlertCircle, Copy, RefreshCw, ChevronDown, ChevronUp, Edit2, Save, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { MathRenderer } from "./MathRenderer";
import { useLanguage } from "../hooks/useLanguage";

interface Props {
  pages: ScannedPage[];
  onUpdateText: (id: string, newText: string) => void;
  onRetry: (id: string) => void;
  onToggleSelection: (id: string) => void;
  collapsedPages: Set<string>;
  togglePageCollapse: (id: string) => void;
  includeImages: boolean;
  mcqQuestions?: any[]; // Array of McqQuestion
  updateMcqQuestionsAndSave?: (qs: any[]) => void;
  onReExtractFromTextLocally?: (pageId: string) => void;
  onReExtractFromTextAi?: (pageId: string) => void;
  onMergeNext?: (pageId: string) => void;
}

const PageProcessItem: React.FC<{
  page: ScannedPage;
  onRetry: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  mcqQuestions?: any[];
  updateMcqQuestionsAndSave?: (qs: any[]) => void;
  onReExtractFromTextLocally?: (pageId: string) => void;
  onReExtractFromTextAi?: (pageId: string) => void;
  onMergeNext?: () => void;
  hasNextPage?: boolean;
}> = ({ page, onRetry, onToggleSelection, onUpdateText, mcqQuestions, updateMcqQuestionsAndSave, onReExtractFromTextLocally, onReExtractFromTextAi, onMergeNext, hasNextPage }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const { language: currentLang } = useLanguage();
  const pageQs = (mcqQuestions || []).filter((q) => q.pageNumber === page.pageNumber);
  const qCount = pageQs.length;

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedQuestionData, setEditedQuestionData] = useState<any>(null);

  const handleStartEditQuestion = (q: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingQuestionId(q.id);
    setEditedQuestionData(JSON.parse(JSON.stringify(q))); // deep copy
  };

  const handleSaveQuestionData = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editedQuestionData || !updateMcqQuestionsAndSave || !mcqQuestions) return;
    
    const qHin = editedQuestionData.question_hin || "";
    const qEng = editedQuestionData.question_eng || "";
    editedQuestionData.questionText = qHin && qEng ? `${qHin} / ${qEng}` : (qHin || qEng);

    const sHin = editedQuestionData.solution_hin || "";
    const sEng = editedQuestionData.solution_eng || "";
    editedQuestionData.solution = sHin && sEng ? `${sHin} / ${sEng}` : (sHin || sEng);

    const updated = mcqQuestions.map((q) => q.id === editedQuestionData.id ? editedQuestionData : q);
    updateMcqQuestionsAndSave(updated);
    setEditingQuestionId(null);
    setEditedQuestionData(null);
  };

  const handleDeleteQuestionData = (qId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!updateMcqQuestionsAndSave || !mcqQuestions) return;
    const filtered = mcqQuestions.filter((q) => q.id !== qId);
    updateMcqQuestionsAndSave(filtered);
    if (editingQuestionId === qId) {
      setEditingQuestionId(null);
      setEditedQuestionData(null);
    }
  };

  const handleAddNewQuestion = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newQi: any = {
      id: Math.random().toString(36).substring(2, 11),
      questionText: "",
      question_hin: "",
      question_eng: "",
      options: [
        { label: "A", text: "", text_hin: "", text_eng: "" },
        { label: "B", text: "", text_hin: "", text_eng: "" },
        { label: "C", text: "", text_hin: "", text_eng: "" },
        { label: "D", text: "", text_hin: "", text_eng: "" },
      ],
      answer: "A",
      solution: "",
      solution_hin: "",
      solution_eng: "",
      pageNumber: page.pageNumber,
      status: "Published"
    };
    if (updateMcqQuestionsAndSave && mcqQuestions) {
      updateMcqQuestionsAndSave([...mcqQuestions, newQi]);
      setEditingQuestionId(newQi.id);
      setEditedQuestionData(newQi);
    }
  };

  useEffect(() => {
    setEditText(page.extractedText || "");
  }, [page.extractedText]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!page.extractedText) return;
    try {
      await navigator.clipboard.writeText(page.extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleSaveEdit = () => {
    onUpdateText(page.id, editText);
    setIsEditing(false);
  };

  const getCardClasses = () => {
    let base =
      "flex flex-col gap-2 rounded-[8px] border transition-all p-3 mx-1 mt-2 ";
    if (page.status === "done") {
      base += page.isSelected
        ? "border-[var(--success-text)] bg-[var(--success-bg)]/20"
        : "border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--success-text)]";
    } else if (page.status === "error") {
      base += page.isSelected
        ? "border-[var(--error-text)] bg-[var(--error-bg)]/20"
        : "border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--error-text)]";
    } else {
      base += page.isSelected
        ? "border-[var(--accent)] bg-[var(--brand-primary-muted)]"
        : "border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--accent)]";
    }
    return base;
  };

  const getThumbnailClasses = () => {
    let base =
      "relative w-16 h-22 sm:w-24 sm:h-32 rounded-[8px] border overflow-hidden flex items-center justify-center shrink-0 transition-all duration-300 ";
    if (page.status === "done") {
      base += "border-[var(--success-text)]/40 bg-[var(--success-bg)]/30";
    } else if (page.status === "error") {
      base += "border-[var(--error-text)]/40 bg-[var(--error-bg)]/30";
    } else {
      base += "border-[var(--border-card)] bg-[var(--bg-body)]";
    }
    return base;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={getCardClasses()}
      onClick={() => {
        if (!isEditing && page.status === "done") setIsExpanded(!isExpanded);
      }}
    >
      <div className="flex flex-col md:flex-row items-stretch md:items-start gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(page.id);
            }}
            className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 mt-2 ${
              page.isSelected
                ? page.status === "done"
                  ? "bg-[var(--success-text)] border-[var(--success-text)] text-white font-bold"
                  : page.status === "error"
                    ? "bg-[var(--error-text)] border-[var(--error-text)] text-white font-bold"
                    : "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "bg-[var(--bg-card)] border-[var(--input-border)] hover:border-[var(--accent)] text-transparent"
            }`}
          >
            <Check size={14} strokeWidth={3} className={page.isSelected ? "opacity-100" : "opacity-0"} />
          </button>

          <div className={getThumbnailClasses()}>
            {page.imageUrl ? (
              <img
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <FileText
                size={24}
                className={
                  page.status === "done"
                    ? "text-[var(--success-text)]/60"
                    : page.status === "error"
                      ? "text-[var(--error-text)]/60"
                      : "text-[var(--text-muted)]"
                }
              />
            )}
            <div
              className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tight ${
                page.status === "done"
                  ? "bg-[var(--success-text)] text-white"
                  : page.status === "error"
                    ? "bg-[var(--error-text)] text-white"
                    : "bg-black/80 text-white"
              }`}
            >
              P{page.pageNumber}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-0 mt-1 cursor-pointer">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span
                className={`text-[11px] font-black uppercase tracking-wider ${
                  page.status === "done"
                    ? "text-[var(--success-text)]"
                    : page.status === "error"
                      ? "text-[var(--error-text)]"
                      : "text-[var(--text-secondary)]"
                }`}
              >
                Page {page.pageNumber}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {page.status === "done" && qCount > 0 && (
                  <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--brand-primary-muted)] px-1.5 py-0.5 rounded-full border border-[var(--brand-primary-border)]">
                    {qCount} Questions
                  </span>
                )}
                {page.status === "done" && qCount === 0 && (
                  <span className="text-[10px] font-bold text-[var(--warning-text)] bg-[var(--warning-bg)] px-1.5 py-0.5 rounded-full border border-[var(--warning-border)]">
                    0 Questions
                  </span>
                )}
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    page.status === "done"
                      ? "text-[var(--success-text)] border-[var(--success-border)] bg-[var(--success-bg)]"
                      : page.status === "error"
                        ? "text-[var(--error-text)] border-[var(--error-border)] bg-[var(--error-bg)]"
                        : page.status === "processing"
                          ? "text-[var(--accent)] border-[var(--brand-primary-border)] bg-[var(--brand-primary-muted)] animate-pulse"
                          : "text-[var(--text-secondary)] border-[var(--border-card)] bg-[var(--bg-body)]"
                  }`}
                >
                  {page.status === "done"
                    ? "success"
                    : page.status === "error"
                      ? "failed"
                      : page.status}
                </span>
              </div>
            </div>
            
            {!isExpanded && (
              <div className="text-[12px] leading-relaxed line-clamp-3 mt-1">
                {page.status === "processing" ? (
                  <span className="italic text-[var(--accent)] animate-pulse">
                    Analyzing and extracting content...
                  </span>
                ) : page.status === "done" && page.extractedText ? (
                  <div className="text-[var(--text-primary)] font-medium prose prose-sm prose-invert max-w-none text-[12px] opacity-80">
                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{page.extractedText.substring(0, 200) + (page.extractedText.length > 200 ? "..." : "")}</Markdown>
                  </div>
                ) : page.status === "error" ? (
                  <span className="text-[var(--error-text)] font-semibold">
                    {page.errorMessage || "Failed to extract content. Please retry this page."}
                  </span>
                ) : page.extractedText ? (
                  <span className="text-[var(--text-secondary)]">
                    {page.extractedText.substring(0, 150)}
                    {page.extractedText.length > 150 ? "..." : ""}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] italic">
                    Awaiting selection/analysis...
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-row md:flex-col gap-1.5 sm:gap-2 justify-end md:justify-start mt-2 md:mt-1 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-150/40 flex-wrap shrink-0">
          {page.status === "done" && page.extractedText && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--accent)] rounded-[6px] text-[10px] font-bold uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            >
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          )}

          {page.status === "done" && page.extractedText && (
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--accent)] rounded-[6px] text-[10px] font-bold uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              onClick={handleCopy}
            >
              <Copy size={12} />
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {(page.status === "error" || page.status === "done") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(page.id);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[10px] font-bold uppercase transition-all cursor-pointer ${
                page.status === "error"
                  ? "bg-[var(--error-bg)] border border-[var(--error-border)] hover:bg-[var(--error-bg)]/80 text-[var(--error-text)]"
                  : "bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && page.status === "done" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full mt-2 border-t border-[var(--border-card)] pt-3 overflow-hidden"
          >
            {/* Display Extracted Questions Inline */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase text-[var(--text-secondary)]">Extracted Questions ({pageQs.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddNewQuestion}
                    className="text-[10px] bg-[var(--accent)] text-white px-2 py-1 rounded-[4px] hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1 font-bold"
                  >
                    <Plus size={11} strokeWidth={3} /> Add Question
                  </button>
                  {pageQs.length > 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (updateMcqQuestionsAndSave && mcqQuestions) {
                          const newQs = mcqQuestions.filter(q => q.pageNumber !== page.pageNumber);
                          updateMcqQuestionsAndSave(newQs);
                        }
                      }}
                      className="text-[10px] bg-[var(--error-bg)] text-[var(--error-text)] px-2 py-1 rounded-[4px] hover:bg-red-500 hover:text-white transition-colors"
                    >
                      Clear Questions
                    </button>
                  )}
                </div>
              </div>
              
              {pageQs.length === 0 ? (
                <div className="p-3 bg-[var(--bg-input)] rounded-[6px] text-center border border-[var(--border-input)] flex flex-col items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">No questions found. Edit the text below and re-extract, or add a question manually.</span>
                  <button
                    onClick={handleAddNewQuestion}
                    className="text-[10px] bg-[var(--accent)] text-white px-2.5 py-1 rounded hover:bg-[var(--accent-hover)] font-bold uppercase transition-all"
                  >
                    + Add Empty Question
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {pageQs.map((q, idx) => (
                    <div key={q.id}>
                      {editingQuestionId === q.id ? (
                        <div className="p-3.5 bg-[var(--bg-card)] border border-[var(--accent)] rounded-[8px] flex flex-col gap-3 shadow-md border-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between border-b border-[var(--border-card)] pb-2 mb-1">
                            <span className="text-[11px] font-black uppercase text-[var(--accent)]">Edit Question Details (P{page.pageNumber}-Q{idx + 1})</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleSaveQuestionData}
                                className="px-2.5 py-1 bg-green-500 text-white rounded text-[10px] font-black uppercase flex items-center gap-1 hover:bg-green-600 transition-colors"
                              >
                                <Check size={11} strokeWidth={2.5} /> Save Changes
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingQuestionId(null);
                                  setEditedQuestionData(null);
                                }}
                                className="px-2 py-1 bg-[var(--bg-hover)] border border-[var(--border-card)] text-[var(--text-primary)] rounded text-[10px] font-bold uppercase hover:bg-[var(--text-secondary)]/20 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>

                          {/* Hindi Question Text */}
                          <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Question Statement (Hindi)</label>
                            <textarea
                              value={editedQuestionData?.question_hin || ""}
                              onChange={(e) => setEditedQuestionData({ ...editedQuestionData, question_hin: e.target.value })}
                              className="w-full bg-[var(--input-bg)] border border-[var(--border-card)] text-[12px] p-2 rounded focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] min-h-[50px] resize-y"
                              placeholder="Hindi question text..."
                            />
                          </div>

                          {/* English Question Text */}
                          <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Question Statement (English)</label>
                            <textarea
                              value={editedQuestionData?.question_eng || ""}
                              onChange={(e) => setEditedQuestionData({ ...editedQuestionData, question_eng: e.target.value })}
                              className="w-full bg-[var(--input-bg)] border border-[var(--border-card)] text-[12px] p-2 rounded focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] min-h-[50px] resize-y"
                              placeholder="English question text..."
                            />
                          </div>

                          {/* Options Editor */}
                          <div>
                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1.5">Options & Labels</label>
                            <div className="grid grid-cols-1 gap-3.5">
                              {(editedQuestionData?.options || []).map((opt: any, optIdx: number) => (
                                <div key={opt.label || optIdx} className="flex flex-col sm:flex-row gap-2 sm:items-center p-2.5 sm:p-0 bg-zinc-50/50 sm:bg-transparent border sm:border-0 border-zinc-150 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11.5px] font-black w-5 shrink-0 text-center text-[var(--text-primary)]">{opt.label || String.fromCharCode(65 + optIdx)}.</span>
                                    <span className="text-[9px] font-black uppercase text-zinc-400 sm:hidden">Configure Options:</span>
                                  </div>
                                  <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5 flex-1 pl-7 sm:pl-0">
                                    <input
                                      type="text"
                                      value={opt.text_hin || opt.text || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updatedOpts = [...editedQuestionData.options];
                                        updatedOpts[optIdx] = {
                                          ...updatedOpts[optIdx],
                                          text_hin: val,
                                          text: val,
                                        };
                                        setEditedQuestionData({ ...editedQuestionData, options: updatedOpts });
                                      }}
                                      className="flex-1 bg-[var(--input-bg)] border border-[var(--border-card)] text-[11px] px-2 py-1 rounded text-[var(--text-primary)]"
                                      placeholder="Hindi Option text..."
                                    />
                                    <input
                                      type="text"
                                      value={opt.text_eng || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updatedOpts = [...editedQuestionData.options];
                                        updatedOpts[optIdx] = {
                                          ...updatedOpts[optIdx],
                                          text_eng: val,
                                          text: updatedOpts[optIdx].text_hin || val,
                                        };
                                        setEditedQuestionData({ ...editedQuestionData, options: updatedOpts });
                                      }}
                                      className="flex-1 bg-[var(--input-bg)] border border-[var(--border-card)] text-[11px] px-2 py-1 rounded text-[var(--text-primary)]"
                                      placeholder="English Option text..."
                                    />
                                  </div>
                                  <div className="flex justify-end pl-7 sm:pl-0 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setEditedQuestionData({ ...editedQuestionData, answer: opt.label || "" })}
                                      className={`px-3 py-1 text-[10px] font-extrabold rounded uppercase transition-colors select-none ${
                                        editedQuestionData.answer === opt.label
                                          ? "bg-green-500 text-white border border-transparent"
                                          : "bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-card)] hover:border-zinc-350"
                                      }`}
                                    >
                                      Correct Key
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Correct Answer Selector & Subjects */}
                          <div className="flex gap-4">
                            <div className="flex-1">
                              <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Correct Answer</label>
                              <select
                                value={editedQuestionData?.answer || "A"}
                                onChange={(e) => setEditedQuestionData({ ...editedQuestionData, answer: e.target.value })}
                                className="w-full bg-[var(--input-bg)] border border-[var(--border-card)] text-[11px] p-2 rounded text-[var(--text-primary)] focus:outline-none"
                              >
                                {["A", "B", "C", "D", "a", "b", "c", "d", "1", "2", "3", "4"].map((key) => (
                                  <option key={key} value={key}>{key}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Solutions */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Explanation (Hindi)</label>
                              <textarea
                                value={editedQuestionData?.solution_hin || ""}
                                onChange={(e) => setEditedQuestionData({ ...editedQuestionData, solution_hin: e.target.value })}
                                className="w-full bg-[var(--input-bg)] border border-[var(--border-card)] text-[11px] p-2 rounded text-[var(--text-primary)] min-h-[50px] resize-y"
                                placeholder="Hindi explanation..."
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Explanation (English)</label>
                              <textarea
                                value={editedQuestionData?.solution_eng || ""}
                                onChange={(e) => setEditedQuestionData({ ...editedQuestionData, solution_eng: e.target.value })}
                                className="w-full bg-[var(--input-bg)] border border-[var(--border-card)] text-[11px] p-2 rounded text-[var(--text-primary)] min-h-[50px] resize-y"
                                placeholder="English explanation..."
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-[6px] cursor-default flex flex-col gap-1.5 transition-all hover:border-[var(--border-strong)]" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-card)] pb-1.5 mb-1.5">
                            <span className="text-[10px] font-black text-orange-500 uppercase tracking-wider">Page P{page.pageNumber} • Question {idx + 1}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => handleStartEditQuestion(q, e)}
                                className="text-[9px] bg-sky-500/10 hover:bg-sky-500 text-sky-600 hover:text-white border border-sky-500/20 px-2 py-0.5 rounded font-black uppercase transition-all shrink-0"
                              >
                                Edit / Correction
                              </button>
                              <button
                                onClick={(e) => handleDeleteQuestionData(q.id, e)}
                                className="text-[9px] bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white border border-red-500/20 px-2 py-0.5 rounded font-black uppercase transition-all shrink-0"
                              >
                                Remove Q
                              </button>
                            </div>
                          </div>

                          {/* Selected Language Render */}
                          {(() => {
                            if (currentLang === "EN") {
                              const engText = q.question_eng || q.questionText || "";
                              return engText ? (
                                <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-relaxed select-all">
                                  <MathRenderer text={engText} />
                                </div>
                              ) : null;
                            }
                            if (currentLang === "HI") {
                              const hinText = q.question_hin || q.questionText || "";
                              return hinText ? (
                                <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-relaxed select-all">
                                  <MathRenderer text={hinText} />
                                </div>
                              ) : null;
                            }
                            // BOTH
                            return (
                              <div className="space-y-1.5">
                                {q.question_eng && (
                                  <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-relaxed select-all">
                                    <span className="text-[9px] bg-sky-600 text-white font-extrabold px-1 rounded mr-1">English</span>
                                    <MathRenderer text={q.question_eng} />
                                  </div>
                                )}
                                {q.question_hin && (
                                  <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-relaxed select-all border-t border-dashed border-zinc-100 pt-1">
                                    <span className="text-[9px] bg-orange-600 text-white font-extrabold px-1 rounded mr-1">Hindi</span>
                                    <MathRenderer text={q.question_hin} />
                                  </div>
                                )}
                                {!q.question_hin && !q.question_eng && q.questionText && (
                                  <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-relaxed select-all">
                                    <MathRenderer text={q.questionText} />
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Render Options */}
                          {q.options && q.options.length > 0 && (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                              {q.options.map((o: any) => (
                                <div
                                  key={o.label}
                                  className={`p-2 rounded border flex flex-col gap-0.5 transition-colors ${
                                    o.label === q.answer
                                      ? "bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)] font-bold shadow-sm"
                                      : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)]"
                                  }`}
                                >
                                  <span className={`font-black ${o.label === q.answer ? "text-[rgba(var(--success-text-rgb),0.9)]" : "text-[var(--text-muted)]"}`}>
                                    Option {o.label}: {o.label === q.answer && " (✅ CORRECT KEY)"}
                                  </span>
                                  {(() => {
                                    const cL = currentLang;
                                    if (cL === "EN") return o.text_eng ? <div className="leading-normal"><MathRenderer text={o.text_eng} /></div> : null;
                                    if (cL === "HI") return o.text_hin ? <div className="leading-normal"><MathRenderer text={o.text_hin} /></div> : null;
                                    return o.text_hin ? <div className="leading-normal"><span className="text-[8px] text-orange-600 uppercase font-black mr-1 bg-orange-500/10 px-1 rounded">HI:</span><MathRenderer text={o.text_hin} /></div> : null;
                                  })()}
                                  {(() => {
                                    const cL = currentLang;
                                    if (cL === "BOTH") return o.text_eng ? <div className="leading-normal"><span className="text-[8px] text-sky-600 uppercase font-black mr-1 bg-sky-500/10 px-1 rounded">EN:</span><MathRenderer text={o.text_eng} /></div> : null;
                                    return null;
                                  })()}
                                  {!o.text_hin && !o.text_eng && o.text && <div className="leading-normal"><MathRenderer text={o.text} /></div>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Render solution */}
                          {(q.solution_hin || q.solution_eng || q.solution) && (
                            <div className="mt-2 text-[10.5px] bg-[var(--success-bg)]/10 text-[var(--text-primary)] p-2.5 rounded border border-[var(--success-border)]/20">
                              <span className="font-extrabold text-[8.5px] uppercase tracking-wider text-green-600 block mb-1">Explanation & Solution Details:</span>
                              {(() => {
                                const cL = currentLang;
                                if (cL === "EN") return q.solution_eng ? <div className="leading-snug"><MathRenderer text={q.solution_eng} /></div> : null;
                                if (cL === "HI") return q.solution_hin ? <div className="leading-snug"><MathRenderer text={q.solution_hin} /></div> : null;
                                return q.solution_hin ? <div className="mb-1 leading-snug"><span className="font-bold text-[9px] text-[#FF6B2B]">Hindi: </span><MathRenderer text={q.solution_hin} /></div> : null;
                              })()}
                              {(() => {
                                const cL = currentLang;
                                if (cL === "BOTH") return q.solution_eng ? <div className="leading-snug"><span className="font-bold text-[9px] text-sky-600">English: </span><MathRenderer text={q.solution_eng} /></div> : null;
                                return null;
                              })()}
                              {!q.solution_hin && !q.solution_eng && q.solution && <div className="leading-snug"><MathRenderer text={q.solution} /></div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-2 border-t border-[var(--border-card)] pt-3">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">Raw Text OCR</span>
              <div className="flex items-center gap-2">
                {onReExtractFromTextLocally && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReExtractFromTextLocally(page.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[10px] font-bold uppercase transition-all cursor-pointer bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-link)] hover:bg-[var(--accent-subtle)]"
                  >
                    <RefreshCw size={11} /> Fast Parse
                  </button>
                )}
                {onReExtractFromTextAi && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReExtractFromTextAi(page.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[10px] font-bold uppercase transition-all cursor-pointer bg-[var(--accent)] text-[var(--text-on-accent)] border border-transparent hover:bg-[var(--accent-hover)]"
                  >
                    <RefreshCw size={11} /> AI Re-Extract
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditing) {
                      handleSaveEdit();
                    } else {
                      setIsEditing(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    isEditing
                      ? "bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]"
                      : "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-card)] hover:border-[var(--accent)]"
                  }`}
                >
                  {isEditing ? (
                    <>
                      <Save size={11} /> Save Text
                    </>
                  ) : (
                    <>
                      <Edit2 size={11} /> Edit Text
                    </>
                  )}
                </button>
              </div>
            </div>

            {isEditing ? (
              <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full min-h-[300px] bg-[var(--input-bg)] border border-[var(--accent)] text-[var(--text-primary)] text-[12px] rounded-[6px] p-3 focus:outline-none focus:ring-2 ring-[var(--accent)]/20 font-mono resize-y"
                  placeholder="Edit the extracted text to correct typos, merge answers from another page, or fix layout issues..."
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-[var(--text-muted)] px-1">Tip: Paste text from the next page here to merge questions with answers, then click Save and "Fast Parse".</p>
                  {hasNextPage && onMergeNext && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMergeNext();
                      }}
                      className="px-2 py-1 text-[10px] font-bold bg-[#FF6B2B]/20 text-[#FF6B2B] hover:bg-[#FF6B2B] hover:text-white border border-[#FF6B2B]/30 rounded transition-colors uppercase tracking-wider"
                    >
                      + Pull Text from Next Page
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div 
                className="w-full min-h-[100px] bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[6px] p-4 overflow-y-auto max-h-[500px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="prose prose-sm prose-invert max-w-none text-[var(--text-primary)]">
                  <Markdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {page.extractedText || ""}
                  </Markdown>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ProcessingList: React.FC<Props> = ({
  pages,
  onUpdateText,
  onRetry,
  onToggleSelection,
  mcqQuestions,
  updateMcqQuestionsAndSave,
  onReExtractFromTextLocally,
  onReExtractFromTextAi,
  onMergeNext,
}) => {
  return (
    <div className="flex flex-col gap-2 py-1">
      {pages.map((page, index) => {
        // Only allow pulling from the next page if it's in the same document
        const hasNextPage = index < pages.length - 1 && pages[index + 1].documentId === page.documentId && pages[index + 1].status === 'done';
        
        return (
          <PageProcessItem
            key={`${page.id}-${index}`}
            page={page}
            onRetry={onRetry}
            onToggleSelection={onToggleSelection}
            onUpdateText={onUpdateText}
            mcqQuestions={mcqQuestions}
            updateMcqQuestionsAndSave={updateMcqQuestionsAndSave}
            onReExtractFromTextLocally={onReExtractFromTextLocally}
            onReExtractFromTextAi={onReExtractFromTextAi}
            onMergeNext={onMergeNext ? () => onMergeNext(page.id) : undefined}
            hasNextPage={hasNextPage}
          />
        );
      })}
    </div>
  );
};

export default ProcessingList;
