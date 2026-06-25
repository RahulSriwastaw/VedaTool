import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User as UserIcon,
  Wand2,
  ImageIcon,
  FileText,
  Copy,
  Check,
  Download,
  File as FileIcon,
  Edit3,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { ChatMessage } from "../../types";
import { saveAs } from "file-saver";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Math as DocxMath,
  MathRun,
  MathFraction,
  MathSuperScript,
  MathSubScript,
  MathSubSuperScript,
  MathRadical,
  MathSum,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

// --- LaTeX Parser Helpers ---

const LATEX_SYMBOLS: Record<string, string> = {
  // Greek Lowercase
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  varphi: "φ",
  varsigma: "ς",
  vartheta: "ϑ",
  varepsilon: "ε",
  varrho: "ϱ",
  // Greek Uppercase
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  // Operators & Symbols
  circ: "°",
  deg: "°",
  degree: "°",
  infty: "∞",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  neq: "≠",
  approx: "≈",
  leq: "≤",
  geq: "≥",
  le: "≤",
  ge: "≥",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  vee: "∨",
  wedge: "∧",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  to: "→",
  gets: "←",
  iff: "⇔",
  implies: "⇒",
  mapsto: "↦",
  longleftrightarrow: "↔",
  sim: "∼",
  simeq: "≃",
  ll: "≪",
  gg: "≫",
  empty: "∅",
  emptyset: "∅",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  oint: "∮",
  therefore: "∴",
  because: "∵",
  angle: "∠",
  perp: "⊥",
  prime: "′",
  ell: "ℓ",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  hbar: "ℏ",
  vert: "|",
  mid: "|",
  dots: "…",
  cdots: "⋯",
  parallel: "∥",
  cong: "≅",
  equiv: "≡",
  propto: "∝",
  surd: "√",
  triangle: "△",
  triangledown: "▽",
  square: "□",
  blacksquare: "■",
  dot: "⋅",
  vdots: "⋮",
  ddots: "⋱",
  checkmark: "✓",
  bullet: "•",
  ast: "∗",
  star: "★",
  oplus: "⊕",
  ominus: "⊖",
  otimes: "⊗",
  oslash: "⊘",
  odot: "⊙",
  dagger: "†",
  ddagger: "‡",
  uplus: "⊎",
  sqcap: "⊓",
  sqcup: "⊔",
  setminus: "∖",
  wr: "≀",
  diamond: "⋄",
  top: "⊤",
  bottom: "⊥",
  models: "⊧",
  vdash: "⊢",
  dashv: "⊣",
  langle: "⟨",
  rangle: "⟩",
  lceil: "⌈",
  rceil: "⌉",
  lfloor: "⌊",
  rfloor: "⌋",
  micro: "μ",
  ohm: "Ω",
};

const MATH_FUNCTIONS = [
  "sin",
  "cos",
  "tan",
  "csc",
  "sec",
  "cot",
  "cosec",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "ln",
  "lg",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "exp",
];

function extractArg(str: string, startIndex: number): [string, number] {
  let i = startIndex;
  while (i < str.length && /\s/.test(str[i])) i++;

  if (i >= str.length) return ["", i];

  const char = str[i];

  if (char === "{") {
    let depth = 1;
    let start = i;
    i++;
    while (i < str.length && depth > 0) {
      if (str[i] === "{") {
        depth++;
      } else if (str[i] === "}") {
        depth--;
      } else if (str[i] === "\\" && i + 1 < str.length) {
        // Skip escaped braces
        if (str[i + 1] === "{" || str[i + 1] === "}") i++;
      }
      i++;
    }
    // Return content INSIDE braces
    return [str.slice(start + 1, i - 1), i];
  } else if (char === "\\") {
    let start = i;
    i++;
    // Scan command name
    if (i < str.length && !/[a-zA-Z]/.test(str[i])) {
      // Single character command like \, or \{
      return [str.slice(start, i + 1), i + 1];
    }
    while (i < str.length && /[a-zA-Z]/.test(str[i])) {
      i++;
    }
    const cmd = str.slice(start + 1, i);

    if (
      [
        "frac",
        "binom",
        "sqrt",
        "text",
        "mathrm",
        "mathbf",
        "vec",
        "hat",
        "bar",
        "overline",
        "underline",
      ].includes(cmd)
    ) {
      let currentPos = i;
      if (cmd === "sqrt") {
        while (currentPos < str.length && /\s/.test(str[currentPos]))
          currentPos++;
        if (str[currentPos] === "[") {
          let depth = 0;
          while (currentPos < str.length) {
            if (str[currentPos] === "[") depth++;
            if (str[currentPos] === "]") depth--;
            currentPos++;
            if (depth === 0) break;
          }
        }
      }
      const numArgs = ["frac", "binom"].includes(cmd) ? 2 : 1;
      for (let a = 0; a < numArgs; a++) {
        const [_, nextI] = extractArg(str, currentPos);
        currentPos = nextI;
      }
      return [str.slice(start, currentPos), currentPos];
    }

    return [str.slice(start, i), i]; // Return full \cmd
  } else {
    return [char, i + 1];
  }
}

