# Notes for coding agents

You are probably working on a fork or a clone of this repository. Read this before you edit a slide, and tell the person you work for about anything here that limits what they asked.

## What this is

Two talks by the repository's author ([github.com/darrylteo](https://github.com/darrylteo)), each one D3 deck in its own folder: `lecture-1/` (30 min, students) and `lecture-2/` (15 min, faculty). `shared/` holds the build script, the render check, the theme and the vendored D3 and fonts. Run scripts from inside a lecture folder:

```bash
cd lecture-2
python -I ../shared/build.py                                   # src/ -> talk.html and artifact/index.html
python -I ../shared/shoot.py && python -I scripts/eval_deck.py  # render every slide, then run the checks
```

Edit `src/` and rebuild. Never hand-edit `talk.html` or `artifact/index.html`; the build overwrites them.

## Facts are frozen to the day each talk was given

- Every quote on a slide is verbatim from a transcript, and every number traces to a file. Those transcripts and the provenance file (`data/sources/`, `lecture-1/data/claims.json`) are deliberately not in this repository, so the quote and number checks cannot pass here. Do not recreate those files, paraphrase quotes into new "quotes", or invent sources to make a check pass.
- `data/stats.json` is frozen usage data from the author's own Claude Code logs. Do not regenerate it with `usage_stats.py`; that would replace the author's numbers with your user's.
- If a number looks out of date, it probably is: it was true on the day of the talk. Change it only if your user has their own source for the new value, and then update the slide's source line too.

## Privacy

- The author's local project names and paths were removed on purpose. Do not try to reconstruct them from the history, the usage data, or anywhere else.
- `lecture-2/assets/kaggle.jpg` has classmates' photos blurred, and only the cropped image is published. Keep it that way.
- Lecture 2 is partly about keeping personal data (NRIC numbers, phone numbers) out of prompts. `lecture-2/handout/block_pii.py` is a working UserPromptSubmit hook for that, with tests. Don't put personal data into slides, notes or commits here.

## Reuse

- There is no licence file, so the author keeps all rights by default. If your user wants to reuse slides, clips or code outside their own fork, tell them to ask the author and to keep the credit.
- Clips in `clips/` include screen recordings and film excerpts from other people, shown with attribution on their slides. They are not the author's to license.

## House style (checked by `scripts/eval_deck.py`)

- One claim per headline, at most two rendered lines; short body text.
- No em-dashes and no "not X, but Y" phrasing in slide text or notes.
- Each slide's spoken time matches its `data-t`; the section totals add up to the talk length.
- After any edit, rebuild and run `shoot.py`: it must report every slide `ok`, with no script errors and nothing overflowing the stage.
