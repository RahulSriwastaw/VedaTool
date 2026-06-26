import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, getDocs, doc, deleteDoc,
  setDoc, limit, startAfter, QueryDocumentSnapshot, where, getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  Shield, Users, FileText, Trash2, ChevronDown, Search,
  BarChart3, RefreshCw, Eye, Download, UserX, Filter,
  AlertTriangle, CheckCircle, XCircle, Clock, Hash,
  TrendingUp, Activity, Database, Settings, PieChart
} from 'lucide-react';

type AdminTab = 'overview' | 'submissions' | 'questions' | 'users' | 'settings';

interface Question {
  id: string;
  questionText: string;
  options: string[];
  answer: string;
  isCorrect: boolean;
  userAnswer: string;
}

interface Submission {
  id: string;
  submissionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  questions: Question[];
  score: number;
  metadata: {
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    parsedAt: string;
  };
  inputMode: string;
  createdAt: any;
}

interface UserStats {
  userId: string;
  email: string;
  name: string;
  totalSubmissions: number;
  totalQuestions: number;
  avgScore: number;
  lastActive: string;
}

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [allQuestions, setAllQuestions] = useState<(Question & { userName: string; userEmail: string; submissionDate: string })[]>([]);
  const [stats, setStats] = useState({
    totalSubmissions: 0, totalQuestions: 0, uniqueUsers: 0,
    avgScore: 0, todaySubmissions: 0, correctRate: 0
  });
  const [filterMode, setFilterMode] = useState<'all' | 'today' | 'week'>('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const PAGE_SIZE = 50;

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadSubmissions(), loadUserStats()]);
      setLastRefreshedAt(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadSubmissions = async (loadMore = false) => {
    try {
      let q;
      if (loadMore && lastDoc) {
        q = query(collection(db, 'vedarank_submissions'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      } else {
        q = query(collection(db, 'vedarank_submissions'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Submission[];

      if (loadMore) {
        setSubmissions(prev => [...prev, ...data]);
      } else {
        setSubmissions(data);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);

      // Calculate global stats
      if (!loadMore) {
        const allQ = query(collection(db, 'vedarank_submissions'));
        const allSnapshot = await getDocs(allQ);
        const allData = allSnapshot.docs.map(d => d.data());
        const uniqueUserIds = new Set(allData.map(d => d.userId));
        const totalQ = allData.reduce((sum, d) => sum + (d.metadata?.totalQuestions || 0), 0);
        const totalCorrect = allData.reduce((sum, d) => sum + (d.metadata?.correctAnswers || 0), 0);
        const totalScore = allData.reduce((sum, d) => sum + (d.score || 0), 0);

        const today = new Date().toDateString();
        const todayCount = allData.filter(d => {
          const parsed = d.metadata?.parsedAt;
          return parsed && new Date(parsed).toDateString() === today;
        }).length;

        setStats({
          totalSubmissions: allSnapshot.size,
          totalQuestions: totalQ,
          uniqueUsers: uniqueUserIds.size,
          avgScore: allSnapshot.size > 0 ? Math.round(totalScore / allSnapshot.size) : 0,
          todaySubmissions: todayCount,
          correctRate: totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0
        });

        // Extract all questions for the question bank
        const questionsBank: (Question & { userName: string; userEmail: string; submissionDate: string })[] = [];
        allData.forEach(sub => {
          (sub.questions || []).forEach((q: Question) => {
            questionsBank.push({
              ...q,
              userName: sub.userName || 'Anonymous',
              userEmail: sub.userEmail || '',
              submissionDate: sub.metadata?.parsedAt || ''
            });
          });
        });
        setAllQuestions(questionsBank);
      }
    } catch (error) {
      console.error('Failed to load submissions:', error);
    }
  };

  const loadUserStats = async () => {
    try {
      const allQ = query(collection(db, 'vedarank_submissions'));
      const allSnapshot = await getDocs(allQ);
      const userMap: Record<string, UserStats> = {};

      allSnapshot.docs.forEach(d => {
        const data = d.data();
        const uid = data.userId || 'anonymous';
        if (!userMap[uid]) {
          userMap[uid] = {
            userId: uid,
            email: data.userEmail || 'anonymous',
            name: data.userName || 'Anonymous',
            totalSubmissions: 0,
            totalQuestions: 0,
            avgScore: 0,
            lastActive: ''
          };
        }
        userMap[uid].totalSubmissions++;
        userMap[uid].totalQuestions += data.metadata?.totalQuestions || 0;
        userMap[uid].avgScore += data.score || 0;
        const parsedAt = data.metadata?.parsedAt || '';
        if (parsedAt > userMap[uid].lastActive) {
          userMap[uid].lastActive = parsedAt;
        }
      });

      // Compute average
      Object.values(userMap).forEach(u => {
        if (u.totalSubmissions > 0) {
          u.avgScore = Math.round(u.avgScore / u.totalSubmissions);
        }
      });

      setUserStats(Object.values(userMap).sort((a, b) => b.totalSubmissions - a.totalSubmissions));
    } catch (error) {
      console.error('Failed to load user stats:', error);
    }
  };

  const handleDelete = async (submissionId: string) => {
    if (!confirm('Kya aap sure hain? Yeh submission permanently delete ho jayega.')) return;
    try {
      await deleteDoc(doc(db, 'vedarank_submissions', submissionId));
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      setStats(prev => ({ ...prev, totalSubmissions: prev.totalSubmissions - 1 }));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed!');
    }
  };

  const handleDeleteAllByUser = async (userId: string) => {
    if (!confirm(`User "${userId}" ke SABHI submissions delete karna chahte hain? Yeh irreversible hai!`)) return;
    try {
      const q = query(collection(db, 'vedarank_submissions'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      setSubmissions(prev => prev.filter(s => s.userId !== userId));
      alert(`${snapshot.size} submissions deleted for user.`);
      loadAllData();
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Bulk delete failed!');
    }
  };

  const handleExportAllQuestions = () => {
    let csv = 'Question,Options,Correct Answer,User Answer,Is Correct,User,Date\n';
    allQuestions.forEach(q => {
      const opts = (q.options || []).join(' | ');
      csv += `"${q.questionText?.replace(/"/g, '""') || ''}","${opts}","${q.answer}","${q.userAnswer}","${q.isCorrect}","${q.userEmail}","${q.submissionDate}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VedaRank_Questions_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSubmissions = () => {
    let csv = 'User Name,Email,Score,Total Questions,Correct,Incorrect,Mode,Date\n';
    submissions.forEach(s => {
      csv += `"${s.userName}","${s.userEmail}",${s.score},${s.metadata?.totalQuestions || 0},${s.metadata?.correctAnswers || 0},${s.metadata?.incorrectAnswers || 0},"${s.inputMode}","${s.metadata?.parsedAt || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VedaRank_Submissions_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredSubmissions = submissions.filter(s => {
    const matchesSearch =
      s.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.submissionId?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterMode === 'today') {
      const today = new Date().toDateString();
      const subDate = s.metadata?.parsedAt ? new Date(s.metadata.parsedAt).toDateString() : '';
      return matchesSearch && subDate === today;
    }
    if (filterMode === 'week') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const subTime = s.metadata?.parsedAt ? new Date(s.metadata.parsedAt).getTime() : 0;
      return matchesSearch && subTime >= weekAgo;
    }
    return matchesSearch;
  });

  const filteredQuestions = allQuestions.filter(q =>
    q.questionText?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.userEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Loading Admin Console...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 flex flex-col">
      {/* Admin Top Bar */}
      <header className="sticky top-12 z-40 h-10 bg-[#0e0e14]/95 backdrop-blur-xl border-b border-zinc-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-amber-400" />
          <span className="text-xs font-bold text-white">Admin Console</span>
          <span className="bg-red-500/15 text-red-400 text-[8px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded">LIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 hidden md:inline">
            {lastRefreshedAt.toLocaleTimeString()}
          </span>
          <button onClick={loadAllData} disabled={isRefreshing}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-400 hover:text-white transition disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-56 bg-[#0e0e14] border-r border-slate-800 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
          <p className="hidden md:block text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 px-2">Navigation</p>
          {([
            { key: 'overview', label: 'Overview', icon: PieChart },
            { key: 'submissions', label: 'Submissions', icon: FileText, count: stats.totalSubmissions },
            { key: 'questions', label: 'Question Bank', icon: Database, count: allQuestions.length },
            { key: 'users', label: 'Users', icon: Users, count: stats.uniqueUsers },
            { key: 'settings', label: 'Settings', icon: Settings },
          ] as { key: AdminTab; label: string; icon: any; count?: number }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <tab.icon size={15} />
                <span>{tab.label}</span>
              </div>
              {tab.count !== undefined && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeTab === tab.key ? 'bg-white/20' : 'bg-slate-800 text-slate-500'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">

          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <PieChart className="h-5 w-5 text-amber-400" />
                Dashboard Overview
              </h2>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={FileText} label="Total Submissions" value={stats.totalSubmissions} color="indigo" />
                <StatCard icon={Database} label="Total Questions" value={stats.totalQuestions} color="green" />
                <StatCard icon={Users} label="Unique Users" value={stats.uniqueUsers} color="amber" />
                <StatCard icon={TrendingUp} label="Avg Score" value={stats.avgScore} color="blue" />
                <StatCard icon={Activity} label="Today" value={stats.todaySubmissions} color="purple" />
                <StatCard icon={CheckCircle} label="Correct Rate" value={`${stats.correctRate}%`} color="emerald" />
              </div>

              {/* Recent Activity */}
              <div className="bg-[#111118] rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Submissions</h3>
                  <span className="text-xs text-slate-500">Last 10</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {submissions.slice(0, 10).map(sub => (
                    <div key={sub.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600/20 rounded-full flex items-center justify-center">
                          <FileText size={14} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{sub.userName || 'Anonymous'}</p>
                          <p className="text-xs text-slate-500">{sub.userEmail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-indigo-400">{sub.score}/{sub.metadata?.totalQuestions || 0}</span>
                        <span className="text-xs text-slate-500">
                          {sub.metadata?.parsedAt ? new Date(sub.metadata.parsedAt).toLocaleDateString('hi-IN') : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== SUBMISSIONS TAB ===== */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-400" />
                  All Submissions
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportSubmissions} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg text-xs font-bold hover:bg-green-600/30 transition">
                    <Download size={13} /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by user email, name, or submission ID..."
                    className="w-full bg-[#111118] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="flex gap-1.5">
                  {(['all', 'today', 'week'] as const).map(mode => (
                    <button key={mode} onClick={() => setFilterMode(mode)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition ${filterMode === mode ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >{mode === 'all' ? 'All' : mode === 'today' ? 'Today' : '7 Days'}</button>
                  ))}
                </div>
              </div>

              {/* Submissions Table */}
              <div className="bg-[#111118] rounded-xl border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#0e0e14]">
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Questions</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correct %</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mode</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredSubmissions.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No submissions found</td></tr>
                      ) : (
                        filteredSubmissions.map(sub => (
                          <>
                            <tr key={sub.id} className="hover:bg-slate-800/20 transition">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="text-sm text-white font-medium">{sub.userName || 'Anonymous'}</p>
                                  <p className="text-xs text-slate-500">{sub.userEmail}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-sm font-bold ${
                                  (sub.score / (sub.metadata?.totalQuestions || 1)) >= 0.7 ? 'text-green-400' :
                                  (sub.score / (sub.metadata?.totalQuestions || 1)) >= 0.4 ? 'text-amber-400' : 'text-red-400'
                                }`}>{sub.score}/{sub.metadata?.totalQuestions || 0}</span>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-300">{sub.questions?.length || 0}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-800 text-slate-300">
                                  {sub.metadata?.totalQuestions ? Math.round((sub.metadata.correctAnswers / sub.metadata.totalQuestions) * 100) : 0}%
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs capitalize bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded">{sub.inputMode}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400">
                                {sub.metadata?.parsedAt ? new Date(sub.metadata.parsedAt).toLocaleString('hi-IN') : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <button onClick={() => setExpandedSubmission(expandedSubmission === sub.id ? null : sub.id)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-900/20 transition" title="View Questions">
                                    <ChevronDown className={`h-4 w-4 transition ${expandedSubmission === sub.id ? 'rotate-180' : ''}`} />
                                  </button>
                                  <button onClick={() => handleDelete(sub.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition" title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Questions Row */}
                            {expandedSubmission === sub.id && (
                              <tr key={`${sub.id}-exp`}>
                                <td colSpan={7} className="px-4 py-4 bg-[#0a0a0f]">
                                  <div className="max-h-80 overflow-y-auto space-y-2">
                                    <p className="text-xs font-bold text-slate-400 mb-2">Questions ({sub.questions?.length || 0})</p>
                                    {sub.questions?.map((q, idx) => (
                                      <div key={q.id || idx} className="bg-[#111118] p-3 rounded-lg border border-slate-800">
                                        <div className="flex items-start gap-2">
                                          <span className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold ${
                                            q.isCorrect ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                                          }`}>{idx + 1}</span>
                                          <div className="flex-1">
                                            <p className="text-sm text-white">{q.questionText}</p>
                                            {q.options?.length > 0 && (
                                              <div className="mt-1 space-y-0.5">
                                                {q.options.map((opt, i) => (
                                                  <p key={i} className={`text-xs px-1.5 py-0.5 rounded ${
                                                    String.fromCharCode(65 + i) === q.answer ? 'text-green-400 bg-green-900/20' : 'text-slate-400'
                                                  }`}>{String.fromCharCode(65 + i)}. {opt}</p>
                                                ))}
                                              </div>
                                            )}
                                            <div className="flex gap-3 mt-1.5 text-[10px]">
                                              <span className="text-slate-500">User: <b>{q.userAnswer || '-'}</b></span>
                                              <span className="text-green-400">Answer: <b>{q.answer || '-'}</b></span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <div className="p-3 text-center border-t border-slate-800">
                    <button onClick={() => loadSubmissions(true)} className="text-amber-400 hover:text-amber-300 text-xs font-bold">
                      Load More →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== QUESTION BANK TAB ===== */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-400" />
                  Question Bank ({allQuestions.length} questions stored)
                </h2>
                <button onClick={handleExportAllQuestions} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg text-xs font-bold hover:bg-green-600/30 transition">
                  <Download size={13} /> Export All CSV
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search questions by text or user email..."
                  className="w-full bg-[#111118] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>

              {/* Questions List */}
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {filteredQuestions.slice(0, 200).map((q, idx) => (
                  <div key={`${q.id}-${idx}`} className="bg-[#111118] p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold ${
                        q.isCorrect ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                      }`}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white mb-2">{q.questionText}</p>
                        {q.options?.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-2">
                            {q.options.map((opt, i) => (
                              <p key={i} className={`text-xs px-2 py-1 rounded ${
                                String.fromCharCode(65 + i) === q.answer ? 'bg-green-900/20 text-green-400 border border-green-800' : 'text-slate-400 bg-slate-800/50'
                              }`}>{String.fromCharCode(65 + i)}. {opt}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                          <span>Correct: <b className="text-green-400">{q.answer || '-'}</b></span>
                          <span>User: <b>{q.userAnswer || '-'}</b></span>
                          <span>By: {q.userEmail}</span>
                          <span>{q.submissionDate ? new Date(q.submissionDate).toLocaleDateString('hi-IN') : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredQuestions.length > 200 && (
                  <p className="text-center text-xs text-slate-500 py-4">Showing first 200 of {filteredQuestions.length} questions. Use search to filter.</p>
                )}
              </div>
            </div>
          )}

          {/* ===== USERS TAB ===== */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-400" />
                User Directory ({userStats.length} users)
              </h2>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full bg-[#111118] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              {/* Users Table */}
              <div className="bg-[#111118] rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0e0e14]">
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">User</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Submissions</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Questions</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Avg Score</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Last Active</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {userStats
                      .filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()) || u.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((u, idx) => (
                        <tr key={u.userId} className="hover:bg-slate-800/20 transition">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm text-white font-medium">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                              <p className="text-[10px] text-slate-600 font-mono">{u.userId}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-indigo-400">{u.totalSubmissions}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">{u.totalQuestions}</td>
                          <td className="px-4 py-3 text-sm font-bold text-green-400">{u.avgScore}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {u.lastActive ? new Date(u.lastActive).toLocaleDateString('hi-IN') : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleDeleteAllByUser(u.userId)}
                              className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition" title="Delete all submissions">
                              <UserX className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== SETTINGS TAB ===== */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-slate-400" />
                Admin Settings
              </h2>

              {/* Add Admin */}
              <div className="bg-[#111118] p-5 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-3">Add New Admin</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Firestore me <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-400">vedarank_admins</code> collection me document create karein jiska ID = User's Firebase UID ho.
                </p>
                <AddAdminForm />
              </div>

              {/* Danger Zone */}
              <div className="bg-[#111118] p-5 rounded-xl border border-red-900/30">
                <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} /> Danger Zone
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Delete ALL Submissions</p>
                      <p className="text-xs text-slate-500">Sabhi users ke sabhi submissions permanently delete ho jayenge</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm('⚠️ SABHI submissions permanently delete ho jayenge. Yeh irreversible hai! Continue?')) return;
                        if (!confirm('FINAL WARNING: Are you absolutely sure?')) return;
                        try {
                          const snapshot = await getDocs(collection(db, 'vedarank_submissions'));
                          const deletes = snapshot.docs.map(d => deleteDoc(d.ref));
                          await Promise.all(deletes);
                          setSubmissions([]);
                          setStats({ totalSubmissions: 0, totalQuestions: 0, uniqueUsers: 0, avgScore: 0, todaySubmissions: 0, correctRate: 0 });
                          alert('All submissions deleted.');
                        } catch (e) {
                          alert('Delete failed: ' + e);
                        }
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition"
                    >
                      Delete All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ===== Helper Components =====

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'from-indigo-900/40 to-indigo-800/10 border-indigo-700/40 text-indigo-400',
    green: 'from-green-900/40 to-green-800/10 border-green-700/40 text-green-400',
    amber: 'from-amber-900/40 to-amber-800/10 border-amber-700/40 text-amber-400',
    blue: 'from-blue-900/40 to-blue-800/10 border-blue-700/40 text-blue-400',
    purple: 'from-purple-900/40 to-purple-800/10 border-purple-700/40 text-purple-400',
    emerald: 'from-emerald-900/40 to-emerald-800/10 border-emerald-700/40 text-emerald-400',
  };
  const cls = colorMap[color] || colorMap.indigo;

  return (
    <div className={`bg-gradient-to-br ${cls} p-4 rounded-xl border`}>
      <Icon className="h-5 w-5 mb-2 opacity-80" />
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function AddAdminForm() {
  const [uid, setUid] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!uid.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'vedarank_admins', uid.trim()), {
        role: 'super_admin',
        addedAt: new Date().toISOString()
      });
      alert(`Admin added: ${uid}`);
      setUid('');
    } catch (e) {
      alert('Failed to add admin: ' + e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text" value={uid} onChange={(e) => setUid(e.target.value)}
        placeholder="Firebase User UID paste karein..."
        className="flex-1 bg-[#0a0a0f] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      />
      <button onClick={handleAdd} disabled={saving || !uid.trim()}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition">
        {saving ? 'Adding...' : 'Add Admin'}
      </button>
    </div>
  );
}
