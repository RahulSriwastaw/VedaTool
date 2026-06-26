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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-12">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">Your Dashboard</h1>
          <p className="text-[15px] text-zinc-400">Welcome back, <span className="text-zinc-200 font-medium">{user.displayName || user.email}</span></p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-8">
        <div className="glass border border-white/5 rounded-2xl p-5 text-center relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-indigo-400 mb-1 relative z-10">{stats.total}</p>
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest relative z-10">Submissions</p>
        </div>
        <div className="glass border border-white/5 rounded-2xl p-5 text-center relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-emerald-400 mb-1 relative z-10">{stats.avgScore}</p>
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest relative z-10">Avg Score</p>
        </div>
        <div className="glass border border-white/5 rounded-2xl p-5 text-center relative overflow-hidden group hover:border-violet-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-zinc-200 mb-1 relative z-10">{stats.totalQ}</p>
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest relative z-10">Questions</p>
        </div>
      </div>

      {/* Submissions */}
      <div className="glass border border-white/5 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <span className="text-sm font-bold text-zinc-200 tracking-wide">Submission History</span>
          <span className="text-xs font-semibold text-zinc-500 bg-white/5 px-3 py-1 rounded-full">{submissions.length} total</span>
        </div>

        {submissions.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400 mb-2">No submissions yet</p>
            <Link to="/" className="text-[13px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
              Analyze your first result <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {submissions.map(sub => {
              const pct = sub.metadata?.totalQuestions ? Math.round((sub.score / sub.metadata.totalQuestions) * 100) : 0;
              return (
                <Link key={sub.id} to={`/submission/${sub.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                      <FileText className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-[15px] text-zinc-100 font-bold mb-0.5 flex items-center gap-2">
                        {sub.score} / {sub.metadata?.totalQuestions || 0}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${pct >= 70 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : pct >= 40 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {pct}%
                        </span>
                      </p>
                      <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-500">
                        <Clock className="h-3 w-3" />
                        {sub.metadata?.parsedAt ? new Date(sub.metadata.parsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}
                        <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                        <span className="uppercase tracking-wider text-[10px]">{sub.inputMode}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-white/5 transition-colors">
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
