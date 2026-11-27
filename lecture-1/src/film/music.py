"""Score for the opening film, synthesised from scratch with numpy: python music.py out.wav

Built from the sounds of a computer, the way Apple opened its October 2021 keynote with a track made from its
own products' sounds: keystrokes, beeps, a drive spinning up, an odometer, a screen switching off. Every sound is
tied to something on screen, on the same 120 bpm grid as scene.html (one beat = 0.5 s):
  0.75  the sentence is typed: key clicks, a space-bar thock as each word lands      3.0  Enter
  3.4   ticks on the token boundaries        4.0  impact as the words split, one blip per chip
  6.0   the context panel opens: low machine hum and a quiet pad
  6.5   a two-tone beep as each context layer locks in         8.4  chips stream in: rising data blips
  8.0   a drive spins up into 10.0           10.0 drop: keyboard drum kit, pulse bass, square-wave arpeggio,
        and an odometer tick each time the token counter rolls over a step
  12.0  a confirm beep as each layer turns green               16.0 second hit for "98% read from cache"
  20.0  hard cut: the screen's power-off zap, then silence under the last line (the speaker's pause)
Needs numpy only (no scipy): filters are done in the frequency domain, waves are band-limited additive.
The previous bell score is kept in music_bells.py.bak.
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 25.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)


def hz(note):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def place(buf, x, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR))
    if i >= N:
        return
    x = x[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(x)] += x * gain * l * np.sqrt(2)
    buf[1, i:i + len(x)] += x * gain * r * np.sqrt(2)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, length=None):
    length = length or n / SR
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - (length - r)) / max(r, 1e-6), 0, 1)
    return env * (1 - rel)


def fft_filter(x, lo=None, hi=None):
    """Zero-phase band shaping with soft (one-octave) edges."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= np.clip(np.log2(np.maximum(f, 1) / lo) + 1, 0, 1)
    if hi:
        g *= np.clip(1 - np.log2(np.maximum(f, 1) / hi), 0, 1)
    return np.fft.irfft(X * g, len(x))


def saw(f, d, harm=12, roll=1.3, detune=0.0):
    t = tt(d)
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > 9000:
            break
        out += np.sin(2 * np.pi * f * k * (1 + detune) * t + k) / k ** roll
    return out


def pad(notes, d, level=0.08):
    out = np.zeros(int(d * SR))
    for n in notes:
        f = hz(n)
        for det in (-0.004, 0.0, 0.0045):
            out += saw(f, d, harm=8, roll=1.8, detune=det)
    env = adsr(len(out), a=min(1.2, d / 3), d=1.0, s=1.0, r=min(1.0, d / 3), length=d)
    return out * env * level / len(notes)


def pluck(f, d=1.2, bright=1.0):
    t = tt(d)
    x = np.sin(2 * np.pi * f * t) + 0.35 * bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) \
        + 0.15 * bright * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 10)
    return x * np.exp(-t * 4.5) * np.minimum(1, t / 0.003)


def bell(f, d=2.0):
    t = tt(d)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2) * np.minimum(1, t / 0.002)


def kick(d=0.45, punch=1.0):
    t = tt(d)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t * 7) + 0.25 * punch * np.exp(-t * 120) * rng.standard_normal(len(t)) * 0.3)


def boom(d=1.6):
    t = tt(d)
    f = 38 + 70 * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 2.4)


