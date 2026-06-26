import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { FileText, TrendingUp, Clock, ChevronRight, Inbox } from 'lucide-react';

interface Submission {
  id: string; submissionId: string; score: number;
  metadata: { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; parsedAt: string; };
  inputMode: string; createdAt: any;
}

export default function Dashboard({ user }: { user: User }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, avgScore: 0, totalQ: 0 });

  useEffect(() => { load(); }, [user.uid]);

  const load = async () => {
    try {
      const q = query(collection(db, 'vedarank_submissions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Submission[];
      setSubmissions(data);
      if (data.length) {
        const totalScore = data.reduce((s, x) => s + x.score, 0);
        const totalQ = data.reduce((s, x) => s + (x.metadata?.totalQuestions || 0), 0);
        setStats({ total: data.length, avgScore: Math.round(totalScore / data.length), totalQ });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-white">Dashboard</h1>
        <p className="text-xs text-zinc-500">{user.displayName || user.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-400">{stats.total}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Submissions</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{stats.avgScore}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Avg Score</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-zinc-300">{stats.totalQ}</p>
          <p className="text-[10px] text-zinc-500 uppercase">Questions</p>
        </div>
      </div>

      {/* Submissions */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300">History</span>
          <span className="text-[10px] text-zinc-600">{submissions.length} total</span>
        </div>

        {submissions.length === 0 ? (
          <div className="py-10 text-center">
            <Inbox className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No submissions yet</p>
            <Link to="/" className="text-xs text-indigo-400 mt-1 inline-block">Analyze your first result →</Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {submissions.map(sub => {
              const pct = sub.metadata?.totalQuestions ? Math.round((sub.score / sub.metadata.totalQuestions) * 100) : 0;
              return (
                <Link key={sub.id} to={`/submission/${sub.id}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/50 transition group">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-indigo-500/10 rounded-md flex items-center justify-center">
                      <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs text-white font-medium">
                        {sub.score}/{sub.metadata?.totalQuestions || 0}
                        <span className={`ml-2 text-[10px] font-bold ${pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <Clock className="h-2.5 w-2.5" />
                        {sub.metadata?.parsedAt ? new Date(sub.metadata.parsedAt).toLocaleDateString() : ''}
                        <span>· {sub.inputMode}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 transition" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
