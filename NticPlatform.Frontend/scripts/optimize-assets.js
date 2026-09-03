/**
 * One-off asset optimisation for the five oversized, referenced images.
 *
 * Why: the four school crests ship at 1024x1024 (~1 MB each) but render inside a
 * 4.5rem (72px) circular avatar, and the Hall of Fame medal ships at 571x1024
 * (503 KB) but renders 120px tall. That is a 20-30x overdraw on every landing
 * page visit. Each is resized to 2x its largest rendered size and encoded as
 * WebP, which every browser in this project's browserslist target supports.
 *
 * Originals are left in place; this only writes the .webp siblings so the result
 * can be inspected before the old files are removed.
 *
 * Run from NticPlatform.Frontend:  node scripts/optimize-assets.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');

// `box` is the largest size the image is ever rendered at (from the SCSS), so
// the target is 2x that for high-DPI screens.
const TARGETS = [
  { file: 'logos/prempeh.png',       width: 144, height: 144, note: 'avatar 72px' },
  { file: 'logos/weygeyhey.png',     width: 144, height: 144, note: 'avatar 72px' },
  { file: 'logos/mfantsipim.png',    width: 144, height: 144, note: 'avatar 72px' },
  { file: 'logos/gsts.png',          width: 144, height: 144, note: 'avatar 72px' },
  { file: 'hall_of_fame_medal.png',  width: null, height: 240, note: 'medal 120px tall' },
];

const kb = (bytes) => (bytes / 1024).toFixed(1);

(async () => {
  let before = 0;
  let after = 0;
  const rows = [];

  for (const target of TARGETS) {
    const src = path.join(ASSETS, target.file);
    if (!fs.existsSync(src)) {
      console.error(`MISSING: ${target.file}`);
      process.exitCode = 1;
      return;
    }

    const out = src.replace(/\.png$/i, '.webp');
    const srcBytes = fs.statSync(src).size;
    const meta = await sharp(src).metadata();

    await sharp(src)
      .resize({
        width: target.width || undefined,
        height: target.height || undefined,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // Transparency matters: these are crests on light and dark backgrounds.
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(out);

    const outBytes = fs.statSync(out).size;
    const outMeta = await sharp(out).metadata();

    before += srcBytes;
    after += outBytes;

    rows.push({
      file: target.file,
      from: `${meta.width}x${meta.height}`,
      to: `${outMeta.width}x${outMeta.height}`,
      fromKb: kb(srcBytes),
      toKb: kb(outBytes),
      saved: `${(100 - (outBytes / srcBytes) * 100).toFixed(1)}%`,
      note: target.note,
    });
  }

  console.log('');
  for (const r of rows) {
    console.log(
      `${r.file.padEnd(28)} ${r.from.padStart(9)} -> ${r.to.padEnd(9)}  ` +
      `${r.fromKb.padStart(8)} KB -> ${r.toKb.padStart(7)} KB  (-${r.saved})  [${r.note}]`
    );
  }
  console.log('');
  console.log(`TOTAL: ${kb(before)} KB -> ${kb(after)} KB  ` +
    `(saved ${kb(before - after)} KB, -${(100 - (after / before) * 100).toFixed(1)}%)`);
})();