function extractOptionalArg(
  str: string,
  startIndex: number,
): [string | null, number] {
  let i = startIndex;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i < str.length && str[i] === "[") {
    let start = i;
    let depth = 0;
    while (i < str.length) {
      if (str[i] === "[") depth++;
      if (str[i] === "]") depth--;
      i++;
      if (depth === 0) break;
    }
    return [str.slice(start + 1, i - 1), i];
  }
  return [null, startIndex];
}

function isChemicalFormula(latex: string): boolean {
  const clean = latex
    .replace(/\\mathrm/g, "")
    .replace(/\\text/g, "")
    .replace(/\\ce/g, "")
    .replace(/[\s\{\}\(\)\[\]\+\-\=\._\^]/g, "")
    .replace(/\\rightarrow/g, "")
    .replace(/\\to/g, "");

  if (latex.includes("\\ce")) return true;
  if (/\\(frac|sqrt|sum|int|prod|lim|sin|cos|tan)/.test(latex)) return false;
  if (!/[A-Za-z]/.test(clean)) return false;
  return /^[A-Z][A-Za-z0-9\u2192]*$/.test(clean);
}

function parseChemistryToTextRuns(latex: string, isBold: boolean): any[] {
  const runs: any[] = [];
  let i = 0;

  const processed = latex
    .replace(/\\rightarrow/g, " → ")
    .replace(/\\to/g, " → ")
    .replace(/\\longrightarrow/g, " ⟶ ")
    .replace(/\\mathrm/g, "")
    .replace(/\\text/g, "")
    .replace(/\\ce/g, "");

  while (i < processed.length) {
    const char = processed[i];
    if (char === "{" || char === "}") {
      i++;
      continue;
    }

    if (char === "\\") {
      const [cmdWithSlash, nextI] = extractArg(processed, i);
      const cmd = cmdWithSlash.replace(/^\\/, "");
      if (LATEX_SYMBOLS[cmd]) {
        runs.push(
          new TextRun({
            text: LATEX_SYMBOLS[cmd],
            size: 22,
            font: "Arial",
            bold: isBold,
            noProof: true,
          }),
        );
      }
      i = nextI;
      continue;
    }

    if (char === "_" || char === "^") {
      const isSub = char === "_";
      i++;
      const [arg, nextI] = extractArg(processed, i);
      i = nextI;
      const cleanArg = arg.replace(/[\{\}]/g, "");
      runs.push(
        new TextRun({
          text: cleanArg,
          subScript: isSub,
          superScript: !isSub,
          size: 22,
          font: "Arial",
          bold: isBold,
          noProof: true,
        }),
      );
    } else {
      let text = "";
      while (i < processed.length) {
        const c = processed[i];
        if (["^", "_", "\\", "{", "}"].includes(c)) break;
        text += c;
        i++;
      }
      if (text) {
        runs.push(
          new TextRun({
            text: text,
            size: 22,
            font: "Arial",
            bold: isBold,
            noProof: true,
          }),
        );
      }
    }
  }
  return runs;
}

