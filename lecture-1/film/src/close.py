"""Closing swell for the questions screen: python close.py close.wav, then encode to film/close.m4a

12 s, starts when the WALL-E clip hands over to the questions screen (src/slides.js, s-close). No bells, no drums:
  0.0-1.4  a low air whoosh as the neon floor fades in
  0.3-6.0  one warm F major 9 chord, its filter opening slowly like a screen warming up
  2.9-4.1  a key click for each letter of "Questions?" (times shared with QA_TYPE_AT in src/slides.js)
  6.0-11.5 the chord fades to silence, so the room is quiet when the questions start
Reuses the synth helpers in music.py.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music as M  # noqa: E402

DUR = 12.0
M.N = int(M.SR * DUR)
N = M.N
SR = M.SR
QA_TYPE_AT = [2.90, 3.02, 3.13, 3.27, 3.38, 3.49, 3.63, 3.74, 3.86, 4.12]


def opening_saw(f, t, bright):
    """A saw whose upper harmonics fade in with `bright` (0 dark .. 1 open): a filter sweep without filters."""
    out = np.zeros_like(t)
    for k in range(1, 14):
        if f * k > 8000:
            break
        out += np.sin(2 * np.pi * f * k * t + k) / k ** (1.2 + 2.6 * (1 - bright) * (k > 1))
    return out


def main(out_path):
    t = np.arange(N) / SR
    buf = np.zeros((2, N))
    bright = np.clip((t - 0.3) / 4.5, 0, 1) ** 1.5
    chord = ['F2', 'C3', 'G3', 'A3', 'E4']
    pad = np.zeros(N)
    for n in chord:
        for det in (-0.003, 0.0, 0.0035):
            pad += opening_saw(M.hz(n) * (1 + det), t, bright)
    env = np.clip((t - 0.3) / 2.2, 0, 1) ** 2 * np.clip((11.5 - t) / 5.5, 0, 1) ** 1.6
    pad *= env / (len(chord) * 3)
    M.place(buf, pad, 0.0, 0.9)
    sub = np.sin(2 * np.pi * M.hz('F1') * t) * env
    M.place(buf, sub, 0.0, 0.25)
    # whoosh: band noise rising, as the floor fades in
    n = int(1.4 * SR)
    w = M.fft_filter(M.NOISE[:n], lo=200, hi=2500) * np.sin(np.linspace(0, np.pi, n)) ** 2
    M.place(buf, w, 0.0, 0.2)
    buf = M.reverb(buf, seconds=3.0, decay=0.8, mix=0.35)
    for i, k in enumerate(QA_TYPE_AT):
        M.place(buf, M.keyclick(i * 3 + 5, 0.9), k, 0.16, pan=-0.2 + i * 0.04)
    buf = buf / np.max(np.abs(buf)) * 10 ** (-16 / 20)  # quiet: a bed under the room, not a sting
    M.write_wav(out_path, buf)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'close.wav')
