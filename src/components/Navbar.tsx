import React, { useState, useEffect } from "react";
import { Sparkles, User, Database, Menu, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { signOut } from "firebase/auth";
import { usePlanLimits } from "../hooks/usePlanLimits";
import { getCleanDisplayName } from "../types";
import AuthModal from "./AuthModal";
import { TokenCounter } from "./ui/TokenCounter";
import { ThemeToggle } from "./ui/ThemeToggle";
import { Button } from "./ui/Button";
import { SearchOverlay } from "./SearchOverlay";

interface NavbarProps {
  onMenuToggle?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuToggle }) => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const { tokens, plan } = usePlanLimits();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Synchronize global CMD+K or CTRL+K search entry trigger
  useEffect(() => {
    const handleGlobalSearchShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

  return (
    <>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
      
      <nav className="fixed top-0 left-0 right-0 h-[48px] bg-[var(--bg-surface)] backdrop-blur-md border-b border-[var(--border-default)] z-[100] flex items-center justify-between px-3 md:px-6">
        {/* Left Side menu toggle + logo branding */}
        <div className="flex items-center gap-2">
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="sm:hidden p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer focus:outline-none"
              aria-label="Toggle Menu"
            >
              <Menu size={18} />
            </button>
          )}

          <Link
            to="/hub"
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] rounded"
          >
            <div className="w-5.5 h-5.5 flex-shrink-0 bg-[var(--brand-primary)] rounded flex items-center justify-center text-white">
              <Sparkles size={12} />
            </div>
            <span className="text-[12px] font-extrabold text-[var(--text-primary)] tracking-[0.06em] uppercase hidden sm:block">
              VEDATOOL
            </span>
          </Link>
        </div>

        {/* Center portion: integrated search bar */}
        <div className="flex-1 max-w-xs mx-3 hidden md:block">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 h-[28px] bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--border-input)] rounded-md text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors outline-none group"
          >
            <div className="flex items-center gap-1.5 text-[10px]">
              <Search size={12} className="group-hover:text-[var(--accent)] transition-colors" />
              <span>Search tools...</span>
            </div>
            <kbd className="text-[8px] bg-[var(--bg-hover)] border border-[var(--border-input)] px-1 py-0.2 rounded text-[var(--text-muted)] group-hover:text-[var(--accent)] select-none">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right portion: Credits + Profile avatar / Login */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile search trigger */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Search"
          >
            <Search size={15} />
          </button>

          {/* Credits item */}
          <div onClick={() => navigate("/veda-rank")} className="flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-hover)] px-2 py-1 rounded-md transition-colors shrink-0">
            <Database size={14} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">VedaRank</span>
          </div>
          <div onClick={() => navigate("/pricing")} className="flex shrink-0 scale-90 md:scale-100">
             <TokenCounter tokens={tokens} />
          </div>

          {user ? (
            <div
              onClick={() => navigate("/profile")}
              className="flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-hover)] p-0.5 pr-1.5 rounded-full transition-colors shrink-0"
            >
              <div className="relative">
                <img
                  src={
                    user.photoURL ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`
                  }
                  alt="Avatar"
                  className="w-6 h-6 rounded-full border border-[var(--border-default)] object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-[var(--success-text)] border border-[var(--bg-surface)] rounded-full"></span>
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-[11px] font-semibold text-[var(--text-primary)] leading-none truncate max-w-[80px]">
                  {getCleanDisplayName(user.displayName || "", user.email || "")}
                </span>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAuthModal(true)}
              className="gap-1.5 h-[28px] px-2.5 py-0.5 text-[10px]"
            >
              <User size={12} />
              <span>Login</span>
            </Button>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
