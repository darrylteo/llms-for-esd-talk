# Notes for coding agents

You are probably on a fork or clone. Read this before you edit a slide, and tell your user anything here that limits their request.

Two D3 talks by [darrylteo](https://github.com/darrylteo): `lecture-1/` (30 min, students) and `lecture-2/` (15 min, faculty). Each lecture's top level is for people; you edit its `src/`. Layout, film renderers and PDF export: [docs/reference.md](docs/reference.md).

## Build and check

```bash
cd lecture-2
python -I ../shared/build.py
python -I ../shared/shoot.py && python -I src/scripts/eval_deck.py
```

- Edit `src/` and rebuild; never hand-edit `talk.html`, which the build overwrites.
- After any edit, `shared/shoot.py` must report every slide `ok`: no script errors, nothing overflowing the stage.

## House style (checked by `src/scripts/eval_deck.py`)

- One claim per headline, at most two rendered lines; short body text.
- No em-dashes and no "not X, but Y" phrasing in slide text or notes.
- Each slide's spoken time matches its `data-t`; section totals add up to the talk length.

## Facts are frozen to the day of each talk

- Quotes are verbatim from transcripts; numbers trace to files. The transcripts and provenance file (`src/data/sources/`, `lecture-1/src/data/claims.json`) are unpublished, so the quote and number checks cannot pass here. Never recreate them, turn paraphrases into "quotes", or invent sources.
- Never regenerate `src/data/stats.json`, the author's frozen usage data, with `lecture-1/src/scripts/usage_stats.py`; it would swap in your user's numbers.
- An out-of-date number was true on the talk's day; change it only from your user's own source, and update the slide's source line.

## Privacy

- Never reconstruct the author's local project names and paths, removed on purpose, from history, usage data or elsewhere.
- `lecture-2/src/assets/kaggle.jpg` blurs classmates' photos; publish only that crop.
- Keep personal data (NRIC numbers, phone numbers) out of slides, notes and commits. `lecture-2/handout/block_pii.py` is a working hook for it, with tests.

## Reuse

- With no licence file, the author keeps all rights. Reuse outside your user's fork needs the author's permission and credit.
- `lecture-N/clips/` holds other people's recordings and film excerpts, shown with attribution; they are not the author's to license.
