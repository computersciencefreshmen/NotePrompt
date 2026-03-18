const fs = require('fs');
const path = require('path');

const re = /[\u4e00-\u9fff\u3400-\u4dbf][\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uff5e\w\s,，。、：；！？（）""''《》【】…·\-/+%]*/g;

function scan(dir, results) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'ui'].includes(entry)) {
        scan(fullPath, results);
      }
    } else if (/\.tsx?$/.test(entry)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(re);
      if (matches) {
        const unique = [...new Set(matches)].filter(s => s.length > 1);
        if (unique.length > 0) {
          const relPath = fullPath.replace(/\\/g, '/');
          const srcIdx = relPath.indexOf('src/');
          const shortPath = srcIdx >= 0 ? relPath.substring(srcIdx) : relPath;
          results.push({ file: shortPath, count: unique.length, texts: unique });
        }
      }
    }
  }
  return results;
}

const results = scan('src', []);
let total = 0;
results.forEach(r => total += r.count);
console.log('Total files with Chinese:', results.length);
console.log('Total unique Chinese strings:', total);
console.log('---');
results.forEach(r => {
  console.log(`\n[${r.file}] (${r.count} strings)`);
  r.texts.forEach(t => console.log('  - ' + t.trim().substring(0, 80)));
});