function parseLatexContent(latex: string): any[] {
  const nodes: any[] = [];
  let i = 0;
  let processedLatex = latex;

  MATH_FUNCTIONS.forEach((fn) => {
    const regex = new RegExp(`(?<!\\\\)\\b${fn}(?![a-zA-Z])`, "g");
    processedLatex = processedLatex.replace(regex, `\\${fn}`);
  });

  while (i < processedLatex.length) {
    const char = processedLatex[i];

    if (/\s/.test(char)) {
      nodes.push(new MathRun(" "));
      i++;
      continue;
    }

    if (char === "\\") {
      const remainder = processedLatex.slice(i + 1);
      const layoutMatch = remainder.match(
        /^(left|right|limits|nolimits|displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/,
      );
      if (layoutMatch) {
        const cmd = layoutMatch[0];
        i += 1 + cmd.length;
        if (cmd === "left" || cmd === "right") {
          while (i < processedLatex.length && /\s/.test(processedLatex[i])) i++;
          if (i < processedLatex.length) {
            const delim = processedLatex[i];
            if (delim !== ".") {
              nodes.push(new MathRun(delim));
            }
            i++;
          }
        }
        continue;
      }

      if (remainder.startsWith("begin") || remainder.startsWith("end")) {
        const isBegin = remainder.startsWith("begin");
        i += isBegin ? 5 : 3;
        const [_, nextI] = extractArg(processedLatex, i);
        i = nextI;
        nodes.push(new MathRun(isBegin ? " [" : "] "));
        continue;
      }

      const styleMatch = remainder.match(
        /^(text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname)\b/,
      );
      if (styleMatch) {
        const cmd = styleMatch[0];
        i += 1 + cmd.length;
        const [textArg, nextI] = extractArg(processedLatex, i);
        i = nextI;
        nodes.push(new MathRun(textArg));
        continue;
      }

      if (remainder.startsWith("frac") || remainder.startsWith("binom")) {
        const isBinom = remainder.startsWith("binom");
        i += isBinom ? 6 : 5;
        const [num, n1] = extractArg(processedLatex, i);
        i = n1;
        const [den, n2] = extractArg(processedLatex, i);
        i = n2;
        nodes.push(
          new MathFraction({
            numerator: parseLatexContent(num),
            denominator: parseLatexContent(den),
          }),
        );
        continue;
      }

      if (remainder.startsWith("sqrt")) {
        i += 5;
        const [optArg, nextI1] = extractOptionalArg(processedLatex, i);
        i = nextI1;
        const [inner, nextI2] = extractArg(processedLatex, i);
        i = nextI2;
        nodes.push(
          new MathRadical({
            degree: optArg ? parseLatexContent(optArg) : undefined,
            children: parseLatexContent(inner),
          }),
        );
        continue;
      }

      const naryMatch = remainder.match(/^([a-zA-Z]+)/);
      if (naryMatch) {
        const cmd = naryMatch[1];
        if (
          ["sum", "prod", "int", "oint", "bigcup", "bigcap", "coprod"].includes(
            cmd,
          )
        ) {
          i += 1 + cmd.length;
          const naryCharMap: Record<string, string> = {
            sum: "∑",
            prod: "∏",
            int: "∫",
            oint: "∮",
            bigcup: "⋃",
            bigcap: "⋂",
            coprod: "∐",
          };
          const naryChar = naryCharMap[cmd];
          let sub: any = undefined;
          let sup: any = undefined;

          let j = i;
          let subStr = "";
          let supStr = "";

          for (let k = 0; k < 2; k++) {
            let skipping = true;
            while (skipping) {
              skipping = false;
              while (j < processedLatex.length && /\s/.test(processedLatex[j]))
                j++;
              if (processedLatex.slice(j).startsWith("\\limits")) {
                j += 7;
                skipping = true;
              }
              if (processedLatex.slice(j).startsWith("\\nolimits")) {
                j += 9;
                skipping = true;
              }
            }
            if (processedLatex[j] === "_") {
              j++;
              const [arg, nextJ] = extractArg(processedLatex, j);
              subStr = arg;
              sub = parseLatexContent(arg);
              j = nextJ;
            } else if (processedLatex[j] === "^") {
              j++;
              const [arg, nextJ] = extractArg(processedLatex, j);
              supStr = arg;
              sup = parseLatexContent(arg);
              j = nextJ;
            } else {
              break;
            }
          }

          nodes.push(
            new MathSum({
              children: [new MathRun(naryChar)],
              subScript: sub ? [sub] : undefined,
              superScript: sup ? [sup] : undefined,
            }),
          );
          i = j;
          continue;
        }

        if (MATH_FUNCTIONS.includes(cmd)) {
          nodes.push(new MathRun(cmd));
          i += 1 + cmd.length;
          continue;
        }

        const accentMap: Record<string, string> = {
          vec: "\u20D7",
          hat: "\u0302",
          bar: "\u0304",
          overline: "\u0305",
          underline: "\u0332",
          dot: "\u0307",
          ddot: "\u0308",
          tilde: "\u0303",
        };
        if (accentMap[cmd]) {
          i += 1 + cmd.length;
          const [arg, nextI] = extractArg(processedLatex, i);
          i = nextI;
          const combiningChar = accentMap[cmd];

          if (cmd === "overline" || cmd === "underline") {
            if (/^[a-zA-Z0-9]+$/.test(arg)) {
              let modifiedArg = "";
              for (const ch of arg) modifiedArg += ch + combiningChar;
              nodes.push(new MathRun(modifiedArg));
            } else {
              nodes.push(new MathRun(`${cmd}(`));
              nodes.push(...parseLatexContent(arg));
              nodes.push(new MathRun(`)`));
            }
          } else {
            if (/^[a-zA-Z0-9]$/.test(arg)) {
              nodes.push(new MathRun(arg + combiningChar));
            } else {
              nodes.push(new MathRun(`${cmd}(`));
              nodes.push(...parseLatexContent(arg));
              nodes.push(new MathRun(`)`));
            }
          }
          continue;
        }

        i += 1 + cmd.length;
        const symbol = LATEX_SYMBOLS[cmd];
        nodes.push(new MathRun(symbol || cmd));
      } else {
        const escapedChar = remainder[0] || "";
        if (escapedChar === "{" || escapedChar === "}") {
          nodes.push(new MathRun(escapedChar));
        } else if (escapedChar === "\\") {
          nodes.push(new MathRun("\n"));
        } else {
          nodes.push(new MathRun(escapedChar));
        }
        i += 1 + escapedChar.length;
      }
    } else if (char === "^" || char === "_") {
      const isSup = char === "^";
      i++;
      const [argContent, nextI] = extractArg(processedLatex, i);
      let currentI = nextI;
      let otherArgContent: string | null = null;
      let hasOther = false;

      let j = currentI;
      while (j < processedLatex.length && /\s/.test(processedLatex[j])) j++;
      const otherChar = isSup ? "_" : "^";
      if (j < processedLatex.length && processedLatex[j] === otherChar) {
        j++;
        const [arg2, nextJ] = extractArg(processedLatex, j);
        otherArgContent = arg2;
        currentI = nextJ;
        hasOther = true;
      }

      const lastNode = nodes.pop();
      const base = lastNode || new MathRun("");
      const supArgText = isSup ? argContent : otherArgContent;
      const subArgText = isSup ? otherArgContent : argContent;

      if (hasOther && otherArgContent !== null) {
        nodes.push(
          new MathSubSuperScript({
            children: [base],
            subScript: parseLatexContent(subArgText!),
            superScript: parseLatexContent(supArgText!),
          }),
        );
      } else {
        if (isSup) {
          nodes.push(
            new MathSuperScript({
              children: [base],
              superScript: parseLatexContent(argContent),
            }),
          );
        } else {
          nodes.push(
            new MathSubScript({
              children: [base],
              subScript: parseLatexContent(argContent),
            }),
          );
        }
      }
      i = currentI;
    } else if (char === "{" || char === "}") {
      i++;
    } else {
      nodes.push(new MathRun(char));
      i++;
    }
  }
  return nodes;
}

function parseLineToDocxChildren(
  trimmed: string,
  forceBold: boolean = false,
): any[] {
  let content = trimmed;
  // Normalize LaTeX delimiters - specifically single dollar math
  let processed = content.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$ $1 $$$$");
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, "$$$$ $1 $$$$");
  // Normalize single dollar math to double dollar for the split logic
  // Using lookbehind and lookahead to avoid matching already normalized or escaped dollars
  processed = processed.replace(
    /(?<!\$)\$(?!\$)([^\$]+?)(?<!\$)\$(?!\$)/g,
    "$$$$ $1 $$$$",
  );

  const parts = processed.split(/(\$\$[\s\S]*?\$\$)/g);

  return parts
    .map((part) => {
      if (!part) return null;

      // CASE 1: Math Block
      if (part.startsWith("$$") && part.endsWith("$$")) {
        const latex = part.slice(2, -2).trim();
        if (isChemicalFormula(latex)) {
          return parseChemistryToTextRuns(latex, forceBold);
        }
        try {
          return new DocxMath({ children: parseLatexContent(latex) });
        } catch (e) {
          console.error("Error parsing LaTeX:", latex, e);
          return new TextRun({
            text: latex,
            font: "Arial",
            size: 22,
            bold: forceBold,
          });
        }
      }
      // CASE 2: Text Block (May contain Bold/Italic)
      else {
        // Split by Markdown Bold syntax (**text** or __text__)
        const boldRegex = /(\*\*.*?\*\*|__.*?__)/g;
        const boldParts = part.split(boldRegex);

        return boldParts.map((subPart) => {
          if (!subPart) return null;

          let isBold = forceBold;
          let textForItalics = subPart;

          if (
            (subPart.startsWith("**") &&
              subPart.endsWith("**") &&
              subPart.length >= 4) ||
            (subPart.startsWith("__") &&
              subPart.endsWith("__") &&
              subPart.length >= 4)
          ) {
            isBold = true;
            textForItalics = subPart.slice(2, -2);
          }

          // Handle italics within the bolded or non-bolded part
          const italicsRegex = /(\*.*?\*|_.*?_)/g;
          const italicSplit = textForItalics.split(italicsRegex);

          return italicSplit.map((iPart) => {
            if (!iPart) return null;

            let isItalic = false;
            let cleanText = iPart;

            if (
              (iPart.startsWith("*") &&
                iPart.endsWith("*") &&
                iPart.length >= 2) ||
              (iPart.startsWith("_") &&
                iPart.endsWith("_") &&
                iPart.length >= 2)
            ) {
              isItalic = true;
              cleanText = iPart.slice(1, -1);
            }

            return new TextRun({
              text: cleanText,
              font: "Arial",
              size: 22,
              bold: isBold,
              italics: isItalic,
              noProof: true,
            });
          });
        });
      }
    })
    .flat(2)
    .filter(Boolean);
}

