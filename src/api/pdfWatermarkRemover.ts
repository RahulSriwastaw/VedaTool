import mupdf from "mupdf";
import { DetectedWatermark, isWatermarkText } from "./pdfWatermarkScanner.ts";

function cleanStreamString(streamContent: string, wmText: string): string {
  let result = "";
  let i = 0;
  const len = streamContent.length;
  
  while (i < len) {
    if (streamContent[i] === '(') {
      const startIdx = i;
      let parenContent = "";
      i++; // move past '('
      while (i < len) {
        if (streamContent[i] === '\\') {
          parenContent += streamContent[i];
          if (i + 1 < len) {
            parenContent += streamContent[i + 1];
            i += 2;
          } else {
            i++;
          }
        } else if (streamContent[i] === ')') {
          i++; // move past ')'
          break;
        } else {
          parenContent += streamContent[i];
          i++;
        }
      }
      
      let shouldRemove = false;
      const normalizedParen = parenContent.replace(/\\/g, "").trim();
      
      // 1. Direct match with current watermark text
      if (wmText && normalizedParen.toLowerCase().includes(wmText.toLowerCase())) {
        shouldRemove = true;
      }
      
      // 2. Match with watermark patterns catalog
      if (!shouldRemove) {
        const { result } = isWatermarkText(normalizedParen);
        if (result) {
          shouldRemove = true;
        }
      }
      
      // 3. Significant substring match
      if (!shouldRemove && wmText && normalizedParen.length >= 4) {
        if (wmText.toLowerCase().includes(normalizedParen.toLowerCase())) {
          shouldRemove = true;
        }
      }
      
      if (shouldRemove) {
        result += "()";
      } else {
        result += streamContent.slice(startIdx, i);
      }
    } else {
      result += streamContent[i];
      i++;
    }
  }
  return result;
}

