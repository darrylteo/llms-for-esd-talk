/* Frame capture for the opening film: node render.js <outDir> [--fps 60] [--at 1.0,4.5,...]
   Opens scene.html in the installed Chrome (headless, via playwright-core), calls draw(t) for each frame
   and writes PNGs (f00000.png ...). --at writes only the listed times (contact sheets, quick checks).
   playwright-core is not vendored: `npm i playwright-core` anywhere and point NODE_PATH at its node_modules. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// A fixed profile reused by every run, so Chrome never sets up a fresh profile (and its extensions) in %TEMP%.
const PROFILE = path.join(process.env.CHROME_PROFILES || 'C:/dev/chrome-profiles', 'talk-film');
const args = process.argv.slice(2);
const out = path.resolve(args[0] || 'frames');
const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const fps = +(opt('--fps') || 60);
const at = opt('--at');

(async () => {
  const stats = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stats.json'), 'utf8')).totals.all;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launchPersistentContext(PROFILE, { executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--allow-file-access-from-files', '--disable-default-apps'],
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto('file:///' + path.join(__dirname, 'scene.html').replace(/\\/g, '/'));
  await page.evaluate(async s => { await window.ready; window.setup(s); }, { processed: stats.processed, hit: stats.cache_hit_rate });
  const dur = await page.evaluate(() => window.DUR);
  const times = at ? at.split(',').map(Number) : Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  const t0 = Date.now();
  for (let i = 0; i < times.length; i++) {
    const url = await page.evaluate(t => { window.draw(t); return document.getElementById('c').toDataURL('image/png'); }, times[i]);
    const name = at ? 't' + times[i].toFixed(2).padStart(5, '0') + '.png' : 'f' + String(i).padStart(5, '0') + '.png';
    fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    if (!at && i % 150 === 0) console.log(`frame ${i}/${times.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
  console.log(`wrote ${times.length} frames to ${out}`);
})();
