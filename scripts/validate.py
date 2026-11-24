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
    need(len(head) <= 60, "lead headline is over 60 characters")
    need(not head.endswith("."), "lead headline must not end with a full stop; the app adds one")
    poster = lead.get("poster")
    need(isinstance(poster, list) and len(poster) == 2 and all(isinstance(x, str) and 3 <= len(x) <= 12 for x in poster),
         "lead.poster must be two lines of 3 to 12 characters each; it is set at poster size on the first screen")
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
            limit = 36 if s.get("id") == "techniques" else 52
            need(len(h) <= limit, f"{w}: headline over {limit} characters; it must fit two lines at its display size")
            body = text(it, "body", w)
            need(len(body.split()) <= 95, f"{w}: body over 95 words")
            text(it, "soWhat", w)
            check_sources(it, w)

    dd = ed.get("deepDive") or {}
    need(len(text(dd, "title", "deepDive")) <= 34, "deepDive: title over 34 characters")
    text(dd, "intro", "deepDive")
    ex = dd.get("example")
    if ex is not None:
        rows = ex.get("rows") if isinstance(ex, dict) else None
        need(isinstance(rows, list) and 4 <= len(rows) <= 9, "deepDive.example: 4 to 9 rows")
        for n, r in enumerate(rows or [], 1):
            need(isinstance(r, dict) and 0 < len(r.get("actor", "")) <= 8, f"deepDive.example row {n}: 'actor' is one short word")
            need(isinstance(r, dict) and 0 < len(r.get("text", "")) <= 110, f"deepDive.example row {n}: 'text' up to 110 characters")
            need(isinstance(r, dict) and r.get("state") in (None, "held", "done"), f"deepDive.example row {n}: 'state' is held, done or absent")
    need(isinstance(dd.get("steps"), list) and 3 <= len(dd["steps"]) <= 6, "deepDive: 3 to 6 steps")
    for n, st in enumerate(dd.get("steps") or [], 1):
        need(len(text(st, "title", f"deepDive step {n}")) <= 34, f"deepDive step {n}: title over 34 characters")
        text(st, "body", f"deepDive step {n}")
    need(isinstance(dd.get("forRequirements"), list) and 3 <= len(dd["forRequirements"]) <= 6, "deepDive: 3 to 6 'forRequirements' lines")
    check_sources(dd, "deepDive", required=False)

    plain = ed.get("plain") or {}
    for k in ("term", "jargon", "simple", "analogy", "stair"):
        text(plain, k, "plain")
    stair = plain.get("stair") or ""
    need(10 <= len(stair.split()) <= 18, "plain.stair: one sentence or two, 10 to 18 words in all")
    need(" ".join(stair.split()[:4]) != " ".join((plain.get("simple") or "").split()[:4]), "plain.simple must carry on from plain.stair, not repeat it")

    room = ed.get("roomLine") or {}
    line = text(room, "line", "roomLine")
    need(len(line.split()) <= 18, "roomLine: keep the line to 18 words")
    need(not text(room, "backup", "roomLine").lower().startswith("if challenged"), "roomLine.backup: start with the fact; the app adds 'If challenged'")

    num = ed.get("number")
    if num is not None:
        need(isinstance(num, dict) and 0 < len(str(num.get("value", ""))) <= 8, "number.value: a figure of 8 characters at most, such as $19.8bn")
        text(num, "caption", "number")
        src = num.get("source") if isinstance(num, dict) else None
        need(isinstance(src, dict) and re.match(r"^https?://\S+$", src.get("url", "") or ""), "number.source needs a url")
        rows = num.get("rows") if isinstance(num, dict) else None
        if rows:
            need(isinstance(rows, list) and 2 <= len(rows) <= 8, "number.rows: 2 to 8 rows")
            try:
                total = float(str(num.get("total", "")).replace(",", ""))
                parts = sum(float(str(r.get("value", "")).replace(",", "")) for r in rows)
                need(abs(total - parts) < 0.051, f"number.rows add up to {parts:g}, not the total {total:g}; add a remainder row or drop the rows")
            except (ValueError, AttributeError):
                problems.append("number.rows and number.total must be plain numbers so the slip can be checked")

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
    need(1100 <= words <= 2200, f"edition should be 1,100 to 2,200 words of prose (it is {words})")

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
