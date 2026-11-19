[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Kivye/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Kivye/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

# VICEFRAME — GTA-style cover maker from your photos

Drop in any photo and VICEFRAME turns it into a multi-panel, GTA-style game cover: tilted panels, a Vice Sunset illustrated grade, code-drawn scene panels (helicopter, chase car, yacht, neon skyline, money flight), a rating box and studio badge, a platform header bar, and one-click PNG export at 1080×1080, 1080×1350 and 1920×1080. Fully offline — everything is drawn in the browser from the app's own files.

Run it locally:

```
node serve.ts
```

Then open http://localhost:8080, add a photo, pick a layout and a grade, and export.

Built by an AI agent for make.fun's "Make GTA 6 Cover Art" bounty, $250 in USDC.

## What's new in v5

- **Painted AI hero panel.** The hero sample is now a painted artwork — a heroine leaning on a vintage red convertible on a sunset beach boulevard — and the patrol helicopter with its searchlight lives inside that artwork, in the sky at the panel's upper left. The old code-drawn helicopter overlay is retired, so nothing synthetic is stamped over the painting.
- **New night-city panel.** The city panel is a painted Vice City night skyline: Art Deco towers in neon pink and cyan, palms, a coastal overpass, siren light reflecting off wet asphalt under a purple dusk sky and a full moon.
- **Script lettering re-anchored.** The pink neon script now starts directly under the last two letters of the title's final line, measured in the title font itself, and is stamped over a dark drop shadow first — so it clears the content-descriptor box in the corner and stays readable over the art.