// Support for tables in Docx
function createDocxTable(tableLines: string[]): Table {
  const dataLines = tableLines.filter(
    (line) => !/^\|?\s*[\-:]+\s*\|/.test(line),
  );
  const rows = dataLines.map((line, rowIndex) => {
    let content = line.trim();
    if (content.startsWith("|")) content = content.substring(1);
    if (content.endsWith("|"))
      content = content.substring(0, content.length - 1);
    const cellTexts = content.split("|");
    const isHeader = rowIndex === 0;
    return new TableRow({
      children: cellTexts.map(
        (cellText) =>
          new TableCell({
            children: [
              new Paragraph({
                children: parseLineToDocxChildren(
                  cellText.trim(),
                  isHeader,
                ) as any[],
                alignment: AlignmentType.CENTER,
              }),
            ],
            width: { size: 100 / cellTexts.length, type: WidthType.PERCENTAGE },
            verticalAlign: AlignmentType.CENTER,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
            },
            shading: isHeader ? { fill: "F2F2F2" } : undefined,
          }),
      ),
    });
  });

  return new Table({
    rows: rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    },
  });
}

const ThinkingIndicator: React.FC<{ statusText?: string }> = ({
  statusText,
}) => {
  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 shrink-0">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
              className="w-1.5 h-1.5 rounded-full bg-[#FF6B2B]"
            />
          ))}
        </div>
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#FF6B2B] flex items-center gap-1.5">
            <span className="inline-block w-1 h-1 rounded-full bg-[#FF6B2B] animate-ping" />
            Veda AI Thinking
          </span>
          <span className="text-[11px] text-[#888888] font-medium">
            {statusText || "Analyzing input parameters..."}
          </span>
        </div>
      </div>
    </div>
  );
};

