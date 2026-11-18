# Handout: three habits from "The Age of LLMs"

## 1. Building a teaching explainer (the recipe from slide 4)

1. **Describe the whiteboard exercise** in plain words: the data, what the student clicks, what they should see. My first message was 90 words; the first working page came 15 minutes later.
2. **Ask for delight**: a sound, a satisfying animation. Attention comes before understanding.
3. **Name the bar**: once one page is good, say "the bar is the X page" for the next one.
4. **Pin it to the real library**: "use the default parameters of R randomForest / Python XGBRegressor", so students can reproduce every number.
5. **Ask a second agent to attack it**: "adversarial review on these files". Mine found 122 of 400 XGBoost predictions off by up to 19 points.

When something looks wrong, ask "reason it out before making any changes" so it explains before it edits.

## 2. Make the check run every time (hooks, exit 2)

A hook is a script Claude Code runs at a fixed moment. A `Stop` hook that runs your check makes Claude fix failures before it finishes, **if the script exits with code 2**. Exit 1 is treated as a broken hook and the task is marked complete anyway.

```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "python evals/check.py || exit 2" } ] } ] } }
```

Write the error message as an instruction: what is wrong, what to do, how to confirm it is fixed.

## 3. Keep personal data out of the prompt (PDPA)

- Personal data is "data, whether true or not, about an individual who can be identified" (PDPA s 2(1)). NRIC, personal phone numbers, home addresses, matric numbers with grades and medical certificates all count. Business contact information is excluded.
- Work on pseudonymised copies, and keep student records outside the folder Claude works in.
- `block_pii.py` is a `UserPromptSubmit` hook that blocks a prompt containing an NRIC/FIN or a Singapore phone number before it reaches Claude. Copy it to `.claude/hooks/` in your project and add to `.claude/settings.json`:

```json
{ "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "python .claude/hooks/block_pii.py" } ] } ] } }
```

Test it: `python handout/test_block_pii.py` (7 planted prompts, all should PASS). It checks only what you type, not files Claude reads, which is why habit two (keep the records out of reach) still matters.

Sources: Claude Code hooks guide and reference (code.claude.com/docs/en/hooks-guide); PDPC Advisory Guidelines on Key Concepts in the PDPA (revised 29 April 2026); PDPC NRIC Advisory Guidelines (2018).
