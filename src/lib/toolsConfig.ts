export interface ToolConfig {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: "pdf" | "content" | "education";
  relatedTools: string[];
  badge?: "NEW" | "PRO" | "BETA";
  isFree: boolean;
  isPro: boolean;
  iconBgColor: string;
  lucideIconName: "ArrowLeftRight" | "FileText" | "ListChecks" | "MessageSquare" | "Youtube" | "LayoutGrid" | "Trash2";
}

export const toolsConfig: ToolConfig[] = [
  {
    id: "pdf-to-word-converter",
    name: "PDF to DOCX Converter",
    slug: "/tools/pdf-to-word-converter",
    description: "AI-powered conversion with formatting, tables, and images natively preserved.",
    category: "pdf",
    relatedTools: ["pdf-page-arranger-merger", "pdf-to-text-ocr"],
    badge: "NEW",
    isFree: true,
    isPro: false,
    iconBgColor: "#6366F1",
    lucideIconName: "ArrowLeftRight",
  },
  {
    id: "pdf-to-text-ocr",
    name: "PDF to Text (OCR)",
    slug: "/tools/pdf-to-text-ocr",
    description: "Human-like OCR accuracy for scanned documents. Extracts clean text and layout.",
    category: "pdf",
    relatedTools: ["pdf-to-word-converter", "ai-chat-document-analyzer"],
    badge: "PRO",
    isFree: false,
    isPro: true,
    iconBgColor: "#4F46E5",
    lucideIconName: "FileText",
  },
  {
    id: "ai-chat-document-analyzer",
    name: "Veda AI Assistant",
    slug: "/tools/ai-chat-document-analyzer",
    description: "Powered by Gemini 3.5. Advanced real-time reasoning and document analysis.",
    category: "content",
    relatedTools: ["pdf-to-text-ocr", "pdf-to-word-converter", "youtube-seo-title-description-generator"],
    badge: "BETA",
    isFree: true,
    isPro: false,
    iconBgColor: "#4B7BF5",
    lucideIconName: "MessageSquare",
  },
  {
    id: "youtube-seo-title-description-generator",
    name: "YouTube SEO Optimizer",
    slug: "/tools/youtube-seo-title-description-generator",
    description: "Generate viral titles, descriptions, and perfectly optimized hashtags with AI.",
    category: "content",
    relatedTools: ["ai-chat-document-analyzer", "pdf-to-text-ocr", "pdf-to-word-converter"],
    badge: "NEW",
    isFree: true,
    isPro: false,
    iconBgColor: "#E63946",
    lucideIconName: "Youtube",
  },
  {
    id: "pdf-page-arranger-merger",
    name: "PDF Page Arranger",
    slug: "/tools/pdf-page-arranger-merger",
    description: "Arrange, rotate, split, and merge multiple PDF documents into single distinct files.",
    category: "pdf",
    relatedTools: ["pdf-to-word-converter", "pdf-to-text-ocr"],
    badge: "NEW",
    isFree: true,
    isPro: false,
    iconBgColor: "#7B5EA7",
    lucideIconName: "LayoutGrid",
  },
  {
    id: "pdf-watermark-remover",
    name: "PDF Watermark Remover",
    slug: "/tools/pdf-watermark-remover",
    description: "Purge hidden text, CTA links, Telegram URLs, and recurring logo watermarks instantly.",
    category: "pdf",
    relatedTools: ["pdf-page-arranger-merger", "pdf-to-word-converter", "pdf-to-text-ocr"],
    badge: "NEW",
    isFree: true,
    isPro: false,
    iconBgColor: "#EF4444",
    lucideIconName: "Trash2",
  },
  {
    id: "mcq-extractor-from-pdf",
    name: "MCQ Extractor & Bank",
    slug: "/tools/mcq-extractor-from-pdf",
    description: "Extract multiple-choice questions from PDFs page-by-page, tag categories, and generate secure passcode test sets.",
    category: "education",
    relatedTools: ["pdf-to-text-ocr", "pdf-to-word-converter"],
    badge: "NEW",
    isFree: true,
    isPro: false,
    iconBgColor: "#F59E0B",
    lucideIconName: "ListChecks",
  },
];
