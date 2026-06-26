import { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Link2, ClipboardPaste, Upload, Loader2, AlertCircle, ArrowRight, Zap } from 'lucide-react';

interface HomeProps { user: User | null; }

interface ParseResult {
  success: boolean;
  submissionId: string;
  questions: any[];
  score: number;
  metadata: { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; parsedAt: string; };
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
    { key: 'url' as const, icon: Link2, label: 'URL' },
    { key: 'paste' as const, icon: ClipboardPaste, label: 'HTML' },
    { key: 'upload' as const, icon: Upload, label: 'File' },
  ];

  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <Zap className="h-3 w-3 text-indigo-400" />
            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Exam Analyzer</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analyze Your Result</h1>
          <p className="text-xs text-zinc-500 mt-1">Response sheet URL paste karein ya HTML upload karein</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {tabs.map(tab => (
              <button key={tab.key}
                onClick={() => { setActiveTab(tab.key); setInputValue(''); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? 'text-indigo-400 bg-indigo-500/5 border-b-2 border-indigo-400 -mb-px'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-4">
            {activeTab === 'url' && (
              <input type="url" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition"
                placeholder="https://rrb.digialm.com/..." />
            )}
            {activeTab === 'paste' && (
              <textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                className="w-full h-32 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition"
                placeholder="Paste HTML source here..." />
            )}
            {activeTab === 'upload' && (
              <label className="flex flex-col items-center gap-2 py-6 border border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-indigo-500/50 transition">
                <Upload className="h-6 w-6 text-zinc-600" />
                <span className="text-xs text-zinc-500">Click to select HTML/MHT file</span>
                <input type="file" accept=".html,.htm,.mht,.mhtml" onChange={handleFileUpload} className="hidden" />
                {inputValue && <span className="text-[10px] text-emerald-400 font-medium">✓ Loaded ({(inputValue.length / 1024).toFixed(0)} KB)</span>}
              </label>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-950/30 border border-red-900/40 rounded-lg">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-300/90 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading || !inputValue.trim()}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2">
              {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>)
                : (<>Analyze <ArrowRight className="h-3.5 w-3.5" /></>)}
            </button>

            {!user && (
              <p className="text-[10px] text-zinc-600 text-center mt-2">Sign in to save results to your dashboard</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