// Helper to convert Markdown to DOCX Paragraphs
const markdownToDocxParagraphs = (text: string): (Paragraph | Table)[] => {
  const elements: (Paragraph | Table)[] = [];
  const lines = text.split("\n");

  let isInCodeBlock = false;
  let codeBuffer: string[] = [];
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      elements.push(createDocxTable(tableBuffer));
      tableBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Code Block Handling
    if (trimmedLine.startsWith("```")) {
      flushTable();
      if (isInCodeBlock) {
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeBuffer.join("\n"),
                font: "Courier New",
                size: 18,
                shading: { fill: "F4F4F4" },
              }),
            ],
            indent: { left: 400 },
          }),
        );
        codeBuffer = [];
        isInCodeBlock = false;
      } else {
        isInCodeBlock = true;
      }
      continue;
    }

    if (isInCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Table Handling
    const isTableRow =
      (line.startsWith("|") && line.endsWith("|")) ||
      (line.startsWith("|") && line.split("|").length > 2);
    if (isTableRow) {
      tableBuffer.push(line);
      continue;
    } else {
      flushTable();
    }

    if (!trimmedLine) {
      elements.push(new Paragraph({ text: "" }));
      continue;
    }

    // Heuristics for question numbers and exam styling
    const cleanLineText = trimmedLine.replace(/\*\*/g, "").trim();
    const isHeaderHeuristic =
      /^(Section|Part|Khand|Unit|Q\.\s*Paper|Paper|Code|Set)\s+[\w\d]+/i.test(
        cleanLineText,
      ) && cleanLineText.length < 50;
    const isMainQuestionHeuristic =
      /^(Q\.?\s?\d+|Prashn\s?\d+|Question\s*[:\-]?\s*\d+|प्रश्न\s?\d+|\d+\.|[\(\[]\d+[\)\]]|\d+[\)])\s/i.test(
        cleanLineText,
      );

    // Headings
    if (line.startsWith("# ") || isHeaderHeuristic) {
      const text = line.startsWith("# ") ? line.slice(2) : line;
      elements.push(
        new Paragraph({
          children: parseLineToDocxChildren(text, true),
          heading: HeadingLevel.HEADING_1,
          alignment: isHeaderHeuristic ? AlignmentType.CENTER : undefined,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        new Paragraph({
          children: parseLineToDocxChildren(line.slice(3), true),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (line.startsWith("### ") || isMainQuestionHeuristic) {
      const text = line.startsWith("### ") ? line.slice(4) : line;
      elements.push(
        new Paragraph({
          children: parseLineToDocxChildren(text, true),
          heading: isMainQuestionHeuristic ? undefined : HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
          indent: isMainQuestionHeuristic
            ? { left: 500, hanging: 500 }
            : undefined,
        }),
      );
    }
    // Bullets
    else if (line.match(/^[-*•]\s/)) {
      const bulletContent = line.replace(/^[-*•]\s/, "");
      elements.push(
        new Paragraph({
          children: parseLineToDocxChildren(bulletContent),
          bullet: { level: 0 },
          indent: { left: 360, hanging: 180 },
        }),
      );
    }
    // Numbered List
    else if (line.match(/^\d+\.\s/)) {
      const listContent = line.replace(/^\d+\.\s/, "");
      const numMatch = line.match(/^(\d+\.)\s/);
      elements.push(
        new Paragraph({
          children: [
            new TextRun({ text: numMatch ? `${numMatch[1]} ` : "• " }),
            ...parseLineToDocxChildren(listContent),
          ],
          indent: { left: 360, hanging: 180 },
        }),
      );
    }
    // Blockquote
    else if (line.startsWith("> ")) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.slice(2),
              italics: true,
              color: "666666",
            }),
          ],
          indent: { left: 720 },
          border: {
            left: {
              color: "CCCCCC",
              space: 4,
              style: BorderStyle.SINGLE,
              size: 12,
            },
          },
        }),
      );
    } else {
      // Regular paragraph
      elements.push(
        new Paragraph({
          children: parseLineToDocxChildren(line),
          spacing: { after: 120 },
        }),
      );
    }
  }

  flushTable();
  return elements;
};

