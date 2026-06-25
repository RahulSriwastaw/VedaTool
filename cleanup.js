const fs = require('fs');
const file = 'src/components/McqInteractiveWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `  return (
    <div className="space-y-4">
      {/* Toast Alert Banner */}`;

console.log("Found start:", content.indexOf(targetStr) !== -1);
