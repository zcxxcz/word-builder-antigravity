import { grade7aWords } from './src/data/grade7a.js';
import { grade7bWords } from './src/data/grade7b.js';
import fs from 'fs';

function esc(s) { return s ? s.replace(/'/g, "''") : ''; }

let sql = '';
for (const w of grade7aWords) {
    sql += `INSERT INTO words (wordlist_id, word, meaning_cn, unit, example1, source) VALUES (1, '${esc(w.word)}', '${esc(w.meaning_cn)}', '${esc(w.unit)}', '${esc(w.example)}', 'waiyanbanseven_a');\n`;
}
for (const w of grade7bWords) {
    sql += `INSERT INTO words (wordlist_id, word, meaning_cn, unit, example1, source) VALUES (2, '${esc(w.word)}', '${esc(w.meaning_cn)}', '${esc(w.unit)}', '${esc(w.example)}', 'waiyanbanseven_b');\n`;
}
fs.writeFileSync('seed_words.sql', sql);
console.log('Done:', grade7aWords.length, '+', grade7bWords.length);
