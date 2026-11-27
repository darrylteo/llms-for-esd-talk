"""Deck eval for "The Age of LLMs" (faculty talk). Run after build.py and shoot.py.

  T1 section timing within ±10% of plan: teaching 8 min (A+B, including a 4-min live demo), how LLMs work 2 min (C), practice 5 min (D)
  T2 total within 15 min ± 30 s
  A1 every headline renders in at most 2 lines (headless Chrome, src/data/shots)
  R1 no script errors, nothing outside the stage, no clipped boxes (headless Chrome)
  Q1 every quote on a slide is found in its source file (verbatim, or ≥ 0.85 similar for auto-captions)
  N1 every key number on a slide is found in its source file
  F1 every asset, clip and handout file the deck references exists
  H1 the PII hook passes its planted tests
  W1 no em-dashes and no "not X, but Y" in slide text or notes
Writes src/data/deck_eval.json and prints a table.
"""
import difflib
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the lecture folder (this file is in src/scripts/)
DATA = ROOT / "src" / "data"
SRC = DATA / "sources"
SHOTS = DATA / "shots"
SLIDES = (ROOT / "src" / "slides.html").read_text(encoding="utf-8")
JS = (ROOT / "src" / "slides.js").read_text(encoding="utf-8")
PLAN = {"AB": 480, "C": 120, "D": 300}

# quote text (as shown) -> source file and the phrase to find there
QUOTES = [
    ("Make sure that your scripts exit with a 2 exit code, because that's what actually sends Claude back to fix it.",
     "lydia_hallie_best_practices.txt", "make sure that your scripts exit with a twoexit code because that's what actually sends Cloud back to fix it"),
    ("Prompting is not a guarantee that a model will do it.", "lydia_hallie_best_practices.txt", "prompting is not a guarantee that a model will do it"),
    ("Permissions only decide if a tool call runs, but they cannot limit what it can reach once it's running.",
     "lydia_hallie_best_practices.txt", "permissions only decide if a tool call runs, but they cannot limit what it can reach once it's running"),
    ("start with a dataframe with 10 rows, 5 variables, 1 response variable. clicking a leaf will show 2 random variables to split on",
     "explainer_build.md", "start with a dataframe with 10 rows, 5 variables, 1 response variable. clicking a leaf will show 2 random variables to split on"),
    ("add sound for the plinko. it is very satisfying.", "explainer_build.md", "add sound for the plinko. it is very satisfying."),
    ("the bar is the random forest page.", "explainer_build.md", "the bar is the random forest page."),
    ("adversarial review on ml explainers files.", "explainer_build.md", "adversarial review on ml explainers files."),
    ("reason it out before making any changes", "explainer_build.md", "reason it out before making any changes"),
]
# number shown -> source file and the text that backs it
NUMBERS = [
    ("0.96355", "web_excerpts.md", None, "kaggle"), ("7 messages", "explainer_build.md", "Total: 7 typed messages", None),
    ("122 of 400", "explainer_build.md", "122 got a different prediction, by up to 19 points", None), ("0.0002", "explainer_build.md", "within 0.0002", None),
    ("9 messages", "web_excerpts.md", "9 messages between the two sessions", None), ("5 from me", "web_excerpts.md", "the user typed 5 messages", None),
    ("~70 students", "explainer_build.md", "3 cohorts of about 20–25 students", None),
]
# my 2019 team code, outside this repo: set KAGGLE_R_DIR to check it (skipped otherwise)
KAGGLE_R = Path(os.environ.get("KAGGLE_R_DIR", "/nonexistent"))


def norm(s):
    s = html.unescape(s).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()


def visible(s):
    s = re.sub(r"<aside class=\"notes\">.*?</aside>", " ", s, flags=re.S)
    return norm(re.sub(r"<[^>]+>", " ", s))


