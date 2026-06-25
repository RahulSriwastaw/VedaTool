const fs = require('fs');

const BGS = "bg-[#3A2A1A], bg-[#121214], bg-[#ff8046], bg-[#0a0a0c], bg-[#09090B], bg-[#1f1f23], bg-[#18181B], bg-[#18181b], bg-[#1C1C21], bg-[#1e1e24], bg-[#2e2e34], bg-[#2c1c1f], bg-[#2d2d34], bg-[#1A1A1A], bg-[#080B14], bg-[#0C0F1E], bg-[#14182E], bg-[#141828], bg-[#111528], bg-[#1C2140], bg-[#1E2545], bg-[#0F0F0F], bg-[#3A1A1A], bg-[#252525], bg-[#1A3A1A], bg-[#111], bg-[#141414], bg-[#161616], bg-[#111111], bg-[#1E1E1E], bg-[#1C1C1C], bg-[#1A2A3A], bg-[#2A2A2A], bg-[#1A1111], bg-[#25252d], bg-[#1a1a1a], bg-[#1c1d22], bg-[#0d0d0f], bg-[#1A1A1E], bg-[#212121], bg-[#18181A], bg-[#222], bg-[#111113], bg-[#1d1d1f], bg-[#1D1D1F], bg-[#1C1C1E], bg-[#252527], bg-[#0c0c0d], bg-[#1A1A1D], bg-[#0A0A0A], bg-[#171717], bg-[#EFEFEF], bg-[#251212], bg-[#1F1F1F], bg-[#1D1D1D], bg-[#181818], bg-[#0b0c10], bg-[#1c1c1f], bg-[#333], bg-[#2f2f32], bg-[#0c0c0e], bg-[#3b3b3e], bg-[#3d3d42], bg-[#2a2a30]";
const BORDERS = "border-[#2e2e34], border-[#27272A], border-[#252525], border-[#1C2140], border-[#1E2545], border-[#14182E], border-[#1A1F38], border-[#333], border-[#1E1E1E], border-[#2A2A2A], border-[#2d2d34], border-[#3a3a3a], border-[#444], border-[#2D2D2D], border-[#202022], border-[#25252A], border-[#252528], border-[#2D2D2F], border-[#1e1e20], border-[#E0E0E0], border-[#333333], border-[#555], border-[#262626], border-[#222], border-[#2c2c30], border-[#1e1e24], border-[#3e3e44]";
const TEXTS = "text-[#EFEFEF], text-[#888888], text-[#555555], text-[#333333], text-[#CCC], text-[#333], text-[#888], text-[#DDD], text-[#666], text-[#AAAAAA], text-[#c5c6c7]";

function pickCategory(cls) {
  cls = cls.replace('bg-', '').replace('border-', '').replace('text-', '').replace('[', '').replace(']', '').replace('#', '').toLowerCase();
  
  if (cls.length !== 6 && cls.length !== 3) return null;
  // Convert 3 hex to 6
  if (cls.length === 3) cls = cls.split('').map(c => c+c).join('');

  // parse hex
  const r = parseInt(cls.substr(0,2), 16);
  const g = parseInt(cls.substr(2,2), 16);
  const b = parseInt(cls.substr(4,2), 16);
  const avg = (r + g + b) / 3;

  return avg;
}

const css = [];

// BACKGROUNDS
let bgPage = [];
let bgSurface = [];
let bgCard = [];
BGS.split(', ').forEach(cls => {
  const avg = pickCategory(cls);
  if (avg === null) return;
  if (avg < 15) bgPage.push(cls);
  else if (avg < 25) bgSurface.push(cls);
  else if (avg < 40) bgCard.push(cls);
});

bgPage.forEach(cls => css.push(`[class*="${cls}" i] { background-color: var(--bg-page) !important; }`));
bgSurface.forEach(cls => css.push(`[class*="${cls}" i] { background-color: var(--bg-surface) !important; }`));
bgCard.forEach(cls => css.push(`[class*="${cls}" i] { background-color: var(--bg-card) !important; }`));

// BORDERS
let borderDefault = [];
let borderStrong = [];
BORDERS.split(', ').forEach(cls => {
  const avg = pickCategory(cls);
  if (avg === null) return;
  if (avg < 35) borderDefault.push(cls);
  else borderStrong.push(cls);
});

borderDefault.forEach(cls => css.push(`[class*="${cls}" i] { border-color: var(--border-default) !important; }`));
borderStrong.forEach(cls => css.push(`[class*="${cls}" i] { border-color: var(--border-strong) !important; }`));

// TEXTS
let textPrimary = [];
let textSecondary = [];
let textMuted = [];
TEXTS.split(', ').forEach(cls => {
  const avg = pickCategory(cls);
  if (avg === null) return;
  if (avg > 200) textPrimary.push(cls);
  else if (avg > 100) textSecondary.push(cls);
  else if (avg <= 100) textMuted.push(cls);
});

textPrimary.forEach(cls => css.push(`[class*="${cls}" i] { color: var(--text-primary) !important; }`));
textSecondary.forEach(cls => css.push(`[class*="${cls}" i] { color: var(--text-secondary) !important; }`));
textMuted.forEach(cls => css.push(`[class*="${cls}" i] { color: var(--text-muted) !important; }`));

let indexCss = fs.readFileSync('src/index.css', 'utf8');
indexCss += '\n\n/* AUTO INJECTED DYNAMIC MAPPINGS */\n' + css.join('\n') + '\n';
fs.writeFileSync('src/index.css', indexCss);
console.log("Successfully injected dynamic classes.");
