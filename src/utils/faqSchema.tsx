import React from "react";

export interface FAQItem {
  q: string;
  a: string;
}

export const faqData: Record<string, FAQItem[]> = {
  "pdf-to-word-converter": [
    {
      q: "How does the PDF to DOCX converter preserve formatting?",
      a: "VedaTool reconstructs standard alignment grids, complex tables, and font patterns securely. It builds a genuine Microsoft Word layout, not a simple raw markdown/text export, ensuring style consistency."
    },
    {
      q: "Is there a file size limit for converting PDF to Word?",
      a: "VedaTool is highly optimized to run directly in the browser and handles typical files (up to dozens of megabytes) smoothly, safely, and fast."
    },
    {
      q: "Can scanned PDF agreements or locked files be converted?",
      a: "Yes. Any locked text characters or layout assets are processed via advanced layout-aware OCR and parsed into an editable DOCX format."
    },
    {
      q: "Is my personal data stored after converting whitepapers or receipts?",
      a: "Security is absolute. Transferred elements are processed on encrypted channels (HTTPS) and are never stored on our servers permanently, keeping your documents 100% private."
    }
  ],
  "pdf-to-text-ocr": [
    {
      q: "How accurate is the AI PDF to Text converter?",
      a: "Our tool achieves near-perfect accuracy on messy documents by utilizing Gemini's context-aware visual comprehension, resolving symbols and blurry characters easily."
    },
    {
      q: "Does it support multilingual documents?",
      a: "Yes, our OCR engine handles multi-language sheets (including Hindi, Spanish, Chinese, French, and German) even when multiple languages are mixed in a single row."
    },
    {
      q: "Can I extract text from PNG or JPEG files?",
      a: "Absolutely. Simply drop any high-resolution image file to transcribe text block structures, tables, and text areas instantly with layouts intact."
    },
    {
      q: "How does it preserve paragraphs or tabular structures?",
      a: "Unlike standard readers, VedaTool uses advanced layout analysis to rebuild reading flows, keeping paragraphs separated and adjacent columns aligned."
    }
  ],
  "ai-chat-document-analyzer": [
    {
      q: "What can Veda AI Assistant analyze inside my documents?",
      a: "Veda AI can read visual charts, nested tables, text layouts, and abstract formulas across multiple pages to answer complex queries and draft notes."
    },
    {
      q: "Which AI models power the Veda AI Document Chat?",
      a: "Dynamic chat requests are evaluated using Gemini 3.5 / Gemini 2.0 models to offer lightning-fast, highly accurate logical reasoning and summarization."
    },
    {
      q: "Can I run multiple separate chat threads with different files?",
      a: "Yes. Veda AI supports isolated sessions, letting you load several reference PDFs and switch contexts without mixing notes."
    },
    {
      q: "Can Veda AI write code or solve calculations based on my PDF?",
      a: "Yes, Veda AI excels at writing clean source blocks, resolving tabular expressions, and explaining scientific formulas based on the uploaded files."
    }
  ],
  "youtube-seo-title-description-generator": [
    {
      q: "How does the YouTube SEO Optimizer improve my video views?",
      a: "By writing high-conversion, viral-style headings and description copy mapped to popular search queries, it drives organic rank and click-through rates (CTR)."
    },
    {
      q: "Does the SEO Generator provide keywords and search tags?",
      a: "Yes. It drafts a clean set of focus tags, YouTube-compatible hashtags, and structured description outlines aligned with modern video search algorithms."
    },
    {
      q: "Can I choose different tones or styles for video headings?",
      a: "Yes. You can specify professional, click-worthy, educational, or highly engaging emotional tones to match your target audience channel."
    },
    {
      q: "How long does the generator take to suggest metadata?",
      a: "It is instantaneous. Simply insert your topic outline and get fully optimized suggestions with emojis and structures in seconds."
    }
  ],
  "pdf-page-arranger-merger": [
    {
      q: "Can I combine pages from distinct PDF documents into one single file?",
      a: "Yes! The interactive visual grid lets you drop multiple PDFs, re-arrange pages side-by-side, rotate them, and stitch them cleanly."
    },
    {
      q: "How do I rotate or duplicate specific sheets inside a document?",
      a: "Each page thumbnail on the board features controls to rotate 90-180-270 degrees, clone, or delete elements with a single click."
    },
    {
      q: "Does the PDF Page Arranger compress original page files?",
      a: "No. VedaTool preserves the highest resolution of images, text anchors, and formatting without compressing files unless selected."
    },
    {
      q: "Is there a page count limit for splitting or merging?",
      a: "There is no strict limit. You can compile large mock books or combine small notes lists without experiencing browser hangs."
    }
  ],
  "pdf-watermark-remover": [
    {
      q: "How does VedaTool delete watermarks without modifying other elements?",
      a: "Our stream scanning engine selectively parses repeat branding layers, CTA texts, and decorative backdrop images to wipe them out cleanly."
    },
    {
      q: "Can it remove custom URL links or Telegram channel watermarks?",
      a: "Yes. By analyzing repeated text pattern flows or using your custom text query, it identifies and overrides those elements."
    },
    {
      q: "Will my document formatting change after wiping watermarks?",
      a: "No. The underlying text flows, font mappings, styling properties, grids, and tables remain absolutely untouched."
    },
    {
      q: "Can I preview the cleaned pages before executing?",
      a: "Yes. You can review page streams and targeted pattern occurrences before completing the scrubbing process."
    }
  ]
};

/**
 * Generates and renders a FAQPage JSON-LD schema script block for reactivation inside Helmet.
 */
export function renderFaqSchema(toolId: string): React.JSX.Element | null {
  const faqs = faqData[toolId];
  if (!faqs || faqs.length === 0) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((item) => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a
      }
    }))
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
