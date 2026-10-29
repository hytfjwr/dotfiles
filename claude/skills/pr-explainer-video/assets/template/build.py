# usage: python3 build.py [シーン番号 ...] [--stills] [--skip-render] [--force] [--kana] [--times] [--jobs N] [--out FILE]
#   番号なし      : 全シーンを撮り（中身が変わっていないシーンは撮り直さない）、最後に 1 本につなぐ
#   番号あり      : そのシーンだけ撮る（つながない）
#   --stills      : 動画は撮らず、各ステップの中ほどと終わりの静止画を stills/ に撮る（そのシーンの古い静止画は消す）
#   --times       : 各ステップの読み上げの開始・終了の時刻（シーンの頭からの秒）を出す。録画の待ち時間に読みを合わせるときに使う
#   --skip-render : 撮らずに、いまある seg/vNN.mp4 でつなぐ
#   --force       : ハッシュが同じでも撮り直す
#   --kana        : 読み上げの文と、音声エンジンが解釈したカナを並べて出す（読みの確認）
#   --jobs N      : 撮影の並列数（既定は video.json の jobs、無ければ 12）
#   --out FILE    : 出力の mp4（既定は video.json の out）
# 動画ごとの設定は作業ディレクトリの video.json（このファイルは書き換えない）:
#   {"out": "explainer.mp4", "hard_cuts": [[4, 5]], "accent": "#2f6fdf", "jobs": 12, "exclude": [],
#    "motion": "plain", "lead": 0.7, "gap": 0.6, "tail": 0.9, "vars": {"--paper": "#fbfaf8"}}
import argparse, hashlib, math, json, os, pathlib, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from scenes import SCENES
from tts import synth, kana

ROOT = pathlib.Path(__file__).parent
CFG = dict(out="explainer.mp4", hard_cuts=[], accent="#2f6fdf", jobs=12, exclude=[], motion="plain", lead=0.7, gap=0.6, tail=0.9, vars={})
if (ROOT / "video.json").exists():
    CFG.update(json.loads((ROOT / "video.json").read_text()))
SC, SEG, STILLS = ROOT / "scenes", ROOT / "seg", ROOT / "stills"
for d in (SC, SEG, STILLS):
    d.mkdir(exist_ok=True)
NM = ROOT / "node_modules" / "@fontsource"
FPS, LEAD, GAP, TAIL, XF = 30, CFG["lead"], CFG["gap"], CFG["tail"], 0.5
HARD_CUT = {tuple(p) for p in CFG["hard_cuts"]}  # フェードせずにカットでつなぐ境目（前のシーン, 次のシーン）。同じ画面が続くデモで明滅しないように
CHUNK = int(os.environ.get("CHUNK", 90))  # 1 区間のコマ数（3 秒）
AP = argparse.ArgumentParser(description="シーンを撮って 1 本の動画にする。番号なしで全シーンを撮り、最後につなぐ")
AP.add_argument("scenes", nargs="*", type=int, help="撮るシーンの番号（指定するとつながない）")
AP.add_argument("--stills", action="store_true", help="各ステップの中ほどと終わりの静止画だけを stills/ に撮る")
AP.add_argument("--times", action="store_true", help="各ステップの読み上げの開始・終了の時刻を出す")
AP.add_argument("--skip-render", action="store_true", help="撮らずに、いまある seg/vNN.mp4 でつなぐ")
AP.add_argument("--force", action="store_true", help="ハッシュが同じでも撮り直す")
AP.add_argument("--kana", action="store_true", help="読み上げの文とエンジンが解釈したカナを出す")
AP.add_argument("--jobs", type=int, default=None, help="撮影の並列数（既定は video.json の jobs、無ければ 12）")
AP.add_argument("--out", default=None, help="出力の mp4（既定は video.json の out）")
OPT = AP.parse_intermixed_args() if __name__ == "__main__" else AP.parse_args([])
JOBS = OPT.jobs or CFG["jobs"]
OUT = (ROOT / (OPT.out or CFG["out"])).resolve()


def mix(hexc, to, k):
    """hexc を to（0-255 の RGB）へ k だけ寄せる"""
    c = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a + (b - a) * k):02x}" for a, b in zip(c, to))


def theme_vars():
    """accent から --brand 系を決め、video.json の vars で上書きする"""
    a = CFG["accent"]
    v = {"--brand": a, "--brand-ink": mix(a, (0, 0, 0), .28), "--brand-l": mix(a, (255, 255, 255), .9), "--brand-b": mix(a, (255, 255, 255), .7)}
    v.update(CFG["vars"])
    return v


