import React from "react";
import { HistoryItem } from "../types";
import {
  Clock,
  Download,
  Trash2,
  X,
  FileText,
  Cloud,
  CloudOff,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  isCloudSynced: boolean;
  onLoginRequest?: () => void;
}

const HistorySidebar: React.FC<Props> = ({
  isOpen,
  onClose,
  history,
  onSelectItem,
  onDeleteItem,
  onClearAll,
  isCloudSynced,
  onLoginRequest,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-[#141414] border-l border-[#252525] z-[101]  flex flex-col"
          >
            <div className="p-1 border-b border-[#252525] flex items-center justify-between bg-[#1A1A1A]">
              <h2 className="text-[13px] font-bold text-[#EFEFEF] flex items-center gap-2 uppercase tracking-[0.8px]">
                <Clock className="w-4 h-4 text-[#FF6B2B]" />
                History
              </h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-[#1A1A1A] rounded-[4px] transition-colors"
              >
                <X size={16} className="text-[#555555]" />
              </button>
            </div>

            {/* Cloud Sync Status Banner */}
            <div className="px-1 py-1 bg-[#171717] border-b border-[#252525] flex items-center justify-between">
              {isCloudSynced ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.4px] text-[#4CAF50]">
                  <Cloud className="w-3.5 h-3.5 text-[#4CAF50]" />
                  <span>Cloud Synced</span>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.4px] text-amber-500">
                    <CloudOff className="w-3.5 h-3.5 text-amber-500" />
                    <span>Local Only</span>
                  </div>
                  {onLoginRequest && (
                    <button
                      onClick={onLoginRequest}
                      className="text-[9px] font-bold uppercase tracking-[0.4px] text-[#FF6B2B] hover:underline"
                    >
                      Login to Sync
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-1 space-y-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-5 text-[#555555] text-[11px] uppercase tracking-[0.8px]">
                  No history found.
                </div>
              ) : (
                history.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="p-1 bg-[#1A1A1A] border border-[#252525] rounded-[8px] hover:border-[#FF6B2B]/30 transition-all group cursor-pointer"
                    onClick={() => onSelectItem(item)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#FF6B2B] uppercase tracking-[0.8px]">
                        <FileText size={10} />
                        DOCX
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(item.id);
                        }}
                        className="text-[#555555] opacity-0 group-hover:opacity-100 hover:text-[#F44336] transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-[12px] font-bold text-[#EFEFEF] truncate mb-1">
                      {item.fileName}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-[#555555] font-medium">
                      <span>{item.pagesCount} PGS</span>
                      <span>
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default HistorySidebar;
