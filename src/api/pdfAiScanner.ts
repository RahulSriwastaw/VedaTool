import { GoogleGenAI } from "@google/genai";
import mupdf from "mupdf";
import { getGeminiClient, MODELS_TO_TRY, runAIAction } from "./index.ts";

export interface AiWatermarkResult {
  text?: string;
  description: string;
  type: "text" | "image" | "stamp" | "overlay";
  position: "top-left" | "top-right" | "bottom-center" | "diagonal" | "center" | "full-page";
  confidence: number;
}

export async function analyzeWithGemini(pdfBuffer: Buffer): Promise<{ results: AiWatermarkResult[]; error?: string }> {
  try {
    const baseDoc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
    const doc = baseDoc.asPDF();
    if (!doc) {
      console.warn("[Gemini AI] Failed to cast to PDF, skipping visual scan.");
      return { results: [], error: "Document is not a valid PDF for visual scan" };
    }
    const totalPages = doc.countPages();
    
    // Feature 2B: Optimization - AI hamesha sirf 5 random pages check karega
    const sampleSize = Math.min(5, totalPages);
    const pagesToScan: number[] = [];
    
    if (totalPages <= sampleSize) {
      for (let i = 0; i < totalPages; i++) pagesToScan.push(i);
    } else {
      while (pagesToScan.length < sampleSize) {
        const rand = Math.floor(Math.random() * totalPages);
        if (!pagesToScan.includes(rand)) pagesToScan.push(rand);
      }
    }

    console.log(`[Gemini AI] Analyzing random pages: ${pagesToScan.map(p => p + 1).join(", ")}`);

    const pageParts: any[] = [];
    for (const pageIdx of pagesToScan) {
      try {
        const page = doc.loadPage(pageIdx);
        const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
        const pngBuffer = pixmap.asPNG();
        pageParts.push({
          inlineData: {
            data: Buffer.from(pngBuffer).toString("base64"),
            mimeType: "image/png"
          }
        });
      } catch (err) {
        console.error(`[Gemini AI] Error processing page ${pageIdx + 1}:`, err);
      }
    }

    if (pageParts.length === 0) return { results: [] };

    const prompt = `Identify any watermarks, stamps, logos, or intrusive text overlays recurring in these sample pages from a PDF.
Look for things like Telegram links (t.me/...), repeated URLs, brand logos in corners, or diagonal background text (e.g., "CONFIDENTIAL", "@freepdfhall").

Return ONLY a JSON array of objects with these fields:
- text: string (the exact watermark text if text-based, else null)
- description: string (simple description of what you see)
- type: "text" | "image" | "stamp" | "overlay"
- position: "top-left" | "top-right" | "bottom-center" | "diagonal" | "center" | "full-page"
- confidence: number (0 to 100)

If no watermark is found, return an empty array [].
Respond ONLY with the JSON array, no other text or markdown markers.`;

    try {
      const results = await runAIAction(async (client, modelName) => {
        console.log(`[Gemini AI] Attempting scan with model: ${modelName} via runAIAction`);
        const response = await client.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...pageParts
              ]
            }
          ]
        });

        const outputText = response.text || "";
        const cleanJson = outputText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        if (!cleanJson || cleanJson === "[]") return [];
        
        const parsed = JSON.parse(cleanJson);
        const results = Array.isArray(parsed) ? parsed : [];
        return results.filter((res: any) => res.confidence >= 60);
      });

      return { results };

    } catch (err: any) {
      console.error("[Gemini AI] Visual scan action failed after all fallback and model retries:", err);
      const isQuota = err?.message?.includes("Exhausted") || err?.message?.includes("Quota") || err?.message?.includes("429");
      return { 
        results: [], 
        error: isQuota ? "AI Quota Exceeded. Falling back to structural scan results only." : "AI scanning failed. Using structural scan results instead."
      };
    }

  } catch (error) {
    console.error("[Gemini AI] Visual scan failed during setup:", error);
    return { results: [], error: "Visual scan setup failed" };
  }
}
