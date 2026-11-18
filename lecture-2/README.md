# Lecture 2: The Age of LLMs

### ▶ [Open the talk in your browser](https://darrylteo.github.io/llms-for-esd-talk/lecture-2/talk.html)

[![Slide 9: below the storm, a hook sways in calm water with the three hook events beside it](docs/preview.png)](https://darrylteo.github.io/llms-for-esd-talk/lecture-2/talk.html)

Press → or Space to advance, F for fullscreen and P for the presenter view.

A 15-minute talk for SUTD faculty and staff, built from the slides of [lecture 1](../lecture-1/). There is no Q&A slot. It covers how teaching machine learning changed between 2019 and now, with a live demo of [ML Explainers](https://ml-explainers.sutdpm.workers.dev), how agents work, and three habits: checks, hooks and keeping personal data (PDPA) out of the prompt. The hook from the PDPA slide is in `handout/`, with its tests.

| Section | Time | Slides |
|---|---|---|
| Opening, then teaching in 2019 vs now | 7:00 (includes a 3:00 live demo) | 1–4 |
| How LLMs work | 3:00 | 5–7 |
| Best practices: checks, hooks, PDPA | 5:00 | 8–12 |

## Presenting (laptop over HDMI)

1. Open `talk.html` in Chrome or Edge. It works offline. Keep `clips/` and `film/` next to it.
2. **F** fullscreen, **P** presenter view (notes, next build, timer), **N** notes strip, **B** blank, number + Enter to jump, **G** or the bottom edge for the slide picker.
3. **Slide 1** starts black. Click 1: 29 pages flip past, with a soft paper sound. Click 2: the recorded forest. Click 3: the line and your name.
4. **Slide 3**, click 3 shows the demo card. Switch to the browser tab at https://ml-explainers.sutdpm.workers.dev for about 3 minutes (demo steps are in the notes), then come back.
5. **Slide 9** plays rain and one thunder clap as it opens, so check the laptop volume. Click 1 pulls the view underwater and the sound fades out.
6. **Slide 12**: one click plays WALL-E (silent, 17 s). It then turns into the thank-you screen with a short swell. Click again to skip.

## Files

| Path | What it is |
|---|---|
| `talk.html` | The deck to present (built, offline) |
| `artifact/index.html` | The same deck for a claude.ai Artifact link (CDN fonts and D3) |
| `src/slides.html`, `src/slides.js` | Every slide, its speaker notes, and its animation, keyed by slide id |
| `src/engine.js`, `src/deck.css`, `src/shell.html` | Slide engine and styles, from lecture 1. Colours and fonts are in `../shared/theme-keynote.css` |
| `assets/` | Kaggle crop (classmates' photos blurred), explainer screenshot, QR code |
| `clips/rf-forest.mp4` | 15 s recording of the live Random Forest explainer (`scripts/record_explainer.js`) |
| `handout/` | `block_pii.py` (UserPromptSubmit hook), its planted test, and a one-page handout |
| `data/sources/` | The facts behind every quote and number: Lydia Hallie transcript excerpts, the explainer build log, PDPA and hooks excerpts (not published) |

## Rebuild and check

Run from this folder (`lecture-2/`):

```bash
python -I ../shared/build.py && python -I ../shared/shoot.py && python -I scripts/eval_deck.py
```

`eval_deck.py` checks timing, headline length, rendering errors and overflow on every slide, every quote and key number against `data/sources/`, referenced files, the hook's tests, and writing style. `data/sources/` (transcript excerpts and build logs) is not published, so the quote and number checks only run on the original copy. To re-record the forest clip, see the header of `scripts/record_explainer.js`.

Slide 1's flip-book is a pre-rendered film (`film/flipbook.mp4`, 60 fps with the paper sounds baked in), because 29 live 3D pages stuttered on a projector. To re-render it, see the headers of `film/src/render_flipbook.js` and `film/src/flipbook_audio.py`. The CSS version in `src/slides.js` is the fallback when the file is missing.
