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
    <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-[var(--bg-card)]/95 backdrop-blur-xl border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-bold text-white tracking-tight">VedaRank</span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/dashboard"
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition">
                <LayoutDashboard className="h-3 w-3" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              {isAdmin && (
                <Link to="/super-admin"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/30 rounded-md transition">
                  <Shield className="h-3 w-3" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-zinc-800">
                <img
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=4f46e5&color=fff&size=28`}
                  alt="" className="h-6 w-6 rounded-full ring-1 ring-zinc-700"
                />
                <button onClick={handleLogout}
                  className="p-1 text-zinc-500 hover:text-red-400 transition" title="Logout">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <Link to="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
