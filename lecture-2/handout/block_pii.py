"""UserPromptSubmit hook: stop a prompt that contains an NRIC/FIN or a Singapore phone number.

Claude Code passes the event as JSON on stdin; the prompt text is in "prompt".
Exit 2 blocks the prompt, so it never reaches Claude, and shows the stderr message.
Exit 0 lets it through. (Exit 1 would NOT block: Claude Code treats it as a broken hook.)
"""
import json
import re
import sys

CHECKS = [
    # NRIC / FIN: S, T, F, G or M, seven digits, a check letter (e.g. S1234567D)
    ("an NRIC/FIN number", re.compile(r"\b[STFGM]\d{7}[A-Z]\b", re.IGNORECASE)),
    # Singapore phone: 8 digits starting with 6, 8 or 9, optional +65 and one space or dash in the middle
    ("a phone number", re.compile(r"(?<!\d)(?:\+65[ -]?)?[689]\d{3}[ -]?\d{4}(?!\d)")),
]


def main():
    prompt = json.load(sys.stdin).get("prompt", "")
    found = [name for name, rx in CHECKS if rx.search(prompt)]
    if found:
        print("Blocked: the prompt contains " + " and ".join(found) + ". "
              "Replace it with a student ID or a placeholder ([NRIC], [PHONE]), then send it again.", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
