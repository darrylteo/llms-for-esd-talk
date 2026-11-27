"""Assemble a lecture deck. Run from inside a lecture folder:  cd lecture-1 && python -I ../shared/build.py

Writes talk.html: offline and self-contained (D3, fonts and small images inlined). GitHub Pages serves the same file.
"""
import base64
import json
import re
import sys
from pathlib import Path

SHARED = Path(__file__).resolve().parent


def deck_root():
    """The lecture folder: --deck DIR, else the current folder (run from inside lecture-N/)."""
    a = sys.argv
    root = Path(a[a.index("--deck") + 1]) if "--deck" in a else Path.cwd()
    root = root.resolve()
    if not (root / "src" / "slides.html").exists():
        sys.exit(f"{root} is not a lecture folder (no src/slides.html). Run from lecture-1/ or lecture-2/, or pass --deck.")
    return root


ROOT = deck_root()
SRC = ROOT / "src"
THEME = "theme-keynote.css"
STATS_KEYS = ("date_range", "active_days", "sessions", "totals", "by_day", "tools_top", "tools_total", "plan_usage")


def read(p):
    return ((SHARED if p == THEME else SRC) / p).read_text(encoding="utf-8")


def stats_json():
    s = json.loads((SRC / "data" / "stats.json").read_text(encoding="utf-8"))
    s = {k: s[k] for k in STATS_KEYS if k in s}
    s["totals"] = {"all": s["totals"]["all"]}
    return json.dumps(s, separators=(",", ":"))


def assemble() -> str:
    html = read("shell.html")
    slides = read("slides.html")
    rep = {
        "<!--SLIDES-->": slides,
        "/*THEME*/": read(THEME),
        "/*DECKCSS*/": read("deck.css"),
        "/*SLIDESJS*/": read("slides.js"),
        "/*ENGINEJS*/": read("engine.js"),
        "/*STATS*/": stats_json(),
    }
    css = (SHARED / "vendor" / "fonts-local.css").read_text(encoding="utf-8")

    def embed(m):
        data = (SHARED / m.group(1)).read_bytes()
        return "url(data:font/woff2;base64," + base64.b64encode(data).decode() + ")"
    css = re.sub(r"url\((vendor/[^)]+)\)", embed, css)
    rep["<!--FONTS-->"] = "<style>\n" + css + "\n</style>"
    rep["<!--D3-->"] = "<script>\n" + (SHARED / "vendor" / "d3.v7.9.0.min.js").read_text(encoding="utf-8") + "\n</script>"
    for k, v in rep.items():
        assert k in html or k in slides, k
        html = html.replace(k, v)
    # small images (src/assets/) are inlined so the deck stays one file; videos stay next to it in clips/ and film/
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml"}
    html = re.sub(r'src="(assets/[^"]+)"', lambda m: 'src="data:' + mime[Path(m.group(1)).suffix.lower()] + ';base64,' +
                  base64.b64encode((SRC / m.group(1)).read_bytes()).decode() + '"', html)
    html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + \
        html.replace("<div id=\"viewport\">", "</head>\n<body>\n<div id=\"viewport\">", 1) + "\n</body>\n</html>\n"
    return html


def main():
    (ROOT / "talk.html").write_text(assemble(), encoding="utf-8")
    print("built talk.html", (ROOT / "talk.html").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