NOISE = rng.standard_normal(N + SR)
HAT_SRC = fft_filter(NOISE[: SR * 2], lo=7000)
CRASH_SRC = fft_filter(NOISE[SR: SR * 4], lo=3000, hi=14000)
CLICK_SRC = fft_filter(NOISE[: SR // 4], lo=2500, hi=9000)


def hat(d=0.06, off=0):
    n = int(d * SR)
    s = HAT_SRC[off % (len(HAT_SRC) - n):][:n]
    return s * np.exp(-np.arange(n) / SR * 70)


def crash(d=2.0):
    n = int(d * SR)
    return CRASH_SRC[:n] * np.exp(-np.arange(n) / SR * 2.2)


def click(off=0):
    n = int(0.03 * SR)
    return CLICK_SRC[off * 97 % (len(CLICK_SRC) - n):][:n] * np.exp(-np.arange(n) / SR * 160)


def reverb(x, seconds=2.2, decay=0.45, mix=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.empty_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / decay)
        ir = fft_filter(ir, lo=200, hi=7000)
        ir /= np.sqrt(np.sum(ir ** 2))
        L = len(x[ch]) + n
        size = 1 << int(np.ceil(np.log2(L)))
        wet = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: len(x[ch])]
        out[ch] = x[ch] + mix * wet
    return out


def square(f, d, harm=7, roll=1.0):
    t = tt(d)
    out = np.zeros_like(t)
    for k in range(1, 2 * harm, 2):
        if f * k > 12000:
            break
        out += np.sin(2 * np.pi * f * k * t) / k ** roll
    return out


def keyclick(off=0, bright=1.0):
    """One mechanical key: a short bright click plus a small plastic body."""
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    c = CLICK_SRC[(off * 131) % (len(CLICK_SRC) - n):][:n] * np.exp(-t * 260) * bright
    f0 = 180 + (off * 37) % 90
    body = np.sin(2 * np.pi * f0 * t) * np.exp(-t * 70) * 0.5
    return (c * 0.8 + body) * np.minimum(1, t / 0.0008)


def thock(f0=95, d=0.12, weight=1.0):
    """Space bar or Enter: a deeper, longer key with a little pitch drop."""
    t = tt(d)
    f = f0 * (1 + 0.6 * np.exp(-t * 60))
    ph = 2 * np.pi * np.cumsum(f) / SR
    n = len(t)
    noise = fft_filter(NOISE[SR * 3: SR * 3 + n], hi=2500) * np.exp(-t * 90)
    return (np.sin(ph) * np.exp(-t * 32) * weight + noise * 0.6) * np.minimum(1, t / 0.0008)


def beep(f, d=0.09, harm=5):
    x = square(f, d, harm=harm, roll=1.2)
    return x * adsr(len(x), a=0.002, d=0.05, s=0.7, r=0.02, length=d)


def blip(f, d=0.05):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 55) * np.minimum(1, t / 0.001)


def hum(d):
    t = tt(d)
    x = 0.6 * np.sin(2 * np.pi * 55 * t) + 0.3 * np.sin(2 * np.pi * 110 * t) + 0.12 * np.sin(2 * np.pi * 165 * t)
    x += fft_filter(NOISE[: len(t)], lo=300, hi=1200) * 0.25
    return x


def spin_up(d=2.0):
    t = tt(d)
    f = 240 * 2 ** (3.2 * (t / d) ** 1.3)
    ph = 2 * np.pi * np.cumsum(f) / SR
    whine = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * (1 + 0.15 * np.sin(2 * np.pi * 9 * t))
    air = fft_filter(NOISE[: len(t)], lo=1500, hi=9000)
    return (whine * 0.35 + air * 0.5) * (t / d) ** 2


def crt_off(d=0.35):
    t = tt(d)
    f = 1400 * np.exp(-t * 14) + 50
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * np.minimum(1, t / 0.001)


