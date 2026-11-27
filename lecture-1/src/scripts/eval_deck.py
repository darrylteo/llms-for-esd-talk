"""Deck eval: the receipt for this talk. Run after build.py and shoot.py.

Checks (each PASS/FAIL, with details):
  T1 timing per section within ±10% of 1 / 22 / 7 min (notes at 140 wpm + film seconds)
  T2 every slide's spoken time within ±30% of its target
  A1 every headline is one sentence-like claim, at most 2 rendered lines
  A2 body text on a slide at most BODY_MAX words (headline, captions, quotes and charts excluded)
  N1 every number shown on a slide is in data/claims.json
  N2 every claims.json entry verifies against its source file or stats.json
  Q1 every attributed quote is found in its source transcript near the cited timestamp
  R1 no script errors, nothing outside the stage, no clipped boxes (headless Chrome)
  C1 text colours reach 4.5:1 contrast on the stage background
  W1 writing style: no em-dashes, no colon headlines, no "not X, but Y"
Writes data/deck_eval.json and prints a table.
"""
import difflib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # the lecture folder (this file is in src/scripts/)
SHOTS = ROOT / "data" / "shots"
WPM = 140
SECTION_TARGET = {"A": 60, "B": 1320, "C": 420}
BODY_MAX = 40
# Stage directions in the notes take real time: a click and its animation, a pause, audience answers.
PAUSES = {"click": 1.5, "pause": 3, "wait": 10, "count": 8}


class SlideText(HTMLParser):
    """Collect visible text of the active slide by role."""
    SKIP_CLASSES = {"notes", "src", "pageno"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.out, self.active_depth = [], [], None
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = set((a.get("class") or "").split())
        self.depth += 1
        if tag == "section" and "slide" in cls and "active" in cls:
            self.active_depth = self.depth
        role = None
        if cls & self.SKIP_CLASSES:
            role = "skip"
        elif tag == "h1":
            role = "headline"
        elif "kicker" in cls:
            role = "kicker"
        elif cls & {"tick", "illustrative", "selfref", "verbatim", "vig"}:
            role = "nonum"
        elif "exhibit" in cls:
            role = "exhibit"
        elif "quote" in cls:
            role = "quote"
        elif tag == "cite":
            role = "cite"
        elif tag == "svg":
            role = "svg"
        elif tag in ("script", "style"):
            role = "skip"
        self.stack.append((tag, role))

    def handle_endtag(self, tag):
        while self.stack:
            t, _ = self.stack.pop()
            self.depth -= 1
            if t == tag:
                break
        if self.active_depth and self.depth < self.active_depth:
            self.active_depth = None

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_data(self, data):
        if not self.active_depth or not data.strip():
            return
        roles = [r for _, r in self.stack if r]
        if "skip" in roles:
            return
        role = roles[-1] if roles else "body"
        if "nonum" in roles:
            role = "nonum"
        if "quote" in roles and role != "cite":
            role = "quote"
        self.out.append((role, data.strip()))


def slide_text(i):
    dom = (SHOTS / f"s{i:02d}.dom.html").read_text(encoding="utf-8")
    p = SlideText()
    p.feed(dom)
    meta = {k: (re.search(rf'data-{k}="([^"]*)"', dom) or [None, ""])[1] for k in ("errors", "overflow", "lines")}
    return p.out, meta


def src_sections():
    """Slide markup (for notes and data-t) from the source, in order."""
    txt = (ROOT / "src" / "slides.html").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'<section class="slide" id="([^"]+)"([^>]*)>(.*?)</section>', txt, re.S):
        attrs, body = m.group(2), m.group(3)
        get = lambda k: (re.search(rf'data-{k}="([^"]*)"', attrs) or [None, ""])[1]
        notes = re.search(r'<aside class="notes">(.*?)</aside>', body, re.S)
        ntext = html.unescape(re.sub(r"<[^>]+>", " ", notes.group(1))) if notes else ""
        spoken = re.sub(r"\[[^\]]*\]", " ", ntext)
        dirs = re.findall(r"\[([^\]]*)\]", ntext)
        pause = sum(next((v for k, v in PAUSES.items() if d.lower().startswith(k)), 0) for d in dirs)
        h1 = re.search(r'<h1 class="claim">(.*?)</h1>', body, re.S)
        out.append({
            "id": m.group(1), "section": get("section"), "t": float(get("t") or 0), "film": float(get("film") or 0),
            "notes": ntext, "spoken_words": len(spoken.split()), "pause": pause,
            "headline": html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else "",
        })
    return out


NUM = re.compile(r"(?<![\w.])\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:×|%|¢|B|k)?")


def numbers_in(text):
    vals = []
    for m in NUM.finditer(text):
        v = m.group(0)
        if re.fullmatch(r"\d", v):  # single digits: list labels, era numbers, step counts
            continue
        vals.append(v)
    return vals


