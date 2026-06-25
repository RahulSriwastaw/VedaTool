/**
 * Utility to format inline continuous points (such as "1. ... 2. ... 3. ...")
 * into beautifully structure list formats with spacing to render cleanly using Markdown.
 */
export const formatPointsToNewlines = (text: string | null | undefined): string => {
  if (!text) return "";
  
  let formatted = text.replace(/\\n/g, "\n");

  // Normalized carriage returns and whitespace
  // 1. Match numeric list items inside sentences: e.g. " 1. ", " 2. ", " 3) ", etc.
  // Ensure we do not match decimal numbers, i.e., "3.14" by verifying spacing or Hindi characters next.
  formatted = formatted.replace(/(?<!\n)[ \t]*\b(\d{1,2}[\.\)])[ \t]+/g, "\n\n$1 ");

  // 2. Match roman listings: e.g. " I. ", " II. ", " III. ", " IV. ", " V. ", " VI. "
  formatted = formatted.replace(/(?<!\n)[ \t]*\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\.[ \t]+/g, "\n\n$1. ");

  // 3. Match bilingual brackets: e.g. " (a) ", " (b) ", " (1) ", " (2) "
  formatted = formatted.replace(/(?<!\n)[ \t]*(\([a-zA-Z0-9\u0900-\u097F]\))[ \t]+/g, "\n\n$1 ");

  // 4. Match common Hindi list markers if they appear inline: e.g. " क. ", " ख. ", " ग. ", " घ. "
  formatted = formatted.replace(/(?<!\n)[ \t]*\b([\u0915-\u0918][\.\)])[ \t]+/g, "\n\n$1 ");

  // 5. Match answer keys/explanation blocks
  formatted = formatted.replace(/(?<!\n)[ \t]*\b(Ans\.|Ans:|उत्तर:|व्याख्या:|स्पष्टीकरण:|Explanation:|Solution:)/gi, "\n\n$1");

  // Clean lines: trim each line and join nicely
  const lines = formatted.split("\n");
  const processedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l) {
      processedLines.push(l);
    } else if (processedLines.length > 0 && processedLines[processedLines.length - 1] !== "") {
      processedLines.push("");
    }
  }

  return processedLines.join("\n").trim();
};
