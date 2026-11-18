"""Render slides with headless Chrome: shoot.py [slide ...] [--step N] [--size 1920x1080] [--out dir] [--deck dir]

Run from inside a lecture folder (cd lecture-1 && python -I ../shared/shoot.py), or pass --deck.
Default: every slide at its final step. Writes PNGs to <lecture>/data/shots/.
Also dumps the DOM per slide to collect script errors recorded by the engine (data-errors on <body>).
"""
import argparse
import os
import queue
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
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
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
WORKERS = 6
# One fixed profile per worker, reused across runs (two Chrome processes cannot share a profile). Without a fixed
# profile Chrome installs the default extensions on every launch and leaves copies in %TEMP%; --disable-extensions
# skips that install.
PROFILES = Path(os.environ.get("CHROME_PROFILES", r"C:\dev\chrome-profiles"))
free_profiles = queue.Queue()
for k in range(WORKERS):
    free_profiles.put(PROFILES / f"talk-shoot-{k}")


def count_slides():
    return len(re.findall(r'<section class="slide"', (ROOT / "talk.html").read_text(encoding="utf-8")))


def shoot(i, step, size, out):
    url = (ROOT / "talk.html").as_uri() + f"#v{i}s{step}"
    png = out / f"s{i:02d}_step{step}.png"
    w, h = size.split("x")
    profile = free_profiles.get()
    try:
        base = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
                f"--window-size={w},{h}", "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
                f"--user-data-dir={profile}", "--disable-extensions", "--disable-default-apps", "--no-first-run"]
        subprocess.run(base + [f"--screenshot={png}", url], capture_output=True, timeout=120)
        dom = subprocess.run(base + ["--dump-dom", url], capture_output=True, timeout=120, text=True, encoding="utf-8").stdout
    finally:
        free_profiles.put(profile)
    (out / f"s{i:02d}.dom.html").write_text(dom, encoding="utf-8")
    m = re.search(r'data-errors="([^"]*)"', dom)
    o = re.search(r'data-overflow="([^"]*)"', dom)
    msg = (m.group(1) if m else "") + ((" OVERFLOW " + o.group(1)) if o and o.group(1) else "")
    return i, png, msg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slides", nargs="*", type=int)
    ap.add_argument("--step", type=int, default=99)
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", default=str(ROOT / "data" / "shots"))
    ap.add_argument("--deck", help="lecture folder (default: the current folder)")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    out = Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    ids = a.slides or list(range(1, count_slides() + 1))
    with ThreadPoolExecutor(WORKERS) as ex:
        for i, png, err in ex.map(lambda i: shoot(i, a.step, a.size, out), ids):
            print(f"slide {i:2d} {'ERR ' + err if err else 'ok'}  {png.name}")


if __name__ == "__main__":
    main()
