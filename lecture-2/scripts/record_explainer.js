// Record the live Random Forest explainer in headless Chrome, for the opening slide and the 2026 panel.
// Usage (needs playwright-core, e.g. from ../../PM-public/node_modules):
//   NODE_PATH=<folder>/node_modules node scripts/record_explainer.js <out_dir>
// Writes <out_dir>/rf.webm (whole run) and rf_marks.json (seconds at which each step began, for cutting with ffmpeg).
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL = 'https://ml-explainers.sutdpm.workers.dev/random-forest/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = path.resolve(process.argv[2] || 'rec');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = k => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k].toFixed(1)); };
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const act = async (a, wait) => {
    const b = page.locator(`[data-act="${a}"]:not([disabled])`).first();
    await b.waitFor({ state: 'visible', timeout: 120000 });
    mark(a);
    await b.click();
    await page.waitForTimeout(wait);
  };
  await act('boot', 4000);
  await act('plant', 3000);
  await act('auto', 7000);
  await act('forest', 16000);
  await act('topredict', 2500);
  await act('rand', 1200);
  await act('drop', 24000);   // long enough for every ball to land
  mark('end');
  const v = page.video();
  await ctx.close();
  await browser.close();
  fs.renameSync(await v.path(), path.join(out, 'rf.webm'));
  fs.writeFileSync(path.join(out, 'rf_marks.json'), JSON.stringify(marks, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
