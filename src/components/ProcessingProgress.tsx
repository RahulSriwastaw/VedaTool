import React from "react";
import { Cpu, X, Zap, RefreshCw, CheckCircle2 } from "lucide-react";

export interface ProcessingProgressProps {
  completed: number;
  total: number;
  message: string;
  allocatedWorkers: number;
  itemStatuses: ("pending" | "processing" | "complete" | "failed" | "retrying")[];
  onCancel?: () => void;
  isReordering?: boolean;
}

export const ProcessingProgress: React.FC<ProcessingProgressProps> = ({
  completed,
  total,
  message,
  allocatedWorkers,
  itemStatuses,
  onCancel,
  isReordering = false,
}) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Render status emoji mapping
  const getStatusEmoji = (status: "pending" | "processing" | "complete" | "failed" | "retrying") => {
    switch (status) {
      case "complete":
        return "✅";
      case "processing":
        return "⚙️";
      case "retrying":
        return "🔄";
      case "failed":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getStatusLabel = (status: "pending" | "processing" | "complete" | "failed" | "retrying") => {
    switch (status) {
      case "complete":
        return "Complete";
      case "processing":
        return "Processing";
      case "retrying":
        return "Retrying";
      case "failed":
        return "Failed";
      default:
        return "Pending";
    }
  };

  const isResting = message.includes("resting") || message.includes("cooldown");

  return (
    <div id="processing-progress-container" className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-6 shadow-xl space-y-6 animate-fade-in text-left">
      {/* Header section with details */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#FF6B2B]/10 rounded-xl text-[#FF6B2B] animate-pulse">
            <Cpu size={22} id="progress-cpu-icon" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]" id="progress-title">
              Smart Parallel Processor
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5" id="progress-subtitle">
              Dynamic pool: {completed} of {total} items analyzed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#FF6B2B] bg-[#FF6B2B]/10 rounded-full border border-[#FF6B2B]/20">
            <Zap size={12} className="fill-[#FF6B2B]" />
            {allocatedWorkers} active
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              id="progress-cancel-btn"
              className="p-1 px-2 text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50/10 rounded-lg transition-colors flex items-center gap-1 border border-gray-200/10"
            >
              <X size={14} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar visual */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)]">
          <span>Overall Completion</span>
          <span className="text-[#FF6B2B] font-bold">{percentage}%</span>
        </div>
        <div className="w-full h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-gray-200/10">
          <div
            className="h-full bg-gradient-to-r from-[#FF6B2B] to-[#FF8B5B] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Grid of processed items */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Processor Slots ({total})
        </span>
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-32 overflow-y-auto p-2 bg-[var(--bg-card-hover)] rounded-xl border border-[var(--border-card)]">
          {itemStatuses.map((status, idx) => (
            <div
              key={idx}
              title={`Page/Item ${idx + 1}: ${getStatusLabel(status)}`}
              className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-center transition-all ${
                status === "complete"
                  ? "bg-green-500/10 border-green-500/20 text-green-600"
                  : status === "processing"
                  ? "bg-[#FF6B2B]/10 border-[#FF6B2B]/30 text-[#FF6B2B] animate-pulse"
                  : status === "retrying"
                  ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 animate-spin-slow"
                  : status === "failed"
                  ? "bg-red-500/10 border-red-500/20 text-red-600"
                  : "bg-gray-100/50 dark:bg-zinc-800/50 border-gray-200/10 text-gray-400"
              }`}
            >
              <span className="text-sm leading-none mb-1">{getStatusEmoji(status)}</span>
              <span className="text-[9px] font-mono leading-none">#{idx + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* User-friendly message readout area */}
      <div className="flex gap-2.5 p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl">
        <div className="text-base leading-none">
          {isReordering ? (
            "✨"
          ) : isResting ? (
            <RefreshCw size={16} className="text-amber-500 animate-spin" />
          ) : (
            <Zap size={16} className="text-[#FF6B2B] animate-pulse" />
          )}
        </div>
        <div className="flex-1 text-xs leading-normal">
          {isReordering ? (
            <span className="font-medium text-emerald-500">
              ✨ Organizing results in correct order...
            </span>
          ) : isResting ? (
            <span className="text-amber-600 font-medium">
              🔄 All processors resting — resuming in a few seconds. Everything is fine!
            </span>
          ) : (
            <span className="text-[var(--text-secondary)]">
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
