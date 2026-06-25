import React, { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Badge } from './Badge';

interface ToolPageHeaderProps {
  icon: ReactNode;
  iconBgColor?: string;
  title: string;
  subtitle: string;
  badges?: ('NEW' | 'PRO' | 'BETA' | 'SOON')[];
  backHref?: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
  className?: string;
}

export const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({
  icon,
  iconBgColor = "var(--accent)",
  title,
  subtitle,
  badges = [],
  backHref,
  onBack,
  rightSlot,
  className = '',
}) => {
  return (
    <div className={`sticky top-[48px] z-40 bg-[var(--bg-surface)]/90 backdrop-blur-md border-b border-[var(--border-default)] py-1 px-3 sm:px-4 md:px-6 w-full ${className}`}>
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-1 sm:gap-2">
        <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors p-[2px] sm:hidden rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          
          <div className="hidden sm:block">
            {onBack && (
              <button
                onClick={onBack}
                className="text-[var(--accent)] text-[11px] font-semibold flex items-center gap-0.5 hover:underline outline-none focus-visible:ring-2 rounded focus-visible:ring-[var(--accent)] mr-2"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>

          <div 
            className="w-5 h-5 sm:w-7 sm:h-7 rounded-[var(--radius-sm)] flex flex-shrink-0 items-center justify-center text-white p-0.5 sm:p-1"
            style={{ backgroundColor: iconBgColor }}
          >
            {icon}
          </div>
          
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
              <h1 className="text-[11px] sm:text-[12px] font-medium text-[var(--text-primary)] leading-none tracking-tight truncate max-w-full">
                {title}
              </h1>
              {badges.map((badge, idx) => (
                <div key={idx} className="scale-[0.75] origin-left">
                  <Badge type={badge} />
                </div>
              ))}
            </div>
            {subtitle && (
              <p className="hidden sm:block text-[9px] sm:text-[10px] font-normal text-[var(--text-muted)] leading-tight truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        
        {rightSlot && (
          <div className="flex items-center shrink-0">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
};
