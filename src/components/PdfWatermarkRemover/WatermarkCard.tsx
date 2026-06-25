import React, { useEffect, useState } from "react";
import { DetectedWatermark } from "./types";
import { Check, FileText, Image as ImageIcon, Repeat, Sparkles } from "lucide-react";

const TYPE_META = {
  TEXT_PATTERN: {
    label: "Shared Text Watermark",
    icon: <Repeat size={14} className="text-indigo-400" />,
    hint: "Found inside shared layout blocks across the PDF",
  },
  TEXT_INLINE: {
    label: "Inline Text Watermark",
    icon: <FileText size={14} className="text-emerald-400" />,
    hint: "Written directly in page text contents",
  },
  IMAGE_REPEATED: {
    label: "Image Watermark",
    icon: <ImageIcon size={14} className="text-amber-400" />,
    hint: "Logo, seal, or stamp appearing on multiple pages",
  },
  AI_DETECTED: {
    label: "AI Visual Finding",
    icon: <Sparkles size={14} className="text-purple-400" />,
    hint: "Identified by Gemini Vision visual analysis",
  },
};

interface Props {
  watermark: DetectedWatermark;
  selected: boolean;
  onToggle: (id: string) => void;
  sessionId: string;
  apiBase: string;
}

export default function WatermarkCard({
  watermark,
  selected,
  onToggle,
  sessionId,
  apiBase,
}: Props) {
  const meta = TYPE_META[watermark.type];
  const confidence = Math.round(watermark.confidence * 100);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (watermark.type !== "IMAGE_REPEATED") return;
    const url = `${apiBase}/api/tools/pdf-watermark-remover/thumbnail/${sessionId}/${watermark.id}`;
    setImgSrc(url);
  }, [watermark.id, sessionId, apiBase, watermark.type]);

  return (
    <div
      onClick={() => onToggle(watermark.id)}
      className={`
        p-4 rounded-[var(--radius-lg)] border cursor-pointer transition-all select-none
        ${
          selected
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary-muted)] shadow-sm"
            : "border-[var(--border-default)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
        }
      `}
    >
      <div className="flex items-start gap-4">
        {/* Customized Checkbox */}
        <div
          className={`
            mt-1 w-5 h-5 rounded-[var(--radius-sm)] border-2 flex-shrink-0 flex items-center justify-center transition-all
            ${
              selected
                ? "bg-[var(--brand-primary)] border-[var(--brand-primary)]"
                : "border-[var(--border-strong)] bg-[var(--bg-page)]"
            }
          `}
        >
          {selected && <Check size={12} className="text-white stroke-[3px]" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="p-1 rounded bg-[var(--bg-page)]">{meta.icon}</span>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {meta.label}
            </span>
            {watermark.source === "ai" && (
              <span className="flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 font-bold px-1.5 py-0.5 rounded border border-purple-500/20">
                <Sparkles size={10} /> AI POWERED
              </span>
            )}
            <span
              className={`
                text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full
                ${
                  confidence >= 85
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-500"
                }
              `}
            >
              {confidence}% Match
            </span>
          </div>

          {/* Description / Position */}
          {(watermark.description || watermark.position) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {watermark.position && (
                <span className="text-[10px] bg-[var(--bg-page)] text-[var(--text-muted)] border border-[var(--border-default)] px-1.5 py-0.5 rounded">
                  POS: {watermark.position.toUpperCase()}
                </span>
              )}
              {watermark.description && (
                <p className="text-[11px] text-[var(--text-secondary)] italic">
                  "{watermark.description}"
                </p>
              )}
            </div>
          )}

          {/* Text / value */}
          {watermark.text && (
            <p className="text-sm font-mono bg-[var(--bg-page)] px-3 py-2 rounded-[var(--radius-md)] text-[var(--text-primary)] border border-[var(--border-default)] mb-2 truncate">
              {watermark.text}
            </p>
          )}

          {/* Image Thumbnail for Repeated Image type */}
          {watermark.type === "IMAGE_REPEATED" && imgSrc && (
            <div className="relative mt-2 mb-2 p-1 bg-[var(--bg-page)] rounded-[var(--radius-md)] border border-[var(--border-default)] max-w-[140px]">
              <img
                src={imgSrc}
                alt="Watermark thumbnail"
                referrerPolicy="no-referrer"
                className="h-16 object-contain rounded-[var(--radius-sm)]"
                onError={() => setImgSrc(null)}
              />
            </div>
          )}

          {/* Page indicator info */}
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-2">
            <span>•</span>
            <span>
              {watermark.pagesAffected.length === 1
                ? `Affects Page ${watermark.pagesAffected[0] + 1}`
                : `Affects ${watermark.pagesAffected.length} Pages`}
            </span>
            {watermark.pagesAffected.length > 1 && (
              <span className="opacity-80">
                ({watermark.pagesAffected.slice(0, 4).map((p) => p + 1).join(", ")}
                {watermark.pagesAffected.length > 4 ? "..." : ""})
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
