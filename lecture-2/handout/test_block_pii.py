"""Planted test for block_pii.py: python handout/test_block_pii.py (prints PASS/FAIL per case, exits 1 on any failure)."""
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).with_name("block_pii.py")
CASES = [
    ("Draft a reply to S1234567D (mobile 9123 4567) about the late work.", 2),
    ("Student t0123456j asked for an extension.", 2),
    ("Call me at +65 8123-4567 tomorrow.", 2),
    ("Draft a reply to student A0423 about the late work.", 0),
    ("Summarise the 2019 Kaggle scores: 0.96355 and 0.91822.", 0),
    ("The office line is 6123 4567 x12", 2),
    ("Order 123456789 shipped.", 0),
]


def run(prompt):
    r = subprocess.run([sys.executable, "-I", str(HOOK)], input=json.dumps({"hook_event_name": "UserPromptSubmit", "prompt": prompt}),
                       capture_output=True, text=True)
    return r.returncode, r.stderr.strip()


fails = 0
for prompt, want in CASES:
    code, err = run(prompt)
    ok = code == want
    fails += not ok
    print(("PASS" if ok else "FAIL"), f"exit {code} (want {want}):", prompt, ("| " + err if err else ""))
sys.exit(1 if fails else 0)