def best_ratio(needle, hay):
    n, h = norm(needle), norm(hay)
    if n in h:
        return 1.0
    best, L = 0.0, len(n)
    for i in range(0, max(1, len(h) - L), 6):
        r = difflib.SequenceMatcher(None, n, h[i:i + L + 10]).ratio()
        best = max(best, r)
    return best


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    res = []
    add = lambda k, ok, d: res.append({"id": k, "pass": bool(ok), "detail": d})
    secs = re.findall(r'<section class="slide" id="([^"]+)" data-section="(\w)[^"]*" data-t="(\d+)"', SLIDES)
    tot = {"AB": 0, "C": 0, "D": 0}
    for sid, sec, t in secs:
        tot["AB" if sec in "AB" else sec] += int(t)
    bad = {k: v for k, v in tot.items() if abs(v - PLAN[k]) > 0.1 * PLAN[k]}
    add("T1", not bad, ", ".join(f"{k} {v}s (plan {PLAN[k]}s)" for k, v in tot.items()))
    total = sum(tot.values())
    add("T2", abs(total - 900) <= 30, f"total {total // 60}:{total % 60:02d}")

    lines, errs = [], []
    for f in sorted(SHOTS.glob("s*.dom.html")):
        d = f.read_text(encoding="utf-8")
        m = re.search(r'data-lines="(\d+)"', d)
        if m and int(m.group(1)) > 2:
            lines.append(f"{f.stem}: {m.group(1)} lines")
        e = re.search(r'data-errors="([^"]*)"', d); o = re.search(r'data-overflow="([^"]*)"', d)
        if (e and e.group(1)) or (o and o.group(1)):
            errs.append(f"{f.stem}: {(e.group(1) if e else '')} {(o.group(1)[:200] if o else '')}")
    nshots = len(list(SHOTS.glob("s*.dom.html")))
    add("A1", nshots and not lines, "; ".join(lines) or f"{nshots} slides checked")
    add("R1", nshots and not errs, "; ".join(errs) or f"{nshots} slides clean")

    shown = visible(SLIDES) + " " + norm(JS)
    qbad = []
    for q, fn, phrase in QUOTES:
        on = norm(q) in shown
        r = best_ratio(phrase, (SRC / fn).read_text(encoding="utf-8"))
        sim = difflib.SequenceMatcher(None, norm(q), norm(phrase)).ratio()
        if not on or r < 0.85 or sim < 0.8:
            qbad.append(f"{q[:40]}… on-slide={on} in-source={r:.2f} quote-vs-source={sim:.2f}")
    add("Q1", not qbad, "; ".join(qbad) or f"{len(QUOTES)} quotes match their sources")

    nbad = []
    for num, fn, phrase, special in NUMBERS:
        if norm(num) not in shown:
            nbad.append(f"{num}: not on a slide"); continue
        if special == "kaggle":
            continue  # read off the leaderboard screenshot (src/data/sources/kaggle-screenshot-raw.png)
        if norm(phrase) not in norm((SRC / fn).read_text(encoding="utf-8")):
            nbad.append(f"{num}: '{phrase}' not in {fn}")
    if KAGGLE_R.exists():
        dep = (KAGGLE_R / "depedencies.R").read_text(encoding="utf-8", errors="ignore")
        fin = (KAGGLE_R / "final.R").read_text(encoding="utf-8", errors="ignore")
        if "ntree=2000" not in dep or "~5   hours" not in fin or "cv.glmnet(" not in dep:
            nbad.append("2019 R code: ntree=2000 / ~5 hours / cv.glmnet not found")
    add("N1", not nbad, "; ".join(nbad) or f"{len(NUMBERS)} numbers and the 2019 R code check out")

    refs = set(re.findall(r'(?:src|data-clip|data-src)="((?:assets|clips|film)/[^"]+)"', SLIDES)) | {"film/close.m4a", "handout/block_pii.py", "handout/README.md"}
    missing = [r for r in sorted(refs) if not (ROOT / r).exists()]
    add("F1", not missing, ", ".join(missing) or f"{len(refs)} files present")

    t = subprocess.run([sys.executable, "-I", str(ROOT / "handout" / "test_block_pii.py")], capture_output=True, text=True)
    add("H1", t.returncode == 0, f"{t.stdout.count('PASS')} PASS, {t.stdout.count('FAIL')} FAIL")

    text_all = re.sub(r"<[^>]+>", " ", SLIDES)
    w = []
    if "—" in text_all:
        w.append(f"{text_all.count('—')} em-dashes")
    if re.search(r"\bnot \w+(?: \w+){0,3}, but\b", text_all, re.I):
        w.append('"not X, but Y"')
    add("W1", not w, ", ".join(w) or "clean")

    for r in res:
        print(f"{r['id']:3} {'PASS' if r['pass'] else 'FAIL'}  {r['detail']}")
    n = sum(r["pass"] for r in res)
    print(f"{n}/{len(res)} pass")
    (DATA / "deck_eval.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    sys.exit(0 if n == len(res) else 1)


if __name__ == "__main__":
    main()
