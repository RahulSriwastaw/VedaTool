import React, { useState, useEffect } from "react";
import { Coins, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TokenDeductionEvent {
  amount: number;
  remaining: number;
  description: string;
  guest: boolean;
}

const TokenNotification: React.FC = () => {
  const [notification, setNotification] = useState<TokenDeductionEvent | null>(null);

  useEffect(() => {
    const handleDeduction = (event: Event) => {
      const customEvent = event as CustomEvent<TokenDeductionEvent>;
      setNotification(customEvent.detail);

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setNotification(null);
      }, 5000);
    };

    window.addEventListener("veda-token-deduction", handleDeduction);
    return () => {
      window.removeEventListener("veda-token-deduction", handleDeduction);
    };
  }, []);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
           initial={{ opacity: 0, y: -20, scale: 0.95 }}
           animate={{ opacity: 1, y: 0, scale: 1 }}
           exit={{ opacity: 0, y: -10, scale: 0.95 }}
           className="fixed top-[70px] right-4 sm:right-6 z-[9999] bg-[var(--bg-card)] border border-[var(--border-default)] p-2.5 rounded-[var(--radius-md)] w-[240px] shadow-[var(--shadow-elevated)] flex items-start gap-2.5"
        >
          <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--brand-primary-muted)] flex items-center justify-center shrink-0">
             <Coins size={14} className="text-[var(--brand-primary)]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
               <h3 className="text-[12px] font-bold text-[var(--text-primary)] leading-none mt-0.5">
                  Token Deduction
               </h3>
               <button
                  onClick={() => setNotification(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
               >
                  <X size={12} />
               </button>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mb-1.5 truncate" title={notification.description}>
               {notification.description}
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold">
               <span className="text-red-500">-{notification.amount}</span>
               <span className="text-emerald-500">{notification.remaining} Left</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TokenNotification;
