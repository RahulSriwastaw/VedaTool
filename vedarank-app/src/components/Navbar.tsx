import { Link, useNavigate } from 'react-router-dom';
import { signOut, User } from 'firebase/auth';
import { auth } from '../firebase';
import { LogOut, Shield, LayoutDashboard, Zap } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  isAdmin: boolean;
}

export default function Navbar({ user, isAdmin }: NavbarProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 glass border-b border-[var(--border)] transition-all duration-300">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
            <Zap className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-[15px] font-bold text-zinc-100 tracking-tight group-hover:text-white transition-colors">VedaRank</span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <Link to="/dashboard"
                className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-lg transition-all">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              {isAdmin && (
                <Link to="/super-admin"
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-amber-500/90 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all">
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-[var(--border)]">
                <img
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=4f46e5&color=fff&size=32`}
                  alt="Profile" className="h-7 w-7 rounded-full ring-2 ring-indigo-500/20"
                  referrerPolicy="no-referrer"
                />
                <button onClick={handleLogout}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer" title="Logout">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <Link to="/login"
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition-all shadow-sm shadow-indigo-500/20">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
