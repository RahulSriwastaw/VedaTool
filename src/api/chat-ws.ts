import { GoogleGenAI } from "@google/genai";
import { getGeminiClient, reportKeySuccess, reportKeyError, getAllKeys } from "./index.ts";

const MODELS_TO_TRY = [
  (process.env.GEMINI_MODEL || "gemini-3.5-flash").split(/[#\s]/)[0].trim(),
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3.1-pro-preview"
]
  .filter((m) => m && m.toLowerCase().includes("gemini-"))
  .map((m) => m.replace(/^models\//, ""))
  .filter((v, i, a) => a.indexOf(v) === i);

export async function handleChatWebSocket(ws: any, req: any) {
  let isAlive = true;
  ws.on('pong', () => { isAlive = true; });

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(interval);
      return;
    }
    if (isAlive === false) return ws.terminate();
    isAlive = false;
    ws.ping();
  }, 15000);

  ws.on("message", async (msg: string) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "start") {
        const { messages, files, userApiKey, isSmartFormat } = data.payload;
        
        // ... build system instruction ...
        let sysInstruction = "You are Whiteboard AI, an ultra-intelligent, advanced, and friendly AI assistant developed as the flagship model of the Whiteboard workspace. You MUST always identify yourself as 'Whiteboard AI' if someone asks who you are. Provide exceptionally clear, high-quality, precise, and accurate replies. Use Markdown formatting elegantly. Use LaTeX for math ($...$ for inline, $$...$$ for block). Use code blocks with appropriate language tags when generating code files. If the user uploads files or images, perform a masterclass analysis and guide them smoothly.";
        if (isSmartFormat) {
          sysInstruction += "\n\nCRITICAL INSTRUCTION: STRICTLY FORMAT ALL MATH EQUATIONS AND MATHEMATICAL REASONING IN PROPER MARKDOWN WITH KA-TEX LATEX SUPPORT. Always wrap inline math formulas with single dollar signs like $ x = 5 $. Always wrap block math formulas with double dollar signs like $$ x = 5 $$. Do NOT output raw math symbols without LaTeX block wrappers. You must apply these formatting styles automatically to all math responses.";
        }
        
        const triedCombinations: Set<string> = new Set();
        const maxRetries = Math.max(12, MODELS_TO_TRY.length * 2);
        const failedKeys: string[] = [];
        
        let keyToUse = userApiKey || undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const modelName = MODELS_TO_TRY[attempt % MODELS_TO_TRY.length];
          let clientData;
          try {
             clientData = getGeminiClient(failedKeys, keyToUse);
          } catch(e) {
             ws.send(JSON.stringify({ type: "error", error: "Please configure your API Key. No backend pool keys configured." }));
             break;
          }
          const { client, key } = clientData;

          const combo = `${modelName}:${key}`;
          if (triedCombinations.has(combo)) continue;
          triedCombinations.add(combo);

          try {
            console.log(`[ChatStreamWS] Using model: ${modelName} with key: ${key ? key.substring(0, 8) : "none"}...`);

            const contents = messages
              .filter((m: any) => m.content?.trim() || (m.files && m.files.length > 0))
              .map((m: any) => {
                const parts: any[] = [];
                if (m.content?.trim()) parts.push({ text: m.content });
                return { role: m.role === "assistant" ? "model" : "user", parts };
              });

            if (files && files.length > 0 && contents.length > 0) {
              const lastMessage = contents[contents.length - 1];
              files.forEach((file: any) => {
                if (file.base64) {
                  const cleanB64 = file.base64.replace(/^data:.*?;base64,/, "");
                  lastMessage.parts.push({
                    inlineData: { mimeType: file.mimeType || "image/png", data: cleanB64 },
                  });
                }
              });
            }

            if (contents.length > 0 && contents[contents.length - 1].parts.length === 0) {
              contents[contents.length - 1].parts.push({ text: "Analyze the attached files." });
            }

            const stream = await client.models.generateContentStream({
              model: modelName,
              contents: contents,
              config: {
                systemInstruction: sysInstruction,
                temperature: 0.7,
              },
            });

            for await (const chunk of stream) {
              if (ws.readyState !== ws.OPEN) break;
              let chunkText = "";
              try {
                if (typeof chunk.text === "string") chunkText = chunk.text;
                else if (typeof (chunk as any).text === "function") chunkText = (chunk as any).text();
                else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) chunkText = chunk.candidates[0].content.parts[0].text;
              } catch (e) {
                console.error("Error extracting text from chunk:", e);
              }

              if (chunkText) {
                ws.send(JSON.stringify({ type: "chunk", text: chunkText }));
              }
            }

            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "done" }));
            }
            reportKeySuccess(key);
            break;
          } catch (error: any) {
            console.warn(`[ChatStreamWS] Attempt ${attempt} unsuccessful using ${modelName}:${key ? key.substring(0, 8) : "none"}...: ${error.message}`);
            
            const errorStr = (error?.message || String(error)).toUpperCase();
            const isQuota =
              errorStr.includes("429") ||
              errorStr.includes("RESOURCE_EXHAUSTED") ||
              errorStr.includes("QUOTA") ||
              errorStr.includes("LIMIT");
            const isServerOverloaded =
              errorStr.includes("503") ||
              errorStr.includes("UNAVAILABLE") ||
              errorStr.includes("OVERLOAD") ||
              errorStr.includes("FETCH FAILED") ||
              errorStr.includes("500");
            const isInvalidKey =
              errorStr.includes("API KEY NOT VALID") ||
              errorStr.includes("PERMISSION_DENIED") ||
              errorStr.includes("API_KEY_INVALID") ||
              errorStr.includes("API KEY INVALID") ||
              errorStr.includes("403") ||
              errorStr.includes("401");

            if (isInvalidKey) {
              reportKeyError(key, "INVALID", true);
            } else if (isQuota) {
              reportKeyError(key, "Quota");
            } else if (isServerOverloaded) {
              reportKeyError(key, "Overload");
            } else {
              reportKeyError(key, "StreamError");
            }

            if (key && !failedKeys.includes(key)) failedKeys.push(key);

            if (attempt >= maxRetries) {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: "error", error: "Service temporarily unavailable. Please try again later." }));
              }
            } else {
              // Try to check if we have untried keys remaining in the pool
              const poolKeysCount = getAllKeys().length;
              const hasUntriedKeys = keyToUse ? false : (failedKeys.length < poolKeysCount);

              if (hasUntriedKeys) {
                // Instantly try next key with a minuscule delay
                console.log(`[ChatStreamWS] Instantly swapping to another untried pooled key. Fresh keys remaining: ${poolKeysCount - failedKeys.length}`);
                await new Promise((resolve) => setTimeout(resolve, 50));
              } else {
                // If we've run out of distinct healthy keys (or we are only using a specific user/primary key),
                // we apply a progressive staggered delay to allow the services/quotas to clear.
                let sleepMs = 300 + attempt * 200;
                if (isQuota || isServerOverloaded) {
                  sleepMs = Math.min(4500, 1500 + attempt * 500);
                  console.log(`[ChatStreamWS] Rate limit/Busy on last/only key. Staggering next attempt by ${sleepMs}ms to let services reset...`);
                } else {
                  console.log(`[ChatStreamWS] Connection error on last/only key. Staggering next attempt by ${sleepMs}ms...`);
                }
                await new Promise((resolve) => setTimeout(resolve, sleepMs));
              }
            }
          }
        }
        
      }
    } catch (err) {
      console.error("[ChatWS] processing error:", err);
    }
  });

  ws.on('close', () => {
    clearInterval(interval);
  });
}
