# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A playable DELTARUNE prototype: Kris at a grand piano on a black stage, rebuilt from decompiled chapter 4 objects (`obj_ch4_DCA09_piano`, `obj_kris_pianopuppet`). Single-file HTML+JS app (`index.html`) with no build step, no dependencies, no server — open the file directly in a browser.

A frozen earlier version set in Noelle's house lives in `noelle_house_version/` and is worked on separately; it has its own README.

## Running

Open `index.html` in a browser (double-click works). Debug params: `?auto=1` skips the title, `&seat=N` sits at song N, `&mute=1` silences, `&free=1` starts free play, `&picker=N` opens song list.

## Regenerating performances

```
python tools/make_performances.py     # requires ffmpeg and numpy
```

Writes `assets/performances.js` — per-frame hand-position strings in `obj_kris_pianopuppet`'s recording format. Do not hand-edit that file.

## Architecture

Everything lives in one `<script>` block in `index.html`. There is no module system, no framework, no build tooling.

### Coordinate systems and scales

- **Room pixels**: 320×180, the native sprite coordinate space. All geometry constants (PIANO, BENCH, SOLIDS, FLOOR bounds, KRIS position) are in room pixels.
- **Internal view**: 640×360 (room × `ROOM_SCALE=2`), the logical canvas the game draws into.
- **Canvas**: 854×480 (view × `RENDER_SCALE=4/3`), the actual `<canvas>` element.
- **UI**: drawn at `UI_SCALE=2` (320×180 logical) over the 640×360 view — 1× over the 2× room art.

The camera never moves — the stage is exactly one screen.

### Two animation rigs

- **Baked** (`spr_kris_piano_full`): 525-frame sprite sheet, frame index driven directly off the audio playhead. Used exclusively for LOWER (`kris_piano_lower.ogg`) via the game's own sync formula. Stored as `piano_full.png` (25×21 grid of 52px cells).
- **Puppet** (`obj_kris_pianopuppet`): body + two 12-frame arm sprites. Six hand positions × raised/down pose, indexed `baseindex + (keydown * 6)`. Drives the other eight songs via performance strings. The same rig handles live play and recording.

`isSyncedSong()` / `usePuppet()` decide which rig draws. LOWER always uses baked; the rest default to puppet but can be toggled in settings.

### Performance format

Each performance is `{fps, frames, l, r}` where `l` and `r` are strings of `"0"` + position-char pairs, one per frame at 30fps. Position chars: `1 2 3 L U R` map to hand positions 5→0; `W` = rest (arm up, stays in place). User recordings stored in `localStorage` under `krispiano.recordings.v1` use the same format and override generated ones.

### Movement

Port of `obj_mainchara/Step_0.gml` (light world): run boost, facing latch, wall-slide and corner resolution. All 30fps constants halved for 60fps, then scaled by `speedScale` for frame-rate independence. A simpler 8-way walker is available via settings.

### Key globals

- `state` — game state machine: `started`, `menu`, `seated`, `playing`, `freePlay`, `songIdx`, `pickerOpen`, `frame`, `fade`
- `KRIS` — position, direction, animation frame
- `PUP` — live puppet pose (left/right position + key-down booleans)
- `REC` — recorder state (mode 0/1/2, accumulated left/right strings)
- `settings` — persisted to `localStorage` under `krispiano.settings.v1`
- `ENV` — loudness envelopes per song (10 samples/sec, base-89 encoded), used to modulate baked animation speed on non-LOWER tracks

### Palette system

All piano/puppet sprites have two variants: as-decompiled (dark-world, suffix `""`) and light-world recolour (suffix `"Lw"`). `pal(base)` returns the active variant. Walking sprites (`assets/kris/`) are always the same set.

### Font

`fnt_main` (8bitoperator JVE) is a sprite atlas with the glyph table inlined as CSV in `GLYPH_CSV`. `drawText` / `drawTextScaled` tint it per call via `source-in` compositing, cached per colour in `fontAtlases`.
