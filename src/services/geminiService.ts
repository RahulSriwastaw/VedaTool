import { GoogleGenAI } from "@google/genai";
import { NumberingStyle, OptionPatternFormat } from "../types";

// Helper to get API key from server-side proxy or env
// In this specific architecture, we likely use a proxy endpoint /api/gemini
// but for the sake of restoration, I'll assume an endpoint exists or we use the SDK if keys are available

export const extractLayoutFromImage = async (
  base64Image: string,
  numberingStyle: NumberingStyle = NumberingStyle.NONE,
  includeImages: boolean = false,
  isBilingual: boolean = false,
  mcqMode: boolean = false,
  refineMode: boolean = false,
  answerLength?: string,
  customAnswerPrompt?: string,
  optionPattern: OptionPatternFormat = OptionPatternFormat.A_B_C_D,
  systematicArrange: boolean = true,
  autoProofread: boolean = false,
  extractOptions?: { answers: boolean; solutions: boolean },
  apiKey?: string
): Promise<any[]> => {
  const userApiKey = apiKey || localStorage.getItem("active_gemini_api_key");

  // We'll call the server proxy to handle the Gemini API securely
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userApiKey ? { "x-user-api-key": userApiKey } : {}),
    },
    body: JSON.stringify({
      base64Image,
      numberingStyle,
      includeImages,
      isBilingual,
      mcqMode,
      refineMode,
      answerLength,
      customAnswerPrompt,
      optionPattern,
      systematicArrange,
      autoProofread,
      extractOptions,
      ocrText: "", // Server expects this
    }),
  });

  if (!response.ok) {
    let errMsg = "Failed to extract layout";
    try {
      const errText = await response.text();
      if (errText.includes('{"error":')) {
        const parsed = JSON.parse(errText.substring(errText.indexOf("{")));
        errMsg = parsed.error || errMsg;
      } else {
        errMsg = errText.length > 200 ? errText.substring(0, 200) + "..." : errText || errMsg;
      }
    } catch (e) {}
    throw new Error(errMsg);
  }

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text.trim());
  } catch (err: any) {
    console.error("Layout response parsing failed. Body received was:", text.substring(0, 500));
    throw new Error(
      `Received invalid response format from extractor server. ${
        text.startsWith("<!DOCTYPE") || text.includes("<html")
          ? "The server returned an HTML page instead of JSON. Ensure the server is running correctly. If you are using the app inside a preview iframe, please click 'Open in New Tab' at the top-right of your screen to authorize cookies."
          : "Response could not be parsed."
      }`
    );
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return data?.elements || [];
};