const extractText = (node: any): string => {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as any).children);
  }
  return "";
};

const PreBlock: React.FC<any> = ({ children, className, ...props }) => {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (children) {
      setText(extractText(children));
    }
  }, [children]);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/pre-block my-3">
      <pre className={`relative overflow-x-auto pr-16 ${className || ""}`} {...props}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1 px-2 rounded-md bg-[#1e1e24] border border-[#2e2e34] hover:bg-[#2e2e34] text-[#888888] hover:text-[#EFEFEF] transition-all flex items-center gap-1.5 cursor-pointer z-30 opacity-0 group-hover/pre-block:opacity-100 focus:opacity-100"
        title="Copy code"
      >
        {copied ? (
          <>
            <Check size={12} className="text-emerald-400" />
            <span className="text-[10px] font-sans text-emerald-400 font-medium">Copied!</span>
          </>
        ) : (
          <>
            <Copy size={12} />
            <span className="text-[10px] font-sans font-medium">Copy</span>
          </>
        )}
      </button>
    </div>
  );
};

interface MessageProps {
  message: ChatMessage;
  onEditSubmit?: (messageId: string, newContent: string) => void;
  isStreamingAll?: boolean;
}

const Typewriter: React.FC<{ text: string; isStreaming?: boolean }> = ({
  text,
  isStreaming,
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const fullTextRef = useRef(text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fullTextRef.current = text;

    // If not streaming and we've already displayed everything, just show it
    if (!isStreaming && displayedText === text) return;

    if (!isTyping) {
      setIsTyping(true);
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setDisplayedText((prev) => {
        if (prev.length < fullTextRef.current.length) {
          // Type next character
          return fullTextRef.current.slice(0, prev.length + 1);
        } else {
          // Reached the end of current text
          if (!isStreaming) {
            setIsTyping(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
          return prev;
        }
      });
    }, 15); // Adjust typing speed here (ms per character)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, isStreaming]);

  // When streaming ends, ensure we eventually show the full text if the interval was slow
  useEffect(() => {
    if (!isStreaming && !isTyping && displayedText !== text) {
      setDisplayedText(text);
    }
  }, [isStreaming, isTyping, text, displayedText]);

  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
      components={{
        pre: PreBlock
      }}
    >
      {displayedText}
    </Markdown>
  );
};

const ChatMessageItem: React.FC<MessageProps> = ({
  message,
  onEditSubmit,
  isStreamingAll,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  useEffect(() => {
    setEditedContent(message.content);
  }, [message.content]);

  const handleEditSubmit = () => {
    if (
      editedContent.trim() &&
      editedContent.trim() !== message.content &&
      onEditSubmit
    ) {
      onEditSubmit(message.id, editedContent.trim());
      setIsEditing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const exportMessage = async (format: "txt" | "docx") => {
    const fileName = `Message_Export_${new Date(message.timestamp).getTime()}`;
    const timestampStr = new Date(message.timestamp).toLocaleString();
    const roleStr = message.role === "user" ? "USER" : "ASSISTANT";

    try {
      switch (format) {
        case "txt":
          const txtContent = `${roleStr} [${timestampStr}]:\n\n${message.content}`;
          saveAs(
            new Blob([txtContent], { type: "text/plain;charset=utf-8" }),
            `${fileName}.txt`,
          );
          break;
        case "docx":
          const docStructure = new Document({
            sections: [
              {
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${roleStr.toUpperCase()} - ${timestampStr}`,
                        bold: true,
                        color: "FF6B2B",
                        size: 28,
                      }),
                    ],
                    spacing: { after: 300 },
                  }),
                  ...markdownToDocxParagraphs(message.content),
                ],
              },
            ],
          });
          const docxBlob = await Packer.toBlob(docStructure);
          saveAs(docxBlob, `${fileName}.docx`);
          break;
      }
    } catch (err) {
      console.error("Individual export failed:", err);
    }
    setShowExportMenu(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 sm:gap-4 group/message w-full mb-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      {message.role === "assistant" && (
        <motion.div
          animate={
            message.isStreaming && !message.content
              ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 mt-1 sm:mt-1 bg-transparent text-black border border-white/10 "
        >
          <Wand2 size={14} className="sm:w-4 sm:h-4" />
        </motion.div>
      )}

      <div
        className={`flex flex-col space-y-1 ${message.role === "user" ? "items-end max-w-[85%] sm:max-w-[70%]" : "items-start w-full min-w-0"}`}
      >
        <div
          className={`relative transition-all text-[15px] sm:text-[16px] leading-relaxed w-full min-w-0 ${
            message.role === "user"
              ? "bg-[#2f2f32] text-slate-100 px-1 py-1 sm:px-2 sm:py-1 rounded-[20px] rounded-br-[6px]"
              : "bg-transparent text-slate-200 py-1"
          }`}
        >
          {/* Action Buttons */}
          {!message.isStreaming && message.role === "assistant" && (
            <div
              className={`absolute -bottom-8 left-0 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity z-20`}
            >
              <div className="flex gap-1">
                <button
                  onClick={copyToClipboard}
                  className="p-1 hover:bg-[#2e2e34] rounded-md text-[#888888] hover:text-[#EFEFEF] transition-all flex items-center gap-1.5"
                  title="Copy message"
                >
                  {isCopied ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="p-1 hover:bg-[#2e2e34] rounded-md text-[#888888] hover:text-[#EFEFEF] transition-all flex items-center gap-1.5"
                    title="Export message"
                  >
                    <Download size={14} />
                  </button>
                  <AnimatePresence>
                    {showExportMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        className="absolute left-0 top-full mt-1 w-32 bg-[#18181b] border border-[#2e2e34] rounded-xl  py-1 z-50 overflow-hidden"
                      >
                        <button
                          onClick={() => exportMessage("txt")}
                          className="w-full text-left px-1 py-1 text-[12px] font-medium hover:bg-[#2e2e34] text-[#888888] hover:text-[#EFEFEF] flex items-center gap-2"
                        >
                          <FileText size={12} /> TXT
                        </button>
                        <button
                          onClick={() => exportMessage("docx")}
                          className="w-full text-left px-1 py-1 text-[12px] font-medium hover:bg-[#2e2e34] text-[#888888] hover:text-[#EFEFEF] flex items-center gap-2"
                        >
                          <FileIcon size={12} /> DOCX
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          )}

          {!message.isStreaming && message.role === "user" && !isEditing && (
            <div
              className="absolute -bottom-8 right-0 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity z-20"
            >
              <div className="flex gap-1">
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isStreamingAll}
                  className="p-1 hover:bg-[#2e2e34] rounded-md text-[#888888] hover:text-[#EFEFEF] transition-all flex items-center gap-1 px-1.5 disabled:opacity-40"
                  title="Edit prompt"
                >
                  <Edit3 size={13} />
                  <span className="text-xs">Edit</span>
                </button>
                <button
                  onClick={copyToClipboard}
                  className="p-1 hover:bg-[#2e2e34] rounded-md text-[#888888] hover:text-[#EFEFEF] transition-all flex items-center gap-1 px-1.5"
                  title="Copy text"
                >
                  {isCopied ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span className="text-xs">Copy</span>
                </button>
              </div>
            </div>
          )}

          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {message.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-1.5 px-1 py-1 rounded-xl text-[13px] font-medium bg-[#1e1e24] text-slate-200 border border-[#2e2e34]"
                >
                  {file.mimeType.includes("image") ? (
                    <ImageIcon size={14} className="text-blue-400" />
                  ) : (
                    <FileText size={14} className="text-[#888888]" />
                  )}
                  <span className="truncate max-w-[150px]">{file.name}</span>
                </div>
              ))}
            </div>
          )}
          <div
            className={`prose prose-invert max-w-full overflow-x-auto overflow-y-hidden break-words prose-p:leading-[1.75] prose-p:my-1 prose-headings:text-slate-100 prose-headings:font-semibold prose-strong:text-[#EFEFEF] prose-strong:font-semibold prose-code:text-slate-200 prose-code:bg-[#2e2e34]/60 prose-code:px-1 prose-code:py-1 prose-code:font-mono prose-code:rounded-lg prose-pre:bg-[#121214] prose-pre:border prose-pre:border-[#2e2e34] prose-pre:rounded-xl prose-pre:overflow-x-auto prose-a:text-[#FF6B2B] prose-a:no-underline hover:prose-a:underline prose-li:my-1 ${message.role === "user" ? "prose-p:text-slate-100 prose-p:my-1" : "prose-p:text-slate-200"}`}
          >
            {message.role === "assistant" ? (
              message.content === "" && message.isStreaming ? (
                <ThinkingIndicator statusText={message.statusText} />
              ) : (
                <Typewriter
                  text={message.content}
                  isStreaming={message.isStreaming}
                />
              )
            ) : isEditing ? (
              <div className="w-full flex flex-col gap-2 p-1 min-w-[260px] sm:min-w-[340px]">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full min-h-[70px] bg-[#1e1e21] text-slate-100 border border-indigo-500/50 rounded-xl p-2.5 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
                  placeholder="Edit message..."
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedContent(message.content);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#3e3e42] text-slate-300 hover:bg-[#2e2e34] hover:text-[#EFEFEF] transition-all flex items-center gap-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    disabled={!editedContent.trim() || editedContent.trim() === message.content}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-all flex items-center gap-1"
                  >
                    <Wand2 size={12} /> Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <Markdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
                components={{
                  pre: PreBlock
                }}
              >
                {message.content}
              </Markdown>
            )}
          </div>
        </div>
        <div
          className={`flex items-center mt-1 px-1 ${message.role === "user" ? "justify-end" : "justify-start"} w-full`}
        >
          <p className="text-[10px] font-medium text-[#555555]">
            {message.isStreaming &&
            message.role === "assistant" &&
            message.content !== ""
              ? "Veda AI is typing..."
              : new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessageItem;
