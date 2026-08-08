#!/usr/bin/env python3
"""Gera 4 clips sussurrados 'Bebe, bebe' (pt-BR), adiciona ruído e filtra (ffmpeg)."""
from __future__ import annotations

import json
import math
import os
import random
import struct
import subprocess
import wave

SR = 44100
OUT_DIR = "music/whispers"
RAW_DIR = "/tmp/whisper_raw_bebe"


def write_wav(path: str, samples: list[float], sr: int = SR) -> None:
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 30000))
        w.writeframes(frames)


def band_noise(n: int, rng: random.Random, f0: float, f1: float) -> list[float]:
    out = [0.0] * n
    x1 = x2 = y1 = y2 = 0.0
    fc = (f0 + f1) / 2
    bw = max(80.0, f1 - f0)
    w0 = 2 * math.pi * fc / SR
    alpha = math.sin(w0) / (2 * (fc / bw))
    cosw = math.cos(w0)
    b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * cosw, 1 - alpha
    b0, b1, b2 = b0 / a0, b1 / a0, b2 / a0
    a1, a2 = a1 / a0, a2 / a0
    for i in range(n):
        x0 = rng.uniform(-1, 1)
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x0
        y2, y1 = y1, y0
        out[i] = y0
    peak = max(1e-9, max(abs(v) for v in out))
    return [v / peak for v in out]


def env(n: int, attack: float, release: float) -> list[float]:
    e = [0.0] * n
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    for i in range(n):
        if i < a:
            e[i] = i / a
        elif i > n - r:
            e[i] = max(0.0, (n - i) / r)
        else:
            e[i] = 1.0
    return e


def syllable(rng: random.Random, dur: float, formants, gain: float = 0.55) -> list[float]:
    n = int(dur * SR)
    layers = [0.0] * n
    for f0, f1, amp in formants:
        bn = band_noise(n, rng, f0, f1)
        for i in range(n):
            layers[i] += bn[i] * amp
    e = env(n, 0.035, 0.1)
    # oclusiva /b/ — sopro curto no ataque
    asp = band_noise(n, rng, 900, 2800)
    for i in range(n):
        a = 0.45 * max(0.0, 1 - i / (0.055 * SR))
        layers[i] = (layers[i] * 0.88 + asp[i] * a) * e[i] * gain
    return layers


def make_phrase(seed: int, pitch: float = 1.0, pause: float = 0.32) -> list[float]:
    """
    'Bebe, bebe' em pt-BR: /be.be be.be/
    Vogal /e/ (não o ditongo inglês de 'baby').
    """
    rng = random.Random(seed)
    # Formantes aproximados do /e/ brasileiro (whisper = ruído filtrado)
    be = [
        (380 * pitch, 620 * pitch, 0.95),   # F1
        (1700 * pitch, 2200 * pitch, 0.8),  # F2
        (2500 * pitch, 3400 * pitch, 0.35), # F3
    ]
    parts: list[list[float]] = []
    silence = lambda t: [0.0] * int(t * SR)

    wind = band_noise(int(0.4 * SR), rng, 200, 900)
    we = env(len(wind), 0.18, 0.18)
    parts.append([w * we[i] * 0.11 for i, w in enumerate(wind)])

    # Be-be
    parts.append(syllable(rng, 0.18, be, 0.64))
    parts.append(silence(0.03 + rng.uniform(0, 0.02)))
    parts.append(syllable(rng, 0.2, be, 0.6))
    parts.append(silence(pause + rng.uniform(-0.04, 0.08)))
    # be-be
    parts.append(syllable(rng, 0.17, be, 0.58))
    parts.append(silence(0.028))
    parts.append(syllable(rng, 0.24, be, 0.55))

    tail = band_noise(int(0.85 * SR), rng, 180, 700)
    te = env(len(tail), 0.14, 0.5)
    parts.append([t * te[i] * 0.09 for i, t in enumerate(tail)])

    out: list[float] = []
    for p in parts:
        out.extend(p)
    for i in range(min(len(out), int(0.05 * SR))):
        out[i] *= i / (0.05 * SR)
    fade = int(0.25 * SR)
    for i in range(fade):
        out[len(out) - 1 - i] *= i / fade
    # ruído de gravação (depois filtrado)
    for i in range(len(out)):
        out[i] = out[i] * 0.85 + rng.uniform(-1, 1) * 0.045
        out[i] += 0.01 * math.sin(2 * math.pi * 60 * i / SR)
    peak = max(1e-9, max(abs(v) for v in out))
    return [v / peak * 0.9 for v in out]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    # remove clips antigos em inglês
    for name in os.listdir(OUT_DIR):
        if name.startswith("baby-whisper-") and name.endswith(".wav"):
            os.remove(os.path.join(OUT_DIR, name))

    variants = [
        ("bebe-whisper-01.wav", 11, 0.92, 0.36),
        ("bebe-whisper-02.wav", 29, 1.04, 0.22),
        ("bebe-whisper-03.wav", 47, 0.86, 0.5),
        ("bebe-whisper-04.wav", 73, 1.1, 0.28),
    ]
    filt = (
        "highpass=f=180,"
        "lowpass=f=4200,"
        "afftdn=nf=-22,"
        "equalizer=f=550:t=q:w=0.9:g=2.5,"
        "equalizer=f=1900:t=q:w=1.0:g=1.5,"
        "equalizer=f=2800:t=q:w=1.0:g=-2,"
        "aecho=0.7:0.55:60|140|280:0.35|0.25|0.15,"
        "volume=1.4,"
        "loudnorm=I=-22:TP=-2:LRA=8"
    )
    names = []
    for name, seed, pitch, pause in variants:
        raw = os.path.join(RAW_DIR, name)
        write_wav(raw, make_phrase(seed, pitch=pitch, pause=pause))
        out = os.path.join(OUT_DIR, name)
        subprocess.run(
            ["ffmpeg", "-y", "-i", raw, "-af", filt, "-ar", "44100", "-ac", "1", out],
            check=True,
            capture_output=True,
        )
        names.append(name)
        print("wrote", out)
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(names, f, indent=2)
        f.write("\n")
    print("manifest", names)


if __name__ == "__main__":
    main()