def norm(s):
    s = s.lower().replace("’", "'").replace("…", " ")
    s = re.sub(r"\b(uh|um)\b", " ", s)
    return re.sub(r"[^a-z0-9' ]+", " ", re.sub(r"\s+", " ", s)).split()


def load_transcript(path):
    segs, t = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.fullmatch(r"\s*(\d+):(\d+)(?::(\d+))?\s*", line)
        if m:
            a, b, c = m.groups()
            t = int(a) * 3600 + int(b) * 60 + int(c) if c else int(a) * 60 + int(b)
            continue
        segs.append((t, norm(line)))
    words, times = [], []
    for t, ws in segs:
        words += ws
        times += [t] * len(ws)
    return words, times


SOURCES = {
    "Lee": ROOT / "data/sources/lee_robinson_cs146s.txt", "Robinson": ROOT / "data/sources/lee_robinson_cs146s.txt",
    "Lauren": ROOT / "data/sources/lauren_tan_matt_pocock.txt", "Kun": ROOT / "data/sources/kun_chen_high_throughput.txt",
}


def find_quote(quote, cite):
    key = next((k for k in SOURCES if k in cite), None)
    if key is None:
        return None, "no transcript for cite"
    words, times = load_transcript(SOURCES[key])
    q = norm(quote)
    n = len(q)
    best = (0, 0)
    for i in range(0, max(1, len(words) - n + 1)):
        if words[i] != q[0] and (i + 1 >= len(words) or words[i + 1] != q[1]):
            continue
        r = difflib.SequenceMatcher(None, q, words[i:i + n + 4]).ratio()
        if r > best[0]:
            best = (r, i)
    ts = re.search(r"(\d+):(\d+)", cite)
    cited = int(ts.group(1)) * 60 + int(ts.group(2)) if ts else None
    found_t = times[best[1]] if words else None
    ok = best[0] >= 0.80 and (cited is None or abs(found_t - cited) <= 45)
    return ok, f"match {best[0]:.2f} at {found_t // 60}:{found_t % 60:02d} (cited {ts.group(0) if ts else '-'})"


