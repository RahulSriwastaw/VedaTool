import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'motion/react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  BookOpen, CheckCircle, Download,
  HelpCircle, Printer,
  RefreshCw, User as UserIcon, XCircle, Sparkles, AlertCircle, ArrowLeft
} from 'lucide-react';

interface ParsedQuestion {
  id: string;
  questionText: string;
  options: string[];
  answer: string;
  isCorrect: boolean;
  userAnswer: string;
}

interface SubmissionData {
  id: string;
  submissionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  questions: ParsedQuestion[];
  score: number;
  metadata: { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; parsedAt: string; };
  studentData?: { name?: string, roll?: string, exam?: string, date?: string, photoUrl?: string };
  inputMode: string;
  createdAt: any;
}

const EXAM_SCHEMAS: Record<string, { name: string, positive: number, negative: number, candidates: number, defaultMaxMarks: number, subjects: string[] }> = {
  jee: {
    name: "JEE Main (Joint Entrance Examination)",
    positive: 4, negative: -1, candidates: 1240000, defaultMaxMarks: 300,
    subjects: ["Physics", "Chemistry", "Mathematics"]
  },
  neet: {
    name: "NEET UG (National Eligibility cum Entrance Test)",
    positive: 4, negative: -1, candidates: 2160000, defaultMaxMarks: 720,
    subjects: ["Physics", "Chemistry", "Botany", "Zoology"]
  },
  ssc: {
    name: "SSC CGL (Staff Selection Commission)",
    positive: 2, negative: -0.5, candidates: 1480000, defaultMaxMarks: 200,
    subjects: ["Quantitative Aptitude", "Reasoning & Intelligence", "English Comprehension", "General Awareness"]
  },
  rrb: {
    name: "RRB NTPC (Railway Recruitment Board)",
    positive: 1, negative: -0.33, candidates: 3250000, defaultMaxMarks: 120,
    subjects: ["Mathematics", "General Intelligence & Reasoning", "General Awareness"]
  },
  generic: {
    name: "General Talent & Evaluation Test",
    positive: 1, negative: 0, candidates: 50000, defaultMaxMarks: 100,
    subjects: ["Logical Reasoning", "Quantitative Ability", "Verbal Aptitude"]
  }
};

