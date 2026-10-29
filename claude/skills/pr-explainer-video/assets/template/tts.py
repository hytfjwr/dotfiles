# ナレーションを合成する。エンジンは環境変数 TTS_ENGINE で選ぶ（既定 aivis。voicevox に切り替えられる）。エンドポイントは TTS_URL で上書きできる
# キャッシュ（作業ディレクトリの tts_cache/）はエンジン・話者・合成の設定・読みのハッシュで分ける
# このファイルは動画ごとに書き換えない。読みの直しは、作業ディレクトリの readings.json（[["表記", "読み"], ...]）か scene(readings=[...]) に書く
import hashlib, json, os, re, pathlib, subprocess, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).parent

ENGINES = {
    # AivisSpeech Engine（既定のエンドポイントは http://127.0.0.1:10101）
    # intonationScale はノーマルのスタイルでは無視される（エンジンの仕様）。pitchScale は 0 以外で音質が落ちるので触らない
    # tempoDynamicsScale を下げて緩急を抑え、落ち着いた調子にする
    "aivis": dict(url="http://127.0.0.1:10101", speaker=1937616896,
                  params=dict(speedScale=1.2, tempoDynamicsScale=0.5, volumeScale=1.0, prePhonemeLength=0.1, postPhonemeLength=0.2)),
    # VOICEVOX Engine（既定のエンドポイントは http://127.0.0.1:50021）
    "voicevox": dict(url="http://127.0.0.1:50021", speaker=30,
                     params=dict(speedScale=1.18, intonationScale=1.1, prePhonemeLength=0.1, postPhonemeLength=0.2, outputSamplingRate=48000, outputStereo=True)),
}
NAME = os.environ.get("TTS_ENGINE", "aivis")
E = ENGINES[NAME]
ENGINE, SPEAKER = os.environ.get("TTS_URL", E["url"]).rstrip("/"), E["speaker"]
CACHE = ROOT / "tts_cache"; CACHE.mkdir(exist_ok=True)

# 字幕の表記 → 読み（全動画共通の、一般的な技術語と読みの罠）。長い語を先に置く
# 英字の語（先頭と末尾が英数字）は、前後が英数字でないときだけ置き換える（domain の中の main には当てない）
READINGS = [
    ("GitHub Actions", "ギットハブ アクションズ"), ("GitHub", "ギットハブ"), ("pull request", "プルリクエスト"), ("Pull Request", "プルリクエスト"),
    ("git push", "ギット・プッシュ"), ("dry-run", "ドライラン"), ("push", "プッシュ"), ("diff", "ディフ"), ("git", "ギット"),
    ("commit", "コミット"), ("branch", "ブランチ"), ("merge", "マージ"), ("main", "メイン"), ("HEAD", "ヘッド"), ("bot", "ボット"),
    ("README", "リードミー"), ("Docker", "ドッカー"), ("JSON", "ジェイソン"), ("YAML", "ヤムル"), ("URL", "ユーアールエル"), ("API", "エーピーアイ"),
    ("SQL", "エスキューエル"), ("HTTP", "エイチティーティーピー"), ("CLI", "シーエルアイ"), ("CI", "シーアイ"), ("PR", "ピーアール"), ("DB", "ディービー"),
    ("行数", "ぎょうすう"), ("〜", "から"), ("一つ目", "ヒトツメ"),
    ("値は", "あたいは"), ("値を", "あたいを"), ("値が", "あたいが"), ("値の", "あたいの"), ("値に", "あたいに"),
    ("「", ""), ("」", ""), ("『", ""), ("』", ""),
]


def _load_readings():
    f = ROOT / "readings.json"
    return [tuple(x) for x in json.loads(f.read_text())] if f.exists() else []


def _sub(t, a, b):
    if re.fullmatch(r"[A-Za-z0-9].*[A-Za-z0-9]|[A-Za-z0-9]", a) and a.isascii():
        return re.sub(r"(?<![A-Za-z0-9_])" + re.escape(a) + r"(?![A-Za-z0-9_])", lambda _: b, t)
    return t.replace(a, b)


def reading(t, extra=()):
    # 適用順：シーンの readings、readings.json、共通の READINGS
    for a, b in list(extra) + _load_readings() + READINGS:
        t = _sub(t, a, b)
    # 「行」を表の行や数の単位として使うときは「ぎょう」と読ませる（「実行」「移行」は前の字が違うので当たらない）
    t = re.sub(r"(?<=[のたい0-9])\s?行(?=[をがはだにのでも、。])", "ぎょう", t)
    # 英字・数字・カタカナの隣の空白で読みが切れる（「エラー にし」→「エラー、西」）ので除く
    t = re.sub(r"(?<=[ァ-ヶーA-Za-z0-9])\s+|\s+(?=[ァ-ヶーA-Za-z0-9])", "", t)
    # 残る空白（ひらがな・漢字の間）は区切りとして読点にする
    return re.sub(r"\s+", "、", t)


def post(path, params, body=None):
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, data=body if body is not None else b"", method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return r.read()


def query(r):
    q = json.loads(post("/audio_query", {"text": r, "speaker": SPEAKER}))
    if NAME.startswith("aivis"):
        q["kana"] = r  # AivisSpeech は kana を読み上げる文として使う（漢字まじりの文を渡すと抑揚が自然になる）
    return q


def kana(text, extra=()):
    # 読みの確認用：エンジンが解釈した読み（アクセント句ごとのモーラを / で区切る。'は アクセントの位置、、は句読点の間）
    q = query(reading(text, extra))
    out = []
    for ap in q["accent_phrases"]:
        m = [x["text"] for x in ap["moras"]]
        a = ap.get("accent", 0)
        if 0 < a <= len(m):
            m[a - 1] += "'"
        out.append("".join(m) + ("、" if ap.get("pause_mora") else ""))
    return "/".join(out)


def synth(text, extra=()):
    r = reading(text, extra)
    key = hashlib.sha1(f"{NAME}|{SPEAKER}|{json.dumps(E['params'], sort_keys=True)}|{r}".encode()).hexdigest()[:16]
    out = CACHE / f"{NAME}_{key}.wav"
    if not out.exists():
        q = query(r)
        q.update(E["params"])
        raw = CACHE / f"{key}.{os.getpid()}.raw.wav"
        raw.write_bytes(post("/synthesis", {"speaker": SPEAKER}, json.dumps(q).encode()))
        tmp = CACHE / f"{key}.{os.getpid()}.tmp.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", str(tmp)], check=True)
        raw.unlink(); tmp.replace(out)  # 並列のビルドが同じ文を合成しても壊れないよう、置き換えで書く
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)]))
    return out, d
