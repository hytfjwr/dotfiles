// 箱どうしを矢印でつなぐ。<script type="application/json" id="wires"> に配列で書く。
//   {"from": "a", "to": "b"}                         a の id から b の id へ
//   "kind":  "ink"（既定）| "ng"（赤、違反や拒否）| "ok"（緑）| "muted"（灰色）| "accent"（青）
//   "dash":  true で破線
//   "route": "elbow"（既定、直角に折る）| "straight" | "curve"
//   "from_side" / "to_side": "top" | "right" | "bottom" | "left"（省略時は位置関係から選ぶ）
//   "offset": 同じ向きの辺どうし（"from_side" と "to_side" が同じ）をつなぐとき、外側へ回る距離（既定 40）
//   "at":    0〜1。from 側の端の位置（既定 0.5）。同じ辺から複数出すときにずらす。"to_at" も同じ
//   "label": 線の中ほどに置く短いラベル。"label_at": 0〜1 で位置をずらす（既定 0.5）
//   "cross": true で中ほどに丸い × を置く（通らない、違反）
//   "num":   × の右上に置く番号（図の下の .key と対応させる）
//   {"from": "a", "stub": true}                      行き先の無い短い破線と × （届かなくなったもの）。"stub": 数値で長さ
// 描き終わると window.figReady が解決する（figtool.py はこれを待って検査と撮影をする）。
(function () {
  const COLORS = { ink: "#475569", ng: "#c62828", ok: "#15803d", muted: "#b6c0cc", accent: "#1d4ed8" };
  const NS = "http://www.w3.org/2000/svg";

  function side(r, s, at) {
    const t = at == null ? 0.5 : at;
    if (s === "top") return { x: r.left + r.width * t, y: r.top, nx: 0, ny: -1 };
    if (s === "bottom") return { x: r.left + r.width * t, y: r.bottom, nx: 0, ny: 1 };
    if (s === "left") return { x: r.left, y: r.top + r.height * t, nx: -1, ny: 0 };
    return { x: r.right, y: r.top + r.height * t, nx: 1, ny: 0 };
  }

  // 縦に重なる区間があれば上下の辺、無ければ左右の辺でつなぐ
  function autoSides(a, b) {
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (overlapX <= 0) return b.left >= a.right ? ["right", "left"] : ["left", "right"];
    return b.top >= a.bottom ? ["bottom", "top"] : ["top", "bottom"];
  }

  function pathFor(p, q, route, offset) {
    const gap = 3; // 矢じりが枠に刺さらないよう手前で止める
    const ex = q.x + q.nx * gap, ey = q.y + q.ny * gap;
    if (route === "straight") return `M${p.x},${p.y} L${ex},${ey}`;
    if (route === "curve") {
      const k = Math.max(40, Math.hypot(ex - p.x, ey - p.y) / 2.5);
      return `M${p.x},${p.y} C${p.x + p.nx * k},${p.y + p.ny * k} ${ex + q.nx * k},${ey + q.ny * k} ${ex},${ey}`;
    }
    const horizontalOut = p.nx !== 0, horizontalIn = q.nx !== 0;
    if (horizontalOut && horizontalIn) {
      // 同じ向きの辺どうし（右から右など）は、外側を回る
      const mx = p.nx === q.nx ? (p.nx > 0 ? Math.max(p.x, ex) : Math.min(p.x, ex)) + p.nx * (offset || 40) : (p.x + ex) / 2;
      return `M${p.x},${p.y} H${mx} V${ey} H${ex}`;
    }
    if (!horizontalOut && !horizontalIn) {
      const my = p.ny === q.ny ? (p.ny > 0 ? Math.max(p.y, ey) : Math.min(p.y, ey)) + p.ny * (offset || 40) : (p.y + ey) / 2;
      return `M${p.x},${p.y} V${my} H${ex} V${ey}`;
    }
    if (horizontalOut) return `M${p.x},${p.y} H${ex} V${ey}`;
    return `M${p.x},${p.y} V${ey} H${ex}`;
  }

  function draw() {
    const spec = document.getElementById("wires");
    const fig = document.querySelector(".fig");
    if (!spec || !fig) return;
    const wires = JSON.parse(spec.textContent);
    const base = fig.getBoundingClientRect();
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "wires");
    svg.setAttribute("width", base.width);
    svg.setAttribute("height", base.height);
    const defs = document.createElementNS(NS, "defs");
    for (const [k, c] of Object.entries(COLORS)) {
      const m = document.createElementNS(NS, "marker");
      m.setAttribute("id", "wire-" + k);
      m.setAttribute("viewBox", "0 0 10 10");
      m.setAttribute("refX", "9"); m.setAttribute("refY", "5");
      m.setAttribute("markerWidth", "7"); m.setAttribute("markerHeight", "7");
      m.setAttribute("orient", "auto-start-reverse");
      const tip = document.createElementNS(NS, "path");
      tip.setAttribute("d", "M0,0 L10,5 L0,10 z");
      tip.setAttribute("fill", c);
      m.appendChild(tip);
      defs.appendChild(m);
    }
    svg.appendChild(defs);
    fig.appendChild(svg);

    const rel = el => {
      const r = el.getBoundingClientRect();
      return { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top, width: r.width, height: r.height };
    };
    // 行き先の無い短い破線の先に × を置く（届かなくなった、取り上げた）
    function drawStub(w) {
      const a = document.getElementById(w.from);
      if (!a) { (window.figErrors = window.figErrors || []).push(`矢印の id が無い: ${w.from}`); return; }
      const p = side(rel(a), w.from_side || "right", w.at);
      const len = w.stub === true ? 18 : w.stub;
      const cx = p.x + p.nx * (len + 12), cy = p.y + p.ny * (len + 12);
      (window.figMarks = window.figMarks || []).push({x: cx, y: cy, r: 9, from: w.from});
      const g = document.createElementNS(NS, "g");
      g.innerHTML = `<path class="wire" d="M${p.x},${p.y} L${p.x + p.nx * len},${p.y + p.ny * len}" stroke="${COLORS.muted}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>` +
        `<path d="M${cx - 8},${cy - 8} L${cx + 8},${cy + 8} M${cx + 8},${cy - 8} L${cx - 8},${cy + 8}" stroke="${COLORS.ng}" stroke-width="3" stroke-linecap="round"/>`;
      g.firstChild.dataset.from = w.from;
      g.firstChild.dataset.to = "";
      svg.appendChild(g);
    }
    for (const w of wires) {
      if (w.stub) { drawStub(w); continue; }
      const a = document.getElementById(w.from), b = document.getElementById(w.to);
      if (!a || !b) { (window.figErrors = window.figErrors || []).push(`矢印の id が無い: ${w.from} -> ${w.to}`); continue; }
      const ra = rel(a), rb = rel(b);
      const [sa, sb] = autoSides(ra, rb);
      const p = side(ra, w.from_side || sa, w.at), q = side(rb, w.to_side || sb, w.to_at);
      const kind = w.kind || "ink";
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", pathFor(p, q, w.route || "elbow", w.offset));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", COLORS[kind]);
      path.setAttribute("stroke-width", kind === "muted" ? "2" : "2.5");
      if (w.dash) path.setAttribute("stroke-dasharray", "7 6");
      path.setAttribute("marker-end", `url(#wire-${kind})`);
      path.setAttribute("class", "wire");
      path.dataset.from = w.from;
      path.dataset.to = w.to;
      svg.appendChild(path);

      const len = path.getTotalLength();
      if (w.cross) {
        const c = path.getPointAtLength(len * (w.cross_at == null ? 0.5 : w.cross_at));
        (window.figMarks = window.figMarks || []).push({x: c.x, y: c.y, r: 15, from: w.from, to: w.to});
        const g = document.createElementNS(NS, "g");
        g.innerHTML = `<circle cx="${c.x}" cy="${c.y}" r="14" fill="#fff" stroke="${COLORS.ng}" stroke-width="2.5"/>` +
          `<path d="M${c.x - 6},${c.y - 6} L${c.x + 6},${c.y + 6} M${c.x + 6},${c.y - 6} L${c.x - 6},${c.y + 6}" stroke="${COLORS.ng}" stroke-width="2.5" stroke-linecap="round"/>`;
        svg.appendChild(g);
        if (w.num) {
          const n = document.createElement("div");
          n.className = "wire-num";
          n.textContent = w.num;
          n.style.left = (c.x + 26) + "px";
          n.style.top = (c.y - 18) + "px";
          fig.appendChild(n);
        }
      }
      if (w.label) {
        const c = path.getPointAtLength(len * (w.label_at == null ? 0.5 : w.label_at));
        const t = document.createElement("div");
        t.className = "wire-label";
        t.textContent = w.label;
        t.style.color = COLORS[kind] === COLORS.muted ? "#64748b" : COLORS[kind];
        t.style.left = c.x + "px";
        t.style.top = (c.y - 6) + "px";
        fig.appendChild(t);
      }
    }
  }

  window.figReady = (document.fonts ? document.fonts.ready : Promise.resolve()).then(draw);
})();
