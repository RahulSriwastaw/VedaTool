import React, { ReactNode } from 'react';
import { Badge } from './Badge';
import { ArrowRight } from 'lucide-react';

interface ToolCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: 'NEW' | 'PRO' | 'BETA' | 'SOON';
  onClick: () => void;
  iconBgColor?: string;
  className?: string;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  icon,
  title,
  description,
  badge,
  onClick,
  iconBgColor = '#6366F1',
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      className={`group relative text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] rounded-xl p-4 sm:p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] transition-all duration-300 min-h-[170px] sm:min-h-[190px] flex flex-col justify-between w-full cursor-pointer hover:shadow-[0_12px_24px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_12px_24px_rgba(0,0,0,0.25)] hover:-translate-y-1 ${className}`}
    >
      <div className="w-full flex flex-col gap-3.5 flex-1">
        {/* Top Header section: Icon & Badge tag */}
        <div className="flex items-center justify-between w-full">
          <div 
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm"
            style={{ backgroundColor: iconBgColor }}
          >
            {icon}
          </div>
          {badge && (
            <span className="scale-90 origin-right shrink-0">
              <Badge type={badge} />
            </span>
          )}
        </div>
        
        {/* Text Area */}
        <div className="flex-1 mt-1 text-left">
          <h3 className="text-xs sm:text-[14px] font-bold text-[var(--text-primary)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors duration-200">
            {title}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] leading-relaxed mt-1.5 line-clamp-2 sm:line-clamp-3">
            {description}
          </p>
        </div>
      </div>

      {/* Bottom Launch status bar */}
      <div className="w-full flex items-center justify-between mt-4 pt-2.5 border-t border-[var(--divider)]/40 text-[var(--accent)] select-none">
        <span className="text-[9px] font-extrabold tracking-wider uppercase text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
          Launch Tool
        </span>
        <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform duration-200 text-[var(--accent)]" />
      </div>
    </button>
  );
};
