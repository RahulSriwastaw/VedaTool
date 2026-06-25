import React from "react";
import katex from "katex";

interface MathRendererProps {
  text?: string;
  className?: string;
  block?: boolean;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ text = "", className = "", block = false }) => {
  if (!text) return null;

  // Let's normalize alternative LaTeX delimiters like \[ \] and \( \)
  // Double-escaped or single-escaped: \\[ ... \\] or \[ ... \] -> $$ ... $$
  // Double-escaped or single-escaped: \\( ... \\) or \( ... \) -> $ ... $
  let processedText = text;
  processedText = processedText.replace(/\\\\\[/g, "$$").replace(/\\\\\]/g, "$$");
  processedText = processedText.replace(/\\\\\(/g, "$").replace(/\\\\\)/g, "$");
  processedText = processedText.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  processedText = processedText.replace(/\\\(/g, "$").replace(/\\\)/g, "$");

  // Render direct math block request
  if (block) {
    try {
      const html = katex.renderToString(processedText, { displayMode: true, throwOnError: false });
      return (
        <div 
          className={`katex-display-container my-2 overflow-x-auto max-w-full ${className}`} 
          dangerouslySetInnerHTML={{ __html: html }} 
        />
      );
    } catch {
      return <pre className={`font-mono text-xs whitespace-pre-wrap ${className}`}>{processedText}</pre>;
    }
  }

  // Parse text that has mixed plain text and math expressions:
  // e.g., "Find x if $$x^2 = 4$$" or "Since $a = 3$"
  
  // First split by $$
  const doubleDollarParts = processedText.split(/\$\$/g);
  const elements: React.ReactNode[] = [];

  doubleDollarParts.forEach((part, outerIndex) => {
    // If odd index, it's a math block from inside $$ ... $$
    if (outerIndex % 2 === 1) {
      if (part.trim()) {
        try {
          const html = katex.renderToString(part, { displayMode: false, throwOnError: false });
          elements.push(
            <span 
              key={`math-block-${outerIndex}`} 
              className="inline-block mx-1 font-semibold math-rendered"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          elements.push(<code key={`math-err-${outerIndex}`} className="bg-zinc-100 px-1 rounded font-mono text-zinc-600">{part}</code>);
        }
      }
    } else {
      // Even index: plain text that might contain single dollar ($) math blocks
      const singleDollarParts = part.split(/\$/g);
      singleDollarParts.forEach((subPart, innerIndex) => {
        // If odd index, it's inline math
        if (innerIndex % 2 === 1) {
          if (subPart.trim()) {
            try {
              const html = katex.renderToString(subPart, { displayMode: false, throwOnError: false });
              elements.push(
                <span 
                  key={`inline-math-${outerIndex}-${innerIndex}`} 
                  className="inline-block mx-0.5 math-rendered"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch {
              elements.push(<code key={`inline-math-err-${outerIndex}-${innerIndex}`} className="bg-zinc-100 px-1 rounded font-mono text-zinc-600">{subPart}</code>);
            }
          }
        } else {
          // Even index of single dollar split is actual plain text.
          // Preserve newlines so that layout paragraphs and explanations keep their line segments
          const lines = subPart.split("\n");
          lines.forEach((line, lineIndex) => {
            if (lineIndex > 0) {
              elements.push(<br key={`br-${outerIndex}-${innerIndex}-${lineIndex}`} />);
            }
            if (line) {
              elements.push(<span key={`text-${outerIndex}-${innerIndex}-${lineIndex}`}>{line}</span>);
            }
          });
        }
      });
    }
  });

  return <span className={className}>{elements}</span>;
};
