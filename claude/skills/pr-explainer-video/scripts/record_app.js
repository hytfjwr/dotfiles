#!/usr/bin/env node
// 起動済みの Web アプリを headless Chrome で開き、台本(flow)を実行しながら録画して mp4 と sidecar JSON を出す。
// usage: node record_app.js --url URL --flow flow.mjs --out clip.mp4 [options]   (詳細は --help と references/app-recording-api.md)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

const HELP = `usage: node record_app.js --url URL --flow flow.mjs --out clip.mp4 [options]
  --url URL              最初に開く URL（必須）
  --flow FILE            台本。export default async function (page, h) { ... }（必須）
  --out FILE             出力 mp4。sidecar は拡張子を .json に替えたパス（after.mp4 → after.json）
  --viewport WxH         既定 1600x900（CSS px）
  --dsf N                deviceScaleFactor。既定 1。mp4 の画素数 = viewport x dsf
  --fps N                既定 30
  --cpu-throttle N       CPU を N 倍遅くする（Emulation.setCPUThrottlingRate）。既定 1
  --network PRESET       fast3g | slow3g | none（既定 none）
  --no-cache             HTTP キャッシュを無効にする
  --hide 'css, css'      撮影中に display:none にする要素（開発用オーバーレイ等）
  --color-scheme S       light | dark
  --cookies FILE         Cookie の JSON（puppeteer の cookie 配列、または {"cookies":[...]}）
  --pause MS             click / type / hover / scroll の前の人間らしい間。既定 400
  --timeout MS           セレクタ待ちの上限。既定 10000
  --tail MS              flow 終了後に最後の画面を保持する時間。既定 500
  --headful              ウィンドウを出して実行する（デバッグ用）
  失敗時は <out>.error.png を保存して非 0 で終わる。Chrome は CHROME_PATH、無ければ標準の場所から探す。`;

// ---------- 引数 ----------
function parseArgs(argv) {
  const o = { viewport: '1600x900', dsf: 1, fps: 30, cpuThrottle: 1, network: 'none', pause: 400, timeout: 10000, tail: 500 };
  const flags = new Set(['--headful', '--no-cache', '--help', '-h']);
  const keys = { '--url': 'url', '--flow': 'flow', '--out': 'out', '--viewport': 'viewport', '--dsf': 'dsf', '--fps': 'fps',
    '--cpu-throttle': 'cpuThrottle', '--network': 'network', '--hide': 'hide', '--color-scheme': 'colorScheme',
    '--cookies': 'cookies', '--pause': 'pause', '--timeout': 'timeout', '--tail': 'tail' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.has(a)) { o[a.replace(/^-+/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true; continue; }
    if (a.startsWith('--') && a.includes('=')) { const [k, ...v] = a.split('='); argv.splice(i + 1, 0, v.join('=')); argv[i] = k; i--; continue; }
    if (!keys[a]) die(`不明な引数: ${a}\n${HELP}`);
    if (i + 1 >= argv.length) die(`${a} に値がありません`);
    o[keys[a]] = argv[++i];
  }
  return o;
}
function die(msg) { console.error(msg); process.exit(2); }

// ---------- puppeteer-core と Chrome の解決 ----------
function loadPuppeteer() {
  const home = process.env.PR_EXPLAINER_VIDEO_HOME || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'pr-explainer-video');
  for (const dir of [home, process.cwd()]) {
    try { return createRequire(path.join(dir, 'noop.js'))('puppeteer-core'); } catch (e) { /* 次の候補へ */ }
  }
  die(`puppeteer-core が見つかりません。scripts/setup.sh を実行してください（探した場所: ${home}/node_modules, ${process.cwd()}/node_modules）`);
}
function findChrome() {
  const cands = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    try { const p = execFileSync('which', [name], { encoding: 'utf8' }).trim(); if (p) return p; } catch (e) { /* 次へ */ }
  }
  die('Chrome が見つかりません。CHROME_PATH に実行ファイルを指定してください');
}

const NETWORK = {
  fast3g: { offline: false, latency: 562, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(750 * 1024 / 8) },
  slow3g: { offline: false, latency: 2000, downloadThroughput: Math.round(500 * 1024 / 8), uploadThroughput: Math.round(500 * 1024 / 8) },
};

// JPEG の SOF から画素数を読む
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => Math.round(x * 10) / 10;

