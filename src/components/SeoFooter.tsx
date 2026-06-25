import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, HelpCircle, Link2 } from "lucide-react";

interface SeoFooterProps {
  toolId: "pdf-to-word" | "pdf-to-text" | "youtube-seo" | "pdf-arranger" | "ai-chat" | "pdf-watermark-remover";
}

export const SeoFooter: React.FC<SeoFooterProps> = ({ toolId }) => {
  const getSeoData = () => {
    switch (toolId) {
      case "pdf-watermark-remover":
        return {
          h1: "PDF Watermark Remover & Content Purger",
          h2: "Decompress, Decode & Scrub Custom Watermarks Online",
          intro: "Erase annoying text patterns, social handle stamps, Telegram link watermarks, and recurring branding logos directly inside your web browser. Utilizing highly optimized document stream scanning, our tool purges graphical instructions and content records without altering your original formatting, font layout structures, or pages resolution.",
          steps: [
            "Upload any PDF file that contains intrusive logo or text stamps.",
            "Choose from the list of auto-detected watermarks of repeated or pattern structures.",
            "Input a custom query to target user-specific texts if your watermark is unique.",
            "Run the stream purger and automatically download your cleanly modified PDF file."
          ],
          relatedLinks: [
            { path: "/tools/pdf-page-arranger-merger", text: "stitch and rearrange pages of various reference books using PDF Page Arranger and Merger" },
            { path: "/tools/pdf-to-word-converter", text: "transform scanned PDF structures into fully editable Microsoft Word documents with PDF to Word Converter" },
            { path: "/tools/pdf-to-text-ocr", text: "scanned PDF documents into clean plain text with layouts intact using PDF to Text OCR" }
          ]
        };
      case "pdf-to-word":
        return {
          h1: "PDF to Word Converter",
          h2: "How to Convert PDF to DOCX Online",
          intro: "Looking for a reliable way to make your PDF files editable? VedaTool's high-fidelity conversion engine reconstructs standard formatting, alignment grid layouts, complex nested tables, and embedded images, instantly delivering a clean Microsoft Word file with zero formatting loss.",
          steps: [
            "Drag and drop your PDF file or click to choose from your physical storage.",
            "Choose your option alignment and layout orientation variables.",
            "Click on 'Convert Now' to execute the secure structure preservation algorithm.",
            "Download your fully customized editable MS Word DOCX file instantly."
          ],
          relatedLinks: [
            { path: "/tools/pdf-to-text-ocr", text: "scanned PDF documents into clean plain text with layouts intact using PDF to Text OCR" },
            { path: "/tools/pdf-page-arranger-merger", text: "stitch, reorder, and split document pages easily with the Interactive PDF Arranger and Page Merger" }
          ]
        };
      case "pdf-to-text":
        return {
          h1: "PDF to Text OCR Converter",
          h2: "High-Accuracy Optical Character Recognition & Layout Extraction",
          intro: "Extract characters and read text with context-aware accuracy from flattened PDFs, non-editable scans, or camera photos. Powered by advanced vision-language model algorithms, our OCR analyzer parses complex double-column layouts, school book sheets, and inline tables effortlessly.",
          steps: [
            "Select or drop any image (PNG, JPG) or scanned PDF document inside the dropzone.",
            "Verify standard parameters like rotation and bilingual support flags.",
            "Trigger processing to translate binary images into digital, copyable text lists.",
            "View results inline and export the reconstructed document instantly as a text file."
          ],
          relatedLinks: [
            { path: "/tools/pdf-to-word-converter", text: "transform scanned PDF structures into fully editable Microsoft Word documents with PDF to Word Converter" },
            { path: "/tools/ai-chat-document-analyzer", text: "summarize and prompt multi-column figures with AI Chat Document Analyzer" }
          ]
        };

      case "youtube-seo":
        return {
          h1: "YouTube SEO Title & Description Generator",
          h2: "Grow Organic Channel Views with CTR metadata",
          intro: "Supercharge your audience conversion metrics and video views. Our AI SEO optimizer analyzes target keyword parameters to output high-CTR viral titles, long semantic descriptions with structural chapters, relevant tags, and trending search hashtags to help you rank on the top search pages.",
          steps: [
            "Input your video's core topic or primary target search keyword.",
            "Specify helpful content outline elements, audience demographics, or language tones.",
            "Click 'Generate' to create multiple CTR-boosting title variations and organic tags.",
            "Copy tags directly into YouTube Creator Studio to skyrocket search impressions."
          ],
          relatedLinks: [
            { path: "/tools/ai-chat-document-analyzer", text: "chat, sketch video outlines, and draft complete scripts with Veda AI Chat Assistant" },
            { path: "/tools/pdf-to-text-ocr", text: "import and parse video reference PDFs, source articles, or written transcripts using PDF to Text OCR" },
            { path: "/tools/pdf-to-word-converter", text: "organize and compile your final video courses and lesson e-books into clean documents with PDF to Word Converter" }
          ]
        };
      case "pdf-arranger":
        return {
          h1: "PDF Page Arranger, Splitter & Merger",
          h2: "High-Fidelity Interactive Page Editor & File Stitcher",
          intro: "Organize, duplicate, split, slide-rotate, delete, or compile your documents with zero friction. VedaTool's drag-and-drop arranger renders live page thumbnails to let you arrange multipage PDFs or stitch pages from distinct, separate source documents into a brand new, perfectly ordered build.",
          steps: [
            "Drag and drop multiple PDF files into our clean tile grid overview.",
            "Reorder pages with simple mouse gestures, or rotate individual sheets 90-180-270 degrees.",
            "Select specific ranges of pages to delete, duplicate, or split into external files.",
            "Stitch the sorted layouts and download your newly compiled high-res PDF file instantly."
          ],
          relatedLinks: [
            { path: "/tools/pdf-to-word-converter", text: "convert your finished, reordered PDF files into structured Microsoft Word templates with PDF to Word Converter" },
            { path: "/tools/pdf-to-text-ocr", text: "recognize and copy text from any single page in your arrangement using PDF to Text OCR" }
          ]
        };
      case "ai-chat":
        return {
          h1: "AI Chat Document Analyzer & Reasoning Assistant",
          h2: "Perform Complex Reasoning & Multi-Modal Document Analyses with Veda AI",
          intro: "Prompt and chat with your documents using advanced, context-aware reasoning structures. Powered by premium Gemini models, Veda AI interprets mathematical charts, multi-column articles, school textbooks, and visual graphs, allowing you to summarize context and build structured notes dynamically.",
          steps: [
            "Initiate a chat session or upload dynamic visual attachments.",
            "Type a targeted prompt, e.g., 'Summarize chapter 3' or 'Explain this technical chart'.",
            "Get instant responses with native markdown equations (KaTeX) and formatted code snippets.",
            "View visual feedback, maintain dynamic active sessions storage, and review history."
          ],
          relatedLinks: [
            { path: "/tools/pdf-to-text-ocr", text: "parse flat papers to copy block layouts first using PDF to Text OCR" },
            { path: "/tools/pdf-to-word-converter", text: "package and structure your AI research and chat answers into docx formats with PDF to Word Converter" },
            { path: "/tools/youtube-seo-title-description-generator", text: "translate your interactive chat concepts into organic keywords with YouTube SEO Optimizer" }
          ]
        };
    }
  };

  const seo = getSeoData() || {
    h1: "Whiteboard PDF Tool Suite",
    h2: "Manage, Convert, and Optimize Documents Instantly",
    intro: "Simplify your productivity with our suite of modern, browser-native document tools. Process documents securely and instantly.",
    steps: [
      "Select a tool from our toolbox hub.",
      "Upload your PDF, Word document, or image file.",
      "Identify, extract, or clean elements as needed.",
      "Download your output instantly without loss of formatting."
    ],
    relatedLinks: []
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-12 pb-16 border-t border-[var(--border-default)] pt-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        {/* Left column: Headings, intro, instructions */}
        <div className="lg:col-span-8 space-y-5">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-sm bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] shrink-0">
              <Sparkles size={11} />
            </span>
            <span className="text-[10px] uppercase tracking-[0.8px] font-semibold text-[var(--text-secondary)]">
              Search Engine Optimization (SEO) & Feature Index
            </span>
          </div>

          <h1 className="text-[18px] sm:text-[20px] font-bold text-[var(--text-primary)] leading-tight tracking-tight">
            {seo.h1}
          </h1>

          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed font-normal">
            {seo.intro}
          </p>

          <div className="border border-[var(--border-default)] rounded-[var(--radius-md)] p-4 bg-[var(--bg-main)]/50">
            <h2 className="text-[12px] sm:text-[13px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="p-1 rounded-sm bg-[var(--bg-hover)] text-[var(--text-secondary)] shrink-0">
                <HelpCircle size={12} />
              </span>
              {seo.h2}
            </h2>

            <ol className="list-decimal pl-5 space-y-2 text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
              {seo.steps.map((step, idx) => (
                <li key={idx} className="pl-1">
                  <span className="text-[var(--text-primary)] font-medium">{step.split(":")[0]}</span>
                  {step.includes(":") ? `:${step.split(":")[1]}` : ""}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Right column: Internal Linking Anchor list */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center gap-1.5 border-b border-[var(--border-default)] pb-2 mb-2">
            <Link2 size={13} className="text-[var(--brand-primary)]" />
            <h3 className="text-[11px] uppercase tracking-[0.8px] font-semibold text-[var(--text-primary)]">
              Related Tools & Resources
            </h3>
          </div>

          <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
            Boost your editing, digitizing, and optimization flows with our other high-quality utility systems:
          </p>

          <ul className="space-y-3">
            {seo.relatedLinks.map((link, idx) => (
              <li key={idx} className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed pl-3 border-l-2 border-[var(--border-default)] hover:border-[var(--brand-primary)] transition-all">
                You can also convert{" "}
                <Link
                  to={link.path}
                  className="text-[var(--brand-primary)] hover:text-[#E55A1A] hover:underline font-semibold"
                >
                  {link.text.split(" ").slice(-2).join(" ")}
                </Link>{" "}
                or {link.text.split(" ").slice(0, -2).join(" ")}.
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="text-center mt-12 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-default)] pt-6">
        &copy; {new Date().getFullYear()} VedaTool Ecosystem. Structured Schema, Open Graph tags, and micro-metadata verified. All rights reserved.
      </div>
    </div>
  );
};