def write_wav(path, mix):
    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2').T.copy()
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main(out_path):
    main = np.zeros((2, N))   # tonal parts (get reverb)
    fx = np.zeros((2, N))     # dry keys, drums, ticks

    # 0.75-2.75: the sentence is typed. Letters fill each eighth note, the space bar lands with the word.
    words = ['Schedule', '40', 'flights', 'across', '12', 'gates', 'with', 'no', 'conflicts.']
    k = 0
    for i, w in enumerate(words):
        tw = 0.75 + i * 0.25
        for j in range(len(w)):
            place(fx, keyclick(k, 0.9), tw - 0.23 + j * 0.2 / len(w), 0.22, pan=-0.35 + 0.7 * j / max(1, len(w) - 1))
            k += 1
        place(fx, thock(110 - i * 2, 0.1, 0.7), tw, 0.42)
    place(fx, thock(80, 0.18, 1.0), 3.0, 0.6)  # Enter

    # 3.4: token boundaries, a tick each, rising
    for i in range(10):
        place(fx, blip(2200 + i * 160, 0.03), 3.4 + (i + 1) * 0.025, 0.12, pan=-0.6 + i * 0.12)
    # 4.0: the split. An impact, then one blip per chip as it pops out
    place(fx, boom(1.4), 4.0, 0.55)
    place(main, crash(1.0), 4.0, 0.08)
    for i, n in enumerate(['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6']):
        place(main, beep(hz(n), 0.05, 3), 4.0 + i * 0.035 + 0.1, 0.05, pan=-0.7 + i * 0.14)

    # 4.0-10.0: a quiet keyboard pulse (thock on the beat, key clicks on the off-beat from 5.0)
    for b in np.arange(4.0, 10.0, BEAT):
        place(fx, kick(punch=0.3), b, 0.22)
        place(fx, thock(70, 0.08, 0.6), b, 0.18)
        if b >= 5.0:
            place(fx, keyclick(int(b * 10), 1.1), b + BEAT / 2, 0.16, pan=0.3)

    # 6.0: the panel opens. Machine hum and a low pad underneath, never louder than the keys
    h = hum(14.0)
    h *= adsr(len(h), a=1.0, d=1, s=1, r=0.6, length=14.0)
    place(fx, h, 6.0, 0.05)
    for t0, t1, notes, lv in [(6, 8, ['A2', 'E3', 'A3'], 0.05), (8, 10, ['F2', 'C3', 'F3'], 0.05), (10, 12, ['A2', 'E3', 'A3'], 0.06),
                              (12, 14, ['F2', 'C3', 'F3'], 0.06), (14, 16, ['G2', 'D3', 'G3'], 0.06), (16, 18, ['C3', 'G3', 'C4'], 0.07),
                              (18, 20.2, ['G2', 'D3', 'G3'], 0.06)]:
        place(main, pad(notes, t1 - t0 + 0.3, lv), t0, 1.0)

    # 6.5-8.0: each context layer locks in: a relay click and a two-tone beep, a step higher each time
    for t0, (a, b2), p in [(6.5, ('A4', 'E5'), -0.3), (7.0, ('C5', 'G5'), -0.1), (7.5, ('D5', 'A5'), 0.1), (8.0, ('E5', 'C6'), 0.3)]:
        place(fx, keyclick(int(t0 * 7), 1.4), t0, 0.2, pan=p)
        place(main, beep(hz(a), 0.07), t0, 0.07, pan=p)
        place(main, beep(hz(b2), 0.11), t0 + 0.08, 0.07, pan=p)

    # 8.4: chips stream into the window: rising data blips
    for i, n in enumerate(['A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7', 'A7']):
        place(main, blip(hz(n), 0.04), 8.4 + i * 0.1 + 0.5, 0.07, pan=0.4)

    # 8.0-10.0: a drive spins up into the drop
    place(main, spin_up(2.0), 8.0, 0.22)

    # 10.0-20.0: keyboard drum kit, pulse bass, square-wave arpeggio
    roots = {10: 'A1', 12: 'F1', 14: 'G1', 16: 'C2', 18: 'G1'}
    arps = {10: ['A4', 'C5', 'E5', 'A5'], 12: ['F4', 'A4', 'C5', 'F5'], 14: ['G4', 'B4', 'D5', 'G5'],
            16: ['C5', 'E5', 'G5', 'C6'], 18: ['G4', 'B4', 'D5', 'G5']}
    for hit_t, ch in [(10.0, ['A3', 'E4', 'A4', 'C5']), (16.0, ['C4', 'G4', 'C5', 'E5'])]:
        place(fx, boom(1.6), hit_t, 0.6)
        place(main, crash(2.0), hit_t, 0.14)
        for j, n in enumerate(ch):
            st = square(hz(n), 1.2, harm=6, roll=1.4) * np.exp(-tt(1.2) * 3.5)
            place(main, st, hit_t, 0.05, pan=-0.3 + j * 0.2)
    for b in np.arange(10.0, 20.0, BEAT):
        sec = int(b // 2 * 2)
        place(fx, kick(), b, 0.5)
        place(fx, thock(65, 0.1, 0.8), b, 0.25)
        if round((b - 10.0) / BEAT) % 2 == 1:   # space-bar snare on 2 and 4
            place(fx, thock(140, 0.16, 0.8), b, 0.38)
            place(fx, hat(0.12, off=int(b * 333)), b, 0.1)
        for s16 in range(4):
            place(fx, keyclick(int(b * 40) + s16, 1.0 if s16 % 2 else 0.6), b + s16 * BEAT / 4, 0.12 if s16 % 2 else 0.08, pan=0.25)
        r = hz(roots[sec])
        for e8 in range(2):
            bass = square(r * (2 if e8 else 1), BEAT / 2 - 0.01, harm=8, roll=1.3)
            bass *= adsr(len(bass), a=0.004, d=0.1, s=0.5, r=0.04, length=BEAT / 2 - 0.01)
            place(fx, fft_filter(bass, hi=900), b + e8 * BEAT / 2, 0.24)
        for s16 in range(4):
            n = arps[sec][s16]
            place(main, beep(hz(n), 0.1, 4), b + s16 * BEAT / 4, 0.04, pan=-0.4 + s16 * 0.27)
            place(main, beep(hz(n), 0.1, 4), b + s16 * BEAT / 4 + 0.375, 0.014, pan=0.4 - s16 * 0.27)  # echo

    # 10.0-15.6: the token counter (outQuart over 5.6 s) ticks like an odometer, fast then slowing
    for i in range(1, 49):
        u = 1 - (1 - i / 49) ** 0.25
        place(fx, blip(3200, 0.012), 10.0 + 5.6 * u, 0.09)

    # 12.0-13.5: each layer turns green (cached): a confirm beep
    for i, t0 in enumerate([12.0, 12.5, 13.0, 13.5]):
        place(main, beep(hz('E5'), 0.06), t0, 0.05, pan=-0.3 + i * 0.2)
        place(main, beep(hz('A5'), 0.1), t0 + 0.07, 0.05, pan=-0.3 + i * 0.2)

    # reverse swell into the cut
    sw = crash(1.0)[::-1] * np.linspace(0, 1, SR) ** 2
    place(main, sw, 19.0, 0.16)

    main = reverb(main, mix=0.18)
    full = main + fx
    gate = np.ones(N)
    c = int(20.0 * SR)
    gate[c - int(0.008 * SR):c] = np.linspace(1, 0, int(0.008 * SR))
    gate[c:] = 0
    full *= gate
    # 20.0: the screen switches off, then silence under the last line
    off = np.zeros((2, N))
    place(off, crt_off(), 20.0, 0.35)
    place(off, keyclick(999, 1.2), 20.0, 0.25)

    peak = np.max(np.abs(full))
    mix = (full + off) / peak * 10 ** (-1.5 / 20)
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # gentle soft clip

    def rms_db(a, b):
        seg = mix[:, int(a * SR):int(b * SR)]
        return 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)
    print(f"rms dB  0-4 {rms_db(0, 4):.1f}  4-10 {rms_db(4, 10):.1f}  10-20 {rms_db(10, 20):.1f}  20.5-25 {rms_db(20.5, 25):.1f}"
          f"  peak {20 * np.log10(np.max(np.abs(mix))):.1f}")
    write_wav(out_path, mix)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'music.wav')
