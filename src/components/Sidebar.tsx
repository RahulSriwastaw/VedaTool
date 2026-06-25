import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeftRight,
  FileText,
  ListChecks,
  MessageSquare,
  Youtube,
  LayoutGrid,
  Trash2,
  Home,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  BookOpen,
  Database,
  Clock,
  Settings
} from "lucide-react";
import { ThemeToggle } from "./ui/ThemeToggle";

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile
}) => {
  const location = useLocation();

  const groups = [
    {
      groupName: null,
      items: [
        {
          path: "/hub",
          label: "Dashboard",
          icon: <Home size={14} />,
          color: "var(--accent)"
        }
      ]
    },
    {
      groupName: "PDF Tools",
      items: [
        {
          path: "/tools/pdf-to-text-ocr",
          label: "PDF OCR",
          icon: <FileText size={14} />,
          color: "#4F46E5"
        },
        {
          path: "/tools/pdf-to-word-converter",
          label: "PDF to DOCX",
          icon: <ArrowLeftRight size={14} />,
          color: "#6366F1"
        },
        {
          path: "/tools/pdf-watermark-remover",
          label: "PDF Watermark Remover",
          icon: <Trash2 size={14} />,
          color: "#EF4444"
        },
        {
          path: "/tools/pdf-page-arranger-merger",
          label: "PDF Arranger",
          icon: <LayoutGrid size={14} />,
          color: "#7B5EA7"
        },
        {
          path: "/tools/mcq-extractor-from-pdf",
          label: "MCQ Extractor",
          icon: <ListChecks size={14} />,
          color: "#F59E0B"
        }
      ]
    },
    {
      groupName: "AI Tools",
      items: [
        {
          path: "/tools/ai-chat-document-analyzer",
          label: "AI Assistant",
          icon: <MessageSquare size={14} />,
          color: "#4B7BF5"
        },
        {
          path: "/tools/youtube-seo-title-description-generator",
          label: "YouTube SEO",
          icon: <Youtube size={14} />,
          color: "#E63946"
        }
      ]
    },
    {
      groupName: "Settings",
      items: [
        {
          path: "/profile",
          label: "Settings",
          icon: <Settings size={14} />,
          color: "#6B7280"
        }
      ]
    }
  ];

  const getIsActive = (path: string) => {
    return location.pathname === path;
  };

  const renderSidebarContent = (isMobileDrawer = false) => {
    const collapsed = isCollapsed && !isMobileDrawer;
    return (
      <div className="flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-default)] select-none">
        {/* Sidebar Header toggle button inside desktop mode */}
        <div className="hidden lg:flex items-center justify-end p-2 border-b border-[var(--divider)] h-10 shrink-0">
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors cursor-pointer outline-none"
            title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 custom-scrollbar flex flex-col gap-4">
          {/* Top Branding Tag */}
          {!collapsed && (
            <div className="px-5 py-1 mb-1 shrink-0">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest block text-left">
                AI Tools Suite
              </span>
            </div>
          )}

          {groups.map((group, groupIdx) => (
            <div key={groupIdx} className="flex flex-col gap-0.5">
              {/* Header name if not collapsed */}
              {!collapsed && group.groupName && (
                <div className="px-5 py-1 mt-1 shrink-0">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] opacity-70 uppercase tracking-wider block text-left">
                    {group.groupName}
                  </span>
                </div>
              )}

              {/* Collapsed view category divider lines */}
              {collapsed && groupIdx > 0 && (
                <div className="mx-3 my-1.5 border-t border-[var(--divider)] shrink-0" />
              )}

              {/* Render items */}
              <div className={`flex flex-col gap-0.5 ${!collapsed && group.groupName ? "pl-2 border-l border-[var(--divider)]/40 ml-5 mr-3" : "px-3"}`}>
                {group.items.map((item) => {
                  const active = getIsActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onCloseMobile}
                      className={`flex items-center gap-2.5 h-8 px-2 rounded-md text-[12px] font-medium transition-all outline-none border-l-2 ${
                        active
                          ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)] font-bold shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] border-transparent"
                      }`}
                    >
                      <div
                        className="shrink-0 flex items-center justify-center transition-colors"
                        style={{ color: active ? "var(--accent)" : item.color }}
                      >
                        {item.icon}
                      </div>
                      {(!collapsed || mobileOpen) && (
                        <span className="truncate text-left flex-1">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar simplified secondary actions footer division */}
        <div className="p-3 border-t border-[var(--divider)] space-y-1 shrink-0 bg-[var(--bg-card)] bg-opacity-30">
          <Link
            to="/blog"
            onClick={onCloseMobile}
            className={`flex items-center gap-2.5 h-8 px-2 rounded-md text-[12px] font-medium transition-all outline-none ${
              location.pathname.startsWith("/blog")
                ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            <div className="shrink-0 text-[14px]">
              <BookOpen size={14} />
            </div>
            {(!collapsed || mobileOpen) && <span className="truncate text-left flex-1">Guides & Blog</span>}
          </Link>

          {(!collapsed || mobileOpen) && (
            <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--divider)] mt-2">
              <span>Interface Mode</span>
              <div className="scale-75 origin-right">
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. DESKTOP/TABLET PERSISTENT SIDEBAR */}
      <aside
        className={`hidden sm:block fixed top-[48px] bottom-0 left-0 z-30 transition-all duration-200 ease-in-out shrink-0 bg-[var(--bg-sidebar)]`}
        style={{
          width: isCollapsed ? "56px" : "260px"
        }}
      >
        {renderSidebarContent()}
      </aside>

      {/* 2. MOBILE SIDEBAR DRAWER WITH SPRING TRANSITIONS */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm sm:hidden"
            />

            {/* Sliding Drawer */}
            <motion.nav
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 z-50 w-[240px] bg-[var(--bg-sidebar)] shadow-[var(--shadow-dropdown)] flex flex-col sm:hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-[48px] border-b border-[var(--divider)] shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-[var(--accent)] rounded flex items-center justify-center text-white">
                    <Sparkles size={11} />
                  </div>
                  <span className="text-[12px] font-bold text-[var(--text-primary)] tracking-wider uppercase">
                    VEDATOOL
                  </span>
                </div>
                <button
                  onClick={onCloseMobile}
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto">
                {renderSidebarContent(true)}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
