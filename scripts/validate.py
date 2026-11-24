#!/usr/bin/env python3
"""Check a day's file and the index before publishing.

Usage: python3 scripts/validate.py YYYY-MM-DD [--full]
--full also checks that the day has the complete morning set.
Exits non-zero and lists every problem if the day would break the app.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTIONS = ("agents", "techniques", "field", "market")
problems = []


def need(cond, msg):
    if not cond:
        problems.append(msg)


def text(obj, key, where, min_len=1):
    val = obj.get(key) if isinstance(obj, dict) else None
    need(isinstance(val, str) and len(val.strip()) >= min_len, f"{where}: '{key}' missing or empty")
    return val if isinstance(val, str) else ""


def words(val):
    if isinstance(val, str):
        return len(val.split())
    if isinstance(val, list):
        return sum(words(v) for v in val)
    return 0


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


def check_number(num, where):
    need(isinstance(num, dict) and 0 < len(str(num.get("value", ""))) <= 8, f"{where}: number.value is a figure of 8 characters at most, such as $19.8bn")
    text(num, "caption", f"{where} number")
    src = num.get("source") if isinstance(num, dict) else None
    need(isinstance(src, dict) and re.match(r"^https?://\S+$", src.get("url", "") or ""), f"{where}: number.source needs a url")
    rows = num.get("rows") if isinstance(num, dict) else None
    if rows:
        need(isinstance(rows, list) and 2 <= len(rows) <= 8, f"{where}: number.rows has 2 to 8 rows")
        try:
            total = float(str(num.get("total", "")).replace(",", ""))
            parts = sum(float(str(r.get("value", "")).replace(",", "")) for r in rows)
            need(abs(total - parts) < 0.051, f"{where}: number.rows add up to {parts:g}, not the total {total:g}; add a remainder row or drop the rows")
        except (ValueError, AttributeError):
            problems.append(f"{where}: number.rows and number.total must be plain numbers so the slip can be checked")


def check_story(a, where):
    need(a.get("section") in SECTIONS, f"{where}: 'section' must be one of {', '.join(SECTIONS)}")
    limit = 36 if a.get("section") == "techniques" else 48
    head = text(a, "headline", where)
    need(len(head) <= limit, f"{where}: headline is {len(head)} characters; the limit is {limit} so it fits two lines")
    need(not head.endswith("."), f"{where}: headline must not end with a full stop")
    if a.get("dek") is not None:
        need(isinstance(a["dek"], str) and 0 < words(a["dek"]) <= 32, f"{where}: dek is one sentence, 32 words at most")
    body = a.get("body")
    need(isinstance(body, list) and 1 <= len(body) <= 5 and all(isinstance(p, str) and p.strip() for p in body), f"{where}: body is a list of 1 to 5 paragraphs")
    need(30 <= words(body) <= 320, f"{where}: body should be 30 to 320 words (it is {words(body)})")
    need(0 < words(text(a, "soWhat", where)) <= 70, f"{where}: soWhat is 70 words at most")
    check_sources(a, where)
    if a.get("lead"):
        poster = a.get("poster")
        need(isinstance(poster, list) and len(poster) == 2 and all(isinstance(x, str) and 3 <= len(x) <= 12 for x in poster),
             f"{where}: the lead story needs 'poster', two lines of 3 to 12 characters each")
    if a.get("number") is not None:
        check_number(a["number"], where)


def check_deepdive(a, where):
    need(len(text(a, "headline", where)) <= 34, f"{where}: headline over 34 characters")
    text(a, "dek", where)
    steps = a.get("steps")
    need(isinstance(steps, list) and 3 <= len(steps) <= 6, f"{where}: 3 to 6 steps")
    for n, st in enumerate(steps or [], 1):
        need(len(text(st, "title", f"{where} step {n}")) <= 34, f"{where} step {n}: title over 34 characters")
        text(st, "body", f"{where} step {n}")
    reqs = a.get("forRequirements")
    need(isinstance(reqs, list) and 3 <= len(reqs) <= 6, f"{where}: 3 to 6 'forRequirements' lines")
    ex = a.get("example")
    if ex is not None:
        rows = ex.get("rows") if isinstance(ex, dict) else None
        need(isinstance(rows, list) and 4 <= len(rows) <= 9, f"{where}: example has 4 to 9 rows")
        for n, r in enumerate(rows or [], 1):
            need(isinstance(r, dict) and 0 < len(r.get("actor", "")) <= 8, f"{where} example row {n}: 'actor' is one short word")
            need(isinstance(r, dict) and 0 < len(r.get("text", "")) <= 110, f"{where} example row {n}: 'text' up to 110 characters")
            need(isinstance(r, dict) and r.get("state") in (None, "held", "done"), f"{where} example row {n}: 'state' is held, done or absent")
    quiz = a.get("quiz") or {}
    text(quiz, "question", f"{where} quiz")
    opts = quiz.get("options")
    need(isinstance(opts, list) and 3 <= len(opts) <= 4, f"{where} quiz: 3 or 4 options")
    need(isinstance(quiz.get("answer"), int) and isinstance(opts, list) and 0 <= quiz["answer"] < len(opts), f"{where} quiz: 'answer' is the index of the right option")
    text(quiz, "explanation", f"{where} quiz")
    check_sources(a, where, required=False)


def check_plain(a, where):
    need(len(text(a, "headline", where)) <= 24, f"{where}: headline is the term itself, 24 characters at most")
    for k in ("jargon", "stair", "simple", "analogy"):
        text(a, k, where)
    stair = a.get("stair") or ""
    need(10 <= len(stair.split()) <= 18, f"{where}: stair is 10 to 18 words")
    need(" ".join(stair.split()[:4]) != " ".join((a.get("simple") or "").split()[:4]), f"{where}: simple must carry on from stair, not repeat it")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    full = "--full" in sys.argv
    if len(args) != 1 or not re.match(r"^\d{4}-\d{2}-\d{2}$", args[0]):
        sys.exit("usage: validate.py YYYY-MM-DD [--full]")
    date = args[0]
    path = ROOT / "data" / f"{date}.json"
    if not path.exists():
        sys.exit(f"missing {path}")
    try:
        day = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"{path.name} is not valid JSON: {e}")

    need(day.get("date") == date, "'date' must match the file name")
    arts = day.get("articles")
    need(isinstance(arts, list) and len(arts) >= 1, "'articles' must be a list with at least one article")
    arts = arts if isinstance(arts, list) else []

    ids = [a.get("id") for a in arts if isinstance(a, dict)]
    need(len(ids) == len(set(ids)), "article ids must be unique within the day")
    for a in arts:
        where = f"article '{a.get('id')}'"
        need(isinstance(a.get("id"), str) and re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", a.get("id", "")) and len(a["id"]) <= 48,
             f"{where}: id is lowercase words joined by hyphens, 48 characters at most")
        need(isinstance(a.get("time"), str) and re.match(r"^([01]\d|2[0-3]):[0-5]\d$", a.get("time", "")), f"{where}: 'time' is HH:MM, Singapore time")
        kind = a.get("kind")
        if kind == "story":
            check_story(a, where)
        elif kind == "deepdive":
            check_deepdive(a, where)
        elif kind == "plain":
            check_plain(a, where)
        else:
            problems.append(f"{where}: 'kind' must be story, deepdive or plain")

    leads = [a for a in arts if a.get("lead")]
    need(len(leads) == 1 and leads[0].get("kind") == "story", "exactly one story must have \"lead\": true")
    need(sum(1 for a in arts if a.get("kind") == "deepdive") <= 1, "one deep dive a day at most")
    need(sum(1 for a in arts if a.get("kind") == "plain") <= 1, "one plain-language term a day at most")
    need(sum(1 for a in arts if a.get("number")) <= 1, "one article a day carries the number")

    line = day.get("line")
    if line is not None:
        need(0 < len(text(line, "line", "line").split()) <= 18, "line.line: 18 words at most")
        need(not text(line, "backup", "line").lower().startswith("if challenged"), "line.backup: start with the fact; the app adds 'If challenged'")
    terms = day.get("terms")
    if terms is not None:
        need(isinstance(terms, list) and 2 <= len(terms) <= 8, "terms: 2 to 8 terms")
        for g in terms or []:
            need(len(text(g, "term", "terms")) <= 24, "terms: a term is 24 characters at most")
            text(g, "meaning", "terms")

    if full:
        for sec in SECTIONS:
            n = sum(1 for a in arts if a.get("kind") == "story" and a.get("section") == sec)
            need(n >= 2, f"morning set: section '{sec}' needs at least 2 stories (it has {n})")
        need(any(a.get("kind") == "deepdive" for a in arts), "morning set: the deep dive is missing")
        need(any(a.get("kind") == "plain" for a in arts), "morning set: the plain-language term is missing")
        need(line is not None, "morning set: the line for the room is missing")
        need(terms is not None, "morning set: the terms are missing")

    try:
        index = json.loads((ROOT / "data" / "index.json").read_text(encoding="utf-8"))
        days = index.get("days") or []
        dates = [d.get("date") for d in days]
        need(dates == sorted(dates, reverse=True) and len(dates) == len(set(dates)), "data/index.json: days must be unique and newest first")
        entry = next((d for d in days if d.get("date") == date), None)
        need(entry is not None, "data/index.json has no entry for this day; run scripts/build_index.py")
        if entry and leads:
            need(entry.get("ids") == ids, "data/index.json: ids do not match the day file; run scripts/build_index.py")
            need(entry.get("headline") == leads[0].get("headline"), "data/index.json: headline does not match the lead; run scripts/build_index.py")
        for d in days:
            need((ROOT / "data" / f"{d.get('date')}.json").exists(), f"data/index.json lists {d.get('date')} but the file is missing")
    except (OSError, json.JSONDecodeError) as e:
        problems.append(f"data/index.json unreadable: {e}")

    if problems:
        print("NOT OK")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print(f"OK: {path.name}, {len(arts)} article(s)")


if __name__ == "__main__":
    main()
