import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lock } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login failed:', error.message);
    }
  };

  return (
    <div className="min-h-screen pt-14 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Card */}
        <div className="glass border border-white/5 rounded-3xl overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="px-8 pt-10 pb-8 border-b border-white/5 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500/10 rounded-2xl mb-6 shadow-inner shadow-white/5">
              <Sparkles className="h-7 w-7 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-black text-zinc-100 mb-2 tracking-tight">Welcome to VedaRank</h1>
            <p className="text-[15px] text-zinc-400 leading-relaxed">
              Sign in to save scorecards and track your exam performance over time.
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-8 space-y-5">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 active:scale-[0.98] text-zinc-900 font-bold text-[15px] py-4 px-5 rounded-2xl transition-all duration-200 cursor-pointer shadow-lg shadow-white/5"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-start gap-3 pt-2">
              <Lock size={14} className="text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-zinc-500 leading-relaxed">
                Secure sign-in via Google. We never store your password or personal data.
              </p>
            </div>
          </div>
        </div>

        {/* Below card note */}
        <div className="mt-8 flex justify-center">
          <p className="text-center text-[13px] text-zinc-500 bg-black/40 px-4 py-2 rounded-full border border-white/5 inline-flex">
            Guest mode available — submit without signing in.
          </p>
        </div>
      </motion.div>
    </div>
  );
}