VARS = theme_vars()
BG = "0x" + VARS.get("--paper", "#fbfaf8")[1:]  # style.css の --paper


def page(i, sc, tl):
    fonts = "".join(f'<link rel="stylesheet" href="file://{NM}/{f}">' for f in
                    ["noto-sans-jp/400.css", "noto-sans-jp/500.css", "noto-sans-jp/700.css", "noto-sans-jp/900.css", "roboto/700.css"])
    theme = ":root{" + ";".join(f"{k}:{v}" for k, v in VARS.items()) + "}"
    en = f'<span class="en">{sc["en"]}</span>' if sc["en"] else ""
    top = f'<div class="top"><span class="ttl">{sc["title"]}</span>{en}</div>' if sc["title"] else ""
    badge = f'<div class="badge">{sc["tag"]}</div>' if sc["tag"] else ""
    caps = "".join(f'<div class="capline">{t}</div>' for t in sc["steps"])
    return f'''<!doctype html><html lang="ja"><head><meta charset="utf-8">{fonts}<link rel="stylesheet" href="file://{ROOT}/style.css"><style>{theme}</style><style>{sc["css"]}</style></head>
<body>{top}{badge}<div class="stage" id="s{i:02d}"><div class="cam3"><div class="camx">{sc["html"]}</div></div></div><div class="cap">{caps}</div><div class="pbar"></div>
<script>window.TL={json.dumps(tl)};window.MOTION={json.dumps(CFG["motion"])};window.BUILD=function(){{{sc["js"]}}};</script>
<script>document.fonts.ready.then(()=>{{const s=document.createElement('script');s.src='file://{ROOT}/engine.js';document.body.appendChild(s);}});</script></body></html>'''


def ffmpeg(*a):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *map(str, a)], check=True)


def silence(sec, out):
    if not out.exists():
        tmp = out.with_suffix(f".{os.getpid()}.{threading.get_ident()}.wav")  # 同じ長さの無音を複数スレッドが同時に作る
        ffmpeg("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{sec:.3f}", "-c:a", "pcm_s16le", tmp)
        tmp.replace(out)


