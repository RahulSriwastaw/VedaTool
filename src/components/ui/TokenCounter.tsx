import React from 'react';
import { Coins } from 'lucide-react';

interface TokenCounterProps {
  tokens: number | null;
  className?: string;
}

export const TokenCounter: React.FC<TokenCounterProps> = ({ tokens, className = '' }) => {
  const count = tokens ?? 0;
  const isLow = count < 5;
  
  return (
    <div
      className={`flex items-center gap-2 bg-[var(--brand-primary-muted)] border border-[var(--brand-primary-border)] rounded-full px-3 py-1.5 cursor-pointer hover:bg-[var(--brand-primary)] hover:text-white transition-colors group ${
        isLow ? 'animate-pulse' : ''
      } ${className}`}
    >
      <Coins size={14} className="text-[#FF6B2B] group-hover:text-white" />
      <span className="text-[12px] font-bold text-[#FF6B2B] group-hover:text-white tracking-wide">
        {count} <span className="hidden sm:inline font-medium">Veda Tokens</span>
      </span>
    </div>
  );
};
