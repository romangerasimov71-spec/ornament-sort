#!/usr/bin/env node
/*
 * Per-platform archives for Playgama, VK, OK, Yandex.
 *
 *   node tools/build-platform.js            # all four
 *   node tools/build-platform.js vk         # one (the others in dist/platforms/ are rebuilt too: build-release wipes dist/)
 *
 * What it does:
 *   1. runs tools/build-release.js (game files + checks) into dist/ornament-sort/
 *   2. for every platform copies that folder to dist/platforms/<platform>/ornament-sort/
 *   3. if release/<platform>/bridge-config.patch.json exists, deep-merges it into
 *      playgama-bridge-config.json of that copy (platform-only overrides; none needed today)
 *   4. zips it to dist/platforms/<platform>/ornament-sort-<platform>.zip (index.html at the root)
 *   5. checks the platform limits and writes release/<platform>/BUILD-SHA256.txt
 *
 * Playgama Bridge detects VK / OK / Yandex by itself (page URL and host SDK), so today all four
 * archives hold the same game files; the script exists so that a platform can diverge without
 * touching the others.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(DIST, 'ornament-sort');
// limits are from the platform requirements pages (Playgama wiki; VK/OK/Yandex from memory, see release/README.md)
const PLATFORMS = {
  playgama: { maxMB: 50, maxFiles: 500 },   // 300 MB is the hard limit; 50 MB keeps MSN, 30 MB YouTube is also met by this game
  vk: { maxMB: 50, maxFiles: 500 },
  ok: { maxMB: 50, maxFiles: 500 },
  yandex: { maxMB: 100, maxFiles: 1000 }
};
const want = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : Object.keys(PLATFORMS);
for (const p of want) if (!PLATFORMS[p]) { console.error('unknown platform ' + p + '; use ' + Object.keys(PLATFORMS).join(', ')); process.exit(2); }

execFileSync('node', [path.join(__dirname, 'build-release.js')], { stdio: 'inherit' });

function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
function listFiles(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, acc); else acc.push({ rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return acc;
}
function zip(srcDir, zipPath) {
  try {
    execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: srcDir });
  } catch (e) {
    execFileSync('python3', ['-I', '-c',
      'import os,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\n' +
      'for r,d,f in os.walk(sys.argv[2]):\n  for n in sorted(f):\n    p=os.path.join(r,n)\n    z.write(p,os.path.relpath(p,sys.argv[2]))\nz.close()',
      zipPath, srcDir]);
  }
}

for (const p of want) {
  const outDir = path.join(DIST, 'platforms', p);
  const gameDir = path.join(outDir, 'ornament-sort');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(SRC, gameDir, { recursive: true });
  const patch = path.join(ROOT, 'release', p, 'bridge-config.patch.json');
  if (fs.existsSync(patch)) {
    const cfgPath = path.join(gameDir, 'playgama-bridge-config.json');
    const cfg = merge(JSON.parse(fs.readFileSync(cfgPath, 'utf8')), JSON.parse(fs.readFileSync(patch, 'utf8')));
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }
  const files = listFiles(gameDir);
  const total = files.reduce((s, f) => s + f.size, 0);
  const lim = PLATFORMS[p];
  const problems = [];
  if (!files.some((f) => f.rel === 'index.html')) problems.push('no index.html at the root');
  if (files.length > lim.maxFiles) problems.push(files.length + ' files, limit ' + lim.maxFiles);
  if (total > lim.maxMB * 1048576) problems.push((total / 1048576).toFixed(1) + ' MB, limit ' + lim.maxMB);
  for (const f of files) if (!/^[A-Za-z0-9._\/-]+$/.test(f.rel)) problems.push('non-Latin name ' + f.rel);
  if (problems.length) { console.error(p + ': FAILED\n  ' + problems.join('\n  ')); process.exit(1); }
  const zipPath = path.join(outDir, 'ornament-sort-' + p + '.zip');
  zip(gameDir, zipPath);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  const note = `${sha}  ornament-sort-${p}.zip  (${files.length} files, ${(total / 1024).toFixed(0)} KB unpacked, ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB zipped)\n`;
  const sumFile = path.join(ROOT, 'release', p, 'BUILD-SHA256.txt');
  fs.mkdirSync(path.dirname(sumFile), { recursive: true });
  fs.writeFileSync(sumFile, 'Built from commit ' + execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim() +
    ' (the sum of the zip changes whenever game files change; the build is not byte-reproducible across machines because of file times)\n' + note);
  console.log(p + ': ' + zipPath + '\n  ' + note.trim());
}
