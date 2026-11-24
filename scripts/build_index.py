#!/usr/bin/env python3
"""Rebuild data/index.json from the day files. Run after adding or changing any article.

Usage: python3 scripts/build_index.py
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

days = []
for path in sorted(DATA.glob("????-??-??.json"), reverse=True):
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", path.stem):
        continue
    day = json.loads(path.read_text(encoding="utf-8"))
    arts = day.get("articles") or []
    if not arts:
        continue
    lead = next((a for a in arts if a.get("lead")), arts[0])
    days.append({
        "date": path.stem,
        "poster": lead.get("poster") or [],
        "headline": lead.get("headline", ""),
        "ids": [a.get("id") for a in arts],
    })

(DATA / "index.json").write_text(json.dumps({"days": days}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"index.json: {len(days)} day(s), {sum(len(d['ids']) for d in days)} article(s)")