export default function SubmissionDetail({ user: _user }: { user: User | null }) {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [examType, setExamType] = useState("generic");

  useEffect(() => {
    const loadSubmission = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'vedarank_submissions', id));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as SubmissionData;
          setSubmission(data);
          if (data.studentData?.exam) {
            const examStr = data.studentData.exam.toLowerCase();
            if (examStr.includes("jee") || examStr.includes("joint entrance")) setExamType("jee");
            else if (examStr.includes("neet") || examStr.includes("medical") || examStr.includes("national eligibility")) setExamType("neet");
            else if (examStr.includes("ssc") || examStr.includes("staff selection") || examStr.includes("cgl")) setExamType("ssc");
            else if (examStr.includes("rrb") || examStr.includes("railway") || examStr.includes("ntpc")) setExamType("rrb");
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    loadSubmission();
  }, [id]);

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="animate-spin h-7 w-7 border-[3px] border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!submission) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <AlertCircle className="w-10 h-10 text-zinc-700 mb-4" />
      <h2 className="text-lg font-black text-white mb-2">Scorecard Not Found</h2>
      <p className="text-zinc-500 text-[13px] mb-6 max-w-sm">This response sheet doesn't exist or has been removed.</p>
      <Link to="/" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition">← Return Home</Link>
    </div>
  );

  const schema = EXAM_SCHEMAS[examType] || EXAM_SCHEMAS.generic;
  const studentData = submission.studentData || {};
  const studentName = studentData.name || submission.userName || "Anonymous Candidate";
  const rollNumber = studentData.roll || `VEDA-${submission.submissionId.substring(0, 6).toUpperCase()}`;
  const studentPhoto = studentData.photoUrl;
  const category = "General";

  const totalQuestions = submission.metadata.totalQuestions || 0;
  const correctCount = submission.metadata.correctAnswers || 0;
  const incorrectCount = submission.metadata.incorrectAnswers || 0;
  const unattemptedCount = totalQuestions - correctCount - incorrectCount;

  const rawScore = correctCount * schema.positive + incorrectCount * schema.negative;
  const maxPossibleScore = totalQuestions * schema.positive;

  const accuracy = correctCount + incorrectCount > 0
    ? parseFloat(((correctCount / (correctCount + incorrectCount)) * 100).toFixed(2))
    : 0;

  const calculatePercentileValue = (score: number, maxScore: number) => {
    if (maxScore <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, score / maxScore));
    let p = 100 * Math.pow(ratio, 1.8);
    if (ratio >= 0.5) p = 85 + 14.99 * Math.pow((ratio - 0.5) / 0.5, 0.7);
    else p = Math.max(1, 85 * Math.pow(ratio / 0.5, 2));
    return Math.min(99.9999, Math.max(1.0001, parseFloat(p.toFixed(4))));
  };

  const percentile = calculatePercentileValue(rawScore, maxPossibleScore);
  const simulatedRank = Math.max(1, Math.round(((100 - percentile) / 100) * schema.candidates));

  const sections: Record<string, { total: number, correct: number, incorrect: number, unattempted: number, marks: number }> = {};
  schema.subjects.forEach(sub => { sections[sub] = { total: 0, correct: 0, incorrect: 0, unattempted: 0, marks: 0 }; });

  if (submission.questions) {
    submission.questions.forEach((q, idx) => {
      const sub = schema.subjects[idx % schema.subjects.length];
      sections[sub].total += 1;
      if (!q.userAnswer) {
        sections[sub].unattempted += 1;
      } else if (q.isCorrect) {
        sections[sub].correct += 1;
        sections[sub].marks += schema.positive;
      } else {
        sections[sub].incorrect += 1;
        sections[sub].marks += schema.negative;
      }
    });
  }

  const handleDownloadPDF = async () => {
    const element = document.getElementById("vedarank-marksheet");
    if (!element) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`VedaRank_Scorecard_${studentName.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("PDF download failed:", err);
      alert("Failed to export PDF. Try the print option instead.");
    } finally { setIsExporting(false); }
  };

  const printMarksheet = () => { window.print(); };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8 font-sans text-slate-100">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * { visibility: hidden; }
          #vedarank-marksheet, #vedarank-marksheet * { visibility: visible; }
          #vedarank-marksheet {
            position: absolute; left: 0; top: 0; width: 210mm; min-height: 297mm;
            padding: 15mm; box-shadow: none; border: none; background: white !important; color: #0f172a !important;
          }
        }
      ` }} />

      {/* Back link */}
      <Link
        to={_user ? "/dashboard" : "/"}
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-zinc-500 hover:text-zinc-200 transition mb-6"
      >
        <ArrowLeft size={14} /> Back
      </Link>

      {/* Action bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 px-5 py-4 rounded-2xl mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <p className="text-[14px] font-black text-white leading-none mb-0.5">Scorecard Ready</p>
            <p className="text-[12px] text-zinc-500">Simulated AIR rank and verified report generated.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={printMarksheet}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-[13px] font-bold text-white transition cursor-pointer"
          >
            <Printer size={14} /> Print
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white rounded-xl text-[13px] font-bold transition disabled:opacity-60 cursor-pointer"
          >
            {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Download PDF
          </button>
        </div>
      </motion.div>

      {/* ── MARKSHEET (A4) ── */}
      <div className="overflow-x-auto pb-4 flex justify-center">
        <div
          id="vedarank-marksheet"
          className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-10 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-slate-200 flex flex-col relative text-left"
        >
          {/* Branding header */}
          <div className="border-b-4 border-indigo-900 pb-4 mb-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-900 rounded-lg flex items-center justify-center text-white shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-[18px] font-black tracking-tight leading-none text-indigo-950">VEDARANK EVALUATION SYSTEMS</h2>
                  <span className="text-[8.5px] uppercase tracking-widest font-bold text-indigo-700">Digital Assessment Agency · National Exam Review Portal</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block bg-indigo-900 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1">OFFICIAL SCORECARD</span>
                <p className="text-[8px] font-bold text-slate-400">ID: {submission.submissionId.substring(0, 16).toUpperCase()}</p>
              </div>
            </div>
          </div>

          {/* Exam title bar */}
          <div className="text-center bg-indigo-50 border-y border-indigo-100 py-2 mb-5">
            <h3 className="text-[12px] font-extrabold text-indigo-900 uppercase tracking-wide">
              {schema.name} — MOCK REPORT CARD
            </h3>
          </div>

          {/* Student profile */}
          <div className="grid grid-cols-12 gap-5 mb-5">
            <div className="col-span-3 flex justify-center">
              {studentPhoto ? (
                <img src={studentPhoto} alt={studentName} className="w-28 h-32 rounded border-2 border-slate-300 object-cover shadow-sm bg-slate-50" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-28 h-32 rounded border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                  <UserIcon size={32} />
                  <span className="text-[8px] font-bold text-slate-400 mt-1.5 uppercase tracking-wide">Photo Space</span>
                </div>
              )}
            </div>
            <div className="col-span-9 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {[
                { label: "Student Name", value: studentName.toUpperCase(), bold: true },
                { label: "Roll / Hall Ticket No.", value: rollNumber, bold: true },
                { label: "Exam Category", value: schema.name.split(" (")[0] },
                { label: "Caste Category", value: category },
                { label: "Evaluation Date", value: new Date(submission.metadata.parsedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) },
              ].map(({ label, value, bold }) => (
                <div key={label}>
                  <span className="block text-[8.5px] font-extrabold text-slate-400 uppercase mb-0.5">{label}</span>
                  <span className={`block ${bold ? 'font-extrabold text-slate-800 text-sm' : 'font-semibold text-slate-700'}`}>{value}</span>
                </div>
              ))}
              <div>
                <span className="block text-[8.5px] font-extrabold text-slate-400 uppercase mb-0.5">Result Status</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle size={9} /> EVALUATED
                </span>
              </div>
            </div>
          </div>

          {/* Hero stat badges */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "ALL INDIA RANK", value: `AIR #${simulatedRank.toLocaleString()}`, color: "from-indigo-900 to-indigo-950", border: "border-indigo-600", text: "text-white", sub: "text-indigo-300", bar: false },
              { label: "PERCENTILE", value: `${percentile}%`, color: "from-slate-800 to-slate-900", border: "border-indigo-500", text: "text-indigo-400", sub: "text-slate-400", bar: true, pct: percentile },
              { label: "RAW SCORE", value: rawScore, suffix: `/ ${maxPossibleScore}`, color: "from-slate-800 to-slate-900", border: "border-emerald-500", text: "text-emerald-400", sub: "text-slate-400", bar: true, pct: Math.max(0, (rawScore / maxPossibleScore) * 100), barColor: "bg-emerald-400" },
              { label: "ACCURACY", value: `${accuracy}%`, color: "from-slate-800 to-slate-900", border: "border-indigo-500", text: "text-indigo-400", sub: "text-slate-400", bar: true, pct: accuracy },
            ].map((s: any) => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} text-white rounded-xl p-3 text-center border-b-4 ${s.border} shadow-md relative overflow-hidden`}>
                <span className={`block text-[7.5px] font-black ${s.sub} uppercase tracking-widest`}>{s.label}</span>
                <span className={`text-[16px] font-black tracking-tight block ${s.text}`}>
                  {s.value}{s.suffix && <span className="text-[9px] text-slate-400 ml-0.5">{s.suffix}</span>}
                </span>
                {s.bar && (
                  <>
                    <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10" />
                    <div className="absolute bottom-0 left-0 h-1 transition-all" style={{ width: `${s.pct}%`, background: s.barColor || '#818cf8' }} />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Subject performance table */}
          <div className="mb-5 flex-grow">
            <h4 className="text-[10.5px] font-extrabold uppercase text-slate-700 tracking-wider mb-2">Subject-Wise Performance</h4>
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[9.5px] font-bold border-b border-slate-200 uppercase tracking-wide">
                  {["Subject / Section", "Total Qs", "Correct", "Incorrect", "Left", "Marks"].map((h, i) => (
                    <th key={h} className={`py-2 px-2.5 border border-slate-200 ${i > 0 ? 'text-center' : ''} ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[11px] text-slate-700">
                {Object.entries(sections).map(([subName, stats], i) => (
                  <tr key={i} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="py-2 px-2.5 font-bold text-slate-800 border border-slate-200">{subName}</td>
                    <td className="py-2 px-2.5 text-center border border-slate-200">{stats.total}</td>
                    <td className="py-2 px-2.5 text-center text-emerald-600 font-semibold border border-slate-200">{stats.correct}</td>
                    <td className="py-2 px-2.5 text-center text-red-500 font-semibold border border-slate-200">{stats.incorrect}</td>
                    <td className="py-2 px-2.5 text-center text-slate-400 border border-slate-200">{stats.unattempted}</td>
                    <td className="py-2 px-2.5 text-right font-extrabold text-slate-800 border border-slate-200">{stats.marks}</td>
                  </tr>
                ))}
                <tr className="bg-indigo-50 border-t-2 border-indigo-900 font-extrabold text-slate-900">
                  <td className="py-2 px-2.5 uppercase border border-slate-200 text-[10px]">Total Evaluation</td>
                  <td className="py-2 px-2.5 text-center border border-slate-200">{totalQuestions}</td>
                  <td className="py-2 px-2.5 text-center text-emerald-700 border border-slate-200">{correctCount}</td>
                  <td className="py-2 px-2.5 text-center text-red-700 border border-slate-200">{incorrectCount}</td>
                  <td className="py-2 px-2.5 text-center border border-slate-200">{unattemptedCount}</td>
                  <td className="py-2 px-2.5 text-right text-indigo-900 text-[13px] border border-slate-200">{rawScore}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-5 mt-auto flex justify-between items-end">
            <div className="flex gap-3 items-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=https://www.vedatool.com/verify/${submission.submissionId}`}
                alt="QR"
                className="w-14 h-14 border p-0.5 bg-white shadow-sm shrink-0"
              />
              <div>
                <span className="block text-[7.5px] font-extrabold text-slate-400 uppercase">Verification</span>
                <span className="text-[9.5px] font-extrabold text-indigo-900 block">SCAN TO VERIFY REPORT</span>
                <span className="text-[7.5px] text-slate-400 font-mono block">Hash: {submission.submissionId.substring(0, 28)}</span>
              </div>
            </div>
            <div className="flex gap-5 items-center">
              <div className="w-16 h-16 border-2 border-dashed border-indigo-500/30 rounded-full flex flex-col items-center justify-center text-[6.5px] font-bold text-indigo-500/50 rotate-[-12deg] tracking-wide shrink-0">
                <span>VEDARANK</span>
                <span>DIGITAL</span>
                <span>SEAL</span>
              </div>
              <div className="text-center w-28 border-t border-slate-300 pt-1">
                <span className="text-indigo-700 text-[13px] block leading-none font-bold" style={{ fontFamily: 'Georgia, serif' }}>Rahul Sriwastaw</span>
                <span className="block text-[7px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">Controller of Evaluation</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── QUESTION ANALYSIS ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
          <h3 className="text-[15px] font-black flex items-center gap-2.5 text-white">
            <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
              <BookOpen size={16} />
            </span>
            Detailed Question Analysis
          </h3>
          <span className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-zinc-500">
            {totalQuestions} Questions
          </span>
        </div>

        <div className="space-y-3">
          {submission.questions.map((question, index) => {
            const status = question.userAnswer === "" ? 'skip' : question.isCorrect ? 'correct' : 'wrong';
            const statusColors = {
              skip: { bar: 'bg-zinc-700', badge: 'bg-zinc-800 text-zinc-400 border-zinc-700', num: 'bg-zinc-800 text-zinc-500' },
              correct: { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', num: 'bg-emerald-500/10 text-emerald-400' },
              wrong: { bar: 'bg-red-500', badge: 'bg-red-500/10 text-red-400 border-red-500/20', num: 'bg-red-500/10 text-red-400' },
            }[status];

            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                key={question.id || index}
                className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all"
              >
                <div className="flex items-start gap-3.5 p-4">
                  {/* Left accent bar */}
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${statusColors.bar}`} />

                  {/* Q number */}
                  <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-black shrink-0 ${statusColors.num}`}>
                    {index + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Question text */}
                    <p className="text-[13px] font-semibold text-zinc-200 mb-3 leading-relaxed">{question.questionText}</p>

                    {/* Options */}
                    {question.options && question.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                        {question.options.map((option, optIndex) => {
                          const optLabel = String.fromCharCode(65 + optIndex);
                          const isUserPick = question.userAnswer === optLabel;
                          const isCorrectAnswer = question.answer === optLabel;
                          const optStyle = isCorrectAnswer
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : isUserPick
                              ? "bg-red-500/10 border-red-500/30 text-red-300"
                              : "bg-zinc-900 border-zinc-800 text-zinc-500";

                          return (
                            <div key={optIndex} className={`flex items-center gap-2.5 px-3 py-2 border rounded-lg text-[12px] font-semibold transition-colors ${optStyle}`}>
                              <span className="shrink-0 w-5 h-5 rounded-md border border-current/20 flex items-center justify-center text-[10px] font-black opacity-60">{optLabel}</span>
                              <span className="truncate flex-1">{option}</span>
                              {isCorrectAnswer && <CheckCircle size={12} className="ml-auto shrink-0 text-emerald-400" />}
                              {isUserPick && !isCorrectAnswer && <XCircle size={12} className="ml-auto shrink-0 text-red-400 opacity-70" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Footer pills */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-zinc-800/60">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-bold border ${statusColors.badge}`}>
                        {status === 'skip' ? <HelpCircle size={11} /> : status === 'correct' ? <CheckCircle size={11} /> : <XCircle size={11} />}
                        {status === 'skip' ? 'Not Answered' : status === 'correct' ? 'Correct' : 'Incorrect'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold bg-zinc-900 border border-zinc-800 text-zinc-400">
                        Answer: <strong className="text-indigo-400 ml-0.5">{question.answer || "N/A"}</strong>
                      </span>
                      {question.userAnswer && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold bg-zinc-900 border border-zinc-800 text-zinc-400">
                          Your pick: <strong className="text-zinc-200 ml-0.5">{question.userAnswer}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}