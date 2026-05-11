#!/usr/bin/env python3
"""Daily report writer/reader.

Stores one Markdown file per day under $HOME/daily_report/YYYY-MM-DD.md.
The file is structured with fixed `##` section headers so that downstream
readers (humans and Claude) get a predictable layout regardless of how the
content was entered.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

FIELDS: list[tuple[str, str]] = [
    ("today_plan", "今日やること"),
    ("done", "やったこと"),
    ("tomorrow_plan", "明日やること"),
    ("notes", "その他補足"),
]
KEY_TO_TITLE = {key: title for key, title in FIELDS}


def report_dir() -> Path:
    base = Path(os.environ["HOME"]) / "daily_report"
    base.mkdir(parents=True, exist_ok=True)
    return base


def report_path(date_str: str) -> Path:
    return report_dir() / f"{date_str}.md"


def parse_existing(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    sections: dict[str, str] = {}
    current: str | None = None
    buf: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf).strip()
    return sections


def render(date_str: str, sections: dict[str, str]) -> str:
    lines = [f"# 日報 {date_str}", ""]
    for _, title in FIELDS:
        lines.append(f"## {title}")
        lines.append("")
        body = sections.get(title, "").strip()
        if body:
            lines.append(body)
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def cmd_write(args: argparse.Namespace) -> int:
    title = KEY_TO_TITLE[args.field]
    path = report_path(args.date)
    sections = parse_existing(path)
    existing = sections.get(title, "").strip()
    new = args.content.strip()
    if not new:
        print("error: --content is empty after stripping", file=sys.stderr)
        return 2
    if args.mode == "append" and existing:
        sections[title] = existing + "\n" + new
    else:
        sections[title] = new
    path.write_text(render(args.date, sections), encoding="utf-8")
    print(f"wrote {path} (field={args.field}, mode={args.mode})")
    return 0


def cmd_read(args: argparse.Namespace) -> int:
    path = report_path(args.date)
    if not path.exists():
        print(f"(no report yet for {args.date}: {path})")
        return 0
    sys.stdout.write(path.read_text(encoding="utf-8"))
    return 0


def cmd_path(args: argparse.Namespace) -> int:
    print(report_path(args.date))
    return 0


def build_parser() -> argparse.ArgumentParser:
    today = datetime.now().strftime("%Y-%m-%d")
    parser = argparse.ArgumentParser(description="Daily report writer/reader")
    sub = parser.add_subparsers(dest="cmd", required=True)

    w = sub.add_parser("write", help="Write or append content to a field")
    w.add_argument("--field", required=True, choices=list(KEY_TO_TITLE))
    w.add_argument("--content", required=True, help="Body text for the field")
    w.add_argument("--date", default=today, help="YYYY-MM-DD (default: today)")
    w.add_argument("--mode", choices=["append", "overwrite"], default="append")
    w.set_defaults(func=cmd_write)

    r = sub.add_parser("read", help="Print the current report as-is")
    r.add_argument("--date", default=today)
    r.set_defaults(func=cmd_read)

    p = sub.add_parser("path", help="Print the resolved file path")
    p.add_argument("--date", default=today)
    p.set_defaults(func=cmd_path)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
