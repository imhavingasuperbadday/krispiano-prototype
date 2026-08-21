"""
Generate piano performance strings for each kris_piano_*.ogg.

The output format is exactly the one obj_kris_pianopuppet records: one entry
per 30fps frame, written as "0" followed by the key held that frame, where

    1 2 3 L U R  =  hand position 5 4 3 2 1 0   (5 = arm furthest out)
    W            =  nothing held, arm stays where it was but lifts

so a generated performance and a performance you record in the browser are the
same kind of object and can be swapped for one another.

Method: short-time spectra at 30fps, split at C4 into a low band (left hand)
and a high band (right hand). Per band, spectral flux gives note onsets; at
each onset a harmonic-sum pitch estimate says where in the band the note sits,
and that maps onto one of the six hand positions. Between onsets the hand
holds its position with the arm raised.

Usage:  python tools/make_performances.py
Writes: assets/performances.js
"""

import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUS = os.path.join(ROOT, "assets", "mus")
OUT = os.path.join(ROOT, "assets", "performances.js")

SR = 22050
FPS = 30
HOP = SR // FPS          # 735 samples per frame
NFFT = 2048

SPLIT_HZ = 261.6         # C4: below is the left hand, above is the right
LOW_MIN, LOW_MAX = 55.0, SPLIT_HZ
HIGH_MIN, HIGH_MAX = SPLIT_HZ, 2200.0

# hand position index -> the character obj_kris_pianopuppet records for it
POS_CHAR = {5: "1", 4: "2", 3: "3", 2: "L", 1: "U", 0: "R"}
REST = "W"

MIN_GAP = 3              # frames between onsets in one hand
HOLD_MIN, HOLD_MAX = 2, 7   # frames a key stays down


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def spectrogram(a):
    n = max(1, 1 + (len(a) - NFFT) // HOP)
    win = np.hanning(NFFT).astype(np.float32)
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    frames = a[np.clip(idx, 0, len(a) - 1)] * win
    S = np.abs(np.fft.rfft(frames, NFFT, axis=1)).astype(np.float32)
    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)
    return S, freqs


def onsets(flux):
    """Peak-pick a flux curve with a local adaptive threshold."""
    if flux.max() > 0:
        flux = flux / flux.max()
    w = 15
    pad = np.pad(flux, w, mode="edge")
    local = np.array([pad[i:i + 2 * w + 1].mean() for i in range(len(flux))])
    thresh = local * 1.6 + 0.035
    hits = []
    last = -MIN_GAP
    for i in range(1, len(flux) - 1):
        if flux[i] < thresh[i]:
            continue
        if flux[i] < flux[i - 1] or flux[i] < flux[i + 1]:
            continue
        if i - last < MIN_GAP:
            # keep whichever of the two is stronger
            if hits and flux[i] > flux[hits[-1]]:
                hits[-1] = i
                last = i
            continue
        hits.append(i)
        last = i
    return hits


def pitch_at(S, freqs, frame, lo, hi):
    """Harmonic-sum pitch estimate inside [lo, hi], averaged over the attack."""
    seg = S[frame:frame + 2].mean(axis=0) if frame + 2 <= len(S) else S[frame]
    band = np.zeros_like(seg)
    sel = (freqs >= lo) & (freqs <= hi)
    band[sel] = seg[sel]
    score = band.copy()
    for k in (2, 3):
        d = seg[::k]
        score[:len(d)] = score[:len(d)] + d * (0.6 / k)
    score[~sel] = 0.0
    if score.max() <= 0:
        return None
    return float(freqs[int(np.argmax(score))])


def hand_track(S, freqs, lo, hi, n_frames):
    """-> list of (onset_frame, position 0..5) for one hand."""
    sel = (freqs >= lo) & (freqs <= hi)
    band = np.log1p(S[:, sel] * 40.0)
    flux = np.maximum(0.0, np.diff(band, axis=0)).sum(axis=1)
    flux = np.concatenate([[0.0], flux])

    hits = []
    for f in onsets(flux):
        p = pitch_at(S, freqs, f, lo, hi)
        if p and p > 0:
            hits.append((f, np.log2(p)))
    if not hits:
        return []

    pitches = np.array([p for _, p in hits])
    # percentile range keeps a couple of stray octave errors from squashing
    # everything else into one bucket
    p_lo, p_hi = np.percentile(pitches, 6), np.percentile(pitches, 94)
    if p_hi - p_lo < 0.25:                      # narrow song: widen a little
        mid = (p_hi + p_lo) / 2
        p_lo, p_hi = mid - 0.2, mid + 0.2

    out = []
    for f, p in hits:
        t = (p - p_lo) / (p_hi - p_lo)
        step = int(np.clip(np.floor(t * 6), 0, 5))   # 0 = lowest .. 5 = highest
        out.append((f, step))
    return out


def to_string(hits, n_frames, low_hand):
    """Render onsets into the puppet's per-frame recording string."""
    frame_char = [REST] * n_frames
    for i, (f, step) in enumerate(hits):
        # left hand: low pitch = arm furthest out (index 5). right hand: mirrored.
        pos = (5 - step) if low_hand else step
        nxt = hits[i + 1][0] if i + 1 < len(hits) else n_frames
        hold = int(np.clip(nxt - f - 1, HOLD_MIN, HOLD_MAX))
        for k in range(f, min(f + hold, n_frames)):
            frame_char[k] = POS_CHAR[pos]
    return "".join("0" + c for c in frame_char)


def main():
    songs = sorted(f for f in os.listdir(MUS) if f.startswith("kris_piano_") and f.endswith(".ogg"))
    if not songs:
        sys.exit("no kris_piano_*.ogg found in " + MUS)

    out = {}
    for f in songs:
        sid = f[:-4]
        a = decode(os.path.join(MUS, f))
        S, freqs = spectrogram(a)
        n = len(S)
        left = hand_track(S, freqs, LOW_MIN, LOW_MAX, n)
        right = hand_track(S, freqs, HIGH_MIN, HIGH_MAX, n)
        out[sid] = {
            "fps": FPS,
            "frames": n,
            "l": to_string(left, n, True),
            "r": to_string(right, n, False),
        }
        print("%-28s %5.1fs  %4d frames  left %4d notes  right %4d notes"
              % (sid, n / FPS, n, len(left), len(right)))

    body = json.dumps(out, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/make_performances.py - do not hand-edit.\n")
        fh.write("// Per-frame hand positions in obj_kris_pianopuppet's recording format,\n")
        fh.write("// so anything you record in-game can replace any of these.\n")
        fh.write("const PERFORMANCES = " + body + ";\n")
    print("\nwrote %s (%.1f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
