// Record the live Random Forest explainer in headless Chrome, for the opening slide and the 2026 panel.
// Usage (needs playwright-core, e.g. from ../../PM-public/node_modules):
//   NODE_PATH=<folder>/node_modules node scripts/record_explainer.js <out_dir>
// Writes <out_dir>/rf.webm (whole run) and rf_marks.json (seconds at which each step began, for cutting with ffmpeg).
// A drawn cursor glides to each button and rings on click, and tree 1's first split is chosen by hand.
// clips/rf-forest.mp4 is three cuts of rf.webm (times from rf_marks.json): pick-0.3 .. picked+0.9 at 1.3x, crop 1586:1080:0:0
// scaled to 1454x990; forest+0.3 .. +13.1 at 2x; drop+5.2 .. drop+19.4 at 1x (until the verdict has shown for ~3 s);
// the last two cropped 1454:990:466:90, the first two joined by a 0.4 s crossfade.
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
  // Headless video has no mouse pointer, so draw one: an arrow that follows the mouse and pulses a ring on each click.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = `#rec-cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:34px;height:40px;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
        .rec-ring{position:fixed;z-index:2147483646;pointer-events:none;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:4px solid #ffd54a;animation:rec-ring .6s ease-out forwards}
        @keyframes rec-ring{from{transform:scale(.4);opacity:1}to{transform:scale(2.6);opacity:0}}`;
      document.head.appendChild(st);
      const c = document.createElement('div'); c.id = 'rec-cur';
      c.innerHTML = '<svg viewBox="0 0 17 20" width="34" height="40"><path d="M1 1 L1 16 L5 12.5 L8 19 L10.6 17.8 L7.7 11.6 L13 11.6 Z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX - 2}px,${e.clientY - 2}px)`; }, true);
      addEventListener('mousedown', e => {
        const r = document.createElement('div'); r.className = 'rec-ring';
        r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
        document.body.appendChild(r); setTimeout(() => r.remove(), 700);
      }, true);
    });
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  let mx = 960, my = 700;
  await page.mouse.move(mx, my);
  // glide the drawn cursor to the element's centre, pause, click
  // scroll the page like a person would: a few wheel notches, eased
  const wheelBy = async dy => {
    const n = 14;
    for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await page.waitForTimeout(22); }
    await page.waitForTimeout(250);
  };
  const glideClick = async loc => {
    let r = await loc.boundingBox();
    const over = r.y + r.height - 1040;
    if (over > 0) { await wheelBy(over); r = await loc.boundingBox(); }
    const x = r.x + r.width / 2, y = r.y + r.height / 2, n = 28;
    for (let i = 1; i <= n; i++) {
      const e = 0.5 - Math.cos(Math.PI * i / n) / 2;
      await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await page.waitForTimeout(16);
    }
    mx = x; my = y;
    await page.waitForTimeout(250);
    await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
  };
  const act = async (a, wait) => {
    const b = page.locator(`[data-act="${a}"]:not([disabled])`).first();
    await b.waitFor({ state: 'visible', timeout: 120000 });
    mark(a);
    await glideClick(b);
    await page.waitForTimeout(wait);
  };
  await act('boot', 4000);
  await act('plant', 2000);
  // one split by hand: pick the root leaf, then the feature with the bigger drop
  mark('pick');
  await page.waitForTimeout(300);
  await glideClick(page.locator('svg g.node.open').first());
  await page.waitForTimeout(1400);
  const card = page.locator('.scard[data-act="split"]:has(.tag)').first();
  await glideClick((await card.count()) ? card : page.locator('.scard[data-act="split"]').first());
  mark('picked');
  await page.waitForTimeout(1600);
  const y = await page.evaluate(() => scrollY);
  if (y > 0) await wheelBy(-y - 20);
  mark('top');
  await page.waitForTimeout(400);
  if (process.env.REC_DEBUG) await page.screenshot({ path: path.join(out, 'after_split.png') });
  // the explainer's random data sometimes leaves no impure leaf after one split; finish by hand only if needed
  if (await page.locator('[data-act="auto"]:not([disabled])').count()) await act('auto', 7000);
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
