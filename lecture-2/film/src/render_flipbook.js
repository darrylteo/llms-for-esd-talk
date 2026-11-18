/* Frame capture for film/flipbook.mp4: node render_flipbook.js <outDir> [--fps 60]
   Opens flipbook.html in headless Chrome, calls draw(t) per frame, screenshots it, and writes schedule.json
   (the start of each page turn, for flipbook_audio.py). Needs playwright-core on NODE_PATH. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const out = path.resolve(args[0] || 'frames');
const fps = +(args[args.indexOf('--fps') + 1] || 60) || 60;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto('file:///' + path.join(__dirname, 'flipbook.html').replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const { dur, sched } = await page.evaluate(() => ({ dur: window.DUR, sched: window.SCHEDULE }));
  fs.writeFileSync(path.join(out, 'schedule.json'), JSON.stringify({ fps, dur, turns: sched }));
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.draw(t), i / fps);
    await page.screenshot({ path: path.join(out, 'f' + String(i).padStart(5, '0') + '.png') });
  }
  await b.close();
  console.log('wrote', n, 'frames,', dur.toFixed(2), 's');
})();
