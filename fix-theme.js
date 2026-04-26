const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-white': 'bg-card',
  'bg-white/': 'bg-card/',
  'border-pink-100': 'border-border',
  'border-pink-200': 'border-border',
  'text-slate-900': 'text-foreground',
  'text-slate-700': 'text-foreground',
  'text-slate-600': 'text-muted-foreground',
  'text-slate-500': 'text-muted-foreground',
  'text-slate-400': 'text-muted-foreground',
  'hover:bg-pink-50': 'hover:bg-secondary',
  'hover:bg-pink-100': 'hover:bg-secondary/80',
  'bg-pink-50': 'bg-secondary',
  'bg-pink-100': 'bg-secondary',
  'focus:border-pink-300': 'focus:border-ring',
  'focus:ring-pink-100': 'focus:ring-ring/50',
  'border-dashed border-pink-200': 'border-dashed border-border',
  'border-amber-200': 'border-border',
  'border-amber-100': 'border-border',
  'text-amber-700': 'text-foreground',
  'hover:bg-amber-50': 'hover:bg-secondary',
  'border-emerald-300': 'border-border',
  'text-emerald-700': 'text-foreground',
  'border-emerald-100': 'border-border'
};

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content;
      
      // Don't replace in theme-toggle.tsx since it defines the themes
      if (fullPath.includes('theme-toggle.tsx')) continue;

      for (const [oldClass, newClass] of Object.entries(replacements)) {
        // Simple string replace for all occurrences
        // To avoid partial matches like bg-white replacing inside bg-white/80, 
        // we'll use a regex with word boundaries
        // wait, bg-white/ is handled before bg-white if we sort correctly.
        // Actually, let's just use regex with word boundary for those without slash
        let regex;
        if (oldClass.endsWith('/')) {
            regex = new RegExp(oldClass, 'g');
        } else {
            regex = new RegExp(oldClass + '(?![\\w/])', 'g');
        }
        newContent = newContent.replace(regex, newClass);
      }
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, 'src'));
