// シーン内のアニメーションを Web Animations API で組み立てる。render.js / stills.js が await window.__seek(ms) で時刻を合わせて撮る。
// 時刻は「ステップ」で指定する。step 0 = シーンの頭、step n = n 番目の読み上げの始まり。d は そこからの遅れ（秒）。
// step には AT('#clip', 秒) が返す絶対時刻（録画クリップの時刻に相当するシーン時刻）も渡せる。
// BUILD の中では、同じ要素に対する FOCUS / CUR を時刻の順に書く（直前の状態を起点にするため）。
// 動きの流儀は video.json の "motion" で選ぶ（window.MOTION）。"plain"（既定）は控えめ、"cinematic" は出入りにぼかしと舞台の出入りを付ける。
(function () {
  const TL = window.TL; // { steps: [開始秒], ends: [終了秒], dur }
  const CIN = window.MOTION === 'cinematic';
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const MOVE = 'cubic-bezier(.65,0,.35,1)';
  const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  // ease には名前（'spring' 'move' 'ease'）か CSS の easing 文字列を渡せる
  const EZ = (e) => ({ spring: SPRING, move: MOVE, ease: EASE }[e] || e);
  const B = (px) => `blur(${px}px)`;
  const K = {
    up: [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }],
    down: [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'none' }],
    left: [{ opacity: 0, transform: 'translateX(-60px)' }, { opacity: 1, transform: 'none' }],
    right: [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }],
    pop: [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }],
    zoom: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    out: [{ opacity: 1 }, { opacity: 0 }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    wipeDown: [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    growX: [{ transform: 'scaleX(0)' }, { transform: 'none' }],
    growY: [{ transform: 'scaleY(0)' }, { transform: 'none' }],
    shake: [{ transform: 'none' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'none' }],
    pulse: [{ transform: 'none' }, { transform: 'scale(1.12)' }, { transform: 'none' }],
    // 以下は plain / cinematic の両方で使える
    blurIn: [{ opacity: 0, transform: 'scale(1.06)', filter: B(16) }, { opacity: 1, transform: 'none', filter: B(0) }],
    mask: [{ clipPath: 'inset(0 0 100% 0)', transform: 'translateY(28px)' }, { clipPath: 'inset(0 0 0% 0)', transform: 'none' }],
  };
  let KEASE = {}, DUR = 700, DUR_OUT = 700;
  if (CIN) {
    Object.assign(K, {
      up: [{ opacity: 0, transform: 'translateY(36px)', filter: B(8) }, { opacity: 1, transform: 'none', filter: B(0) }],
      down: [{ opacity: 0, transform: 'translateY(-36px)', filter: B(8) }, { opacity: 1, transform: 'none', filter: B(0) }],
      left: [{ opacity: 0, transform: 'translateX(-56px)', filter: B(8) }, { opacity: 1, transform: 'none', filter: B(0) }],
      right: [{ opacity: 0, transform: 'translateX(56px)', filter: B(8) }, { opacity: 1, transform: 'none', filter: B(0) }],
      pop: [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }],
      zoom: [{ opacity: 0, transform: 'scale(.92)', filter: B(10) }, { opacity: 1, transform: 'none', filter: B(0) }],
      out: [{ opacity: 1, filter: B(0) }, { opacity: 0, filter: B(6) }],
      pulse: [{ transform: 'none' }, { transform: 'scale(1.08)' }, { transform: 'none' }],
    });
    KEASE = { pop: SPRING, growX: 'cubic-bezier(.22,1,.36,1)', growY: 'cubic-bezier(.22,1,.36,1)', out: 'cubic-bezier(.5,0,.75,0)', pulse: 'cubic-bezier(.45,0,.55,1)', shake: 'cubic-bezier(.36,.07,.19,.97)' };
    DUR = 750; DUR_OUT = 450;
  }
  // 時刻（ms）。step は番号か、AT() が返す { ms }
  const T = (step, delay) => (step !== null && typeof step === 'object' ? step.ms : step === 0 ? 0 : TL.steps[step - 1] * 1000) + (delay || 0) * 1000;
  const $ = (s) => (typeof s === 'string' ? [...document.querySelectorAll(s)] : [s]);
  window.T = T;

  // A(step, 対象, キーフレーム名か配列, {d: 遅延秒, dur: ミリ秒, stagger: 秒, ease, fill, composite, iter})
  // キーフレーム名: up down left right pop zoom fade out wipe wipeDown growX growY shake pulse blurIn mask
  window.A = (step, sel, kf, o = {}) => {
    const frames = typeof kf === 'string' ? K[kf] : kf;
    if (!frames) throw new Error(`A: キーフレーム名が無い: ${kf}`);
    $(sel).forEach((el, i) => {
      el.animate(frames, { fill: o.fill || (kf === 'out' ? 'forwards' : 'both'), easing: EZ(o.ease) || KEASE[kf] || EASE, duration: o.dur || (kf === 'out' ? DUR_OUT : DUR),
        delay: T(step, (o.d || 0) + i * (o.stagger || 0)), iterations: o.iter || 1, composite: o.composite || 'replace' });
    });
  };
  // 移動: M(step, sel, [[x,y],...], {d, dur})
  window.M = (step, sel, pts, o = {}) => A(step, sel, pts.map(([x, y]) => ({ transform: `translate(${x}px,${y}px)` })), o);

  // ---- スクリーンショット・録画クリップのカメラ（ズーム・パン）。clip() も shot() と同じ枠なので同じ API が効く ----
  const cams = new Map();
  const vpOf = (shot) => shot.querySelector('.vp');
  const camOf = (shot) => shot.querySelector('.cam');
  const tf = (c) => `translate(${c.tx}px,${c.ty}px) scale(${c.s})`;
  const fit = (shot, r) => {
    const vp = vpOf(shot), W = vp.clientWidth, H = vp.clientHeight;
    const [x, y, w, h] = r, s = Math.min(W / w, H / h);
    return { s, tx: W / 2 - (x + w / 2) * s, ty: H / 2 - (y + h / 2) * s };
  };
  document.querySelectorAll('.shot').forEach((shot) => {
    const lw = Number(shot.dataset.lw), vp = vpOf(shot);
    const view = shot.dataset.view ? JSON.parse(shot.dataset.view) : [0, 0, lw, lw * vp.clientHeight / vp.clientWidth];
    const c = fit(shot, view);
    cams.set(shot, c);
    camOf(shot).style.transform = tf(c);
  });
  // FOCUS(step, '#shot', [x, y, w, h], {d, dur}) : 画像（クリップ）の論理 px の矩形が枠いっぱいに入るよう寄る
  window.FOCUS = (step, sel, r, o = {}) => $(sel).forEach((shot) => {
    const from = cams.get(shot), to = fit(shot, r);
    camOf(shot).animate([{ transform: tf(from) }, { transform: tf(to) }],
      { fill: 'forwards', easing: EZ(o.ease) || MOVE, duration: o.dur || 1400, delay: T(step, o.d) });
    cams.set(shot, to);
  });
  // XY('#shot', ix, iy) : 画像（クリップ）の点が stage のどこに見えるか（直前に書いた FOCUS の状態で計算）。カーソルの行き先に使う
  const offs = (el) => { let x = 0, y = 0; const st = document.querySelector('.stage');
    while (el && el !== st) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return [x, y]; };
  window.XY = (sel, ix, iy) => {
    const shot = $(sel)[0], c = cams.get(shot), [ox, oy] = offs(vpOf(shot));
    return [ox + c.tx + ix * c.s, oy + c.ty + iy * c.s];
  };

  // ---- カーソル ----
  const curPos = new Map();
  // CUR(step, '#cur', [x, y] か [[x,y],...], {d, dur}) : stage の座標へ動かす。最初の呼び出しは初期位置を決める（動かない）
  window.CUR = (step, sel, p, o = {}) => $(sel).forEach((el) => {
    const pts = Array.isArray(p[0]) ? p : [p];
    if (!curPos.has(el)) { el.style.transform = `translate(${pts[0][0]}px,${pts[0][1]}px)`; curPos.set(el, pts[0]); pts.shift(); if (!pts.length) return; }
    const kf = [curPos.get(el), ...pts].map(([x, y]) => ({ transform: `translate(${x}px,${y}px)` }));
    el.animate(kf, { fill: 'forwards', easing: EZ(o.ease) || MOVE, duration: o.dur || 900, delay: T(step, o.d) });
    curPos.set(el, pts[pts.length - 1]);
  });
  // CLICK(step, '#cur', {d}) : 押した波紋
  window.CLICK = (step, sel, o = {}) => $(sel).forEach((el) => {
    el.querySelector('.rip').animate([{ opacity: .95, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: 650, delay: T(step, o.d), fill: 'none', easing: 'ease-out' });
    el.querySelector('svg').animate([{ transform: 'none' }, { transform: 'scale(.82)' }, { transform: 'none' }], { duration: 260, delay: T(step, o.d), fill: 'none' });
  });

  // ---- 線を描く: DRAW(step, sel, {d, dur, stagger}) 。SVG の path / line を stroke-dashoffset で描く（点線・塗りは淡く現れる） ----
  window.DRAW = (step, sel, o = {}) => {
    let k = 0;
    $(sel).forEach((root) => {
      const els = root instanceof SVGGeometryElement ? [root] : [...root.querySelectorAll('path,line,rect,circle,polyline')];
      els.forEach((el) => {
        const delay = T(step, (o.d || 0) + k * (o.stagger || .12)); k++;
        if (el.getAttribute('stroke-dasharray') || el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { fill: 'both', duration: 300, delay, easing: EASE });
          return;
        }
        const len = el.getTotalLength ? el.getTotalLength() : 1000;
        el.style.strokeDasharray = `${len} ${len}`;
        el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { fill: 'both', duration: o.dur || 800, delay, easing: MOVE });
      });
    });
  };
  // ---- カメラ: 舞台全体に寄る・引く。CAM(step, [scale, x, y], {d, dur}) 。x, y は舞台の中の注目点（舞台の座標。既定は中央 880, 398） ----
  const camx = document.querySelector('.camx');
  let camState = { s: 1, x: 880, y: 398 };
  const camT = (c) => `translate(${(880 - c.x) * c.s}px,${(398 - c.y) * c.s}px) scale(${c.s})`;
  window.CAM = (step, v, o = {}) => {
    const to = { s: v[0], x: v[1] === undefined ? 880 : v[1], y: v[2] === undefined ? 398 : v[2] };
    camx.animate([{ transform: camT(camState) }, { transform: camT(to) }], { fill: 'forwards', duration: o.dur || 1600, delay: T(step, o.d), easing: EZ(o.ease) || MOVE });
    camState = to;
  };
  // ---- フォーカス: FP(step, '残す要素', {d, dur}) で、残す要素以外の舞台の要素をぼかして沈める。FPOFF(step, {d}) で戻す ----
  const tops = () => [...camx.children];
  const DIM = 'blur(3px) opacity(.32)', CLR = 'blur(0px) opacity(1)';
  let fpOn = [];
  window.FP = (step, keep, o = {}) => {
    const ks = $(keep);
    const dim = tops().filter((el) => !ks.some((k) => el === k || el.contains(k) || k.contains(el)));
    const t = T(step, o.d);
    fpOn.forEach((el) => { if (!dim.includes(el)) el.animate([{ filter: DIM }, { filter: CLR }], { fill: 'forwards', duration: o.dur || 700, delay: t, easing: MOVE }); });
    dim.forEach((el) => { if (!fpOn.includes(el)) el.animate([{ filter: CLR }, { filter: DIM }], { fill: 'forwards', duration: o.dur || 700, delay: t, easing: MOVE }); });
    fpOn = dim;
  };
  window.FPOFF = (step, o = {}) => { const t = T(step, o.d);
    fpOn.forEach((el) => el.animate([{ filter: DIM }, { filter: CLR }], { fill: 'forwards', duration: o.dur || 700, delay: t, easing: MOVE })); fpOn = []; };

  // ---- 時刻に応じて中身を書き換えるもの（onSeek で毎コマ評価） ----
  const counters = [], typers = [], swaps = new Map();
  // 数字のカウント: C(step, sel, from, to, {d, dur, dec: 小数の桁})
  // ease: 'linear' で等速（経過時間の表示など）。既定は終わりで減速する
  window.C = (step, sel, from, to, o = {}) => $(sel).forEach((el) => counters.push({ el, from, to, dec: o.dec || 0, t0: T(step, o.d), dur: o.dur || 1200, lin: o.ease === 'linear' }));
  // 文字を打つ: TYPE(step, sel, '文字列', {d, cps: 1 秒あたりの字数, caret: true})
  window.TYPE = (step, sel, text, o = {}) => $(sel).forEach((el) => typers.push({ el, text: [...text], t0: T(step, o.d), cps: o.cps || 9, caret: o.caret !== false }));
  // 画像の差し替え: SWAP(step, '#shot', k, {d, fade: ミリ秒}) で k 番目の画像（shot() の frames の順）に替える。既定はカット（fade 0）。fade（上限 300）を付けると、重ねずに枠の地を経由して替える（白く沈んで見えるので、使うのは画面全体が替わるときだけ）
  window.SWAP = (step, sel, k, o = {}) => $(sel).forEach((shot) => {
    if (!swaps.has(shot)) swaps.set(shot, []);
    swaps.get(shot).push({ t: T(step, o.d), k, fade: Math.min(o.fade || 0, 300) });
  });
  // コマ送り: SEQ(step, '#shot', [k, ...], {d, every: 秒}) 。打鍵ごとに撮った画像を順に見せる
  window.SEQ = (step, sel, ks, o = {}) => ks.forEach((k, i) => SWAP(step, sel, k, { d: (o.d || 0) + i * (o.every || .25), fade: o.fade || 0 }));  // コマ送りは既定でカット

  // ---- 録画クリップ（clip()）。コマの再生はリアルタイムではなく、毎コマ currentTime を決めて止める（決定的に撮るため） ----
  const vids = [];
  // VID(step, '#id', {d, from, to, rate}) : T(step, d) からクリップの from 秒を再生し始め、to 秒で止めて最後のコマを保持する。開始前は from のコマ。to 省略はクリップの終わりまで
  window.VID = (step, sel, o = {}) => $(sel).forEach((shot) => {
    const v = shot.tagName === 'VIDEO' ? shot : shot.querySelector('video');
    if (!v) throw new Error(`VID: video が無い: ${sel}`);
    vids.push({ v, t0: T(step, o.d), from: o.from || 0, to: o.to === undefined ? null : o.to, rate: o.rate || 1 });
  });
  // AT('#id', クリップの秒) : そのクリップ時刻に相当するシーン時刻 { ms } を返す。A / CUR / FOCUS / CLICK などの第 1 引数（step）にそのまま渡せる。VID の後に書く
  window.AT = (sel, sec) => {
    const el = $(sel)[0], v = el.tagName === 'VIDEO' ? el : el.querySelector('video');
    const e = vids.filter((x) => x.v === v).pop();
    if (!e) throw new Error(`AT: 先に VID を書く: ${sel}`);
    return { ms: e.t0 + (sec - e.from) * 1000 / e.rate };
  };
  const vidTime = (e, ms) => {
    const dur = e.v.duration, fps = Number(e.v.dataset.fps) || 30;
    const end = e.to === null ? dur : Math.min(e.to, dur);
    const t = Math.min(end, e.from + Math.max(0, ms - e.t0) / 1000 * e.rate);
    const n = Math.min(Math.round(dur * fps) - 1, Math.floor(t * fps + 1e-6));
    return (n + 0.5) / fps;  // コマの中ほどを指す（コマの境目だと前後どちらのコマが出るか不定になる）
  };
  const waitReady = (v) => new Promise((res, rej) => {
    if (v.readyState >= 2) return res();
    v.addEventListener('loadeddata', () => res(), { once: true });
    v.addEventListener('error', () => rej(new Error(`video を読めない: ${v.currentSrc || v.src}`)), { once: true });
    setTimeout(() => rej(new Error(`video の読み込みが終わらない: ${v.currentSrc || v.src}`)), 20000);
  });
  const seekVideo = (v, t) => new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 1e-4 && !v.seeking) return res();
    const to = setTimeout(() => { console.error('video の seek が終わらない', v.src, t); res(); }, 10000);
    v.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true });
    v.currentTime = t;
  });
  const videos = () => [...document.querySelectorAll('video')];
  window.__videosReady = () => Promise.all(videos().map(waitReady));

  const latest = (list, ms) => { const by = new Map();
    list.slice().sort((a, b) => a.t0 - b.t0).forEach((c) => { if (!by.has(c.el) || ms >= c.t0) by.set(c.el, c); }); return by; };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ---- 端末（term()）向け ----
  // SHOW(step, sel, {d, stagger}) : 時刻が来るまで要素を display:none にしておく。端末の行に使うと、新しい行が下に足され、古い行が上へ押し出される
  const shows = [];
  window.SHOW = (step, sel, o = {}) => $(sel).forEach((el, i) => shows.push({ el, t: T(step, (o.d || 0) + i * (o.stagger || 0)) }));
  // HIDE(step, sel, {d}) : 時刻が来たら display:none にする（入力欄の文字を消す、スピナーを消すなど）
  const hides = [];
  window.HIDE = (step, sel, o = {}) => $(sel).forEach((el) => hides.push({ el, t: T(step, o.d) }));
  // STREAM(step, sel, {d, cps}) : 中の HTML の書式（色の span など）を保ったまま、文字を先頭から順に出す
  const streams = [];
  window.STREAM = (step, sel, o = {}) => $(sel).forEach((el) => {
    const nodes = []; const walk = (n) => n.childNodes.forEach((c) => c.nodeType === 3 ? nodes.push({ n: c, full: c.textContent }) : walk(c)); walk(el);
    streams.push({ nodes, t0: T(step, o.d), cps: o.cps || 40 });
  });
  // LINES(step, sel, {d, every}) : ツールの結果のように、書式を保ったまま改行（\n）単位で 1 行ずつ出す。every は 1 行あたりの秒（既定 0.06）
  const lineReveals = [];
  window.LINES = (step, sel, o = {}) => $(sel).forEach((el) => {
    const nodes = []; const walk = (n) => n.childNodes.forEach((c) => c.nodeType === 3 ? nodes.push({ n: c, full: c.textContent }) : walk(c)); walk(el);
    lineReveals.push({ nodes, t0: T(step, o.d), every: (o.every || 0.06) * 1000 });
  });
  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  // 端末の自動スクロール。あふれたときだけ流し、上端で行が半分切れないよう、行の頭に合わせて止める。
  // 行の頭に合わせると最下部より少し先まで送ることがあるので、送れる余白（.tspacer）を末尾に足しておく
  const TOP_GAP = 12;  // 窓の上端から、いちばん上の行の文字までの間（.tw::after の帯で隠す 9 px より少し下）
  const tbodies = [...document.querySelectorAll('.tw .tbody')].filter((b) => b.querySelector('.tscroll'));
  tbodies.forEach((b) => { const sp = document.createElement('div'); sp.className = 'tspacer'; b.appendChild(sp); });
  // トーストが出ている間は、トーストの下端までを中身に含めて送る（会話の行が上へ流れ、トーストは入力欄の下に収まる）。
  // トーストが消えても送り戻さない：トーストを含めて送った位置を、それ以降の下限（toastFloor）にする。
  // 区間に分けて並列に撮っても同じ位置になるよう、下限は時刻だけで決める（最初の __seek で各コマの送り量を先に求める）
  const FRAME = 1000 / 30;
  const toastFloor = new Map();  // tbody → [[ms, トーストを含めた送り量], ...]
  const toastShown = (b) => [...b.querySelectorAll('.ttoast')].some((t) => {
    const cs = getComputedStyle(t); return cs.display !== 'none' && parseFloat(cs.opacity) > 0.01; });
  const scrollTerm = (b, ms, rec) => {
    b.scrollTop = 0;
    // 中身の下端（余白 .tspacer を除く。トーストは出ているときだけ含める）
    const top0 = b.getBoundingClientRect().top, withToast = toastShown(b);
    let bottom = 0;
    for (const c of b.children) {
      if (c.classList.contains('tspacer') || (!withToast && c.classList.contains('ttoasts'))) continue;
      bottom = Math.max(bottom, c.getBoundingClientRect().bottom - top0);
    }
    const need = bottom + parseFloat(getComputedStyle(b).paddingBottom) - b.clientHeight;
    let st = need > 0 ? scrollAt(b, need, top0, []) : 0;
    if (rec) { if (withToast && st > 0) rec.push([ms, st]); }
    else (toastFloor.get(b) || []).forEach(([t, v]) => { if (t <= ms + 0.5) st = Math.max(st, v); });
    // トーストを消した後は送れる量が減るので、下限まで送れるよう余白を伸ばす
    const sp = b.querySelector('.tspacer'); sp.style.height = '';
    const lack = st - (b.scrollHeight - b.clientHeight);
    if (lack > 0) sp.style.height = `${sp.offsetHeight + Math.ceil(lack)}px`;
    b.scrollTop = st;
  };
  const scrollAt = (b, need, top0, cands) => {
    const sc = b.querySelector('.tscroll');
    // 行の頭の候補：表示されている文字の各行（折り返しを含む）と、行の要素・表の行・コードの行の上端
    const tw = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim()) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.height > 0) cands.push(r.top - top0 - TOP_GAP);
    }
    sc.querySelectorAll('.tl, tr, .cr').forEach((el) => { const r = el.getBoundingClientRect(); if (r.height > 0) cands.push(r.top - top0 - TOP_GAP + 2); });
    // 囲みの枠（.hlb）の下端が、上端の帯（9 px）のすぐ下に細く覗く位置では止めない
    const edges = [...sc.querySelectorAll('.hlb')].map((el) => el.parentElement.getBoundingClientRect())
      .filter((r) => r.height > 0).map((r) => r.bottom - top0);
    const peeks = (c) => edges.some((e) => e - c > 8.5 && e - c < 18);
    const ok = cands.filter((c) => c >= need - 0.5 && !peeks(c));
    return Math.round(ok.length ? Math.min(...ok) : need);
  };

  window.onSeek = (ms) => {
    latest(counters, ms).forEach((c) => {
      const p = Math.min(1, Math.max(0, (ms - c.t0) / c.dur)), e = c.lin ? p : 1 - Math.pow(1 - p, 3);
      c.el.textContent = (c.from + (c.to - c.from) * e).toLocaleString('en-US', { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
    });
    latest(typers, ms).forEach((c) => {
      const n = ms < c.t0 ? 0 : Math.min(c.text.length, Math.floor((ms - c.t0) / 1000 * c.cps) + 1);
      const done = n >= c.text.length && ms >= c.t0;
      const blink = done ? Math.floor((ms - c.t0) / 530) % 2 === 0 : true;
      c.el.innerHTML = esc(c.text.slice(0, n).join('')) + (c.caret && ms >= c.t0 && blink ? '<span class="caret"></span>' : '');
    });
    swaps.forEach((ev, shot) => {
      const fr = shot.querySelectorAll('.cam img.fr');
      const done = ev.filter((e) => e.t <= ms).sort((a, b) => a.t - b.t);
      const cur = done[done.length - 1], prev = done[done.length - 2];
      // fade があるときは重ねずに、前の画像を前半で消し、後半で次の画像を出す（白い枠の地を経由する）
      fr.forEach((img, k) => {
        let op = 0, z = 0;
        if (!cur) op = k === 0 ? 1 : 0;
        else if (k === cur.k) { op = cur.fade ? Math.min(1, Math.max(0, (ms - cur.t) / (cur.fade / 2) - 1)) : 1; z = 2; }
        else if (k === (prev ? prev.k : 0) && cur.fade && ms - cur.t < cur.fade / 2) { op = 1 - (ms - cur.t) / (cur.fade / 2); z = 1; }
        img.style.opacity = op; img.style.zIndex = z;
      });
    });
    shows.forEach((c) => { if (!c.el.dataset.disp) c.el.dataset.disp = getComputedStyle(c.el).display === 'none' ? 'block' : getComputedStyle(c.el).display; });
    const vis = new Map();
    shows.forEach((c) => { const v = ms >= c.t; vis.set(c.el, (vis.get(c.el) || false) || v); });
    hides.forEach((c) => { if (ms >= c.t) vis.set(c.el, false); else if (!vis.has(c.el)) vis.set(c.el, true); });
    vis.forEach((v, el) => { el.style.display = v ? (el.dataset.disp || '') : 'none'; });
    streams.forEach((c) => {
      let left = ms < c.t0 ? 0 : Math.floor((ms - c.t0) / 1000 * c.cps);
      c.nodes.forEach((x) => { const chars = [...x.full]; const k = Math.max(0, Math.min(chars.length, left)); x.n.textContent = chars.slice(0, k).join(''); left -= chars.length; });
    });
    lineReveals.forEach((c) => {
      let lines = ms < c.t0 ? 0 : Math.floor((ms - c.t0) / c.every) + 1;
      c.nodes.forEach((x) => {
        if (lines <= 0) { x.n.textContent = ''; return; }
        const chars = [...x.full]; let k = 0;
        for (; k < chars.length; k++) { if (chars[k] === '\n' && --lines === 0) break; }
        x.n.textContent = chars.slice(0, k).join('');
      });
    });
    tbodies.forEach((b) => scrollTerm(b, ms, recs && recs.get(b)));  // 端末は最新の行が見えるよう送る（あふれたときだけ、行の頭に合わせて）
    document.querySelectorAll('.spin').forEach((el) => { el.textContent = SPIN[Math.floor(ms / 110) % SPIN.length]; });
    // 考え中の印の経過秒（SHOW で出した時刻から数える。SHOW が無ければシーンの頭から）
    document.querySelectorAll('.tspin .sec').forEach((el) => {
      const sp = el.closest('.tspin'); let t0 = 0;
      shows.forEach((c) => { if (c.el === sp && c.t <= ms) t0 = Math.max(t0, c.t); });
      el.textContent = `${Math.max(0, Math.floor((ms - t0) / 1000))}s · `;
    });
    // 字幕：いまのステップの文だけを出す。前の文を 0.15 秒で消し切ってから、次の文を 0.15 秒で出す（重ならない）
    const s = ms / 1000, F = 0.15, cl = (x) => Math.min(1, Math.max(0, x));
    document.querySelectorAll('.capline').forEach((el, i) => {
      const a = TL.steps[i] - F, b = TL.ends[i] - F;   // 出し始め / 消し終わり（次の文の出し始めと同じ時刻）
      const op = cl((s - a) / F) * cl((b - s) / F);
      el.style.opacity = op;
      if (CIN) el.style.transform = `translateX(-50%) translateY(${(1 - cl((s - a) / (F * 2))) * 12}px)`;
    });
  };
  // 時刻を戻しても効くよう、アニメーションは作った直後に控えておく（fill:'none' のものは終わると getAnimations() に出なくなる）
  let anims = [];
  const seek0 = (ms) => {
    const all = new Set([...anims, ...document.getAnimations()]); anims = [...all];
    anims.forEach((a) => { a.pause(); a.currentTime = ms; }); window.onSeek(ms);
  };
  let recs = null, floorsReady = false;
  const buildFloors = () => {  // 字体の読み込みを待ってから求める（render.js / stills.js は fonts.ready の後に __seek する）
    floorsReady = true;
    const tb = tbodies.filter((b) => b.querySelector('.ttoast'));
    if (!tb.length) return;
    recs = new Map(tb.map((b) => [b, []]));
    for (let i = 0; i * FRAME <= (TL.dur + 1) * 1000; i++) seek0(i * FRAME);
    recs.forEach((v, b) => toastFloor.set(b, v));
    recs = null;
  };
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // __seek(ms) : 時刻 ms のコマに合わせる。Promise を返す。video があるときは全クリップの seeked と 2 回の rAF を待ってから resolve する
  window.__seek = async (ms) => {
    if (!floorsReady) buildFloors();
    seek0(ms);
    if (vids.length || videos().length) {
      await window.__videosReady();
      const want = new Map();
      latest(vids.map((e) => ({ ...e, el: e.v })), ms).forEach((e, v) => want.set(v, vidTime(e, ms)));
      await Promise.all(videos().map((v) => seekVideo(v, want.has(v) ? want.get(v) : 0.5 / (Number(v.dataset.fps) || 30))));
    }
    await raf2();
  };

  // 共通の入り。cinematic は、舞台が右からぼけて入り、終わりに左へ抜け、全体がゆっくり寄る
  const END = TL.dur * 1000;
  if (CIN) {
    const st = document.querySelector('.stage');
    st.animate([{ opacity: 0, translate: '90px 0', filter: B(12) }, { opacity: 1, translate: '0 0', filter: B(0) }], { fill: 'both', duration: 750, delay: 0, easing: EASE });
    st.animate([{ opacity: 1, translate: '0 0', filter: B(0) }, { opacity: 0, translate: '-90px 0', filter: B(12) }], { fill: 'forwards', duration: 420, delay: END - 420, easing: 'cubic-bezier(.55,0,.8,.2)' });
    document.querySelector('.cam3').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }], { fill: 'both', duration: END, delay: 0, easing: 'cubic-bezier(.45,0,.55,1)' });
    A(0, '.top', 'mask', { d: 0.1, dur: 800 });
    A(0, '.badge', 'pop', { d: 0.35 });
    ['.top', '.badge'].forEach((q) => $(q).forEach((el) => el.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '-40px 0' }], { fill: 'forwards', duration: 400, delay: END - 420, easing: 'cubic-bezier(.55,0,.8,.2)' })));
  } else {
    A(0, '.top', 'down', { d: 0.1, dur: 800 });
    A(0, '.badge', 'pop', { d: 0.3 });
  }
  if (window.BUILD) window.BUILD();
  anims = document.getAnimations();
  window.__ready = true;
})();
