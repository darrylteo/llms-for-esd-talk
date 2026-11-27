/* Frame capture for film/flipbook.mp4: node render_flipbook.js <outDir> [--fps 60]   (needs playwright-core on NODE_PATH)
   1. Opens flipbook.html in headless Chrome and screenshots each of the 29 slide pages (<outDir>/pageNN.png).
   2. Hands those images to the scene as textures, then calls draw(t) per frame and screenshots it (<outDir>/fNNNNN.png).
   3. Writes <outDir>/schedule.json (when each leaf starts to turn, and how long a turn takes) for flipbook_audio.py.
   Then, from this folder:
     python flipbook_audio.py <outDir>/schedule.json <outDir>/paper.wav
     ffmpeg -y -framerate 60 -i <outDir>/f%05d.png -i <outDir>/paper.wav -c:v libx264 -preset slow -crf 18 -tune animation
            -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart -shortest ../../film/flipbook.mp4
   Preview the motion in Chrome afterwards with flipbook.html?preview when <outDir> is ./frames. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const out = path.resolve(args[0] || 'frames');
const fps = +(args[args.indexOf('--fps') + 1] || 60) || 60;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });  // WebGL2 in software
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto('file:///' + path.join(__dirname, 'flipbook.html').replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const count = await page.evaluate(() => window.PAGE_COUNT);
  const urls = [];
  for (let i = 0; i < count; i++) {
    await page.evaluate(i => window.showOnly(i), i);
    const f = path.join(out, 'page' + String(i).padStart(2, '0') + '.png');
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1040, height: 780 } });
    urls.push('data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  }
  await page.evaluate(u => window.setTextures(u), urls);
  const { dur, sched, turn } = await page.evaluate(() => ({ dur: window.DUR, sched: window.SCHEDULE, turn: window.TURN }));
  fs.writeFileSync(path.join(out, 'schedule.json'), JSON.stringify({ fps, dur, turn, turns: sched }));
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.draw(t), i / fps);
    await page.screenshot({ path: path.join(out, 'f' + String(i).padStart(5, '0') + '.png') });
  }
  await b.close();
  console.log('wrote', count, 'pages and', n, 'frames,', dur.toFixed(2), 's');
})();
