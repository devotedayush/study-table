const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-pink-500': 'bg-primary',
  'text-pink-500': 'text-primary',
  'text-pink-600': 'text-primary',
  'text-pink-700': 'text-primary',
  'border-pink-300': 'border-ring',
  'border-pink-400': 'border-ring',
  'shadow-pink-200': 'shadow-primary/20',
  'bg-pink-50/40': 'bg-secondary/40',
  'bg-pink-50/50': 'bg-secondary/50',
  'bg-pink-50/60': 'bg-secondary/60',
  'bg-pink-50/70': 'bg-secondary/70',
  'bg-pink-50/80': 'bg-secondary/80',
  'hover:bg-pink-50/70': 'hover:bg-secondary/70',
  'hover:bg-pink-50/60': 'hover:bg-secondary/60',
  'text-white': 'text-primary-foreground',
  'bg-slate-500': 'bg-muted-foreground',
  'text-slate-800': 'text-foreground',
  'bg-slate-100': 'bg-secondary',
  'bg-slate-50': 'bg-secondary/50',
  'border-slate-200': 'border-border',
  'border-slate-100': 'border-border'
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
