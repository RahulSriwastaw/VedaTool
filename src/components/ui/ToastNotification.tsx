import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle } from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
}

export const ToastNotification: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        message: string;
        type?: "success" | "error" | "warning" | "info";
        duration?: number;
      }>;
      
      if (!customEvent.detail || !customEvent.detail.message) return;

      const { message, type = "info", duration = 4000 } = customEvent.detail;
      
      // Prevent duplicating the exact same toast message within a short window
      setToasts((prev) => {
        const isDuplicate = prev.some((t) => t.message === message);
        if (isDuplicate) return prev;
        
        const id = Math.random().toString(36).substring(2, 9);
        return [...prev, { id, message, type, duration }];
      });
    };

    window.addEventListener("app-toast", handleToastEvent);
    return () => {
      window.removeEventListener("app-toast", handleToastEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map((toast) => {
          // Choose colors and icons based on type
          let icon = <Info size={18} />;
          let bgClass = "bg-[var(--bg-card)] border-[var(--border-card)]";
          let textClass = "text-[var(--text-primary)]";
          let iconColor = "text-[var(--accent)]";
          
          if (toast.type === "success" || toast.message.toLowerCase().includes("success") || toast.message.toLowerCase().includes("completed")) {
            icon = <CheckCircle2 size={18} />;
            bgClass = "bg-[var(--success-bg)] border-[var(--success-border)] dark:bg-[#0c2a12] dark:border-[#14532d]/40";
            textClass = "text-[var(--success-text)] dark:text-[#a7f3d0]";
            iconColor = "text-[var(--success-text)] dark:text-[#34d399]";
          } else if (toast.type === "error" || toast.message.toLowerCase().includes("fail") || toast.message.toLowerCase().includes("error") || toast.message.toLowerCase().includes("crash")) {
            icon = <AlertCircle size={18} />;
            bgClass = "bg-[var(--error-bg)] border-[var(--error-border)] dark:bg-[#2b0c0c] dark:border-[#7f1d1d]/40";
            textClass = "text-[var(--error-text)] dark:text-[#fca5a5]";
            iconColor = "text-[var(--error-text)] dark:text-[#fca5a5]";
          } else if (toast.type === "warning" || toast.message.toLowerCase().includes("warning") || toast.message.toLowerCase().includes("limit") || toast.message.toLowerCase().includes("rest")) {
            icon = <AlertTriangle size={18} />;
            bgClass = "bg-[var(--warning-bg)] border-[var(--warning-border)] dark:bg-[#2c1d0c] dark:border-[#78350f]/40";
            textClass = "text-[var(--warning-text)] dark:text-[#fcd34d]";
            iconColor = "text-[var(--warning-text)] dark:text-[#fbbf24]";
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
              layout
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md ${bgClass}`}
              style={{
                boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.4)"
              }}
            >
              <div className={`shrink-0 mt-0.5 ${iconColor}`}>{icon}</div>
              <div className={`flex-1 text-[13px] font-medium leading-relaxed ${textClass}`}>
                {toast.message}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded transition-colors self-start"
              >
                <X size={14} />
              </button>
              
              {/* Auto close progress indicator */}
              <ToastTimer duration={toast.duration || 4000} onComplete={() => removeToast(toast.id)} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

// Helper internal component to automatically handle timeout with ref safety
const ToastTimer: React.FC<{ duration: number; onComplete: () => void }> = ({ duration, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return null;
};
