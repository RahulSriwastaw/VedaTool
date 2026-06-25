import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertCircle } from "lucide-react";

interface SystemMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const SystemMessageModal: React.FC<SystemMessageModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Continue",
  cancelText = "Cancel",
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[101] p-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-sm bg-[#121214] border border-[#2e2e34] rounded-2xl  relative pointer-events-auto overflow-hidden"
            >
              <div className="h-24    relative flex items-center justify-center">
                <div className="absolute inset-x-0 bottom-0 h-10  ] " />
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  <AlertCircle className="text-amber-500" size={24} />
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 p-1 bg-black/20 text-[#888888] hover:text-[#EFEFEF] rounded-full transition-colors hover:bg-black/40"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-2 pt-1 text-center">
                <h2 className="text-[20px] font-bold text-[#EFEFEF] mb-1">
                  {title}
                </h2>
                <div className="text-[13px] text-[#888888] mb-2 leading-relaxed whitespace-pre-wrap">
                  {message}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-1 px-1 rounded-xl bg-transparent/5 text-[#888888] font-semibold hover:bg-transparent/10 transition-all active:scale-95"
                  >
                    {cancelText}
                  </button>
                  {onConfirm && (
                    <button
                      onClick={() => {
                        onConfirm();
                        onClose();
                      }}
                      className="flex-1 py-1 px-1 rounded-xl bg-[#FF6B2B] text-[#EFEFEF] font-semibold hover:bg-[#FF6B2B]/90 transition-all active:scale-95  shadow-[#FF6B2B]/20"
                    >
                      {confirmText}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SystemMessageModal;
