// 確認用：指定の時刻のコマを PNG で撮る
// usage: node stills.js <spec.json>   spec = [{html, times: [秒], names: [出力 PNG のパス]}]
// Chrome は環境変数 CHROME_PATH、無ければ macOS の Google Chrome、Linux の google-chrome / chromium を探す。puppeteer-core は作業ディレクトリの node_modules から読む
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const chromePath = () => {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error('Chrome が見つからない。環境変数 CHROME_PATH に実行ファイルを指定する');
  return p;
};
const S = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files'] });
  for (const sc of S) {  // 並列に撮ると描画が欠けるので 1 ページずつ
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('pageerror', (e) => console.error('PAGEERROR', sc.html, e.message));
    await page.goto('file://' + sc.html, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
    for (let k = 0; k < sc.times.length; k++) {
      await page.evaluate((ms) => window.__seek(ms), sc.times[k] * 1000);
      await page.screenshot({ path: sc.names[k] });
    }
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
