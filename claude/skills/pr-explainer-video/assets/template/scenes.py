# シーンは parts/sNN.py に 1 つずつある。ファイル名の番号順に読み込み、SCENES[NN] に入れる
# 動画から外すシーンは、作業ディレクトリの video.json の "exclude": [番号, ...] に書く（拡張子を .py 以外にしたファイルは読まれない）
import importlib, json, pathlib
import scenes_base
from scenes_base import SCENES

ROOT = pathlib.Path(__file__).parent
EXCLUDE = set(json.loads((ROOT / "video.json").read_text()).get("exclude", [])) if (ROOT / "video.json").exists() else set()

for p in sorted((ROOT / "parts").glob("s[0-9][0-9].py")):
    if int(p.stem[1:]) in EXCLUDE:
        continue
    scenes_base.CURRENT = int(p.stem[1:])
    importlib.import_module(f"parts.{p.stem}")