export function removePDFWatermarks(
  pdfBuffer: Buffer,
  selectedWatermarks: DetectedWatermark[]
): any {
  const baseDoc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const doc = baseDoc.asPDF();
  if (!doc) {
    throw new Error("Failed to cast document to PDFDocument");
  }

  const totalPages = doc.countPages();

  for (const wm of selectedWatermarks) {
    try {
      // Handle Image Watermarks (including Type 4 and Type 5 SMask Transparency / multiple wrappers)
      if (wm.type === "IMAGE_REPEATED" && (wm.xref || wm.allRelatedXrefs)) {
        const targetXrefs = wm.allRelatedXrefs && wm.allRelatedXrefs.length > 0
          ? wm.allRelatedXrefs
          : (wm.xref ? [wm.xref] : []);

        // 1. Clear target image stream and/or all related wrapper XObject streams directly
        for (const targetXref of targetXrefs) {
          try {
            const obj = doc.newIndirect(targetXref);
            if (obj && obj.isStream()) {
              obj.writeStream(new Uint8Array(0));
            }
            
            // ALSO check if it has a nested SMask stream and clear that too!
            if (obj && !obj.isNull()) {
              const smask = obj.get("SMask");
              if (!smask.isNull() && smask.isIndirect()) {
                const smaskXref = smask.asIndirect();
                if (smaskXref) {
                  const smaskObj = doc.newIndirect(smaskXref);
                  if (smaskObj && smaskObj.isStream()) {
                    smaskObj.writeStream(new Uint8Array(0));
                  }
                }
              }
            }
          } catch (imgStreamErr) {
            console.error(`Error clearing XObject stream directly for xref ${targetXref}:`, imgStreamErr);
          }
        }

        // 2. Also locate page resources / contents to remove Do/sh operator references across all pages of the document to prevent skipping
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
          try {
            if (pageNum >= totalPages) continue;
            const page = doc.loadPage(pageNum) as any;
            const pageObj = page.getObject();
            const resources = pageObj.get("Resources");
            if (resources.isNull()) continue;

            for (const targetXref of targetXrefs) {
              let imgResourceName: string | null = null;
              let isPatternType = false;

              const xobjects = resources.get("XObject");
              if (!xobjects.isNull() && xobjects.isDictionary()) {
                xobjects.forEach((value: any, key: string | number) => {
                  if (value.resolve().isIndirect() && value.asIndirect() === targetXref) {
                    imgResourceName = String(key);
                  }
                });
              }

              if (!imgResourceName) {
                const patterns = resources.get("Pattern");
                if (!patterns.isNull() && patterns.isDictionary()) {
                  patterns.forEach((value: any, key: string | number) => {
                    if (value.resolve().isIndirect() && value.asIndirect() === targetXref) {
                      imgResourceName = String(key);
                      isPatternType = true;
                    }
                  });
                }
              }

              if (!imgResourceName) continue;

              const contentsRef = pageObj.get("Contents");
              if (contentsRef.isNull()) continue;

              const streamsList: any[] = [];
              if (contentsRef.isArray()) {
                const len = contentsRef.length;
                for (let i = 0; i < len; i++) {
                  streamsList.push(contentsRef.get(i));
                }
              } else if (contentsRef.isStream()) {
                streamsList.push(contentsRef);
              }

              const rxDo = new RegExp(`/${imgResourceName}\\s+Do`, "g");
              const rxDoWithGraphics = new RegExp(`q[^Q]*?/${imgResourceName}\\s+Do[^Q]*?Q`, "g");
              const rxSh = new RegExp(`/${imgResourceName}\\s+sh`, "g");

              for (const streamObj of streamsList) {
                const resolvedStream = streamObj.resolve();
                if (resolvedStream.isStream()) {
                  const streamContent = (resolvedStream.readStream() as any).toString("latin1");
                  if (streamContent.includes(imgResourceName)) {
                    let cleaned = streamContent.replace(rxDoWithGraphics, "");
                    cleaned = cleaned.replace(rxDo, "");
                    cleaned = cleaned.replace(rxSh, "");
                    resolvedStream.writeStream(new Uint8Array(Buffer.from(cleaned, "latin1")));
                  }
                }
              }
            }
          } catch (pageErr) {
            console.error(`Error processing page ${pageNum} for image/graphic removal:`, pageErr);
          }
        }
      } 
      // Handle ALL Text Watermarks (TEXT_PATTERN, TEXT_INLINE, and AI_DETECTED)
      else {
        // Clear referenced Form/Pattern XObject if TEXT_PATTERN has xref
        if (wm.type === "TEXT_PATTERN" && wm.xref) {
          try {
            const obj = doc.newIndirect(wm.xref);
            if (obj && obj.isStream()) {
              const streamContent = (obj.readStream() as any).toString("latin1");
              const cleaned = cleanStreamString(streamContent, wm.text || "");
              obj.writeStream(new Uint8Array(Buffer.from(cleaned, "latin1")));
            }
          } catch (xobjErr) {
            console.error("Error cleaning TEXT_PATTERN XObject:", xobjErr);
          }
        }

        // Clean parenthesized text across all pages in the PDF to prevent skipping
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
          try {
            if (pageNum >= totalPages) continue;
            const page = doc.loadPage(pageNum) as any;
            const pageObj = page.getObject();

            // 1. Clean page Contents stream
            const contentsRef = pageObj.get("Contents");
            if (!contentsRef.isNull()) {
              const streamsList: any[] = [];
              if (contentsRef.isArray()) {
                const len = contentsRef.length;
                for (let i = 0; i < len; i++) {
                  streamsList.push(contentsRef.get(i));
                }
              } else if (contentsRef.isStream()) {
                streamsList.push(contentsRef);
              }

              for (const streamObj of streamsList) {
                const resolvedStream = streamObj.resolve();
                if (resolvedStream.isStream()) {
                  const streamContent = (resolvedStream.readStream() as any).toString("latin1");
                  const cleaned = cleanStreamString(streamContent, wm.text || "");
                  resolvedStream.writeStream(new Uint8Array(Buffer.from(cleaned, "latin1")));
                }
              }
            }

            // 2. Also clean all referenced Form XObjects on this page
            const resources = pageObj.get("Resources");
            if (!resources.isNull()) {
              const xobjects = resources.get("XObject");
              if (!xobjects.isNull() && xobjects.isDictionary()) {
                xobjects.forEach((value: any) => {
                  const resolved = value.resolve();
                  if (resolved.isStream() && resolved.isIndirect()) {
                    const subtype = resolved.get("Subtype");
                    if (!subtype.isNull() && subtype.isName() && (subtype.asName() === "Form" || subtype.asName() === "Pattern")) {
                      const streamContent = (resolved.readStream() as any).toString("latin1");
                      const cleaned = cleanStreamString(streamContent, wm.text || "");
                      resolved.writeStream(new Uint8Array(Buffer.from(cleaned, "latin1")));
                    }
                  }
                });
              }
            }

          } catch (pageErr) {
            console.error(`Error cleaning text objects on page ${pageNum}:`, pageErr);
          }
        }
      }
    } catch (wmErr) {
      console.error(`Failed to handle watermark of type ${wm.type}:`, wmErr);
    }
  }

  // Save changes and return optimized buffer with clean garbage collection
  const outBuffer = doc.saveToBuffer("garbage=yes,compress=yes,clean=yes");
  return Buffer.from(outBuffer.asUint8Array());
}
