const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const files = [
  'data/vocabulary_bank.js',
  'data/tests_1_to_3.js',
  'data/tests_4_to_6.js',
  'data/tests_7_to_10.js',
  'data/grammar_practice.js',
  'data/writing_practice.js',
  'data/speaking_topics.js',
  'app.js'
];

const combinedJs = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

html = html.replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>\n${css}\n</style>`);
html = html.replace(
  /<script src="\.\/data\/vocabulary_bank\.js"><\/script>[\s\S]*?<script src="\.\/app\.js"><\/script>/,
  () => `<script>\n${combinedJs}\n</script>`
);

const outPath1 = path.join('C:\\Users\\V3873606\\Downloads', 'HCMUS_OnThi_2026_Mobile.html');
const outPath2 = path.join(__dirname, 'HCMUS_OnThi_2026_Mobile.html');
fs.writeFileSync(outPath1, html, 'utf8');
fs.writeFileSync(outPath2, html, 'utf8');

console.log('Successfully created:', outPath1, Math.round(fs.statSync(outPath1).size / 1024) + ' KB');
