#!/usr/bin/env python3
"""PR 解説図（HTML）の検査と PNG 化。

  figtool.py new    <dir>/<name>.html [--like layers|before-after|steps]
                                          雛形（--like なら例）から図を 1 枚作り、base.css と wires.js を同じ所に置く
  figtool.py check  fig.html [...]        headless Chrome で配置、文字、体裁を検査する
  figtool.py render fig.html [...]        fig.png（2 倍、添付用）と fig.gh.png（GitHub の表示幅）を書く

check は問題ごとに 1 行を出し、ERROR が 1 件でもあれば終了コード 1 を返す。
WARN は意図した配置でも出るので、PNG を見て判断する。
Chrome の場所は環境変数 CHROME で上書きできる。標準ライブラリのみで動く。
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
GITHUB_WIDTH = 880  # PR 本文の画像の表示幅（デスクトップ）
FIG_WIDTH = 1000  # .fig の幅。base.css と揃える
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
]


def find_chrome() -> str:
    env = os.environ.get("CHROME")
    if env:
        return env
    for c in CHROME_CANDIDATES:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        if not os.path.isabs(c) and shutil.which(c):
            return shutil.which(c)  # type: ignore[return-value]
    sys.exit("Chrome が見つからない。環境変数 CHROME にパスを指定する")


def run_chrome(args: list[str], done, timeout: float = 60) -> str:
    """Chrome は出力を書いた後も終了しないことがあるので、done() が真になったら殺す。stdout を返す。"""
    profile = tempfile.mkdtemp(prefix="figtool-chrome-")
    cmd = [
        find_chrome(),
        "--headless=new",
        f"--user-data-dir={profile}",
        "--disable-gpu",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
        "--virtual-time-budget=5000",
        *args,
    ]
    out_path = Path(profile) / "stdout.txt"
    with open(out_path, "wb") as out:
        p = subprocess.Popen(cmd, stdout=out, stderr=subprocess.DEVNULL)
        start = time.time()
        while time.time() - start < timeout:
            if done(out_path) or p.poll() is not None:
                break
            time.sleep(0.3)
        time.sleep(0.3)
        if p.poll() is None:
            p.kill()
            p.wait()
    text = out_path.read_text(errors="replace")
    shutil.rmtree(profile, ignore_errors=True)
    return text


CHECK_JS = r"""
<script>
(window.figReady || Promise.resolve()).then(() => setTimeout(function () {
  const out = [];
  const add = (lvl, kind, msg) => out.push([lvl, kind, msg]);
  const fig = document.querySelector('.fig');
  const result = document.createElement('pre');
  result.id = 'figtool-result';
  if (!fig) { add('ERROR', 'structure', '.fig が無い（template.html から作る）'); result.textContent = JSON.stringify({issues: out}); document.body.appendChild(result); return; }
  const F = fig.getBoundingClientRect();
  for (const e of (window.figErrors || [])) add('ERROR', 'wires', e);
  if (document.documentElement.scrollWidth > F.width + 1)
    add('ERROR', 'canvas', `横幅が ${F.width}px を超える（${document.documentElement.scrollWidth}px）`);

  // 文字の断片を集める
  const SENTENCE_OK = '.detail, .note, .caption, .subtitle, .eyebrow';
  const items = [];
  const walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode, text = n.nodeValue.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (el.closest('script, style, #figtool-result')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter(x => x.width > 0.5 && x.height > 0.5);
    if (!rects.length) continue;
    items.push({el, text, rects, prose: !!el.closest(SENTENCE_OK), title: !!el.closest('.title')});
  }
  const label = s => s.replace(/\s+/g, ' ').slice(0, 28);
  const wlen = s => [...s.replace(/\s/g, '')].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 0.5 : 1), 0);

  // 1. 文字の大きさ
  const small = {};
  for (const it of items) {
    const fs = parseFloat(getComputedStyle(it.el).fontSize);
    if (fs < 15) (small[fs] = small[fs] || []).push(label(it.text));
  }
  for (const [fs, ex] of Object.entries(small))
    add('ERROR', 'font-size', `${fs}px は GitHub の表示幅で ${(fs * 0.88).toFixed(1)}px になる（15px 以上にする）: ${ex.length} 件、例「${ex[0]}」`);

  // 2. はみ出し、重なり
  const inter = (a, b, pad) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > pad && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > pad;
  for (const it of items) for (const r of it.rects)
    if (r.left < F.left - 0.5 || r.right > F.right + 0.5 || r.top < F.top - 0.5 || r.bottom > F.bottom + 0.5) { add('ERROR', 'canvas', `文字が図の外にはみ出す: 「${label(it.text)}」`); break; }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (items[i].rects.some(a => items[j].rects.some(b => inter(a, b, 2))))
      add('ERROR', 'text-overlap', `文字が重なる: 「${label(items[i].text)}」と「${label(items[j].text)}」`);
  }
  const BOX = '.node, .card, .pill, .badge, .tag, .lane, .note';
  for (const box of fig.querySelectorAll(BOX)) {
    if (box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1)
      add('ERROR', 'box-overflow', `中身が箱からはみ出す: 「${label(box.textContent)}」`);
  }
  for (const it of items) {
    const box = it.el.closest(BOX); if (!box) continue;
    const b = box.getBoundingClientRect();
    if (it.rects.some(r => r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5))
      add('ERROR', 'box-overflow', `文字が箱からはみ出す: 「${label(it.text)}」`);
  }

  // 3. 矢印が文字や関係の無い箱を横切る
  const nodes = [...fig.querySelectorAll('.node, .pill, .badge, .tag')];
  for (const p of fig.querySelectorAll('svg.wires path.wire')) {
    const len = p.getTotalLength(), pts = [];
    for (let d = 0; d <= len; d += 3) { const q = p.getPointAtLength(d); pts.push({x: q.x + F.left, y: q.y + F.top}); }
    const inside = (q, r, pad) => q.x > r.left + pad && q.x < r.right - pad && q.y > r.top + pad && q.y < r.bottom - pad;
    const hit = new Set();
    for (const it of items) if (it.rects.some(r => pts.some(q => inside(q, r, 1)))) hit.add(label(it.text));
    for (const h of hit) add('ERROR', 'wire-over-text', `矢印が文字を横切る（${p.dataset.from} → ${p.dataset.to}）: 「${h}」`);
    const from = document.getElementById(p.dataset.from), to = document.getElementById(p.dataset.to);
    for (const n of nodes) {
      if (n === from || n === to || n.contains(from) || n.contains(to) || (from && from.contains(n)) || (to && to.contains(n))) continue;
      if (pts.some(q => inside(q, n.getBoundingClientRect(), 2)))
        add('ERROR', 'wire-over-box', `矢印が関係の無い箱を横切る（${p.dataset.from} → ${p.dataset.to}）: 「${label(n.textContent)}」`);
    }
  }

  for (const lab of fig.querySelectorAll('.wire-label, .wire-num')) {
    const r = lab.getBoundingClientRect();
    for (const n of nodes) if (inter(r, n.getBoundingClientRect(), 1))
      add('ERROR', 'label-over-box', `矢印のラベルが箱にかぶる: 「${label(lab.textContent)}」と「${label(n.textContent)}」。線を長くするか、ラベルを箱の中の .pill にする`);
  }

  for (const m of (window.figMarks || [])) {
    const r = {left: m.x - m.r + F.left, right: m.x + m.r + F.left, top: m.y - m.r + F.top, bottom: m.y + m.r + F.top};
    for (const n of nodes) if (n.id !== m.from && n.id !== m.to && inter(r, n.getBoundingClientRect(), 1))
      add('ERROR', 'mark-over-box', `× が箱にかぶる（${m.from}）: 「${label(n.textContent)}」`);
    for (const it of items) if (it.rects.some(x => inter(r, x, 1)))
      add('ERROR', 'mark-over-text', `× が文字にかぶる（${m.from}）: 「${label(it.text)}」`);
  }

  // 識別子（空白の無い英数字と _ . / -）が途中で折り返していないか
  for (const it of items) {
    if (!/^[\w.\/:-]+$/.test(it.text) || it.text.length < 6) continue;
    const tops = new Set(it.rects.map(r => Math.round(r.top)));
    if (tops.size > 1) add('ERROR', 'identifier-wrap', `識別子が途中で折り返す（列を広げるか、white-space: nowrap にするか、短い名前にする）: 「${label(it.text)}」`);
  }

  for (const br of fig.querySelectorAll('br')) {
    const prev = br.previousSibling;
    if (prev && prev.nodeType === 3 && /[\w][_.\/-]$/.test(prev.nodeValue.trim()))
      add('ERROR', 'identifier-wrap', `識別子を <br> で折っている（列を減らすか、短い名前にする）: 「${label(prev.nodeValue)}」`);
  }

  // 4. 文字量と文の置き場所
  let total = 0, prose = 0;
  for (const it of items) {
    const w = wlen(it.text); total += w; if (it.prose) prose += w;
    if (/。/.test(it.text) && !it.prose)
      add('ERROR', 'sentence', `文は .detail / .note / .caption に置く（箱やラベルに書かない）: 「${label(it.text)}」`);
    if (!it.prose && !it.title && w > 24)
      add('WARN', 'label-length', `ラベルが ${w.toFixed(0)} 字。短くするか .detail に移す: 「${label(it.text)}」`);
    if (/・/.test(it.text)) add('WARN', 'nakaguro', `日本語の並列に中黒を使わない（読点か " / "）: 「${label(it.text)}」`);
    if (/[\u{1F300}-\u{1FAFF}☀-✒✙-➿]/u.test(it.text)) add('ERROR', 'emoji', `絵文字を使わない: 「${label(it.text)}」`);
  }
  if (total > 450) add('ERROR', 'density', `文字量 ${total.toFixed(0)} 字（上限 450、半角は 0.5 字）。説明は PR 本文へ移し、形と色で見せる`);
  if (total > 0 && prose / total > 0.5) add('WARN', 'density', `文（.detail など）が文字量の ${Math.round(prose / total * 100)}% を占める。図が主役になっているか確かめる`);

  // 5. 体裁
  for (const el of fig.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const bw = s => parseFloat(cs['border' + s + 'Width']);
    for (const [s, others] of [['Left', ['Right', 'Top', 'Bottom']], ['Right', ['Left', 'Top', 'Bottom']]])
      if (bw(s) >= 3 && others.every(o => bw(o) < 1)) { add('ERROR', 'side-stripe', `片側だけの色の太線を使わない: 「${label(el.textContent)}」`); break; }
    if (/gradient/.test(cs.backgroundImage)) add('ERROR', 'gradient', `グラデーションを使わない: 「${label(el.textContent)}」`);
    if (cs.boxShadow && cs.boxShadow !== 'none') add('WARN', 'shadow', `影を使わない: 「${label(el.textContent)}」`);
  }
  for (const el of document.querySelectorAll('img[src^="http"], link[href^="http"], script[src^="http"]'))
    add('ERROR', 'external', `外部の資源を読まない: ${el.getAttribute('src') || el.getAttribute('href')}`);

  result.textContent = JSON.stringify({height: Math.ceil(F.height), chars: Math.round(total), issues: out});
  document.body.appendChild(result);
}, 50));
</script>
"""


def inspect(page: Path) -> dict:
    """検査用の写しを同じディレクトリに作って Chrome で開き、結果の JSON を返す。"""
    src = page.read_text()
    probe = page.with_name(f".figtool-{page.stem}.html")
    probe.write_text(src.replace("</body>", CHECK_JS + "</body>") if "</body>" in src else src + CHECK_JS)
    try:
        dom = run_chrome([f"--window-size={FIG_WIDTH},2000", "--force-device-scale-factor=1", "--dump-dom", probe.as_uri()],
                         done=lambda p: "</html>" in p.read_text(errors="replace"))
    finally:
        probe.unlink(missing_ok=True)
    m = re.search(r'<pre id="figtool-result">(.*?)</pre>', dom, re.S)
    if not m:
        return {"height": 0, "chars": 0, "issues": [["ERROR", "load", "Chrome から結果を取れなかった（HTML の構文、base.css と wires.js の置き場所を確かめる）"]]}
    return json.loads(html.unescape(m.group(1)))


def cmd_check(paths: list[Path]) -> int:
    errors = 0
    for p in paths:
        r = inspect(p.resolve())
        issues = sorted({f"{lvl} {kind}: {msg}" for lvl, kind, msg in r["issues"]})
        print(f"== {p}  (高さ {r['height']}px、文字量 {r['chars']} 字、{len(issues)} 件)")
        for i in issues:
            print("  " + i)
        errors += sum(i.startswith("ERROR") for i in issues)
    print(f"\nERROR {errors} 件" if errors else "\nERROR 0 件。PNG を見て最終確認する")
    return 1 if errors else 0


def cmd_render(paths: list[Path]) -> int:
    for p in paths:
        p = p.resolve()
        height = inspect(p)["height"] or 1200
        for scale, out in ((2, p.with_suffix(".png")), (GITHUB_WIDTH / FIG_WIDTH, p.with_suffix(".gh.png"))):
            out.unlink(missing_ok=True)
            run_chrome([f"--window-size={FIG_WIDTH},{height}", f"--force-device-scale-factor={scale}",
                        f"--screenshot={out}", p.as_uri()],
                       done=lambda _, o=out: o.exists() and o.stat().st_size > 0)
            print(out if out.exists() else f"失敗: {out} を書けなかった")
    return 0


def cmd_new(args: list[str]) -> int:
    dst = Path(args[0])
    like = args[args.index("--like") + 1] if "--like" in args else None
    src = SKILL_DIR / "assets" / ("template.html" if like is None else f"examples/{like}.html")
    if not src.exists():
        sys.exit(f"{src} が無い（--like は layers、before-after、steps のどれか）")
    if dst.exists():
        sys.exit(f"{dst} はすでにある（上書きしない）")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text().replace('href="../base.css"', 'href="base.css"').replace('src="../wires.js"', 'src="wires.js"'))
    for name in ("base.css", "wires.js"):
        shutil.copy(SKILL_DIR / "assets" / name, dst.parent / name)
    print(dst)
    return 0


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] not in ("new", "check", "render"):
        print(__doc__)
        return 2
    if sys.argv[1] == "new":
        return cmd_new(sys.argv[2:])
    paths = [Path(a) for a in sys.argv[2:]]
    for p in paths:
        if not p.exists():
            sys.exit(f"{p} が無い")
    return cmd_check(paths) if sys.argv[1] == "check" else cmd_render(paths)


if __name__ == "__main__":
    sys.exit(main())
