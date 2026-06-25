import React from 'react';
import { motion } from 'framer-motion';

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onChange, className = '' }) => {
  return (
    <div className={`p-1 bg-[var(--bg-surface)] rounded-md inline-flex items-center 
    overflow-x-auto whitespace-nowrap custom-scrollbar ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors z-10 ${
              isActive
                ? 'text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="tabBar-indicator"
                className="absolute inset-0 bg-[var(--brand-primary)] rounded-md -z-10"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative z-10 block">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`relative z-10 inline-flex items-center justify-center px-1.5 min-w-[20px] h-5 text-[10px] rounded-full font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--border-strong)] text-[var(--text-primary)]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