def prepare(i):
    """読み上げを合成し、ステップの時刻を決め、シーンの音声 seg/aNN.wav を作る"""
    sc = SCENES[i]
    t, starts, ends, parts = LEAD, [], [], []
    for n, text in enumerate(sc["steps"], 1):
        wav, d = synth(re.sub("<[^>]+>", "", text), sc["readings"])
        g = GAP + sc["hold"].get(n, 0)
        starts.append(round(t, 3)); ends.append(round(t + d + g, 3)); parts.append((wav, g))
        t += d + g
    # シーンの長さはコマの整数倍にそろえる（端数があるとつないだときに映像が音声より少しずつ遅れる）
    dur = math.ceil(round((t + TAIL) * FPS, 6)) / FPS
    files = [SEG / f"sil_{LEAD:.2f}.wav"]
    silence(LEAD, files[0])
    for w, g in parts:
        gp = SEG / f"sil_{g:.2f}.wav"; silence(g, gp); files += [w, gp]
    st = SEG / f"sil_{TAIL:.2f}.wav"; silence(TAIL, st); files.append(st)
    lst = SEG / f"a{i:02d}.{os.getpid()}.txt"
    lst.write_text("".join(f"file '{f}'\n" for f in files))
    tmp = SEG / f"a{i:02d}.{os.getpid()}.{threading.get_ident()}.wav"
    ffmpeg("-f", "concat", "-safe", "0", "-i", lst, "-af", "apad", "-t", f"{dur:.6f}", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", tmp)  # 音声もシーンの長さちょうどに
    tmp.replace(SEG / f"a{i:02d}.wav"); lst.unlink()
    return i, dict(steps=starts, ends=ends, dur=dur)


def scene_hash(html):
    # ページの中身（時刻・テーマ・動きの流儀を含む）、共通ファイル、参照している素材（クリップは mp4 と sidecar JSON）の大きさと更新時刻で決まる
    h = hashlib.sha1(html.encode())
    for f in ("engine.js", "style.css", "render.js"):
        h.update((ROOT / f).read_bytes())
    h.update(f"{FPS}|{CHUNK}|{XF}".encode())
    for p in sorted(set(re.findall(r"file://([^\"')\s]+/assets/[^\"')\s]+)", html))):
        pp = pathlib.Path(p)
        for q in [pp] + ([pp.with_suffix(".json")] if pp.suffix == ".mp4" else []):
            if q.exists():
                s = q.stat(); h.update(f"{q}|{s.st_size}|{s.st_mtime_ns}".encode())
    return h.hexdigest()


def render_chunk(job):
    i, k, f0, f1 = job
    out = SEG / f"v{i:02d}_{os.getpid()}_{k:03d}.mp4"  # 同じシーンを別のプロセスが撮っていてもぶつからないよう、プロセス番号を入れる
    t = time.time()
    r = subprocess.run(["node", str(ROOT / "render.js"), str(SC / f"s{i:02d}.html"), str(out), str(FPS), str(f0), str(f1)], capture_output=True, text=True)
    if r.returncode or r.stderr.strip():
        print(f"scene {i} chunk {k}:", r.stderr.strip()[:400])
    return i, time.time() - t, r.returncode


def render_all(targets, tls):
    # シーンを 3 秒ずつの区間に分け、区間単位で並列に撮る。中身が前回と同じシーンは飛ばす
    jobs, todo = [], []
    for i in targets:
        html = page(i, SCENES[i], tls[i])
        (SC / f"s{i:02d}.html").write_text(html)
        hv = scene_hash(html); hf = SEG / f"v{i:02d}.hash"
        if not OPT.force and hf.exists() and hf.read_text() == hv and (SEG / f"v{i:02d}.mp4").exists():
            print(f"s{i:02d}: 変更なし、撮り直さない"); continue
        todo.append((i, hv))
        n = round((tls[i]["dur"] + XF) * FPS)
        jobs += [(i, k, f0, min(n, f0 + CHUNK)) for k, f0 in enumerate(range(0, n, CHUNK))]
    if not jobs:
        return
    t0 = time.time(); cpu = {}; failed = set()
    with ThreadPoolExecutor(JOBS) as ex:
        for i, s, rc in ex.map(render_chunk, jobs):
            cpu[i] = cpu.get(i, 0) + s
            if rc:
                failed.add(i)
    if failed:  # 1 区間でも落ちたシーンをつなぐと映像が短くなるので、ここで止める
        for p in SEG.glob(f"v*_{os.getpid()}_*.mp4"):
            p.unlink()
        sys.exit(f"撮影に失敗した区間がある: シーン {sorted(failed)}")
    for i, hv in todo:
        parts = sorted(SEG.glob(f"v{i:02d}_{os.getpid()}_*.mp4"))
        lst = SEG / f"v{i:02d}.{os.getpid()}.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in parts))
        tmp = SEG / f"v{i:02d}.{os.getpid()}.mp4"
        ffmpeg("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", tmp)
        tmp.replace(SEG / f"v{i:02d}.mp4")
        for p in parts + [lst]:
            p.unlink()
        (SEG / f"v{i:02d}.hash").write_text(hv)
        print(f"s{i:02d}: {tls[i]['dur']:.1f} 秒、区間の撮影時間の合計 {cpu[i]:.0f} 秒")
    print(f"撮影 {len(jobs)} 区間 / {JOBS} 並列 / 実時間 {time.time() - t0:.0f} 秒")


def stills(targets, tls):
    spec = []
    STILLS.mkdir(exist_ok=True)
    for i in targets:
        for old in STILLS.glob(f"s{i:02d}_*.png"):  # ステップを減らしたときに古い静止画が残らないように
            old.unlink()
        html = page(i, SCENES[i], tls[i]); (SC / f"s{i:02d}.html").write_text(html)
        times, names = [], []
        for k, (s, e) in enumerate(zip(tls[i]["steps"], tls[i]["ends"]), 1):
            times += [(s + e - GAP) / 2, e - 0.35]  # 終わりは字幕が消え始める直前
            names += [str(STILLS / f"s{i:02d}_{k}_mid.png"), str(STILLS / f"s{i:02d}_{k}_end.png")]
        spec.append(dict(html=str(SC / f"s{i:02d}.html"), times=times, names=names))
    sp = SEG / f"stills.{os.getpid()}.json"
    sp.write_text(json.dumps(spec))
    subprocess.run(["node", str(ROOT / "stills.js"), str(sp)], check=True)
    sp.unlink()
    print("stills:", " ".join(n for s in spec for n in s["names"]))


def srt(idxs, tls):
    def ts(x):
        ms = round(x * 1000); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    out, n, off = [], 1, 0.0
    for i in idxs:
        for text, s, e in zip(SCENES[i]["steps"], tls[i]["steps"], tls[i]["ends"]):
            out.append(f"{n}\n{ts(off + s)} --> {ts(off + e - GAP)}\n{re.sub('<[^>]+>', '', text)}\n"); n += 1
        off += tls[i]["dur"]
    OUT.with_suffix(".srt").write_text("\n".join(out))


def stream_durations(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", str(path)])
    return {s["codec_type"]: float(s["duration"]) for s in json.loads(out)["streams"] if "duration" in s}


def final(idxs, tls):
    total = sum(tls[i]["dur"] for i in idxs)
    args = []
    for i in idxs:
        args += ["-i", SEG / f"v{i:02d}.mp4"]
    # シーンの切り替え：前のシーンを背景色まで落としてから次のシーンを背景色から出す（重ねない）。
    # video.json の hard_cuts の境目だけはカットでつなぐ（同じ画面が続くデモで、窓が明滅しないように）
    filt, ins = [], []
    for k, i in enumerate(idxs):
        d = tls[i]["dur"]
        f = f"[{k}:v]trim=end_frame={round(d * FPS)},setpts=PTS-STARTPTS"
        if k > 0 and (idxs[k - 1], i) not in HARD_CUT:
            f += f",fade=t=in:st=0:d={XF / 2}:color={BG}"
        if k < len(idxs) - 1 and (i, idxs[k + 1]) not in HARD_CUT:
            f += f",fade=t=out:st={d - XF / 2:.3f}:d={XF / 2}:color={BG}"
        filt.append(f + f"[c{k}]"); ins.append(f"[c{k}]")
    filt.append("".join(ins) + f"concat=n={len(idxs)}:v=1:a=0[cat]")
    # 進捗の帯は、全体の長さが決まるここで重ねる（シーンの撮影がほかのシーンの長さに左右されないように）
    filt.append(f"color=c=0x{VARS['--brand'][1:]}:s=1920x6:r={FPS}:d={total:.3f}[pb]")
    filt.append(f"[cat][pb]overlay=x='-w+w*t/{total:.3f}':y=1074:shortest=1,fade=t=in:st=0:d=0.6,fade=t=out:st={total - 0.8:.3f}:d=0.8[vout]")
    (SEG / "alist.txt").write_text("".join(f"file '{SEG / f'a{i:02d}.wav'}'\n" for i in idxs))
    ffmpeg("-f", "concat", "-safe", "0", "-i", SEG / "alist.txt", "-c:a", "pcm_s16le", SEG / "audio.wav")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg(*args, "-i", SEG / "audio.wav", "-filter_complex", ";".join(filt), "-map", "[vout]", "-map", f"{len(idxs)}:a",
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", FPS,
           "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", OUT)
    srt(idxs, tls)
    print(f"done {total:.1f}s -> {OUT}")
    # 映像と音声の長さの検査：並列撮影の 1 区間が欠けて映像が短くなる事故を検知する
    d = stream_durations(OUT)
    gap = abs(d.get("video", 0) - d.get("audio", 0))
    print(f"映像 {d.get('video', 0):.3f} 秒 / 音声 {d.get('audio', 0):.3f} 秒（差 {gap:.3f} 秒）")
    if gap > 0.1:
        sys.exit(f"映像と音声の長さが 0.1 秒を超えてずれている（差 {gap:.3f} 秒）。撮影の失敗が疑われる。--force で撮り直す")


def main():
    only = sorted(set(OPT.scenes))
    idxs = sorted(SCENES)
    missing = [i for i in only if i not in SCENES]
    if missing:
        sys.exit(f"シーンが無い: {missing}（parts/sNN.py）")
    targets = only or idxs
    if OPT.kana:
        for i in targets:
            for t in SCENES[i]["steps"]:
                print(f"s{i:02d} {re.sub('<[^>]+>', '', t)}\n    {kana(re.sub('<[^>]+>', '', t), SCENES[i]['readings'])}")
        return
    with ThreadPoolExecutor(4) as ex:
        tls = dict(ex.map(prepare, targets))
    if OPT.times:
        for i in targets:
            print(f"s{i:02d}（{tls[i]['dur']:.2f} 秒）")
            for k, (st, en, text) in enumerate(zip(tls[i]['steps'], tls[i]['ends'], SCENES[i]['steps']), 1):
                print(f"  step {k}: {st:6.2f} 〜 {en - GAP:6.2f} 秒  {re.sub('<[^>]+>', '', text)}")
        return
    if OPT.stills:
        stills(targets, tls); return
    if not OPT.skip_render:
        render_all(targets, tls)
    if not only:
        final(idxs, tls)


if __name__ == "__main__":
    main()
