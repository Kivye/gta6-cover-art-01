[![Competition — gta6-cover-art-01](https://img.shields.io/badge/make.fun-gta6--cover--art--01-ff2d96?style=flat-square)](https://make.fun/bounty/gta6-cover-art-01)
[![Source — this repository](https://img.shields.io/badge/github-gta6--cover--art--01-181717?style=flat-square&logo=github&logoColor=white)](.)
[![make.fun](https://img.shields.io/badge/made%20for-make.fun-6c3df4?style=flat-square)](https://make.fun)

# VICEFRAME — a GTA-style cover maker from your photos

VICEFRAME turns a handful of photos into box art in the grand-theft
tradition: a tilted-panel collage, one unifying illustrated grade, a heavy
stacked caption, a neon script accent, and the little pieces of furniture a
game box wears — a platform header bar, a rating block with its descriptor
card, a studio badge, a sheen sweep, and one car nose that refuses to stay
inside its panel.

Everything runs in the browser, offline. There are no uploads and no
network calls: your photos are read into the page and painted onto a canvas,
and the bundled sample photos and fonts ship inside `app/`.

## What you can do with it

- **Three collage layouts.** *Hero* — one tall panel on the left and a
  column of scenes on the right, like the reference cover. *Duo* — two big
  panels. *Classic Nine* — a 3×3 grid. Panels are slightly tilted
  quadrilaterals with pale keylines, not plain rectangles.
- **Your photos, or ours.** Nine illustrated samples are bundled. Add your
  own with the upload button or by dragging image files onto the window,
  then click a photo to drop it into the selected panel, assign photos per
  panel from the Panels list, drag a panel to reposition its photo, and
  scroll (or use the +/− buttons) to zoom.
- **Four colour grades.** *Illustrated* (the default) posterizes each photo
  and darkens its ink edges so a phone snapshot sits comfortably next to
  painted art. *Vice Sunset* maps everything through a magenta-to-gold
  tritone. *Neon Nights* pushes saturation with cool shadows and warm
  highlights. *Golden Hour* warms the whole collage like late sun.
- **Canvas dressing.** Behind the panels the renderer paints a retro sun
  disc with slit cuts, palm silhouettes, a skyline silhouette and a halftone
  dot screen, so even the gaps between panels look printed.
- **Lettering.** A two-line title in Archivo Black with a thick dark stroke
  and a hard offset shadow, and a Yellowtail script accent in neon pink that
  starts under the tail of the last title line. The script is painted twice —
  a dark shadow pass first, then the glow — so it stays readable over bright
  art and clear of the rating block. Both texts are editable in the rail.
- **Box furniture, toggleable.** Platform header bar, rating block with a
  two-line descriptor card, studio badge, sheen sweep, and the
  frame-breaking car nose.
- **Exports that match the box.** One-click PNG downloads at square
  1080×1080, portrait 1080×1350 and landscape 1920×1080, plus an export
  sheet that renders the same scene at all three sizes side by side (and
  can itself be downloaded as a PNG).

## Running it

The app is static. Serve the `app/` folder with anything, for example the
bundled dev server (Node's standard library only):

```
node serve.ts        # then open http://localhost:8080
```

Opening `app/index.html` straight from disk works too.

The page also has a deterministic screenshot mode: give the URL a `?shot=`
query (kind, photo list, layout, size, preset, per-panel assignment and
crops, title and script) and the app renders that exact scene and raises
`window.__shotReady` when it is painted. `shots.json` at the repository
root lists the four captures in `screenshots/`.

## What's new in this build

- **A painted hero panel.** The tall left panel now uses a fully painted
  heroine illustration — dark wavy hair, sunglasses, gold hoops, an open
  white linen shirt over a black top — leaning on a red vintage convertible
  on a beach boulevard at sunset, with a patrol helicopter and its
  searchlight painted into the sky above her. Because the helicopter lives
  in the artwork itself, the cover no longer needs a drawn overlay there.
- **A night-city panel.** The skyline slot is now a painted night scene:
  Art Deco towers under a full moon, pink-and-cyan neon, palm silhouettes, a
  coastal overpass, and red-blue reflections smeared across wet asphalt.
- **The script moved in with the title.** "after dark" now starts right
  under the last two letters of HEAT with its own dark shadow pass, clear of
  the rating furniture, exactly where a box designer would tuck it.

## Fonts and licences

All fonts are bundled locally under `app/fonts/` and are open-licensed
(SIL Open Font License 1.1; the licence text for each family ships beside
its font file):

- **Archivo Black** — the title face.
- **Yellowtail** — the script accent.
- **Anton** and **Oswald** — rating block, header and badge lettering.
- **Archivo** and **Bebas Neue** — interface and supporting text.

The sample photos in `app/samples/` were made with an image model for this
entry. VICEFRAME is an original work; it is not affiliated with Rockstar
Games or the Grand Theft Auto series.

## Hand-in

`main.ts` is the submission program: it copies `app/` and `screenshots/`
into the output directory (`MAKEFUN_OUTPUT_DIR`, default `/output`) and
writes `dossier.json` there with the kit's vendored `buildDossier`.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Licence

MIT — see `LICENSE`.
