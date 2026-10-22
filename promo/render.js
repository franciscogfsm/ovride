// usage: node render.js out.mp4 [scale]   |   node render.js --stills 3,8,14
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe');
const FPS = 30;

(async () => {
  const stills = process.argv[2] === '--stills';
  const scale = Number(process.argv[3]) || 1; // 1 = 720p, 1.5 = 1080p
  const browser = await chromium.launch({ executablePath: EXE, args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: stills ? 1 : scale });
  await page.goto('file:///' + path.join(__dirname, 'film.html').replace(/\\/g, '/'));
  await page.evaluate(() => document.fonts.ready);

  if (stills) {
    for (const t of process.argv[3].split(',').map(Number)) {
      await page.evaluate(t => seek(t), t);
      await page.screenshot({ path: path.join(__dirname, `still_${t}.png`) });
    }
    return browser.close();
  }

  const out = process.argv[2] || 'ovride.mp4';
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round((await page.evaluate(() => DURATION)) * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate(t => seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('done', out);
})();
