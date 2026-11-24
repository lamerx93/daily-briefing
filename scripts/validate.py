#!/usr/bin/env python3
"""Check an edition file and the index before publishing.

Usage: python3 scripts/validate.py 2026-11-24
Exits non-zero and lists every problem if the edition would break the app.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
problems = []


def need(cond, msg):
    if not cond:
        problems.append(msg)


def text(obj, key, where, min_len=1):
    val = obj.get(key) if isinstance(obj, dict) else None
    need(isinstance(val, str) and len(val.strip()) >= min_len, f"{where}: '{key}' missing or empty")
    return val if isinstance(val, str) else ""


def check_sources(obj, where, required=True):
    src = obj.get("sources") if isinstance(obj, dict) else None
    if not src:
        need(not required, f"{where}: needs at least one source")
        return
    need(isinstance(src, list), f"{where}: 'sources' must be a list")
    for i, s in enumerate(src if isinstance(src, list) else []):
        url = s.get("url", "") if isinstance(s, dict) else ""
        need(isinstance(s, dict) and re.match(r"^https?://\S+$", url or ""), f"{where}: source {i + 1} needs an http(s) url")
        need(isinstance(s, dict) and (s.get("publisher") or s.get("title")), f"{where}: source {i + 1} needs a publisher or title")


def main():
    if len(sys.argv) != 2 or not re.match(r"^\d{4}-\d{2}-\d{2}$", sys.argv[1]):
        sys.exit("usage: validate.py YYYY-MM-DD")
    date = sys.argv[1]
    path = ROOT / "data" / f"{date}.json"
    if not path.exists():
        sys.exit(f"missing {path}")
    try:
        ed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"{path.name} is not valid JSON: {e}")

    need(ed.get("date") == date, "'date' must match the file name")
    need(isinstance(ed.get("edition"), int), "'edition' must be a number")
    need(isinstance(ed.get("readMinutes"), int) and 3 <= ed["readMinutes"] <= 12, "'readMinutes' should be 3 to 12")

    lead = ed.get("lead") or {}
    head = text(lead, "headline", "lead")
    need(len(head) <= 70, "lead headline is over 70 characters; it wraps badly on a phone")
    text(lead, "dek", "lead")
    need(isinstance(lead.get("body"), list) and 1 <= len(lead["body"]) <= 4, "lead body should be 1 to 4 paragraphs")
    text(lead, "whyItMatters", "lead")
    check_sources(lead, "lead")

    sections = ed.get("sections")
    need(isinstance(sections, list) and len(sections) == 4, "expected 4 sections: agents, techniques, field, market")
    ids = [s.get("id") for s in sections or [] if isinstance(s, dict)]
    need(ids == ["agents", "techniques", "field", "market"], f"section ids must be agents, techniques, field, market in that order (got {ids})")
    for s in sections or []:
        where = f"section {s.get('id')}"
        text(s, "title", where)
        items = s.get("items")
        need(isinstance(items, list) and 2 <= len(items) <= 4, f"{where}: 2 to 4 items")
        for n, it in enumerate(items or [], 1):
            w = f"{where} item {n}"
            h = text(it, "headline", w)
            need(len(h) <= 70, f"{w}: headline over 70 characters")
            body = text(it, "body", w)
            need(len(body.split()) <= 95, f"{w}: body over 95 words")
            text(it, "soWhat", w)
            check_sources(it, w)

    dd = ed.get("deepDive") or {}
    text(dd, "title", "deepDive")
    text(dd, "intro", "deepDive")
    need(isinstance(dd.get("steps"), list) and 3 <= len(dd["steps"]) <= 6, "deepDive: 3 to 6 steps")
    for n, st in enumerate(dd.get("steps") or [], 1):
        text(st, "title", f"deepDive step {n}")
        text(st, "body", f"deepDive step {n}")
    need(isinstance(dd.get("forRequirements"), list) and 3 <= len(dd["forRequirements"]) <= 6, "deepDive: 3 to 6 'forRequirements' lines")
    check_sources(dd, "deepDive", required=False)

    plain = ed.get("plain") or {}
    for k in ("term", "jargon", "simple", "analogy"):
        text(plain, k, "plain")

    room = ed.get("roomLine") or {}
    line = text(room, "line", "roomLine")
    need(len(line.split()) <= 40, "roomLine: keep the line to 40 words")
    text(room, "backup", "roomLine")

    quiz = ed.get("quiz") or {}
    text(quiz, "question", "quiz")
    opts = quiz.get("options")
    need(isinstance(opts, list) and 3 <= len(opts) <= 4, "quiz: 3 or 4 options")
    need(isinstance(quiz.get("answer"), int) and isinstance(opts, list) and 0 <= quiz["answer"] < len(opts), "quiz: 'answer' must be the index of the right option")
    text(quiz, "explanation", "quiz")

    gl = ed.get("glossary")
    need(isinstance(gl, list) and 2 <= len(gl) <= 5, "glossary: 2 to 5 terms")
    for g in gl or []:
        text(g, "term", "glossary")
        text(g, "meaning", "glossary")

    def prose(o):
        if isinstance(o, str):
            return len(o.split())
        if isinstance(o, dict):
            return sum(prose(v) for k, v in o.items() if k not in ("url", "sources", "id", "date"))
        if isinstance(o, list):
            return sum(prose(v) for v in o)
        return 0

    words = prose(ed)
    need(1100 <= words <= 2000, f"edition should be 1,100 to 2,000 words of prose (it is {words})")

    try:
        index = json.loads((ROOT / "data" / "index.json").read_text(encoding="utf-8"))
        eds = index.get("editions") or []
        need(bool(eds) and eds[0].get("date") == date, "data/index.json: this edition must be the first entry")
        dates = [e.get("date") for e in eds]
        need(dates == sorted(dates, reverse=True), "data/index.json: editions must be newest first")
        need(len(dates) == len(set(dates)), "data/index.json: duplicate dates")
        for e in eds:
            need((ROOT / "data" / f"{e.get('date')}.json").exists(), f"data/index.json lists {e.get('date')} but the file is missing")
        if eds and eds[0].get("date") == date:
            need(eds[0].get("headline") == lead.get("headline"), "data/index.json: headline must match the lead headline")
    except (OSError, json.JSONDecodeError) as e:
        problems.append(f"data/index.json unreadable: {e}")

    if problems:
        print("NOT OK")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print(f"OK: {path.name} ({words} words, about {round(words / 220)} min read)")


if __name__ == "__main__":
    main()
