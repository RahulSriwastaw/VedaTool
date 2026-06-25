import React from 'react';

export interface BadgeProps {
  type: 'NEW' | 'PRO' | 'BETA' | 'SOON' | 'SUCCESS';
  className?: string;
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ type, className = '', children }) => {
  const styles = {
    NEW: 'bg-[#FF6B2B] text-white',
    PRO: 'bg-[var(--info-bg)] text-[var(--info-text)]',
    BETA: 'bg-[var(--warning-bg)] text-[var(--warning-text)]',
    SOON: 'bg-transparent border border-[var(--border-strong)] text-[var(--text-muted)]',
    SUCCESS: 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]',
  };

  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-[1px] text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.04em] rounded-full whitespace-nowrap ${styles[type]} ${className}`}
    >
      {children || type}
    </span>
  );
};
