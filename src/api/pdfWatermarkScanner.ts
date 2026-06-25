import mupdf from "mupdf";
import { nanoid } from "nanoid";

export const WATERMARK_TEXT_PATTERNS = [
  /@\w+/i,                    // @username style
  /click\s+here/i,            // CTA watermarks
  /t\.me\//i,                 // Telegram links
  /www\.\S+/i,                // Website URLs
  /downloaded\s+from/i,
  /visit\s+\S+/i,
  /whatsapp/i,
  /join\s+(us|our|channel)/i,
  /freepdf/i,
  /telegram/i,
  /subscribe/i,
  /not\s+to\s+be\s+re-?published/i, // NCERT style with optional dash
  /re-?published/i,                // fallback republished match
  /ncert/i,                         // ncert books brand
  /for\s+free/i,
  /watermark/i,
  /confidential/i,
  /ypt_book/i,
  /ypt/i,
  /do\s+not\s+copy/i,
  /preview\s+only/i,
  /sample\s+page/i,
];

export function isWatermarkText(text: string): { result: boolean; confidence: number } {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 150) {
    return { result: false, confidence: 0 };
  }
  for (const pattern of WATERMARK_TEXT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { result: true, confidence: 0.95 };
    }
  }
  return { result: false, confidence: 0 };
}

function readStreamContent(obj: any): string | null {
  try {
    if (!obj.isStream()) return null;
    const buf = obj.readStream();
    return buf.toString("latin1");
  } catch {
    return null;
  }
}

export interface DetectedWatermark {
  id: string;
  type: "TEXT_PATTERN" | "TEXT_INLINE" | "IMAGE_REPEATED" | "AI_DETECTED";
  text: string | null;
  description?: string | null;
  source: "structure" | "ai";
  xref: number | null;
  pagesAffected: number[];
  confidence: number;
  position?: string;
  thumbnailBase64?: string | null;
  allRelatedXrefs?: number[]; // Shared/multiple wrappers for Type 5 Fix
}

// Recursively checks if an XObject (or child chain) contains an SMask transparency watermark of significant size
function hasWatermarkChain(doc: any, startXref: number, seen: Set<number>, depth = 0): boolean {
  if (depth > 6) return false;
  if (seen.has(startXref)) return false;
  seen.add(startXref);

  try {
    const obj = doc.newIndirect(startXref);
    if (!obj || obj.isNull()) return false;
    const resolved = obj.resolve();
    
    const subtype = resolved.get("Subtype");
    if (!subtype.isNull() && subtype.isName()) {
      const subName = subtype.asName();
      if (subName === "Image") {
        const smask = resolved.get("SMask");
        if (!smask.isNull() && smask.isIndirect()) {
          const smaskXref = smask.asIndirect();
          if (smaskXref) {
            const smaskObj = doc.newIndirect(smaskXref).resolve();
            const wObj = smaskObj.get("Width");
            const hObj = smaskObj.get("Height");
            const w = wObj.asInteger ? wObj.asInteger() : 0;
            const h = hObj.asInteger ? hObj.asInteger() : 0;
            // Transparency mask of significant size (like the 947x947 NCERT background watermark)
            if (w > 100 && h > 100) {
              return true;
            }
          }
        }
      } else if (subName === "Form") {
        // Form XObjects contain nested XObjects inside Resources -> XObject dictionary
        const resources = resolved.get("Resources");
        if (!resources.isNull() && resources.isDictionary()) {
          const xobjects = resources.get("XObject");
          if (!xobjects.isNull() && xobjects.isDictionary()) {
            let found = false;
            xobjects.forEach((value: any) => {
              if (found) return;
              const subXref = value.asIndirect();
              if (subXref) {
                if (hasWatermarkChain(doc, subXref, seen, depth + 1)) {
                  found = true;
                }
              }
            });
            if (found) return true;
          }
        }
      }
    }
  } catch {
    // Ignore error
  }
  return false;
}

// Returns the sorted array of nested sub-xrefs referenced inside a Form XObject
function getXObjectFingerprint(doc: any, xref: number): number[] {
  const refs: number[] = [];
  try {
    const obj = doc.newIndirect(xref);
    if (obj && !obj.isNull()) {
      const resolved = obj.resolve();
      const resources = resolved.get("Resources");
      if (!resources.isNull() && resources.isDictionary()) {
        const xobjects = resources.get("XObject");
        if (!xobjects.isNull() && xobjects.isDictionary()) {
          xobjects.forEach((value: any) => {
            const subXref = value.asIndirect();
            if (subXref && !refs.includes(subXref)) {
              refs.push(subXref);
            }
          });
        }
        const patterns = resources.get("Pattern");
        if (!patterns.isNull() && patterns.isDictionary()) {
          patterns.forEach((value: any) => {
            const subXref = value.asIndirect();
            if (subXref && !refs.includes(subXref)) {
              refs.push(subXref);
            }
          });
        }
      }
    }
  } catch {
    // Ignore
  }
  return refs.sort((a, b) => a - b);
}