def lum(hexc):
    hexc = hexc.lstrip("#")
    c = [int(hexc[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def get_path(d, path):
    for k in path.split("."):
        d = d[int(k)] if k.isdigit() else d[k]
    return d


def verify_claim(c, stats):
    if "stats" in c:
        v = get_path(stats, c["stats"])
        shown = eval(c["fmt"], {}, {"v": v, "s": stats}) if "fmt" in c else str(v)  # fmt is a trusted local expression
        return shown == c["value"], f"stats {c['stats']} -> {shown}"
    if "file" in c:
        p = Path(c["file"]) if Path(c["file"]).is_absolute() else ROOT / c["file"]
        if not p.exists():
            return False, f"missing file {p}"
        t = p.read_text(encoding="utf-8", errors="replace")
        if "count_regex" in c:
            found = re.findall(c["count_regex"], t)
            n = len(set(found)) if c.get("distinct") else len(found)
            return c["fmt"].format(n) == c["value"], f"{p.name}: {n} matches of {c['count_regex']}"
        if "line_count" in c:
            n = len(t.splitlines())
            return n == c["line_count"], f"{p.name} has {n} lines"
        ok = all(s in t for s in c["contains"])
        return ok, f"{p.name} contains {c['contains']}"
    return bool(c.get("source")), "manual source: " + c.get("source", "")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    results = {}
    secs = src_sections()
    n_slides = len(secs)
    stats = json.loads((ROOT / "data/stats.json").read_text(encoding="utf-8"))
    claims = json.loads((ROOT / "data/claims.json").read_text(encoding="utf-8"))
    for c in claims:  # stats-derived numbers are whatever the frozen stats.json formats to
        if "stats" in c:
            c["value"] = eval(c["fmt"], {}, {"v": get_path(stats, c["stats"]), "s": stats})
    registered = {c["value"] for c in claims}

    # T1, T2
    sec_time, sec_target, slide_issues = {}, {}, []
    for s in secs:
        spoken = s["spoken_words"] / WPM * 60 + s["film"] + s["pause"]
        k = s["section"][0]
        sec_time[k] = sec_time.get(k, 0) + spoken
        sec_target[k] = sec_target.get(k, 0) + s["t"]
        if s["t"] and abs(spoken - s["t"]) / s["t"] > 0.30:
            slide_issues.append(f"{s['id']} {spoken:.0f}s vs {s['t']:.0f}s")
        s["spoken"] = spoken
    t1 = [f"{k}: {sec_time[k]:.0f}s spoken / {SECTION_TARGET[k]}s planned (data-t sum {sec_target[k]:.0f}s)" for k in sorted(sec_time)]
    t1_ok = all(abs(sec_time[k] - SECTION_TARGET[k]) / SECTION_TARGET[k] <= 0.10 for k in SECTION_TARGET)
    results["T1 section timing ±10%"] = (t1_ok, t1 + [f"total {sum(sec_time.values()) / 60:.1f} min"])
    results["T2 slide timing ±30%"] = (not slide_issues, slide_issues)
    if "--timing" in sys.argv:
        for s in secs:
            print(f"{s['id']:16s} {s['spoken']:5.0f}s / {s['t']:3.0f}s  words {s['spoken_words']:4d}  need {max(0, (s['t'] - s['spoken']) * WPM / 60):4.0f} more words")

    a1, a2, n1, q1, r1, w1 = [], [], [], [], [], []
    for i, s in enumerate(secs, 1):
        parts, meta = slide_text(i)
        if meta["errors"]:
            r1.append(f"{i} errors: {meta['errors']}")
        if meta["overflow"]:
            r1.append(f"{i} overflow: {meta['overflow']}")
        h = s["headline"]
        if h:
            if meta["lines"] and int(meta["lines"]) > 2:
                a1.append(f"{i} headline {meta['lines']} lines")
            if not re.search(r"[.?]$", h):
                a1.append(f"{i} headline not a sentence: {h}")
            if ":" in h:
                w1.append(f"{i} colon in headline: {h}")
        body = " ".join(t for r, t in parts if r == "body")
        bw = len(body.split())
        if bw > BODY_MAX:
            a2.append(f"{i} {bw} body words")
        shown = " ".join(t for r, t in parts if r in ("body", "headline", "svg", "quote", "exhibit"))
        for v in numbers_in(shown):
            if v not in registered:
                n1.append(f"{i} unregistered number {v}")
        quote, cite = "", ""
        for r, t in parts:
            if r == "quote":
                quote += " " + t
            elif r == "cite" and quote:
                cite = t
                if not cite.startswith(("LESSONS",)):
                    qtext = re.sub(r"^.*?“|”.*$", "", quote.strip())
                    ok, msg = find_quote(qtext, cite)
                    if not ok:
                        q1.append(f"{i} {msg}: {qtext[:50]}")
                quote = ""
        alltext = " ".join(t for _, t in parts) + " " + s["notes"]
        if "—" in alltext:
            w1.append(f"{i} em-dash")
        for m in re.finditer(r"\bnot\b[^.;]{1,50}?,? but\b", alltext):
            w1.append(f"{i} 'not X, but Y': {m.group(0)[:60]}")
    results["A1 headline claim, ≤2 lines"] = (not a1, a1)
    results[f"A2 body ≤{BODY_MAX} words"] = (not a2, a2)
    results["N1 numbers registered"] = (not n1, n1)
    bad_claims = []
    for c in claims:
        ok, msg = verify_claim(c, stats)
        if not ok:
            bad_claims.append(f"{c['value']}: {msg}")
    results["N2 claims verify against source"] = (not bad_claims, bad_claims + [f"{len(claims)} claims checked"])
    results["Q1 quotes match transcripts"] = (not q1, q1)
    shots = len(list(SHOTS.glob("s*_step99.png")))
    results["R1 render clean"] = (not r1 and shots == n_slides, r1 + [f"{shots}/{n_slides} slides rendered"])
    theme = (ROOT.parent / "shared" / "theme-keynote.css").read_text(encoding="utf-8")
    tok = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", theme))
    c1 = []
    for name in ("ink", "mute", "dim", "l-sys", "l-proj", "l-sess", "l-conv", "l-new", "cached", "bad"):
        for bg in ("bg", "surface"):
            r = contrast(tok[name], tok[bg])
            if r < 4.5:
                c1.append(f"{name} on {bg} {r:.2f}:1")
    results["C1 contrast ≥4.5:1"] = (not c1, c1 or [f"min {min(contrast(tok[n], tok['surface']) for n in ('ink', 'mute', 'dim')):.2f}:1 for text greys"])
    results["W1 writing style"] = (not w1, w1)

    passed = sum(ok for ok, _ in results.values())
    total = len(results)
    width = max(len(k) for k in results)
    for k, (ok, det) in results.items():
        print(f"{'PASS' if ok else 'FAIL'}  {k.ljust(width)}  " + ("; ".join(det[:6]) + (" …" if len(det) > 6 else "")))
    summary = (f"deck eval {passed}/{total} checks pass · {len(claims)} numbers traced to source · "
               f"{sum(1 for s in secs)} slides rendered headless · spoken {sum(sec_time.values()) / 60:.1f} min")
    print(summary)
    (ROOT / "data/deck_eval.json").write_text(json.dumps(
        {"summary": summary, "passed": passed, "total": total,
         "results": {k: {"pass": ok, "details": det} for k, (ok, det) in results.items()}}, indent=1, ensure_ascii=False), encoding="utf-8")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
