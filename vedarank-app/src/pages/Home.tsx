import { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Link2, ClipboardPaste, Upload, RefreshCw, AlertCircle, Sparkles, FileSpreadsheet, ArrowRight, Lock, BarChart2 } from 'lucide-react';
import { motion } from 'motion/react';

interface HomeProps { user: User | null; }

interface ParseResult {
  success: boolean;
  submissionId: string;
  questions: any[];
  score: number;
  metadata: { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; parsedAt: string; };
  studentData?: { name?: string, roll?: string, exam?: string, date?: string, photoUrl?: string };
}

export default function Home({ user }: HomeProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'paste' | 'upload'>('url');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!inputValue.trim()) { setError('Input required'); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/parse-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: activeTab, [activeTab === 'url' ? 'url' : 'html']: inputValue }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(response.status === 404
          ? 'Backend server not running. Run "npm run server" first.'
          : `Server error (${response.status}): Backend unreachable.`);
      }
      const data: ParseResult = await response.json();
      if (!data.success) throw new Error((data as any).message || 'Parse failed');
      if (!data.questions?.length) throw new Error('No questions found. Verify URL is correct & accessible.');

      const docRef = await addDoc(collection(db, 'vedarank_submissions'), {
        submissionId: data.submissionId,
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || 'anonymous',
        userName: user?.displayName || 'Anonymous',
        questions: data.questions,
        score: data.score,
        metadata: data.metadata,
        studentData: data.studentData || null,
        inputMode: activeTab,
        createdAt: serverTimestamp(),
      });
      navigate(`/submission/${docRef.id}`);
    } catch (err: any) {
      setError(err.name === 'TypeError' && err.message.includes('fetch')
        ? 'Network error: Cannot reach backend server.'
        : err.message);
    } finally { setLoading(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInputValue(ev.target?.result as string);
    reader.readAsText(file);
  };

  const tabs = [
    { key: 'url' as const, icon: Link2, label: 'Web URL' },
    { key: 'paste' as const, icon: ClipboardPaste, label: 'Paste HTML' },
    { key: 'upload' as const, icon: Upload, label: 'Upload File' },
  ];

  const stats = [
    { value: '2.4L+', label: 'Scorecards' },
    { value: '98%', label: 'Parse Accuracy' },
    { value: '12+', label: 'Exam Types' },
  ];

  return (
    <div className="w-full min-h-screen pt-14 flex flex-col items-center justify-center px-4 sm:px-6 py-12 relative overflow-hidden">

      {/* Background glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[600px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-12 relative z-10">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2.5 py-2 px-5 mb-8 rounded-full glass border border-white/10 shadow-xl"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-[0.2em]">
            Verified Scorecards & AIR
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl sm:text-7xl font-black tracking-tight mb-5 leading-none"
        >
          Veda<span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 via-violet-400 to-orange-400">Rank</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-zinc-400 max-w-xl leading-relaxed"
        >
          Analyze response sheets, calculate sectional percentiles, and generate verified marksheets with unparalleled precision.
        </motion.p>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-xl glass border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative z-10"
      >
        {/* Card Header */}
        <div className="flex items-center gap-4 px-6 py-6 border-b border-white/5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 flex-shrink-0 shadow-inner shadow-white/5">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100 leading-tight mb-1">Submit Response Sheet</h2>
            <p className="text-sm text-zinc-500 leading-tight">RRB · SSC · Banking · UPSC supported</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 px-6 pt-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setInputValue(''); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2.5 py-4 text-sm font-semibold transition-all border-b-2 -mb-px ${activeTab === tab.key
                  ? 'text-indigo-400 border-indigo-500 bg-indigo-500/[0.03]'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/[0.02]'
                }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="p-6 space-y-5">
          {activeTab === 'url' && (
            <div className="relative flex items-center group">
              <Link2 size={18} className="absolute left-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
              <input
                type="url"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl pl-11 pr-4 py-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all"
                placeholder="https://rrb.digialm.com/..."
              />
            </div>
          )}

          {activeTab === 'paste' && (
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full h-36 bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl px-5 py-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none transition-all font-mono leading-relaxed"
              placeholder="Paste HTML source here..."
            />
          )}

          {activeTab === 'upload' && (
            <label className="flex flex-col items-center gap-3 py-12 border-2 border-dashed border-white/10 bg-black/20 rounded-2xl cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/[0.02] transition-all group">
              <div className="p-4 rounded-full bg-white/5 group-hover:bg-indigo-500/10 group-hover:scale-110 transition-all duration-300">
                <Upload className="h-8 w-8 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="text-center">
                <span className="block text-sm font-semibold text-zinc-300 group-hover:text-zinc-100 transition-colors mb-1">Click to browse or drag file</span>
                <span className="text-xs text-zinc-500">Supports .html, .htm, .mht</span>
              </div>
              <input type="file" accept=".html,.htm,.mht,.mhtml" onChange={handleFileUpload} className="hidden" />
              {inputValue && (
                <span className="mt-2 text-xs text-emerald-400 font-bold bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Loaded ({(inputValue.length / 1024).toFixed(0)} KB)
                </span>
              )}
            </label>
          )}

          {/* Hint */}
          <div className="flex items-start gap-3 p-4 bg-indigo-500/[0.04] border border-indigo-500/10 rounded-2xl">
            <Sparkles size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-zinc-400 leading-relaxed">
              Provide the official answer key {activeTab === 'url' ? 'URL' : activeTab === 'paste' ? 'HTML' : 'file'}. VedaRank auto-extracts candidate name, roll number, and exam type.
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] rounded-2xl font-medium"
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !inputValue.trim()}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] text-white font-bold py-4 px-6 rounded-2xl text-[15px] flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:from-indigo-600 disabled:hover:to-violet-600 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Processing your result...
              </>
            ) : (
              <>
                <BarChart2 size={18} />
                Analyze & Generate Marksheet
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex border-t border-white/5 bg-white/[0.02]">
          {stats.map((s, i) => (
            <div key={i} className={`flex-1 py-5 text-center ${i > 0 ? 'border-l border-white/5' : ''}`}>
              <p className="text-2xl font-black text-zinc-100 tracking-tight leading-none mb-1.5">{s.value}</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Footer note */}
      {!user && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-2 text-[13px] font-medium text-zinc-500 mt-8 relative z-10 bg-black/40 px-4 py-2 rounded-full border border-white/5"
        >
          <Lock size={14} className="text-zinc-400" />
          Sign in to save and access past scorecards
        </motion.p>
      )}
    </div>
  );
}