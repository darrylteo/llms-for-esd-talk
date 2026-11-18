"""Paper sounds for film/flipbook.mp4: python flipbook_audio.py <frames_dir>/schedule.json out.wav

One soft page turn per flip, at the times flipbook.html uses: a filtered noise swish rising over the turn,
then a light paper flick as the page lands. Early turns are louder; the fast riffle at the end is quieter.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(29)


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def turn(level):
    d = 0.42
    n = int(d * SR)
    t = np.arange(n) / SR
    swish = band(rng.standard_normal(n), 1200, 7000) * np.sin(np.pi * np.clip(t / 0.34, 0, 1)) ** 2 * 0.5
    k = int(0.03 * SR)
    flick = np.zeros(n)
    s = int(0.30 * SR)
    burst = band(rng.standard_normal(k), 1800, 9000) * np.exp(-np.arange(k) / (0.006 * SR))
    flick[s:s + k] = burst[: max(0, min(k, n - s))]
    return level * (swish + flick)


def main():
    sch = json.load(open(sys.argv[1]))
    total = int((sch["dur"] + 0.5) * SR)
    out = np.zeros(total)
    for i, t0 in enumerate(sch["turns"]):
        level = 0.55 if i < 4 else max(0.18, 0.55 * 0.9 ** (i - 3))
        x = turn(level)
        a = int(t0 * SR)
        out[a:a + len(x)] += x[: total - a]
    out = out / max(1e-9, np.abs(out).max()) * 0.35
    pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
    with wave.open(sys.argv[2], "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print("wrote", sys.argv[2], round(total / SR, 2), "s")


if __name__ == "__main__":
    main()
