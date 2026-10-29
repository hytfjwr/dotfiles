// シーン HTML を時刻シークしながら 1 コマずつ撮り、ffmpeg で動画にする
// usage: node render.js <html> <out.mp4> <fps> <startFrame> <endFrame>（endFrame は含まない）
// Chrome は環境変数 CHROME_PATH、無ければ macOS の Google Chrome、Linux の google-chrome / chromium を探す。puppeteer-core は作業ディレクトリの node_modules から読む
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const chromePath = () => {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error('Chrome が見つからない。環境変数 CHROME_PATH に実行ファイルを指定する');
  return p;
};
const [html, out, fpsArg, f0Arg, f1Arg] = process.argv.slice(2);
const fps = Number(fpsArg), f0 = Number(f0Arg), f1 = Number(f1Arg);
(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto('file://' + html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
  const cdp = await page.createCDPSession();
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = f0; i < f1; i++) {
    await page.evaluate((ms) => window.__seek(ms), (i * 1000) / fps);  // video があるときは seeked と 2 回の rAF を待って返る
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