// Find all Form XObjects across the PDF that use the exact same sub-objects fingerprint
function findAllFormXrefsWithSameFingerprint(doc: any, totalXrefs: number, fingerprint: number[]): number[] {
  if (fingerprint.length === 0) return [];
  const matches: number[] = [];
  const fingerKey = JSON.stringify(fingerprint);

  for (let xref = 1; xref <= totalXrefs; xref++) {
    try {
      const obj = doc.newIndirect(xref);
      if (!obj || !obj.isStream()) continue;
      const resolved = obj.resolve();
      const subtype = resolved.get("Subtype");
      if (!subtype.isNull() && subtype.isName() && subtype.asName() === "Form") {
        const subFingerprint = getXObjectFingerprint(doc, xref);
        if (JSON.stringify(subFingerprint) === fingerKey) {
          matches.push(xref);
        }
      }
    } catch {
      // Ignore
    }
  }
  return matches;
}

export function scanPDF(pdfBuffer: Buffer): { watermarks: DetectedWatermark[]; totalPages: number } {
  const baseDoc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const doc = baseDoc.asPDF();
  if (!doc) {
    throw new Error("Failed to cast document to PDFDocument");
  }

  const totalPages = doc.countPages();
  const totalXrefs = doc.countObjects();
  const watermarks: DetectedWatermark[] = [];
  const seenXrefs = new Set<number>();

  // ── STEP 1: Scan all objects for Pattern/Form/XObject streams with watermark texts ──
  console.log(`[WatermarkScanner] Starting PDF scan. Total pages: ${totalPages}, Total objects: ${totalXrefs}`);
  for (let xref = 1; xref <= totalXrefs; xref++) {
    try {
      const obj = doc.newIndirect(xref);
      if (!obj || !obj.isStream()) continue;

      const content = readStreamContent(obj);
      if (!content) continue;

      // Scan for strings in parentheses e.g. (text) Tj or (text) inside Tj array
      const matches = Array.from(content.matchAll(/\(([^)]+)\)/g));
      let matchesChecked = 0;
      let watermarkMatchesCount = 0;
      for (const match of matches) {
        matchesChecked++;
        const text = match[1];
        const { result, confidence } = isWatermarkText(text);
        if (result) {
          watermarkMatchesCount++;
          console.log(`[WatermarkScanner][STEP 1] XRef ${xref} MATCH: Text "${text}" matched watermark rules (confidence: ${confidence})`);
          if (!seenXrefs.has(xref)) {
            seenXrefs.add(xref);
            
            // Determine which pages reference this XObject xref
            let pagesAffected: number[] = [];
            for (let p = 0; p < totalPages; p++) {
              const pageObj = (doc.loadPage(p) as any).getObject();
              if (pageObj.toString().includes(`${xref} 0 R`)) {
                pagesAffected.push(p);
              }
            }

            console.log(`[WatermarkScanner][STEP 1] XRef ${xref} AFFECTS: Originally found in page(s): ${pagesAffected.map(p => p + 1).join(", ")}. Forcing global distribution across all pages.`);
            // Force all pages as affected if this is a global TEXT_PATTERN watermark to prevent page-skipping bugs
            pagesAffected = Array.from({ length: totalPages }, (_, i) => i);

            watermarks.push({
              id: nanoid(),
              type: "TEXT_PATTERN",
              text,
              source: "structure",
              xref,
              pagesAffected,
              confidence,
            });
          }
        }
      }
      if (watermarkMatchesCount > 0) {
        console.log(`[WatermarkScanner][STEP 1] XRef ${xref} SUMMARY: Scanned ${matchesChecked} segments, found ${watermarkMatchesCount} matching text watermark(s).`);
      }
    } catch {
      // Ignore individual object errors
    }
  }

  // ── STEP 2: Scan individual page Contents stream for inline text watermarks ──
  console.log(`[WatermarkScanner][STEP 2] Starting scan of individual page Contents streams for inline text watermarks.`);
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    try {
      const page = doc.loadPage(pageNum) as any;
      const pageObj = page.getObject();
      const contentsRef = pageObj.get("Contents");
      if (contentsRef.isNull()) {
        console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages}: No Contents dictionary found (empty page contents stream).`);
        continue;
      }

      const streamsList: any[] = [];
      if (contentsRef.isArray()) {
        const len = contentsRef.length;
        for (let i = 0; i < len; i++) {
          streamsList.push(contentsRef.get(i));
        }
      } else if (contentsRef.isStream()) {
        streamsList.push(contentsRef);
      }

      console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages}: Found ${streamsList.length} contents stream(s) to scan.`);

      let streamIdx = 0;
      for (const streamObj of streamsList) {
        streamIdx++;
        const resolvedStream = streamObj.resolve();
        const content = readStreamContent(resolvedStream);
        if (!content) {
          console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}]: No valid text/content stream content read.`);
          continue;
        }

        const matches = Array.from(content.matchAll(/\(([^)]+)\)/g));
        let streamWatermarksFound = 0;
        
        for (const match of matches) {
          const text = match[1];
          const { result, confidence } = isWatermarkText(text);
          if (result) {
            streamWatermarksFound++;
            console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}] MATCH: Found text "${text}" matching watermark signature (confidence: ${confidence}).`);
            const normalizedText = text.trim();
            const existing = watermarks.find(
              (w) => w.text === normalizedText && w.type === "TEXT_INLINE"
            );

            if (existing) {
              if (!existing.pagesAffected.includes(pageNum)) {
                existing.pagesAffected.push(pageNum);
                console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}]: Appended page to existing inline watermark "${normalizedText}".`);
              }
            } else {
              console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}]: Creating new inline watermark entry for "${normalizedText}".`);
              watermarks.push({
                id: nanoid(),
                type: "TEXT_INLINE",
                text: normalizedText,
                source: "structure",
                xref: resolvedStream.isIndirect() ? resolvedStream.asIndirect() : null,
                pagesAffected: [pageNum],
                confidence,
              });
            }
          }
        }
        
        if (streamWatermarksFound > 0) {
          console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}] SUMMARY: Scanned ${matches.length} segments, found ${streamWatermarksFound} matching watermark(s).`);
        } else if (matches.length > 0) {
          const samples = matches.slice(0, 5).map(m => m[1]).join(", ");
          console.log(`[WatermarkScanner][STEP 2] Page ${pageNum + 1}/${totalPages} [Stream ${streamIdx}] NO MATCH: Scanned ${matches.length} text segments, e.g. [${samples}...]. None matched watermark regexes.`);
        }
      }
    } catch (err) {
      console.error(`[WatermarkScanner][STEP 2] Error scanning inline contents for page ${pageNum + 1}:`, err);
    }
  }

  // ── STEP 3: Scan for repeated image watermarks across pages (appearing on >= 3 pages) ──
  const imagePageCount = new Map<number, { pages: number[]; subtype: string }>(); // xref -> { pages, subtype }
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    try {
      const page = doc.loadPage(pageNum) as any;
      const pageObj = page.getObject();
      const resources = pageObj.get("Resources");
      if (!resources.isNull()) {
        const xobjects = resources.get("XObject");
        if (!xobjects.isNull() && xobjects.isDictionary()) {
          xobjects.forEach((value: any) => {
            const resolved = value.resolve();
            const subtype = resolved.get("Subtype");
            if (!subtype.isNull() && subtype.isName()) {
              const subStr = subtype.asName();
              if (subStr === "Image" || subStr === "Form" || subStr === "Pattern") {
                const xref = value.asIndirect();
                if (xref) {
                  if (!imagePageCount.has(xref)) {
                    imagePageCount.set(xref, { pages: [], subtype: subStr });
                  }
                  const entry = imagePageCount.get(xref)!;
                  if (!entry.pages.includes(pageNum)) {
                    entry.pages.push(pageNum);
                  }

                  // Also check for nested SMask inside image dictionary!
                  const smask = resolved.get("SMask");
                  if (!smask.isNull() && smask.isIndirect()) {
                    const smaskXref = smask.asIndirect();
                    if (smaskXref) {
                      if (!imagePageCount.has(smaskXref)) {
                        imagePageCount.set(smaskXref, { pages: [], subtype: "SMask" });
                      }
                      const smaskEntry = imagePageCount.get(smaskXref)!;
                      if (!smaskEntry.pages.includes(pageNum)) {
                        smaskEntry.pages.push(pageNum);
                      }
                    }
                  }
                }
              }
            }
          });
        }

        const patterns = resources.get("Pattern");
        if (!patterns.isNull() && patterns.isDictionary()) {
          patterns.forEach((value: any) => {
            const xref = value.asIndirect();
            if (xref) {
              if (!imagePageCount.has(xref)) {
                imagePageCount.set(xref, { pages: [], subtype: "Pattern" });
              }
              const entry = imagePageCount.get(xref)!;
              if (!entry.pages.includes(pageNum)) {
                entry.pages.push(pageNum);
              }
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Error scanning images/graphics on page ${pageNum}:`, err);
    }
  }

  for (const [imgXref, entry] of imagePageCount.entries()) {
    const pages = entry.pages;
    const minPages = totalPages <= 2 ? 1 : 3;
    if (pages.length >= minPages) {
      const coverage = pages.length / totalPages;
      const confidence = coverage > 0.5 ? 0.95 : 0.75;

      let thumbnailBase64: string | null = null;
      try {
        const imageRef = doc.newIndirect(imgXref);
        const subtype = imageRef.get("Subtype");
        if (!subtype.isNull() && subtype.isName() && subtype.asName() === "Image") {
          const image = doc.loadImage(imageRef);
          const pixmap = image.toPixmap();
          const pngBytes = pixmap.asPNG();
          thumbnailBase64 = Buffer.from(pngBytes).toString("base64");
        }
      } catch (imgErr) {
        console.warn(`Error compiling thumbnail for image xref ${imgXref}:`, imgErr);
      }

      let description = "Repeated image/vector background element";
      if (entry.subtype === "SMask") {
        description = "Repeated Transparency SMask (Hidden Image Watermark)";
      } else if (entry.subtype === "Form") {
        description = "Shared Form / Vector Graphic Watermark";
      } else if (entry.subtype === "Pattern") {
        description = "Repeated Vector Pattern Watermark";
      }

      seenXrefs.add(imgXref);

      watermarks.push({
        id: nanoid(),
        type: "IMAGE_REPEATED",
        text: null,
        description,
        source: "structure",
        xref: imgXref,
        pagesAffected: Array.from({ length: totalPages }, (_, i) => i), // Force all pages to clean up references thoroughly
        confidence,
        thumbnailBase64,
      });
    }
  }

  // ── STEP 4: Scan for SMask transparency chain & multiple wrapper objects (Type 4 & 5) ──
  for (let xref = 1; xref <= totalXrefs; xref++) {
    try {
      if (seenXrefs.has(xref)) continue;

      const obj = doc.newIndirect(xref);
      if (!obj || !obj.isStream()) continue;
      const resolved = obj.resolve();
      
      const subtype = resolved.get("Subtype");
      if (!subtype.isNull() && subtype.isName() && subtype.asName() === "Form") {
        // Recursively check if nested XObject chain terminates in an SMask transparency watermark
        const containsSMaskWatermark = hasWatermarkChain(doc, xref, new Set<number>());
        if (containsSMaskWatermark) {
          seenXrefs.add(xref);

          // Determine which pages reference this Form wrapper or are affected
          const pagesAffected: number[] = [];
          for (let p = 0; p < totalPages; p++) {
            const pageObj = (doc.loadPage(p) as any).getObject();
            const resources = pageObj.get("Resources");
            let isReferenced = pageObj.toString().includes(`${xref} 0 R`);
            
            if (!isReferenced && !resources.isNull()) {
              const xobjects = resources.get("XObject");
              if (!xobjects.isNull() && xobjects.isDictionary()) {
                xobjects.forEach((value: any) => {
                  if (value.asIndirect() === xref) {
                    isReferenced = true;
                  }
                });
              }
            }
            if (isReferenced) {
              pagesAffected.push(p);
            }
          }

          // Fingerprint and handle multiple wrapper instances of the same watermark (Type 5 Fix)
          const fingerprint = getXObjectFingerprint(doc, xref);
          const allRelatedXrefs = findAllFormXrefsWithSameFingerprint(doc, totalXrefs, fingerprint);

          // Add all related Form XObjects to seen list so they aren't generated as duplicates
          for (const rel of allRelatedXrefs) {
            seenXrefs.add(rel);
          }

          watermarks.push({
            id: nanoid(),
            type: "IMAGE_REPEATED",
            text: null,
            description: "Hidden Transparency SMask Watermark (Type 4/5 Background)",
            source: "structure",
            xref: xref,
            allRelatedXrefs: allRelatedXrefs.length > 0 ? allRelatedXrefs : [xref],
            pagesAffected: Array.from({ length: totalPages }, (_, i) => i),
            confidence: 1.0,
          });
        }
      }
    } catch (err) {
      console.warn(`Error scanning SMask transparency watermark for xref ${xref}:`, err);
    }
  }

  return { watermarks, totalPages };
}
