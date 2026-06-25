import React, { useCallback, useState } from 'react';
import { UploadCloud, File as FileIcon, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface UploadDropzoneProps {
  onFileSelect: (file: File) => void;
  accept: Record<string, string[]>;
  maxSize: number;
  label: string;
  sublabel: string;
  className?: string;
  clearFile?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileSelect,
  accept,
  maxSize,
  label,
  sublabel,
  className = '',
  clearFile = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Clear internal state if requested by parent
  React.useEffect(() => {
    if (clearFile) setSelectedFile(null);
  }, [clearFile]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
  });

  return (
    <div className={`w-full ${className}`}>
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`min-h-[160px] w-full border border-dashed rounded-xl bg-[var(--bg-card)] flex flex-col items-center justify-center cursor-pointer transition-all duration-200 p-5 ${
            isDragActive
              ? 'border-[var(--accent)] bg-[var(--accent-subtle)] scale-[1.01]'
              : isDragReject
              ? 'border-red-500 bg-red-500/10'
              : 'border-[var(--border-default)] hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center mb-3 transition-transform duration-200">
            <UploadCloud className={`w-5 h-5 text-[var(--accent)] ${isDragActive ? 'animate-pulse' : ''}`} />
          </div>
          <h3 className="text-xs font-bold text-[var(--text-primary)] mb-0.5 text-center">
            {label}
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] mb-3 text-center max-w-[280px]">
            {sublabel}
          </p>
          <div className="bg-[var(--bg-card-hover)] px-2.5 py-0.5 rounded-full border border-[var(--border-default)]">
            <span className="text-[9px] font-mono tracking-wider font-medium text-[var(--text-muted)] uppercase">
              {Object.values(accept).flat().join(', ').replace(/\./g, '')} • MAX {maxSize / (1024 * 1024)}MB
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full border border-[var(--border-default)] rounded-xl p-3 bg-[var(--bg-card)] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center shrink-0">
              <FileIcon size={16} className="text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--text-primary)] truncate block w-full max-w-[200px] sm:max-w-[400px]">
                {selectedFile.name}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Document'}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile(null);
            }}
            className="p-1.5 hover:bg-[var(--bg-card-hover)] rounded-md transition-colors shrink-0 outline-none text-[var(--text-muted)] hover:text-red-400"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
};
