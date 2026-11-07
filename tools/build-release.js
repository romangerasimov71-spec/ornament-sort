#!/usr/bin/env node
/*
 * Release package: copies ONLY the files the game ships into dist/ and makes
 * dist/ornament-sort.zip (index.html at the root of the archive).
 * Checks: no localStorage / sessionStorage / indexedDB / cookies in the game code,
 * no tests, docs or prototype, only Latin file names, no links to outside hosts.
 *
 *   node tools/build-release.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const GAME_DIR = path.join(DIST, 'ornament-sort');

// audio actually used by js/audio.js (music-proto.mp3 belongs to the prototype only)
const audioSrc = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
const audioFiles = [...audioSrc.matchAll(/'audio\/([a-z0-9_-]+\.mp3)'/g)].map((m) => 'audio/' + m[1]);

const FILES = [
  'index.html',
  'playgama-bridge.js',
  'playgama-bridge-config.json',
  'css/style.css',
  'js/rules.js',
  'js/levels-data.js',
  'js/i18n.js',
  'js/audio.js',
  'js/game.js',
  ...audioFiles
];

fs.rmSync(DIST, { recursive: true, force: true });
for (const f of FILES) {
  const to = path.join(GAME_DIR, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), to);
}

// ---- checks
const problems = [];
const gameCode = ['index.html', 'css/style.css', 'js/rules.js', 'js/levels-data.js', 'js/i18n.js', 'js/audio.js', 'js/game.js'];
for (const f of gameCode) {
  const txt = fs.readFileSync(path.join(GAME_DIR, f), 'utf8');
  if (/localStorage|sessionStorage|indexedDB|document\.cookie/.test(txt)) problems.push(f + ': uses browser storage');
  if (/(src|href)=["']https?:|url\(\s*["']?https?:|fetch\(\s*["']https?:/.test(txt)) problems.push(f + ': loads something from outside');
}
// every script / stylesheet referenced by index.html must be in the package
const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!fs.existsSync(path.join(GAME_DIR, m[1]))) problems.push('index.html references missing ' + m[1]);
}
for (const m of html.matchAll(/'(js\/[a-z0-9-]+\.js)'/g)) {
  if (!fs.existsSync(path.join(GAME_DIR, m[1]))) problems.push('boot list references missing ' + m[1]);
}
JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'playgama-bridge-config.json'), 'utf8'));
let total = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (!/^[A-Za-z0-9._-]+$/.test(e.name)) problems.push('non-Latin name: ' + p);
    if (/^(tests?|docs|prototype|tools|node_modules)$/.test(e.name)) problems.push('should not ship: ' + p);
    if (e.isDirectory()) walk(p); else total += fs.statSync(p).size;
  }
})(GAME_DIR);
if (problems.length) {
  console.error('RELEASE CHECK FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ---- zip (index.html at the archive root)
const zipPath = path.join(DIST, 'ornament-sort.zip');
try {
  execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: GAME_DIR });
} catch (e) {
  execFileSync('python3', ['-I', '-c',
    'import os,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\n' +
    'for r,_,fs in os.walk("."):\n  for f in fs: z.write(os.path.join(r,f))\nz.close()', zipPath], { cwd: GAME_DIR });
}
console.log(`dist/ornament-sort/: ${FILES.length} files, ${(total / 1024).toFixed(0)} KB; ` +
  `zip: dist/ornament-sort.zip ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB; checks passed`);
