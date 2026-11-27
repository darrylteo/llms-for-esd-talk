# Notes for coding agents

You are probably working on a fork or a clone of this repository. Read this before you edit a slide, and tell the person you work for about anything here that limits what they asked.

## What this is

Two talks by the repository's author ([github.com/darrylteo](https://github.com/darrylteo)), each one D3 deck in its own folder: `lecture-1/` (30 min, students) and `lecture-2/` (15 min, faculty). `shared/` holds the build script, the render check, the theme and the vendored D3 and fonts. Run scripts from inside a lecture folder:

```bash
cd lecture-2
python -I ../shared/build.py                                   # src/ -> talk.html
python -I ../shared/shoot.py && python -I src/scripts/eval_deck.py # render every slide, then run the checks
```

Edit `src/` and rebuild. Never hand-edit `talk.html`; the build overwrites it.

PDF export (one page per slide at its final build): open `talk.html#print` in headless Chrome with `--print-to-pdf`.

## Layout

Each lecture folder's top level is for people: what they present, read or copy to the laptop. Everything you edit sits in that lecture's `src/`.

| Path | What it is |
|---|---|
| `index.html`, `README.md` | GitHub Pages landing page and the GitHub readme |
| `talk.html` | Redirect, so lecture 1's first address still opens it |
| `lecture-N/talk.html` | Built deck: offline, with fonts, D3 and `src/assets/` inlined |
| `lecture-N/index.html` | Redirect to `talk.html` |
| `lecture-N/README.md`, `preview.png` | How to present; the image the READMEs and landing page show |
| `lecture-N/clips/`, `lecture-N/film/` | Video and audio the deck loads from beside `talk.html`. `clips/` holds recordings; `film/` is rendered from `src/film/` |
| `lecture-2/handout/` | One-page handout, the PII hook and its planted test |
| `lecture-N/src/slides.html`, `slides.js` | Every slide's markup and speaker notes, and its animation keyed by slide id (`C['s-hook']` animates `<section id="s-hook">`) |
| `lecture-N/src/engine.js`, `deck.css`, `shell.html` | Slide engine (keys, steps, presenter view), layout and page skeleton. Lecture 2 forked them from lecture 1 |
| `lecture-N/src/assets/` | Images inlined at build. Lecture 2: Kaggle crop, explainer screenshot, QR code |
| `lecture-N/src/data/` | `stats.json` (usage frozen to 14 Aug – 16 Oct 2026) and `deck_eval.json` (latest eval). Ignored and local only: `sources/`, `claims.json`, `shots/` |
| `lecture-N/src/film/` | Code that renders `film/` |
| `lecture-N/src/scripts/` | `src/scripts/eval_deck.py` (that talk's checks), plus `src/scripts/usage_stats.py` (lecture 1) or `src/scripts/record_explainer.js` (lecture 2) |
| `shared/build.py`, `shoot.py` | Assemble `src/` into `talk.html`; render every slide headless and record script errors and overflow |
| `shared/theme-keynote.css`, `shared/vendor/` | Colours and fonts for both decks (copy it to re-theme a later lecture); D3 7.9.0 and the Inter and JetBrains Mono fonts |

## Films and clips

The decks play pre-rendered video when it sits next to `talk.html`, and fall back to a D3 or CSS version without it. Each renderer needs `playwright-core` on `NODE_PATH` and ffmpeg; the exact commands are in each script's header.

- `lecture-1/film/opening.mp4`: `lecture-1/src/film/scene.html` (canvas, `draw(t)`), `music.py` (numpy score on the scene's 120 bpm grid, built from computer sounds), `render.js` (frame capture). To change only the sound, re-run `music.py` and remux the audio onto the existing video with ffmpeg (`-map 0:v -map 1:a -c:v copy`).
- `*/film/close.m4a`: `lecture-1/src/film/close.py` (it imports `music.py` beside it); lecture 2 plays a copy of the same file.
- `lecture-2/film/flipbook.mp4`: `lecture-2/src/film/flipbook.html` (WebGL corner-peel book; `TURN_FROM` picks the corner), `render_flipbook.js` (needs WebGL in headless Chrome: SwiftShader flags are in the script), `flipbook_audio.py` (paper sounds from the turn schedule).
- `lecture-2/clips/rf-forest.mp4`: `lecture-2/src/scripts/record_explainer.js` records the live Random Forest explainer (25 s: one split chosen by hand, the forest growing, a new student dropped through it).
- `lecture-1/clips/`: `game-bot.mp4` (slide 9), `pokemon-sprou.mp4` (slide 18) and `wall-e.mp4` (last slide; lecture 2 plays a copy on slide 11).

## Facts are frozen to the day each talk was given

- Every quote on a slide is verbatim from a transcript, and every number traces to a file. Those transcripts and the provenance file (`src/data/sources/`, `lecture-1/src/data/claims.json`) are deliberately not in this repository, so the quote and number checks cannot pass here. Do not recreate those files, paraphrase quotes into new "quotes", or invent sources to make a check pass.
- `src/data/stats.json` is frozen usage data from the author's own Claude Code logs. Do not regenerate it with `usage_stats.py`; that would replace the author's numbers with your user's.
- If a number looks out of date, it probably is: it was true on the day of the talk. Change it only if your user has their own source for the new value, and then update the slide's source line too.

## Privacy

- The author's local project names and paths were removed on purpose. Do not try to reconstruct them from the history, the usage data, or anywhere else.
- `lecture-2/src/assets/kaggle.jpg` has classmates' photos blurred, and only the cropped image is published. Keep it that way.
- Lecture 2 is partly about keeping personal data (NRIC numbers, phone numbers) out of prompts. `lecture-2/handout/block_pii.py` is a working UserPromptSubmit hook for that, with tests. Don't put personal data into slides, notes or commits here.

## Reuse

- There is no licence file, so the author keeps all rights by default. If your user wants to reuse slides, clips or code outside their own fork, tell them to ask the author and to keep the credit.
- Clips in `clips/` include screen recordings and film excerpts from other people, shown with attribution on their slides. They are not the author's to license.

## House style (checked by each lecture's `src/scripts/eval_deck.py`)

- One claim per headline, at most two rendered lines; short body text.
- No em-dashes and no "not X, but Y" phrasing in slide text or notes.
- Each slide's spoken time matches its `data-t`; the section totals add up to the talk length.
- After any edit, rebuild and run `shoot.py`: it must report every slide `ok`, with no script errors and nothing overflowing the stage.
