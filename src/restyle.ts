import fs from "fs";
import path from "path";

function walk(dir: string, callback: (filepath: string) => void) {
  fs.readdirSync(dir).forEach((f) => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

function processContent(content: string): string {
  let out = content;

  // 1. Remove shadows (except we will put hover later or via CSS)
  out = out.replace(/\bshadow-(sm|md|lg|xl|2xl|inner|none)\b/g, "");
  out = out.replace(/\bshadow-\[[^\]]+\]\b/g, "");

  // 2. Remove gradients completely
  out = out.replace(/\bbg-gradient-to-[a-z]+\b/g, "");
  out = out.replace(/\bfrom-[a-zA-Z0-9-\[\]#\/]+\b/g, "");
  out = out.replace(/\bto-[a-zA-Z0-9-\[\]#\/]+\b/g, "");
  out = out.replace(/\bvia-[a-zA-Z0-9-\[\]#\/]+\b/g, "");

  // 3. Colors - Backgrounds
  out = out.replace(/\bbg-[#09090B]\/90\b/g, "bg-[#141414] opacity-100"); // Navbar
  out = out.replace(/\bbg-white\b/g, "bg-transparent"); // NO white backgrounds
  out = out.replace(/\bbg-[#121214]\b/g, "bg-[#1A1A1A]");
  out = out.replace(/\bbg-[#0F0F12]\b/g, "bg-[#111111]"); // Main content bg
  out = out.replace(/\bbg-[#0F0F0F]\b/g, "bg-[#0F0F0F]");
  out = out.replace(/\bbg-gray-[89]00\b/g, "bg-[#1A1A1A]");
  out = out.replace(/\bbg-slate-[89]00\b/g, "bg-[#1A1A1A]");

  // Primary Accents
  out = out.replace(/\btext-white\b/g, "text-[#EFEFEF]");
  out = out.replace(/\btext-gray-300\b/g, "text-[#888888]");
  out = out.replace(/\btext-gray-400\b/g, "text-[#888888]");
  out = out.replace(/\btext-slate-300\b/g, "text-[#888888]");
  out = out.replace(/\btext-slate-400\b/g, "text-[#888888]");
  out = out.replace(/\btext-gray-500\b/g, "text-[#555555]");
  out = out.replace(/\btext-slate-500\b/g, "text-[#555555]");

  // Border
  out = out.replace(/\bborder-[#222226]\b/g, "border-[#252525]");
  out = out.replace(/\bborder-[#1e1e24]\b/g, "border-[#252525]");
  out = out.replace(/\bborder-[#2E2E34]\b/g, "border-[#252525]");

  // 4. Buttons (Primary / Secondary)
  // Primary: #FF6B2B bg, white text, hover #E55A1A
  // Wait, replacing specific buttons via regex is hard. I'll inject global CSS for buttons.

  // 5. Gap reduction
  // Reduce gaps
  out = out.replace(/\bgap-8\b/g, "gap-[12px]");
  out = out.replace(/\bgap-6\b/g, "gap-[12px]");

  // 6. Padding Reduction (30%)
  const scaleDown = (match: string, p1: string, p2: string) => {
    let val = parseFloat(p2);
    if (isNaN(val)) return match;
    // tailwind scale: 1 = 0.25rem = 4px.
    // 4 * 0.7 = 2.8 (~3 = 12px)
    let newVal = Math.max(0, Math.floor(val * 0.7));
    if (newVal === 0 && val > 0) newVal = 1;
    return `${p1}-${newVal}`;
  };
  out = out.replace(
    /\b(p|py|px|pt|pb|pl|pr|m|my|mx|mt|mb|ml|mr)-([0-9.]+)\b/g,
    scaleDown,
  );

  // 7. Typography / Font size reductions
  out = out.replace(/\btext-sm\b/g, "text-[13px]");
  out = out.replace(/\btext-xs\b/g, "text-[11px]");
  out = out.replace(/\btext-base\b/g, "text-[13px]");
  out = out.replace(/\btext-lg\b/g, "text-[15px]");
  out = out.replace(/\btext-xl\b/g, "text-[20px]");
  out = out.replace(/\btext-2xl\b/g, "text-[20px]");

  // 8. Box Shadows
  // Will be applied via CSS on hover

  return out;
}

function run() {
  ["./src/components", "./src/App.tsx"].forEach((target) => {
    if (!fs.existsSync(target)) return;
    const processFile = (filepath: string) => {
      if (!filepath.endsWith(".tsx") && !filepath.endsWith(".ts")) return;
      const original = fs.readFileSync(filepath, "utf8");
      const processed = processContent(original);
      if (original !== processed) {
        fs.writeFileSync(filepath, processed);
        console.log("Processed", filepath);
      }
    };

    if (fs.statSync(target).isDirectory()) {
      walk(target, processFile);
    } else {
      processFile(target);
    }
  });
}

run();