(async () => {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help || opt.h) { console.log(HELP); return; }
  for (const k of ['url', 'flow', 'out']) if (!opt[k]) die(`--${k} は必須です\n${HELP}`);
  const m = /^(\d+)x(\d+)$/.exec(opt.viewport);
  if (!m) die(`--viewport は 1600x900 の形式で指定してください: ${opt.viewport}`);
  const vw = +m[1], vh = +m[2], dsf = Number(opt.dsf), fps = Number(opt.fps);
  const cpu = Number(opt.cpuThrottle), pauseMs = Number(opt.pause), timeoutMs = Number(opt.timeout), tailMs = Number(opt.tail);
  if (opt.network !== 'none' && !NETWORK[opt.network]) die(`--network は fast3g | slow3g | none: ${opt.network}`);
  if (opt.colorScheme && !['light', 'dark'].includes(opt.colorScheme)) die('--color-scheme は light | dark');
  const out = path.resolve(opt.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const flowPath = path.resolve(opt.flow);
  if (!fs.existsSync(flowPath)) die(`flow が見つかりません: ${flowPath}`);

  const puppeteer = loadPuppeteer();
  const flow = (await import(pathToFileURL(flowPath).href)).default;
  if (typeof flow !== 'function') die('flow は export default async function (page, h) { ... } の形にしてください');

  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: !opt.headful, defaultViewport: null,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', `--force-device-scale-factor=${dsf}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', `--window-size=${vw},${vh + (opt.headful ? 120 : 0)}`],
  });
  const page = await browser.newPage();
  const frames = []; // { ts(秒, 録画開始から), buf }
  let t0 = 0;
  const now = () => Date.now() / 1000 - t0;
  let failed = null;
  const actions = [];
  let total = 0;

  try {
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: dsf });
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    if (opt.noCache) await page.setCacheEnabled(false);
    if (opt.colorScheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opt.colorScheme }]);
    page.setDefaultTimeout(timeoutMs);

    const css = `${opt.hide ? `${opt.hide}{display:none!important}` : ''}::-webkit-scrollbar{display:none!important}html{scrollbar-width:none!important}`;
    await page.evaluateOnNewDocument((cssText) => {
      const add = () => {
        const target = document.head || document.documentElement;
        if (!target) return false;
        if (!document.getElementById('__rec_style')) {
          const s = document.createElement('style'); s.id = '__rec_style'; s.textContent = cssText; target.appendChild(s);
        }
        return true;
      };
      if (!add()) { const mo = new MutationObserver(() => { if (add()) mo.disconnect(); }); mo.observe(document, { childList: true, subtree: true }); }
    }, css);

    if (opt.cookies) {
      let ck = JSON.parse(fs.readFileSync(opt.cookies, 'utf8'));
      if (!Array.isArray(ck)) ck = ck.cookies || [];
      await page.setCookie(...ck.map((c) => (c.url || c.domain ? c : { ...c, url: opt.url })));
    }

    const cdp = await page.createCDPSession();
    if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (opt.network !== 'none') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', NETWORK[opt.network]); }

    cdp.on('Page.screencastFrame', (ev) => {
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
      frames.push({ ts: ev.metadata.timestamp - t0, buf: Buffer.from(ev.data, 'base64') });
    });
    t0 = Date.now() / 1000;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: Math.round(vw * dsf), maxHeight: Math.round(vh * dsf), everyNthFrame: 1 });

    // ---------- h: flow に渡す操作 ----------
    const log = (type, extra = {}) => actions.push({ t: r1000(now()), type, ...extra });
    const r1000 = (x) => Math.round(x * 1000) / 1000;
    const boxOf = async (el) => {
      const b = await el.boundingBox();
      return b ? { x: Math.round(b.x * dsf), y: Math.round(b.y * dsf), w: Math.round(b.width * dsf), h: Math.round(b.height * dsf) } : undefined;
    };
    const pick = async (selector, visible = true) => {
      const el = await page.waitForSelector(selector, { visible, timeout: timeoutMs });
      if (!el) throw new Error(`セレクタが見つかりません: ${selector}`);
      return el;
    };
    const ensureVisible = async (el) => {
      const ok = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
      if (!ok) { await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })); await sleep(150); }
    };
    const center = (b) => ({ x: (b.x + b.w / 2) / dsf, y: (b.y + b.h / 2) / dsf });
    const moveTo = async (el) => {
      await ensureVisible(el);
      const b = await boxOf(el);
      if (!b) throw new Error('要素に大きさがありません');
      const c = center(b);
      await page.mouse.move(c.x, c.y, { steps: 12 });
      return b;
    };
    const smoothScrollTo = (y, dur) => page.evaluate((target, d) => new Promise((res) => {
      const start = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
      const to = Math.max(0, Math.min(max, target)), tStart = performance.now();
      const step = (n) => {
        const p = Math.min(1, (n - tStart) / d), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        window.scrollTo({ top: start + (to - start) * e, behavior: 'instant' });
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    }), y, dur);
    const pause = (o) => sleep(o && o.pause !== undefined ? o.pause : pauseMs);

    const h = {
      now: () => r1000(now()),
      async goto(url, o = {}) {
        log('goto', { label: url });
        await page.goto(url, { waitUntil: o.waitUntil || 'load', timeout: Math.max(timeoutMs, 30000) });
      },
      async click(selector, o = {}) {
        const el = await pick(selector);
        await pause(o);
        const box = await moveTo(el);
        log('click', { selector, box, ...(o.label ? { label: o.label } : {}) });
        const c = center(box);
        await page.mouse.click(c.x, c.y);
      },
      async type(selector, text, o = {}) {
        const el = await pick(selector);
        await pause(o);
        await ensureVisible(el);
        const box = await boxOf(el);
        await el.evaluate((e) => { if (document.activeElement !== e) e.focus(); });
        log('type', { selector, box, label: text });
        const cps = o.cps || 10;
        for (const ch of text) { await page.keyboard.type(ch); await sleep(1000 / cps); }
      },
      async scroll(target, o = {}) {
        await pause(o);
        const dur = o.duration || 700;
        if (typeof target === 'number') {
          log('scroll', { label: `y=${target}` });
          await smoothScrollTo(target, dur);
        } else {
          const el = await pick(target, false);
          const y = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return window.scrollY + r.top - innerHeight / 2 + r.height / 2; });
          log('scroll', { selector: target });
          await smoothScrollTo(y, dur);
          await ensureVisible(el);
          actions[actions.length - 1].box = await boxOf(el);
        }
      },
      async hover(selector, o = {}) {
        const el = await pick(selector);
        await pause(o);
        const box = await moveTo(el);
        log('hover', { selector, box });
      },
      async waitFor(selector, o = {}) {
        const el = await page.waitForSelector(selector, { visible: o.visible !== false, timeout: o.timeout || timeoutMs });
        log('wait', { selector, box: await boxOf(el), ...(o.label ? { label: o.label } : {}) });
      },
      async wait(ms) { log('wait', { label: `${ms}ms` }); await sleep(ms); },
      mark(label) { log('mark', { label }); },
    };

    await h.goto(opt.url);
    await flow(page, h);
    await sleep(tailMs);
    total = now();
    await cdp.send('Page.stopScreencast');
    await sleep(100);
  } catch (e) {
    failed = e;
    console.error(`[record_app] 失敗: ${e && e.message ? e.message : e}`);
    try { await page.screenshot({ path: `${out}.error.png` }); console.error(`[record_app] スクリーンショット: ${out}.error.png`); } catch (e2) { /* 無視 */ }
  }
  await browser.close();
  if (failed) process.exit(1);

  // ---------- コマの固定 fps 化とエンコード ----------
  if (!frames.length) { console.error('[record_app] screencast のコマが 1 枚も届きませんでした'); process.exit(1); }
  const W = Math.round(vw * dsf), H = Math.round(vh * dsf);
  const W2 = Math.ceil(W / 2) * 2, H2 = Math.ceil(H / 2) * 2;
  // 起動直後は viewport の反映前の大きさのコマが混じることがあるので、期待の大きさ以外は捨てる（前のコマが保持される）
  const good = frames.filter((f) => { const sz = jpegSize(f.buf); return sz && sz.w === W && sz.h === H; });
  if (good.length === frames.length) { /* そのまま */ }
  else if (good.length) { console.error(`[record_app] 大きさが ${W}x${H} でないコマを ${frames.length - good.length} 枚捨てました`); frames.splice(0, frames.length, ...good); }
  else console.error(`[record_app] 警告: ${W}x${H} のコマが無いので、届いたコマを拡縮して使います`);
  const N = Math.max(1, Math.ceil(total * fps));
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${W}:${H}:in_range=full:out_range=limited,pad=${W2}:${H2}:0:0:color=white,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-g', '30', '-r', String(fps), '-an', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let ffErr = null;
  ff.stdin.on('error', (e) => { ffErr = e; });
  let k = 0;
  for (let i = 0; i < N; i++) {
    const t = i / fps;
    while (k + 1 < frames.length && frames[k + 1].ts <= t) k++;
    if (!ff.stdin.write(frames[k].buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0 || ffErr) { console.error(`[record_app] ffmpeg が失敗しました (code ${code})`); process.exit(1); }

  const sidecar = {
    fps, width: W2, height: H2, duration: Math.round((N / fps) * 1e6) / 1e6,
    viewport: { width: vw, height: vh, dsf },
    conditions: { cpu_throttle: cpu, network: opt.network },
    actions,
  };
  fs.writeFileSync(out.replace(/\.mp4$/i, '') + '.json', JSON.stringify(sidecar, null, 2) + '\n');
  console.log(`done ${sidecar.duration}s ${W2}x${H2} ${frames.length} source frames -> ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
