const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/**/*.tsx');
const bgs = new Set();
const borders = new Set();
const texts = new Set();

files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  
  const bgMats = [...c.matchAll(/bg-\[#([0-9a-fA-F]+)\]/g)];
  bgMats.forEach(m => bgs.add(m[0]));
  
  const borderMats = [...c.matchAll(/border-\[#([0-9a-fA-F]+)\]/g)];
  borderMats.forEach(m => borders.add(m[0]));
  
  const textMats = [...c.matchAll(/text-\[#([0-9a-fA-F]+)\]/g)];
  textMats.forEach(m => texts.add(m[0]));
});

console.log('BGS', Array.from(bgs).join(', '));
console.log('BORDERS', Array.from(borders).join(', '));
console.log('TEXTS', Array.from(texts).join(', '));
