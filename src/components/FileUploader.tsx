import React, { useRef } from "react";
import { Upload, FileText, ImageIcon, RefreshCw } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  onFilesSelected: (files: FileList | null) => void;
  isLoading: boolean;
  progress?: number;
  status?: string;
}

const FileUploader: React.FC<Props> = ({
  onFilesSelected,
  isLoading,
  progress = 0,
  status = "Processing files...",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={`relative group h-[140px] md:h-[185px] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-dashed border-[var(--border-default)] hover:border-[var(--accent)] rounded-xl flex flex-col items-center justify-center transition-all duration-200 overflow-hidden ${
        isLoading ? "cursor-wait" : "cursor-pointer"
      }`}
      onClick={() => !isLoading && inputRef.current?.click()}
    >
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.docx"
        onChange={(e) => {
          if (!isLoading) {
            onFilesSelected(e.target.files);
          }
        }}
      />

      {isLoading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full h-full flex flex-col items-center justify-center px-4 relative"
        >
          {/* Subtle Progress Spinner */}
          <div className="relative w-12 h-12 flex items-center justify-center mb-3">
            <RefreshCw
              className="absolute inset-0 w-12 h-12 text-[var(--accent)] animate-spin opacity-30"
              style={{ animationDuration: "2s" }}
            />
            <span className="text-xs font-mono font-bold text-[var(--accent)]">
              {Math.round(progress)}%
            </span>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] mb-1">
            Processing...
          </p>

          <p className="text-[11px] text-[var(--text-secondary)] text-center max-w-xs truncate mb-2">
            {status}
          </p>

          <div className="w-[180px] h-1 bg-[var(--border-default)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent)] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            />
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center p-6 text-center select-none">
          <div className="w-10 h-10 bg-[var(--accent-subtle)] rounded-lg flex items-center justify-center text-[var(--accent)] mb-2.5 group-hover:scale-105 transition-transform duration-200">
            <Upload size={18} />
          </div>

          <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">
            Drop your files here, or <span className="text-[var(--accent)] font-semibold hover:underline">browse</span>
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] tracking-tight mb-2">
            Supports PDF, DOCX, JPEG, or PNG (Max 50MB)
          </p>

          <div className="flex gap-3 text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mt-1">
            <span className="flex items-center gap-1">
              <FileText size={10} /> Documents
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <ImageIcon size={10} /> Images
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
