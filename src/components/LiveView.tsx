import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ScannedPage } from "../types";
import TypewriterText from "./TypewriterText";
import { FileText, ImageIcon, RefreshCw, AlertCircle } from "lucide-react";

interface Props {
  page: ScannedPage;
  onClose?: () => void;
}

const LiveView: React.FC<Props> = ({ page, onClose }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px] min-h-[600px] bg-[#0F0F0F]">
      {/* Left Column: Text Output */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full bg-[#1A1A1A] rounded-[16px] border border-[#252525] overflow-hidden "
      >
        <div className="px-2 py-1 border-b border-[#252525] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[var(--accent)]/15 flex items-center justify-center">
              <FileText className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <span className="text-[14px] font-bold text-[#EFEFEF]">
              AI Extraction Output
            </span>
          </div>
          {page.status === "processing" && (
            <div className="flex items-center gap-2 px-1 py-1 bg-[var(--accent)]/15 rounded-full">
              <RefreshCw className="w-3 h-3 text-[var(--accent)] animate-spin" />
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">
                AI Working...
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 p-2 overflow-y-auto custom-scrollbar">
          {page.status === "error" ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h4 className="text-[#EFEFEF] font-bold text-[18px]">
                  Extraction Failed
                </h4>
                <p className="text-[#888888] text-[14px] mt-1 max-w-xs">
                  {page.errorMessage ||
                    "An unexpected error occurred during processing."}
                </p>
              </div>
            </div>
          ) : page.status === "processing" ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-[#252525] border-[#252525] rounded-full" />
                <div className="absolute inset-0 border-[#252525] border-t-[var(--accent)] rounded-full animate-spin" />
              </div>
              <p className="text-[#888888] text-[13px] animate-pulse">
                Analyzing document structure...
              </p>
            </div>
          ) : page.extractedText ? (
            <TypewriterText text={page.extractedText} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-[#555555] text-[14px] italic">
                Waiting for content...
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Right Column: Source Image */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full bg-[#1A1A1A] rounded-[16px] border border-[#252525] overflow-hidden  relative group"
      >
        <div className="px-2 py-1 border-b border-[#252525] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[#2196F3]/10 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-[#2196F3]" />
            </div>
            <span className="text-[14px] font-bold text-[#EFEFEF]">
              Source Document Page {page.pageNumber}
            </span>
          </div>
          <div className="text-[10px] font-bold text-[#555555] bg-[#141414] px-1 py-1 rounded border border-[#252525]">
            PREVIEW
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#0A0A0A] p-1 flex items-center justify-center relative">
          <img
            src={page.imageUrl}
            alt="Source Page"
            className="max-w-full h-auto shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-[4px]"
          />

          {/* Visual Scan Effect Overlay */}
          {page.status === "processing" && (
            <motion.div
              initial={{ top: "-10%" }}
              animate={{ top: "110%" }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] z-10 pointer-events-none opacity-50"
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LiveView;
