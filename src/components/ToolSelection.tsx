import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, MessageSquare, LayoutGrid, ListChecks, ArrowLeftRight, Youtube, Sparkles, Info, X, Trash2, Search } from "lucide-react";
import { usePlanLimits } from "../hooks/usePlanLimits";
import { ToolCard } from "./ui/ToolCard";

interface Props {
  onSelect: (toolId: string) => void;
}

export const ToolSelection: React.FC<Props> = ({ onSelect }) => {
  const { limits, usage } = usePlanLimits();
  const [infoPopup, setInfoPopup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const tools = [
    {
      id: "pdf-to-word-converter",
      title: "PDF to DOCX Converter",
      description: "AI-powered conversion with formatting, tables, and images natively preserved.",
      longInfo: "Features:\n- Fast AI structure and text analysis\n- High accuracy OCR & line reconstruction\n- Inline tables and highlighted box elements mapping\n- Embedded XObject image extraction natively",
      icon: <ArrowLeftRight size={16} />,
      iconBgColor: "#6366F1",
      badge: "NEW" as const,
    },
    {
      id: "pdf-to-text-ocr",
      title: "PDF to Text (OCR)",
      description: "Human-like OCR accuracy for scanned documents. Extracts clean text and layout.",
      longInfo: "Features:\n- Upload PDFs or Images\n- Extracts text, lists, and tables correctly\n- Downloads as DOCX\n\nLimits:\nUsers on free plan get limited daily uses.",
      icon: <FileText size={16} />,
      iconBgColor: "#4F46E5",
      badge: "PRO" as const,
    },
    {
      id: "ai-chat-document-analyzer",
      title: "Veda AI Assistant",
      description: "Powered by Gemini 3.5. Advanced real-time reasoning and document analysis.",
      longInfo: "Features:\n- Talk with advanced Gemini model Veda AI\n- Upload images/files to analyze visual and textual context\n- Search local session history",
      icon: <MessageSquare size={16} />,
      iconBgColor: "#4B7BF5",
      badge: "BETA" as const,
    },
    {
      id: "youtube-seo-title-description-generator",
      title: "YouTube SEO Optimizer",
      description: "Generate viral titles, descriptions, and perfectly optimized hashtags with AI.",
      longInfo: "Features:\n- AI-driven titles to explode CTR\n- Long, keyword-optimized descriptions\n- Bulk generation of 400 tags & 200 hashtags",
      icon: <Youtube size={16} />,
      iconBgColor: "#E63946",
      badge: "NEW" as const,
    },
    {
      id: "pdf-page-arranger-merger",
      title: "PDF Page Arranger",
      description: "Arrange, rotate, split, and merge multiple PDF documents into single distinct files.",
      longInfo: "Features:\n- Multi-File Drag & Drop Upload\n- Interactive Grid Layout with High-Fidelity thumbnails\n- Multi-Selection for Bulk rotation, duplication, or delete\n- Slicing and splitting PDFs with Custom Ranges into ZIP",
      icon: <LayoutGrid size={16} />,
      iconBgColor: "#7B5EA7",
      badge: "NEW" as const,
    },
    {
      id: "pdf-watermark-remover",
      title: "PDF Watermark Remover",
      description: "Purge hidden text, CTA links, Telegram URLs, and recurring logo watermarks instantly.",
      longInfo: "Features:\n- Automatic layout & structure scans\n- Removes recurring watermarks, user social tag handles & links\n- Strips repeated XObject image brand seals/stamps cleanly\n- Preserves document formatting and text elements layout",
      icon: <Trash2 size={16} />,
      iconBgColor: "#EF4444",
      badge: "NEW" as const,
    },
    {
      id: "mcq-extractor-from-pdf",
      title: "MCQ Extractor & Bank",
      description: "Extract multiple-choice questions from PDFs page-by-page, tag categories, and generate secure passcode test sets.",
      longInfo: "Features:\n- Page-by-page scanning and smart MCQ identification\n- Extract questions, options, keys & detailed explanations\n- Refined filtering by PYQ Status, Exam, Subject, and Difficulty Level\n- Save selected items directly to your personal persistent Question Bank",
      icon: <ListChecks size={16} />,
      iconBgColor: "#F59E0B",
      badge: "NEW" as const,
    },
  ];

  const filteredTools = tools.filter((tool) => {
    const matchesSearch = 
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="max-w-[1350px] w-full mx-auto px-4 md:px-6 pb-12 sm:pb-20 pt-2 sm:pt-6 font-sans">
      <AnimatePresence>
        {infoPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-5 md:p-6 shadow-[var(--shadow-dropdown)] max-w-sm w-full relative"
            >
              <button
                onClick={() => setInfoPopup(null)}
                className="absolute top-4 right-4 p-1 rounded-md bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors outline-none cursor-pointer"
              >
                <X size={15} />
              </button>
              <h3 className="text-xs font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2 uppercase tracking-wide">
                <div className="p-1.5 bg-[var(--accent-subtle)] rounded text-[var(--accent)]">
                  <Info size={15} />
                </div>
                Tool capabilities
              </h3>
              <div className="text-[var(--text-secondary)] text-[12px] whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto custom-scrollbar">
                {tools.find((t) => t.id === infoPopup)?.longInfo}
              </div>
              <button
                onClick={() => setInfoPopup(null)}
                className="w-full mt-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer outline-none"
              >
                Acknowledge
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center text-center max-w-xl mx-auto mb-8 mt-1 sm:mt-4">
        {/* Banner badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent)] border-opacity-20 mb-3"
        >
          <Sparkles size={13} className="text-[var(--accent)]" />
          <span className="text-[10px] font-extrabold tracking-wider uppercase text-[var(--accent)]">
            AI Productivity Suite
          </span>
        </motion.div>
        
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">
          VedaTool Workspace Hub
        </h1>
        <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] leading-relaxed px-2">
          Select any highly optimized specialized AI tool below to accelerate your workflow. All processing is private, secure, and end-to-end encrypted.
        </p>

        {/* Local Search-First input container */}
        <div className="mt-6 relative w-full max-w-md px-1 col-span-full">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search tools or features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-muted)] h-[38px]"
          />
        </div>
      </div>

      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {filteredTools.map((tool, i) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className="flex h-full relative group"
            >
              <ToolCard
                icon={tool.icon}
                iconBgColor={tool.iconBgColor}
                title={tool.title}
                description={tool.description}
                badge={tool.badge}
                onClick={() => onSelect(tool.id)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoPopup(tool.id);
                }}
                className="absolute top-2.5 right-2 sm:right-3.5 p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 z-10"
                title="View Capabilities"
              >
                <Info size={14} />
              </button>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-12 text-center rounded-xl max-w-md mx-auto">
          <Search className="mx-auto text-[var(--text-muted)] mb-3" size={24} />
          <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">No matching tools</h3>
          <p className="text-[var(--text-secondary)] text-[11px]">Try refining your search text or clear query parameter.</p>
        </div>
      )}
    </div>
  );
};

export default ToolSelection;
