import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X, HelpCircle, FileText, ArrowRight, Settings, Star, TrendingUp } from "lucide-react";
import { toolsConfig } from "../toolsConfig.js";
import { blogPosts } from "../data/blogData";
import { faqData } from "../utils/faqSchema";
import { motion, AnimatePresence } from "motion/react";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  type: "tool" | "guide" | "faq";
  title: string;
  description: string;
  url: string;
  category?: string;
  iconBgColor?: string;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
      setQuery("");
      setSelectedIndex(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Construct global search elements
  const allResults: SearchResult[] = [];

  // 1. Add tools
  toolsConfig.forEach((tool) => {
    allResults.push({
      id: `tool-${tool.id}`,
      type: "tool",
      title: tool.name,
      description: tool.description,
      url: tool.slug,
      category: tool.category,
      iconBgColor: tool.iconBgColor,
    });
  });

  // 2. Add blog guides
  blogPosts.forEach((post) => {
    allResults.push({
      id: `guide-${post.slug}`,
      type: "guide",
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      category: post.category,
    });
  });

  // 3. Add FAQs
  Object.entries(faqData).forEach(([toolId, faqs]) => {
    const tool = toolsConfig.find((t) => t.id === toolId);
    faqs.forEach((faq, index) => {
      allResults.push({
        id: `faq-${toolId}-${index}`,
        type: "faq",
        title: faq.q,
        description: faq.a,
        url: tool ? `${tool.slug}#faq` : "/hub",
        category: tool ? tool.name : "Help Desk",
      });
    });
  });

  // Filter based on input matching
  const filteredResults = query.trim() === "" 
    ? [] 
    : allResults.filter((result) => {
        const matchesTitle = result.title.toLowerCase().includes(query.toLowerCase());
        const matchesDesc = result.description.toLowerCase().includes(query.toLowerCase());
        return matchesTitle || matchesDesc;
      });

  // Hot queries & recommended defaults
  const defaults: SearchResult[] = [
    {
      id: "tool-pdf-to-word-converter",
      type: "tool",
      title: "PDF to DOCX Converter",
      description: "Convert PDFs into high-fidelity editable Word documents instantly.",
      url: "/tools/pdf-to-word-converter",
      iconBgColor: "#6366F1",
    },
    {
      id: "guide-how-to-convert-pdf-to-word",
      type: "guide",
      title: "Guide: PDF to Word Without Losing Layouts",
      description: "How structural AI preserves nested tables and font assets natively.",
      url: "/blog/how-to-convert-pdf-to-word",
    },
  ];

  const currentResults = query.trim() === "" ? defaults : filteredResults;

  // Handle arrow key traversing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (currentResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % currentResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + currentResults.length) % currentResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = currentResults[selectedIndex];
      if (selected) {
        navigate(selected.url);
        onClose();
      }
    }
  };

  // Scroll active item smoothly into view
  useEffect(() => {
    const resultsContainer = resultsRef.current;
    if (!resultsContainer) return;

    const selectedElement = resultsContainer.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#080B14]/85 backdrop-blur-md cursor-pointer"
        />

        {/* Console Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="relative max-w-2xl w-full bg-[#111528] border border-[#1C2140] rounded-xl overflow-hidden shadow-2xl flex flex-col h-[420px]"
        >
          {/* Header query input bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#14182E]">
            <Search className="text-[var(--text-muted)] shrink-0" size={18} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search tools, tutorials, FAQs..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-none text-[13px] text-[#F1F5FF] placeholder-[#4B5680] outline-none h-8"
            />
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[#F1F5FF] transition-colors p-1 rounded-md hover:bg-[#1C2140]"
            >
              <X size={15} />
            </button>
          </div>

          {/* Results Block */}
          <div ref={resultsRef} className="flex-1 overflow-y-auto p-3 space-y-4">
            {query.trim() === "" && (
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold px-2 mb-1 select-none">
                <TrendingUp size={12} />
                Popular Workflows & Quick Links
              </div>
            )}

            {currentResults.length > 0 ? (
              <div className="space-y-1">
                {currentResults.map((result, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={result.id}
                      data-index={index}
                      onClick={() => {
                        navigate(result.url);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? "bg-[var(--accent)] text-white" 
                          : "bg-transparent text-[var(--text-primary)] hover:bg-[#1C2140]/50"
                      }`}
                    >
                      {/* Left icon wrapper */}
                      <div className="shrink-0 mt-0.5">
                        {result.type === "tool" ? (
                          <div 
                            className={`w-6 h-6 rounded flex items-center justify-center text-white p-0.5`}
                            style={{ backgroundColor: result.iconBgColor || "#6366F1" }}
                          >
                            <ArrowRight size={13} />
                          </div>
                        ) : result.type === "guide" ? (
                          <div className={`w-6 h-6 rounded flex items-center justify-center bg-[#4B5680]/20 text-[#8B9DC3] ${isSelected ? "text-white bg-white/20" : ""}`}>
                            <FileText size={13} />
                          </div>
                        ) : (
                          <div className={`w-6 h-6 rounded flex items-center justify-center bg-[#4B5680]/20 text-[#8B9DC3] ${isSelected ? "text-white bg-white/20" : ""}`}>
                            <HelpCircle size={13} />
                          </div>
                        )}
                      </div>

                      {/* Content block */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2.5">
                          <span className={`text-[12px] font-bold ${isSelected ? "text-white" : "text-[#F1F5FF]"}`}>
                            {result.title}
                          </span>
                          {result.category && (
                            <span className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${isSelected ? "text-[#E0E7FF]" : "text-[var(--accent)] text-opacity-80"}`}>
                              {result.category}
                            </span>
                          )}
                        </div>
                        <p className={`text-[10px] leading-normal line-clamp-2 mt-0.5 ${isSelected ? "text-[#EEF2FF]" : "text-[var(--text-secondary)]"}`}>
                          {result.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-[var(--text-muted)] select-none">
                <Search className="mx-auto mb-2 text-[#4B5680]" size={24} />
                <p className="text-xs">No matching tools, resources, or FAQs found for "{query}"</p>
              </div>
            )}
          </div>

          {/* Footer Shortcuts help-bar */}
          <div className="px-4 py-2 border-t border-[#14182E] bg-[#0C101E] flex items-center justify-between text-[10px] text-[var(--text-muted)] select-none">
            <div className="flex items-center gap-3">
              <span><kbd className="bg-[#1C2140] px-1.5 py-0.5 rounded text-[9px] text-[#8B9DC3]">↑↓</kbd> to navigate</span>
              <span><kbd className="bg-[#1C2140] px-1.5 py-0.5 rounded text-[9px] text-[#8B9DC3]">Enter</kbd> to launch</span>
              <span><kbd className="bg-[#1C2140] px-1.5 py-0.5 rounded text-[9px] text-[#8B9DC3]">ESC</kbd> to close</span>
            </div>
            <div className="font-semibold text-[var(--accent)]">
              VedaTool AI Suite
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
