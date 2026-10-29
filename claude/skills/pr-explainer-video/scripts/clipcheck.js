// 見切れ・重なりの検査：scenes/sNN.html を 0.25 秒ごとに止め、見えている文字や画像が
// 画面や .stage、overflow:hidden の枠からはみ出していないか、文字どうしが重なっていないかを調べる
// usage: node clipcheck.js <作業ディレクトリ> [シーン番号 ...]   番号を省くと scenes/ のすべて
// puppeteer-core は作業ディレクトリの node_modules から読む。Chrome は環境変数 CHROME_PATH、無ければ macOS / Linux の標準の場所
// 報告する項目：画面（.stage の外に出ている）、枠（overflow:hidden の枠で一部が切れている）、スポット・カーソルのはみ出し、重なり（文字どうし・字幕との重なり）
// カメラで切り抜くスクリーンショット・クリップの中（.shot .cam）は、寄ると外が切れるのが仕様なので検査しない
const path = require('path');
const fs = require('fs');
const [dirArg, ...idArgs] = process.argv.slice(2);
if (!dirArg) { console.error('usage: node clipcheck.js <作業ディレクトリ> [シーン番号 ...]'); process.exit(2); }
const dir = path.resolve(dirArg);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [dir] }));
const chromePath = () => {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error('Chrome が見つからない。環境変数 CHROME_PATH に実行ファイルを指定する');
  return p;
};
const ids = idArgs.length ? idArgs.map(Number)
  : fs.readdirSync(path.join(dir, 'scenes')).map((f) => /^s(\d\d)\.html$/.exec(f)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);

// ページの中で実行する検査（時刻を合わせたあとに呼ぶ）
const inspect = () => {
  const stage = document.querySelector('.stage').getBoundingClientRect();
  const out = [];
  const op = (e) => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) o *= parseFloat(getComputedStyle(x).opacity); return o; };
  const media = (e) => e.tagName === 'IMG' || e.tagName === 'VIDEO';
  const own = (e) => media(e) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const box = (e) => {
    if (media(e)) return e.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).forEach((n) => {
      const g = document.createRange(); g.selectNodeContents(n); const q = g.getBoundingClientRect();
      if (q.width) { x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
    });
    if (getComputedStyle(e).textOverflow === 'ellipsis') { const q = e.getBoundingClientRect(); x0 = Math.max(x0, q.left); x1 = Math.min(x1, q.right); }  // 省略表示は見えている幅まで
    return { left: x0, top: y0, right: x1, bottom: y1, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  };
  const inShotCam = (e) => !!e.closest('.shot .cam');
  const label = (e) => (e.textContent || e.getAttribute('src') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const scene = [...document.querySelectorAll('.camx *')].filter((e) => !inShotCam(e) && own(e) && op(e) >= 0.5);  // 出入りの途中（淡い間）の位置ずれは拾わない
  scene.forEach((e) => {
    const r = box(e); if (!r.width || !r.height) return;
    // 画面の切り抜き：.stage の外へ出ている（外へ完全に出たものは見えないので除く）
    const off = [r.left < stage.left - 1 && 'left', r.right > stage.right + 1 && 'right', r.top < stage.top - 1 && 'top', r.bottom > stage.bottom + 1 && 'bottom'].filter(Boolean);
    const inside = r.right > stage.left && r.left < stage.right && r.bottom > stage.top && r.top < stage.bottom;
    if (off.length && inside) out.push(`画面:${off.join('/')} ${label(e)}`);
    // 枠（overflow:hidden）の切り抜き。一部だけ切れているものを報告する（完全に外へ出たものは見えない）。text-overflow:ellipsis は意図した省略なので除く
    if (getComputedStyle(e).textOverflow === 'ellipsis') return;
    for (let p = e.parentElement; p && !p.classList.contains('camx'); p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
        const q = p.getBoundingClientRect();
        const cut = r.right > q.right + 2 || r.bottom > q.bottom + 2 || r.left < q.left - 2 || r.top < q.top - 2;
        const vis = r.right > q.left && r.left < q.right && r.bottom > q.top && r.top < q.bottom;
        if (cut && vis) out.push(`枠(${p.id || p.className}):${label(e)}`);
      }
    }
  });
  // フォーカス枠・カーソルが .stage からはみ出していないか（枠の線は内側に描く前提で、箱そのもので見る）
  document.querySelectorAll('.camx .spot,.camx .cursor').forEach((e) => {
    if (op(e) < 0.5 || e.closest('.shot .cam') && e.classList.contains('spot')) return;
    const r = e.getBoundingClientRect();
    const off = [r.left < stage.left - 0.5 && 'left', r.right > stage.right + 0.5 && 'right', r.top < stage.top - 0.5 && 'top', r.bottom > stage.bottom + 0.5 && 'bottom'].filter(Boolean);
    if (off.length) out.push(`${e.className}:${off.join('/')}`);
  });
  // 見出し・札・字幕が 1920x1080 の画面からはみ出していないか
  document.querySelectorAll('.top *,.badge,.capline').forEach((e) => {
    if (!own(e) || op(e) < 0.5) return;
    const r = box(e); if (!r.width) return;
    const off = [r.left < -1 && 'left', r.right > 1921 && 'right', r.top < -1 && 'top', r.bottom > 1081 && 'bottom'].filter(Boolean);
    if (off.length) out.push(`画面端:${off.join('/')} ${label(e)}`);
  });
  // 文字どうしの重なり（両方がはっきり見えていて、小さい方の 25% 以上が重なる）。字幕・見出し・札との重なりも見る
  const extra = [...document.querySelectorAll('.top *,.badge,.capline')].filter((e) => own(e) && op(e) > 0.6);
  const texts = [...scene.filter((e) => !media(e) && op(e) > 0.6), ...extra]
    .map((e) => ({ e, r: box(e) })).filter((x) => x.r.width && x.r.height);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 0 || h <= 0) continue;
    const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if (w * h > small * 0.25) out.push(`重なり:${label(a.e).slice(0, 18)} × ${label(b.e).slice(0, 18)}`);
  }
  return out;
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--hide-scrollbars', '--allow-file-access-from-files'] });
  const all = [];
  for (const id of ids) {  // 動画を含むシーンもあるので 1 シーンずつ
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('pageerror', (e) => console.error('PAGEERROR', id, e.message));
    await page.goto(`file://${dir}/scenes/s${String(id).padStart(2, '0')}.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const dur = await page.evaluate(() => window.TL.dur);
    const seen = new Map();
    for (let ms = 0; ms <= dur * 1000; ms += 250) {
      await page.evaluate((t) => window.__seek(t), ms);  // 時刻を合わせる（video の seeked と描画を待つ）
      const hits = await page.evaluate(inspect);
      hits.forEach((h) => { if (!seen.has(h)) seen.set(h, ms / 1000); });
    }
    seen.forEach((t, h) => all.push(`s${String(id).padStart(2, '0')} t=${t.toFixed(2)} ${h}`));
    await page.close();
  }
  await browser.close();
  console.log(all.length ? all.sort().join('\n') : 'no clipping');
})().catch((e) => { console.error(e); process.exit(1); });
