# Lecture 1: LLMs for ESD

### ▶ [Open the talk in your browser](https://darrylteo.github.io/llms-for-esd-talk/lecture-1/talk.html)

[![Slide 2 of the talk: a trust curve rising from "LLM output is trash" to daily use, next to 100 agents running on their own](preview.png)](https://darrylteo.github.io/llms-for-esd-talk/lecture-1/talk.html)

Press → or Space to advance, F for fullscreen and P for the presenter view.

30-minute talk: 1 min hook, 22 min technical (harness, context, evals), 7 min applications.

Part of a series: [lecture 2, The Age of LLMs](../lecture-2/), is a 15-minute version for faculty and staff. The [repository README](../README.md) lists both.

I gave this lecture to engineering students at the Singapore University of Technology and Design in Fall 2026. It covers how coding agents are built (the harness), what goes into their context, and how to evaluate their output, with examples from my own research. The deck is one self-contained HTML file built with D3; every slide and animation is in `src/`.

Short clips are screen recordings shown with attribution on their slides. The talk transcripts and notes behind some quotes (`src/data/sources/`) and the provenance file for each number (`src/data/claims.json`) are not included in this repository, so `src/scripts/eval_deck.py` only runs on the original copy.

## Presenting (laptop over HDMI)

1. Open `talk.html` in Chrome or Edge. It is self-contained and works offline (fonts and D3 are embedded).
2. Press **F** for fullscreen on the projector.
3. Press **P** to open the presenter view in a second window: current and next build, speaker notes, a clock, and a plan timer (green while you are on time). Drag that window to the laptop screen. **T** resets the timer.
   If the browser blocks the pop-up, press **N** for a notes strip at the bottom of the main window instead.
4. Use → / Space / PageDown, or a clicker, to advance. ← to go back. Type a number and Enter to jump to that slide. **B** blanks the screen.
5. During questions, move the mouse to the bottom edge (or press **G**) for a row of numbered slide buttons. Hover one to see its headline; click it to jump there, fully built. **Esc** hides it.

Slide 1 starts black. Your first click starts the 25-second opening film (with sound, so check the laptop volume); a second click skips to its last line.

The last slide starts black too. One click plays the WALL-E clip (silent, 17 s); when it ends, the screen turns into the questions slide by itself with a short swell of music. Click again to skip the clip.

Engagement moments are marked ★ in the notes: show of hands (slide 2), pages guess (6), guess the bill (17), the debate vote (19), spot the bad eval (21).

## Files

| Path | What it is |
|---|---|
| `talk.html` | The deck to present (offline, ~1 MB) |
| `src/slides.html` | Every slide's markup and speaker notes, in order |
| `src/slides.js` | Every slide's animation, in slide order, keyed by slide id (`C['s-hook']` animates `<section id="s-hook">`) |
| `src/engine.js`, `src/shell.html`, `src/deck.css` | Slide engine (keys, steps, presenter view), page skeleton, layout |
| `../shared/theme-keynote.css` | All colours and fonts, shared with lecture 2. Copy and edit this file to re-theme a later lecture |
| `src/data/stats.json` | Usage numbers, frozen to 14 Aug – 16 Oct 2026 |
| `src/data/deck_eval.json` | Latest eval result from `src/scripts/eval_deck.py` |
| `clips/` | Silent clips the deck plays: `game-bot.mp4` (slide 9), `pokemon-sprou.mp4` (slide 18), `wall-e.mp4` (last slide) |
| `film/close.m4a` | The swell under the questions slide (`src/film/close.py`) |

## Opening film

Slide 1 plays `film/opening.mp4` (25 s, 1920×1080, with sound) on the first click when that file sits next to `talk.html`; without it, the same sequence runs as a silent D3 animation. The film is drawn in code: `src/film/scene.html` (canvas, `draw(t)`), `src/film/music.py` (numpy score on the same 120 bpm grid, built from computer sounds: keystrokes, beeps, a drive spinning up, a screen switching off), `src/film/render.js` (frame capture in headless Chrome).

Keep the `film/` and `clips/` folders with the deck when you copy it to the laptop.
