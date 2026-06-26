import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, CheckCircle, XCircle, Minus } from 'lucide-react';

interface Question {
  id: string; questionText: string; options: string[];
  answer: string; isCorrect: boolean; userAnswer: string;
}
interface SubmissionData {
  id: string; submissionId: string; userId: string; userEmail: string; userName: string;
  questions: Question[]; score: number;
  metadata: { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; parsedAt: string; };
  inputMode: string; createdAt: any;
}

export default function SubmissionDetail({ user: _user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all');

  useEffect(() => { loadSubmission(); }, [id]);

  const loadSubmission = async () => {
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, 'vedarank_submissions', id));
      if (snap.exists()) setSubmission({ id: snap.id, ...snap.data() } as SubmissionData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;
  if (!submission) return (
    <div className="text-center py-20">
      <p className="text-zinc-500 text-sm">Submission not found</p>
      <Link to="/dashboard" className="text-indigo-400 text-xs mt-2 inline-block">← Back</Link>
    </div>
  );

  const pct = Math.round((submission.score / (submission.metadata.totalQuestions || 1)) * 100);
  const questions = submission.questions.filter(q =>
    filter === 'all' ? true : filter === 'correct' ? q.isCorrect : !q.isCorrect
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition mb-4">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      {/* Score Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-white">Result</h1>
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${
            pct >= 70 ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' :
            pct >= 40 ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20' :
            'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
          }`}>{pct}%</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={submission.metadata.totalQuestions} color="zinc" />
          <Stat label="Correct" value={submission.metadata.correctAnswers} color="emerald" />
          <Stat label="Wrong" value={submission.metadata.incorrectAnswers} color="red" />
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 mb-3">
        {(['all', 'correct', 'wrong'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition ${
              filter === f ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}>{f} {f === 'all' ? `(${submission.questions.length})` :
              f === 'correct' ? `(${submission.metadata.correctAnswers})` : `(${submission.metadata.incorrectAnswers})`}
          </button>
        ))}
      </div>

      {/* Questions */}
      <div className="space-y-1.5">
        {questions.map((q, idx) => (
          <div key={q.id || idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--border-hover)] transition">
            <div className="flex gap-2">
              <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                q.isCorrect ? 'bg-emerald-500/15' : 'bg-red-500/15'
              }`}>
                {q.isCorrect ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-zinc-200 leading-relaxed mb-1.5">{q.questionText}</p>
                {q.options?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 mb-1.5">
                    {q.options.map((opt, i) => {
                      const letter = String.fromCharCode(65 + i);
                      const isCorrectOpt = letter === q.answer;
                      const isUserWrong = letter === q.userAnswer && !q.isCorrect;
                      return (
                        <div key={i} className={`px-2 py-1 rounded text-[11px] ${
                          isCorrectOpt ? 'bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-800/50' :
                          isUserWrong ? 'bg-red-950/40 text-red-300 ring-1 ring-red-800/50' :
                          'text-zinc-500'
                        }`}>
                          <span className="font-medium">{letter}.</span> {opt}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-3 text-[10px]">
                  {q.userAnswer && <span className={q.isCorrect ? 'text-emerald-500' : 'text-red-400'}>You: {q.userAnswer}</span>}
                  {q.answer && !q.isCorrect && <span className="text-emerald-500">Ans: {q.answer}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-zinc-300';
  return (
    <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5 text-center">
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}
