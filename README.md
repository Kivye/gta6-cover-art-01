# VICEFRAME — multi-panel action-game cover studio for your own photos

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Kivye/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Kivye/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

VICEFRAME is a one-screen, fully offline cover maker. Drop in your own
photos and it seats them in a slanted comic-panel grid, runs every panel
through one shared colour grade so the collage reads as a single poster,
sets a stacked display title with a neon script accent over the art, and
exports a print-safe PNG. No uploads, no accounts, no network: the whole
studio is static files and a canvas.

## What it does

- **Three panel layouts** — Classic 5-Panel, Widescreen Split and Slashed
  Comic — drawn as tilted quadrilaterals with real gutters, never plain
  rectangles. One photo can fill several panels; several photos deal out
  round-robin.
- **Panel framing that feels like a darkroom** — click a panel, drag it on
  the canvas to pan, scroll to zoom (45–400%), flip it, or reset it; the
  same controls live in the rail as sliders.
- **Five colour grades, one light** — Illustrated (poster + ink), Vice
  Sunset tritone, Neon Noir (with an optional deep-night pass), Golden
  Print and a dark Midnight grade, plus a Comic Ink halftone toggle. The
  grade is computed once per photo and shared by every panel.
- **Poster furniture, all toggleable** — platform header bar, five-star
  press strip with an editable review quote, per-panel callout chips
  (THE DRIVER, THE RIDER, THE GETAWAY, THE CITY, THE COURIER), a gold
  VICEFRAME ORIGINAL seal, rating block with descriptor card, collector
  barcode, studio badge and a neon keyline frame.
- **Live lettering** — title (up to three lines, auto-shrinking
  Archivo Black with a hard shadow and neon glow), script accent,
  tagline strip and credits line, all editable in the rail and rendered
  on the canvas as you type.
- **Two built-in scenes** — Vice Heat and Midnight Run — plus Randomize
  Vibe (button or the R key) and a 30-step undo (button or Ctrl/Cmd+Z).
- **Export in the three post sizes** — Square 1080×1080, Portrait
  1080×1350, Landscape 1920×1080 — rendered offscreen at full resolution,
  plus a 3D collector case PNG of the current scene.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Any static file server pointed at `app/` works just as well; there is no
build step and nothing to install.

## How it is built

- `app/index.html` — the studio shell and editor rail.
- `app/style.css` — the dark editor chrome.
- `app/src/cover.js` — the whole render pipeline: panel geometry, the
  shared grade, halftone, furniture, lettering, the cover renderer and
  the export sheet. Deterministic: no clock or random source in the
  render path, so the same state always paints the same bytes.
- `app/src/main.js` — editor wiring: tray, gestures, caption fields,
  undo history, scenes and PNG export.
- `main.ts` — the hand-in program; copies `app/` + `screenshots/` to the
  output directory and writes `dossier.json` with the kit library.
- `serve.ts` — the small dev server above.

## Assets and licences

The sample photos under `app/samples/` were made with an image model for
this entry (plus two starter photos from the competition kit) and are
free to use. All fonts under `app/fonts/` are SIL Open Font License 1.1
faces — Archivo, Archivo Black, Bebas Neue, Oswald, Yellowtail and
Anton — each shipped with its own licence file. VICEFRAME is an original
work: no Rockstar Games logo, artwork or font is used anywhere.

The entry itself is MIT licensed — see `LICENSE`.
