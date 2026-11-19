// VICEFRAME cover renderer.
//
// Everything the app knows about drawing a GTA-style box-art cover lives in
// this module: the panel geometry for the three layouts, the colour grades
// that unify a set of photos into one illustrated poster, the backdrop
// dressing (retro sun, palms, skyline, halftone), the caption lettering and
// the box furniture (platform header, rating block, studio badge, sheen and
// the car nose that breaks a panel's frame). The module is pure canvas: it
// takes a 2d context, a pixel size, a scene description and the loaded
// images, and paints. The editor in main.js owns the scene and the DOM.
//
// A scene looks like this:
//   {
//     layout:  'hero' | 'duo' | 'nine',
//     size:    'square' | 'portrait' | 'landscape',
//     preset:  'illustrated' | 'vice' | 'neon' | 'golden',
//     pool:    [photoKey, ...]            // assignable photos, in tray order
//     assign:  { panelIndex: poolIndex }, // which photo fills which panel
//     crops:   { panelIndex: { z, dx, dy } },
//     title:   'VICE\nHEAT',
//     script:  'after dark',
//     furniture: { header, rating, badge, sheen, nose }  // booleans
//   }

export const COVER_SIZES = {
  square: { w: 1080, h: 1080, label: 'Square 1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 1080 × 1350' },
  landscape: { w: 1920, h: 1080, label: 'Landscape 1920 × 1080' },
};

export const SAMPLE_PHOTOS = [
  { key: 'ai-hero2', file: 'samples/ai-hero2.webp', label: 'Heroine & convertible' },
  { key: 'ai-moto', file: 'samples/ai-moto.webp', label: 'Coastal rider' },
  { key: 'ai-chase', file: 'samples/ai-chase.webp', label: 'Pursuit on the coast road' },
  { key: 'ai-partner', file: 'samples/ai-partner.webp', label: 'The partner' },
  { key: 'ai-city2', file: 'samples/ai-city2.webp', label: 'Vice City after dark' },
  { key: 'ai-heroine', file: 'samples/ai-heroine.webp', label: 'Heroine, first sitting' },
  { key: 'ai-city', file: 'samples/ai-city.webp', label: 'Downtown towers' },
  { key: 'boulevard', file: 'samples/boulevard.jpg', label: 'Boulevard at dusk' },
  { key: 'pier', file: 'samples/pier.jpg', label: 'The old pier' },
];

export const GRADE_PRESETS = [
  { key: 'illustrated', label: 'Illustrated (poster + ink)' },
  { key: 'vice', label: 'Vice Sunset tritone' },
  { key: 'neon', label: 'Neon Noir' },
  { key: 'golden', label: 'Golden Print' },
];

export const PANEL_NAMES = {
  hero: ['Hero', 'Moto', 'Chase', 'City', 'Partners'],
  duo: ['Left panel', 'Right panel'],
  nine: ['Panel 1', 'Panel 2', 'Panel 3', 'Panel 4', 'Panel 5', 'Panel 6', 'Panel 7', 'Panel 8', 'Panel 9'],
};

// The hero layout's panel order is hero, moto, chase, city, partners; the
// default assignment sends the city photo to the city panel and the partner
// photo to the partners panel, which is not the identity map.
const HERO_DEFAULT_ASSIGN = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 3 };

export function defaultScene() {
  return {
    layout: 'hero',
    size: 'landscape',
    preset: 'illustrated',
    pool: SAMPLE_PHOTOS.map((p) => p.key),
    assign: { ...HERO_DEFAULT_ASSIGN },
    crops: {},
    title: 'VICE\nHEAT',
    script: 'after dark',
    furniture: { header: true, rating: true, badge: true, sheen: true, nose: true },
  };
}

export function defaultAssign(layout, poolLength) {
  if (layout === 'hero') return { ...HERO_DEFAULT_ASSIGN };
  const out = {};
  const n = PANEL_NAMES[layout].length;
  for (let i = 0; i < n; i++) out[i] = i % Math.max(1, poolLength);
  return out;
}

export function cropOf(scene, panel) {
  const c = scene.crops[panel];
  if (!c) return { z: 1, dx: 0, dy: 0 };
  return { z: Math.max(0.4, c.z || 1), dx: c.dx || 0, dy: c.dy || 0 };
}

// ---------------------------------------------------------------- geometry
//
// A panel is a slightly tilted quadrilateral. We keep its axis-aligned rect
// plus four corner nudges (in fractions of the cover), small enough that the
// photo can be painted into the bounding box and clipped by the quad without
// visible keystone error, large enough that the grid feels hand-placed like
// a real box-art collage instead of a spreadsheet.

const TILTS = [
  [0, 0, 0.004, 0.006, 0.002, -0.004, -0.003, 0.002],
  [0.003, -0.004, -0.002, 0.003, 0, 0.005, -0.004, -0.002],
  [-0.003, 0.003, 0.004, -0.002, -0.002, -0.005, 0.003, 0.004],
  [0.002, 0.005, -0.004, -0.003, 0.003, 0.002, -0.002, -0.004],
  [-0.004, -0.002, 0.002, 0.004, -0.003, 0.003, 0.004, -0.002],
  [0.003, 0.002, -0.003, -0.005, 0.004, 0, -0.002, 0.003],
  [-0.002, -0.005, 0.003, 0.002, -0.004, 0.004, 0.002, -0.003],
  [0.004, -0.003, -0.002, 0.005, 0.002, -0.002, -0.003, 0.004],
  [-0.003, 0.004, 0.004, -0.004, 0, 0.003, -0.004, -0.002],
];

function quadFromRect(rect, tiltIndex, W, H) {
  const t = TILTS[tiltIndex % TILTS.length];
  const { x, y, w, h } = rect;
  return [
    { x: x + t[0] * W, y: y + t[1] * H },
    { x: x + w + t[2] * W, y: y + t[3] * H },
    { x: x + w + t[4] * W, y: y + h + t[5] * H },
    { x: x + t[6] * W, y: y + h + t[7] * H },
  ];
}

function quadBounds(quad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of quad) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function traceQuad(ctx, quad) {
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
  ctx.closePath();
}

// Panel rects for each layout. The header bar, when present, reserves the
// top strip; panels live in the content box beneath it.
export function panelRects(scene, W, H) {
  const headerH = scene.furniture.header ? H * 0.046 : 0;
  const left = W * 0.009;
  const right = W * 0.991;
  const top = headerH + H * 0.016;
  const bottom = H * 0.986;
  const gapX = W * 0.011;
  const gapY = H * 0.014;
  const cw = right - left;
  const ch = bottom - top;
  const rects = [];

  if (scene.layout === 'hero') {
    if (W >= H) {
      const heroW = cw * 0.568;
      const colX = left + heroW + gapX;
      const colW = right - colX;
      const rowsH = ch - gapY * 2;
      const hMoto = rowsH * 0.408;
      const hChase = rowsH * 0.332;
      const hBase = rowsH - hMoto - hChase;
      const cityW = colW * 0.487;
      rects.push({ x: left, y: top, w: heroW, h: ch });
      rects.push({ x: colX, y: top, w: colW, h: hMoto });
      rects.push({ x: colX, y: top + hMoto + gapY, w: colW, h: hChase });
      rects.push({ x: colX, y: top + hMoto + hChase + gapY * 2, w: cityW, h: hBase });
      rects.push({ x: colX + cityW + gapX, y: top + hMoto + hChase + gapY * 2, w: colW - cityW - gapX, h: hBase });
    } else {
      const heroH = ch * 0.52;
      const gridTop = top + heroH + gapY;
      const cellW = (cw - gapX) / 2;
      const cellH = (ch - heroH - gapY * 2) / 2;
      rects.push({ x: left, y: top, w: cw, h: heroH });
      rects.push({ x: left, y: gridTop, w: cellW, h: cellH });
      rects.push({ x: left + cellW + gapX, y: gridTop, w: cellW, h: cellH });
      rects.push({ x: left, y: gridTop + cellH + gapY, w: cellW, h: cellH });
      rects.push({ x: left + cellW + gapX, y: gridTop + cellH + gapY, w: cellW, h: cellH });
    }
  } else if (scene.layout === 'duo') {
    if (W >= H) {
      const cellW = (cw - gapX) / 2;
      rects.push({ x: left, y: top, w: cellW, h: ch });
      rects.push({ x: left + cellW + gapX, y: top, w: cellW, h: ch });
    } else {
      const cellH = (ch - gapY) / 2;
      rects.push({ x: left, y: top, w: cw, h: cellH });
      rects.push({ x: left, y: top + cellH + gapY, w: cw, h: cellH });
    }
  } else {
    const cellW = (cw - gapX * 2) / 3;
    const cellH = (ch - gapY * 2) / 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        rects.push({ x: left + c * (cellW + gapX), y: top + r * (cellH + gapY), w: cellW, h: cellH });
      }
    }
  }
  return rects;
}

export function panelQuads(scene, W, H) {
  return panelRects(scene, W, H).map((rect, i) => quadFromRect(rect, i, W, H));
}

// ------------------------------------------------------------------ grades
//
// A grade is a per-pixel pass over a photo, run once per photo + preset into
// an offscreen canvas that the panel painter then treats as the photo. The
// passes are deliberately simple — a luminance ramp, a poster quantiser, an
// edge estimate from neighbouring pixels — because they have to run in the
// browser while someone drags panels around, and because simple is what
// reads as "illustrated" at poster size.

const GRADE_WIDTH = 1200; // graded copies are capped at this width
const gradeCache = new Map();

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function gradeIllustrated(data, w, h) {
  // Posterise toward a handful of flat colour steps, push saturation, then
  // darken wherever the luminance jumps — the inked edge of a screen print.
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const grey = (r + g + b) / 3;
    const sat = 1.28;
    r = grey + (r - grey) * sat;
    g = grey + (g - grey) * sat;
    b = grey + (b - grey) * sat;
    const steps = 6;
    r = Math.round((r / 255) * steps) * (255 / steps);
    g = Math.round((g / 255) * steps) * (255 / steps);
    b = Math.round((b / 255) * steps) * (255 / steps);
    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
    lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const edge = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const right = lum[y * w + Math.min(w - 1, x + 1)];
      const down = lum[Math.min(h - 1, y + 1) * w + x];
      const jump = Math.abs(lum[p] - right) + Math.abs(lum[p] - down);
      edge[p] = jump > 26 ? Math.min(1, (jump - 26) / 90) : 0;
    }
  }
  for (let p = 0, i = 0; p < edge.length; p++, i += 4) {
    if (edge[p] > 0) {
      const keep = 1 - edge[p] * 0.55;
      data[i] *= keep;
      data[i + 1] *= keep;
      data[i + 2] *= keep;
    }
  }
}

function tritoneLut() {
  // Vice Sunset: violet shadow, magenta middle, hot amber highlight.
  const stops = [
    [0.0, 24, 6, 46],
    [0.42, 122, 30, 92],
    [0.68, 214, 64, 110],
    [0.86, 250, 128, 84],
    [1.0, 255, 196, 120],
  ];
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const f = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[v * 3 + c] = a[1 + c] + (b[1 + c] - a[1 + c]) * f;
  }
  return lut;
}
const TRITONE = tritoneLut();

function gradeVice(data) {
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const mix = 0.62;
    data[i] = clampByte(data[i] * (1 - mix) + TRITONE[lum * 3] * mix);
    data[i + 1] = clampByte(data[i + 1] * (1 - mix) + TRITONE[lum * 3 + 1] * mix);
    data[i + 2] = clampByte(data[i + 2] * (1 - mix) + TRITONE[lum * 3 + 2] * mix);
  }
}

function gradeNeon(data) {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const grey = (r + g + b) / 3;
    const sat = 1.38;
    r = grey + (r - grey) * sat;
    g = grey + (g - grey) * sat;
    b = grey + (b - grey) * sat;
    // S-curve contrast, then cool the shadows and warm the highlights.
    const curve = (v) => {
      const t = v / 255;
      return clampByte(255 * (t * t * (3 - 2 * t) * 0.35 + t * 0.65));
    };
    r = curve(r); g = curve(g); b = curve(b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const cool = (1 - lum) * 16;
    const warm = lum * lum * 14;
    data[i] = clampByte(r + warm);
    data[i + 1] = clampByte(g + cool * 0.3);
    data[i + 2] = clampByte(b + cool);
  }
}

function gradeGolden(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    data[i] = clampByte(0.393 * r + 0.769 * g + 0.189 * b + 10);
    data[i + 1] = clampByte(0.349 * r + 0.686 * g + 0.168 * b + 4);
    data[i + 2] = clampByte(0.272 * r + 0.534 * g + 0.131 * b - 6);
  }
}

const GRADE_FNS = { illustrated: gradeIllustrated, vice: gradeVice, neon: gradeNeon, golden: gradeGolden };

// The graded copy of a photo under a preset, drawn once and cached. Falls
// back to the raw image when the pixel pass is unavailable.
export function gradedPhoto(image, photoKey, preset) {
  if (!image || !image.naturalWidth) return image;
  const cacheKey = photoKey + '|' + preset;
  if (gradeCache.has(cacheKey)) return gradeCache.get(cacheKey);
  const scale = Math.min(1, GRADE_WIDTH / image.naturalWidth);
  const w = Math.max(2, Math.round(image.naturalWidth * scale));
  const h = Math.max(2, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  try {
    const img = ctx.getImageData(0, 0, w, h);
    GRADE_FNS[preset](img.data, w, h);
    ctx.putImageData(img, 0, 0);
  } catch (err) {
    ctx.drawImage(image, 0, 0, w, h);
  }
  gradeCache.set(cacheKey, canvas);
  return canvas;
}

// --------------------------------------------------------------- dressing
//
// The backdrop the panels sit on: a deep indigo field, a striped retro sun,
// palm silhouettes at the edges, a skyline along the bottom and a faint
// halftone dot field. Most of it hides behind the panels; what peeks through
// the gutters is what makes the grid feel like a poster instead of a table.

function drawSunDisc(ctx, cx, cy, radius) {
  const grad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
  grad.addColorStop(0, '#ffcf6e');
  grad.addColorStop(0.55, '#ff7e5f');
  grad.addColorStop(1, '#d6336c');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  // Cut the classic horizontal slits, thicker toward the bottom.
  ctx.globalCompositeOperation = 'destination-out';
  let y = cy + radius * 0.08;
  let slit = radius * 0.03;
  while (y < cy + radius) {
    ctx.fillRect(cx - radius, y, radius * 2, slit);
    y += slit + radius * 0.13;
    slit *= 1.45;
  }
  ctx.restore();
}

function drawPalm(ctx, baseX, baseY, height, lean, flip) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.scale(flip, 1);
  ctx.strokeStyle = '#06030e';
  ctx.fillStyle = '#06030e';
  ctx.lineWidth = height * 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lean * height * 0.4, -height * 0.55, lean * height, -height);
  ctx.stroke();
  const topX = lean * height;
  const topY = -height;
  // Fronds: arcs fanning out and drooping from the crown.
  for (let i = 0; i < 6; i++) {
    const ang = Math.PI * (0.08 + i * 0.17);
    const len = height * (0.42 + (i % 3) * 0.07);
    const ex = topX + Math.cos(ang) * len * (i < 3 ? -1 : 1) * 0.9;
    const ey = topY - Math.sin(ang) * len * 0.42 + len * 0.22;
    ctx.lineWidth = height * 0.02;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + (ex - topX) * 0.5, topY - len * 0.28, ex, ey);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(topX, topY, height * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSkyline(ctx, W, H) {
  // A deterministic row of towers along the bottom edge.
  ctx.fillStyle = '#08040f';
  let x = -W * 0.02;
  let seed = 7;
  const base = H * 1.001;
  while (x < W * 1.02) {
    seed = (seed * 37 + 11) % 101;
    const tw = W * (0.02 + (seed % 5) * 0.006);
    const th = H * (0.05 + (seed % 7) * 0.016);
    ctx.fillRect(x, base - th, tw, th);
    if (seed % 3 === 0) ctx.fillRect(x + tw * 0.35, base - th - H * 0.02, tw * 0.3, H * 0.02);
    x += tw + W * 0.006;
  }
}

function halftonePattern(dotColor) {
  const tile = document.createElement('canvas');
  tile.width = 14;
  tile.height = 14;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = dotColor;
  tctx.beginPath();
  tctx.arc(3.5, 3.5, 1.6, 0, Math.PI * 2);
  tctx.arc(10.5, 10.5, 1.6, 0, Math.PI * 2);
  tctx.fill();
  return tile;
}
let halftoneTile = null;

export function drawBackdrop(ctx, W, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#150b2e');
  bg.addColorStop(0.6, '#0d0721');
  bg.addColorStop(1, '#07030f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawSunDisc(ctx, W * 0.71, H * 0.30, H * 0.21);
  drawSkyline(ctx, W, H);
  drawPalm(ctx, W * 0.035, H * 1.0, H * 0.34, 0.35, 1);
  drawPalm(ctx, W * 0.975, H * 1.0, H * 0.27, 0.3, -1);
  if (!halftoneTile) halftoneTile = halftonePattern('rgba(255,255,255,0.55)');
  ctx.save();
  ctx.globalAlpha = 0.05;
  const pattern = ctx.createPattern(halftoneTile, 'repeat');
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ----------------------------------------------------------------- panels

function paintPhoto(ctx, source, bounds, crop) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return;
  const base = Math.max(bounds.w / sw, bounds.h / sh);
  const scale = base * crop.z;
  const dw = sw * scale;
  const dh = sh * scale;
  const x = bounds.x + (bounds.w - dw) / 2 + crop.dx * bounds.w;
  const y = bounds.y + (bounds.h - dh) / 2 + crop.dy * bounds.h;
  ctx.drawImage(source, x, y, dw, dh);
}

function paintPlaceholder(ctx, bounds, label) {
  const grad = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
  grad.addColorStop(0, '#3a1650');
  grad.addColorStop(1, '#131022');
  ctx.fillStyle = grad;
  ctx.fillRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.max(13, bounds.h * 0.07)}px Oswald, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || 'photo', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function drawPanels(ctx, scene, W, H, images) {
  const quads = panelQuads(scene, W, H);
  quads.forEach((quad, i) => {
    const bounds = quadBounds(quad);
    const poolIndex = scene.assign[i] !== undefined ? scene.assign[i] : i % scene.pool.length;
    const key = scene.pool[poolIndex];
    const image = images.get(key);
    ctx.save();
    traceQuad(ctx, quad);
    ctx.clip();
    if (image && (image.naturalWidth || image.width)) {
      paintPhoto(ctx, gradedPhoto(image, key, scene.preset), bounds, cropOf(scene, i));
    } else {
      paintPlaceholder(ctx, bounds, PANEL_NAMES[scene.layout][i] || '');
    }
    ctx.restore();
    // The collage edge: a pale keyline, then a dark outer rule so each panel
    // lifts off its neighbours.
    traceQuad(ctx, quad);
    ctx.strokeStyle = '#f4efe4';
    ctx.lineWidth = Math.max(2, W * 0.0026);
    ctx.stroke();
    traceQuad(ctx, quad);
    ctx.strokeStyle = 'rgba(5,2,10,0.85)';
    ctx.lineWidth = Math.max(1, W * 0.0009);
    ctx.stroke();
  });
  return quads;
}

// --------------------------------------------------------------- lettering
//
// The caption block: stacked Archivo Black lines with a heavy dark stroke
// and a hard offset shadow, sitting over the hero panel's lower left, and
// the Yellowtail script tucked under the tail of the last line. The script
// gets two passes — a dark, blurred shadow first so the neon reads over
// bright art, then the glowing pink itself.

export function titleMetrics(scene, W, H) {
  const size = scene.layout === 'hero' && W < H ? W * 0.19 : H * 0.20;
  const x = W * 0.098;
  const lastBaseline = H * 0.90;
  return { size, x, lastBaseline, lineGap: size * 0.99 };
}

export function drawTitle(ctx, scene, W, H) {
  const lines = String(scene.title || '').split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return null;
  const { size, x, lastBaseline, lineGap } = titleMetrics(scene, W, H);
  ctx.save();
  ctx.font = `${size}px "Archivo Black", "Anton", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const firstBaseline = lastBaseline - lineGap * (lines.length - 1);
  lines.forEach((line, i) => {
    const y = firstBaseline + i * lineGap;
    // Hard shadow: the whole letterform, stroke and all, in near-black.
    ctx.save();
    ctx.translate(size * 0.045, size * 0.055);
    ctx.strokeStyle = '#0a0510';
    ctx.lineWidth = size * 0.17;
    ctx.fillStyle = '#0a0510';
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    ctx.restore();
    ctx.strokeStyle = '#12081c';
    ctx.lineWidth = size * 0.15;
    ctx.strokeText(line, x, y);
    ctx.fillStyle = '#f8edd6';
    ctx.fillText(line, x, y);
  });
  const lastLine = lines[lines.length - 1];
  const lastWidth = ctx.measureText(lastLine).width;
  ctx.restore();
  return { x, lastBaseline, lastWidth, size };
}

export function drawScript(ctx, scene, W, H, titleBox) {
  const text = String(scene.script || '').trim();
  if (!text || !titleBox) return;
  const size = titleBox.size * 0.335;
  ctx.save();
  ctx.font = `${size}px "Yellowtail", cursive`;
  const width = ctx.measureText(text).width;
  // Start under the last two letters of the final title line: the script's
  // left edge sits a little before the tail, its body flowing right.
  const sx = titleBox.x + titleBox.lastWidth - width * 0.74;
  const sy = titleBox.lastBaseline + size * 0.52;
  ctx.translate(sx, sy);
  ctx.rotate(-0.028);
  ctx.textBaseline = 'alphabetic';
  // Pass one: the dark shadow, slightly down-right and softened.
  ctx.save();
  ctx.shadowColor = 'rgba(10,2,12,0.9)';
  ctx.shadowBlur = size * 0.10;
  ctx.shadowOffsetX = size * 0.045;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = '#1c0514';
  ctx.fillText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  // Pass two: the neon itself, glowing.
  ctx.save();
  ctx.shadowColor = 'rgba(255,45,150,0.95)';
  ctx.shadowBlur = size * 0.22;
  ctx.fillStyle = '#ff5fa8';
  ctx.fillText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.fillStyle = '#ffd7ec';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// --------------------------------------------------------------- furniture

function drawHeaderBar(ctx, W, H) {
  const h = H * 0.046;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0e63d8');
  grad.addColorStop(1, '#084298');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, h - Math.max(1, H * 0.0016), W, Math.max(1, H * 0.0016));
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = `${Math.round(H * 0.004)}px`; } catch (err) { /* older canvas */ }
  ctx.font = `${H * 0.0235}px "Archivo Black", "Anton", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('NEXT-GEN CONSOLE', W * 0.014, h * 0.54);
  ctx.font = `${H * 0.0155}px "Archivo Black", "Anton", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('VICEFRAME EDITION', W * 0.986, h * 0.54);
  ctx.textAlign = 'left';
  try { ctx.letterSpacing = '0px'; } catch (err) { /* older canvas */ }
  ctx.textBaseline = 'alphabetic';
}

function drawRatingBlock(ctx, W, H) {
  const boxW = W * 0.056;
  const boxH = H * 0.15;
  const x = W * 0.013;
  const y = H * 0.978 - boxH;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = H * 0.008;
  ctx.shadowOffsetY = H * 0.003;
  ctx.fillStyle = '#f5f2ea';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.restore();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1.5, W * 0.0012);
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.font = `${boxH * 0.115}px "Oswald", sans-serif`;
  ctx.fillText('MATURE 17+', x + boxW / 2, y + boxH * 0.17);
  ctx.font = `${boxH * 0.52}px "Anton", sans-serif`;
  ctx.fillText('M', x + boxW / 2, y + boxH * 0.70);
  ctx.font = `${boxH * 0.082}px "Oswald", sans-serif`;
  ctx.fillText('CONTENT RATED BY', x + boxW / 2, y + boxH * 0.90);
  ctx.fillText('VF', x + boxW / 2, y + boxH * 0.985);
  // The descriptor card beside it: translucent black, thin rule, two lines.
  const dx = x + boxW + W * 0.006;
  const dw = W * 0.136;
  const dh = boxH * 0.72;
  const dy = y + boxH - dh;
  ctx.fillStyle = 'rgba(8,6,14,0.78)';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(dx, dy, dw, dh);
  ctx.fillStyle = '#f2eee6';
  ctx.textAlign = 'left';
  ctx.font = `${dh * 0.175}px "Oswald", sans-serif`;
  ctx.fillText('Intense Violence · Blood and Gore', dx + dw * 0.06, dy + dh * 0.36);
  ctx.fillText('Strong Language · Drug Reference', dx + dw * 0.06, dy + dh * 0.68);
  ctx.textAlign = 'left';
}

function drawStudioBadge(ctx, W, H) {
  const s = W * 0.052;
  const x = W * 0.986 - s;
  const by = H * 0.978 - s;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = H * 0.01;
  ctx.shadowOffsetY = H * 0.004;
  ctx.fillStyle = '#ffc61a';
  const r = s * 0.14;
  ctx.beginPath();
  ctx.roundRect(x, by, s, s, r);
  ctx.fill();
  ctx.restore();
  // Four-point star.
  ctx.fillStyle = '#14100a';
  const cx = x + s / 2;
  const cy = by + s * 0.30;
  const R = s * 0.13;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R);
  ctx.quadraticCurveTo(cx, cy, cx + R, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + R);
  ctx.quadraticCurveTo(cx, cy, cx - R, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - R);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `${s * 0.155}px "Archivo Black", sans-serif`;
  ctx.fillText('VICEFRAME', cx, by + s * 0.66);
  ctx.font = `${s * 0.115}px "Oswald", sans-serif`;
  ctx.fillText('S T U D I O S', cx, by + s * 0.85);
  ctx.textAlign = 'left';
}

function drawSheen(ctx, W, H) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);
  const band = ctx.createLinearGradient(-W * 0.42, 0, W * 0.30, 0);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.46, 'rgba(255,255,255,0.055)');
  band.addColorStop(0.55, 'rgba(255,255,255,0.11)');
  band.addColorStop(0.64, 'rgba(255,255,255,0.05)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(-W * 0.75, -H, W * 1.5, H * 2);
  ctx.restore();
}

function drawCarNose(ctx, W, H, anchor) {
  // A glossy red convertible nose poking past the chase panel's lower-left
  // corner — the one piece of the collage allowed to break its frame. Drawn
  // as a side profile: windshield wedge at the rear, a long hood falling to
  // the nose tip, a ringed headlight, a chrome bumper and the top of the
  // front wheel, so it reads as a car at a glance rather than a red streak.
  const w = W * 0.128;
  const h = w * 0.46;
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(-0.07);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = h * 0.28;
  ctx.shadowOffsetY = h * 0.10;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#f0445e');
  body.addColorStop(0.45, '#c21532');
  body.addColorStop(1, '#700b1f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.92);
  ctx.lineTo(w * 0.015, h * 0.52);
  ctx.quadraticCurveTo(w * 0.03, h * 0.30, w * 0.17, h * 0.26); // rear deck
  ctx.quadraticCurveTo(w * 0.30, h * 0.02, w * 0.44, h * 0.05); // windshield rise
  ctx.quadraticCurveTo(w * 0.52, h * 0.07, w * 0.58, h * 0.24); // cowl
  ctx.quadraticCurveTo(w * 0.82, h * 0.30, w * 0.965, h * 0.50); // hood to tip
  ctx.quadraticCurveTo(w * 1.005, h * 0.56, w * 0.99, h * 0.72); // nose face
  ctx.lineTo(w * 0.965, h * 0.90);
  ctx.quadraticCurveTo(w * 0.60, h * 1.0, w * 0.30, h * 0.97);
  ctx.quadraticCurveTo(w * 0.10, h * 0.95, 0, h * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Windshield glass over the rise.
  ctx.fillStyle = 'rgba(16,14,34,0.92)';
  ctx.beginPath();
  ctx.moveTo(w * 0.235, h * 0.235);
  ctx.quadraticCurveTo(w * 0.315, h * 0.045, w * 0.435, h * 0.065);
  ctx.quadraticCurveTo(w * 0.475, h * 0.075, w * 0.50, h * 0.225);
  ctx.quadraticCurveTo(w * 0.36, h * 0.19, w * 0.235, h * 0.235);
  ctx.closePath();
  ctx.fill();
  // Hood highlight streak.
  ctx.strokeStyle = 'rgba(255,190,190,0.5)';
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  ctx.moveTo(w * 0.56, h * 0.33);
  ctx.quadraticCurveTo(w * 0.78, h * 0.37, w * 0.94, h * 0.52);
  ctx.stroke();
  // Headlight: chrome ring, pale lens, bright core.
  ctx.beginPath();
  ctx.ellipse(w * 0.905, h * 0.60, w * 0.052, h * 0.115, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d9d4c8';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.905, h * 0.60, w * 0.040, h * 0.088, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe9a8';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.905, h * 0.60, w * 0.016, h * 0.036, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fffbe8';
  ctx.fill();
  // Front wheel crown and a chrome bumper line.
  ctx.beginPath();
  ctx.arc(w * 0.76, h * 0.99, w * 0.085, Math.PI, Math.PI * 2);
  ctx.fillStyle = '#0c0a12';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.76, h * 0.99, w * 0.038, Math.PI, Math.PI * 2);
  ctx.fillStyle = '#cfd4da';
  ctx.fill();
  ctx.fillStyle = 'rgba(240,244,248,0.9)';
  ctx.fillRect(w * 0.30, h * 0.86, w * 0.66, h * 0.055);
  ctx.restore();
}

// ---------------------------------------------------------------- the draw

export function drawCover(ctx, W, H, scene, images) {
  drawBackdrop(ctx, W, H);
  const quads = drawPanels(ctx, scene, W, H, images);
  if (scene.furniture.sheen) drawSheen(ctx, W, H);
  if (scene.furniture.nose && scene.layout === 'hero' && quads[2]) {
    const b = quadBounds(quads[2]);
    drawCarNose(ctx, W, H, { x: b.x - W * 0.012, y: b.y + b.h - H * 0.068 });
  }
  if (scene.furniture.header) drawHeaderBar(ctx, W, H);
  const titleBox = drawTitle(ctx, scene, W, H);
  drawScript(ctx, scene, W, H, titleBox);
  if (scene.furniture.rating) drawRatingBlock(ctx, W, H);
  if (scene.furniture.badge) drawStudioBadge(ctx, W, H);
  return quads;
}

// The export sheet: the same scene rendered at all three post sizes, laid
// out side by side on a dark page with a label under each.
export function drawSheet(ctx, W, H, scene, images) {
  ctx.fillStyle = '#0b0716';
  ctx.fillRect(0, 0, W, H);
  if (!halftoneTile) halftoneTile = halftonePattern('rgba(255,255,255,0.5)');
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = ctx.createPattern(halftoneTile, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = '#f2ead8';
  ctx.font = `${H * 0.032}px "Archivo Black", sans-serif`;
  ctx.fillText('VICEFRAME — EXPORT SHEET', W * 0.03, H * 0.062);
  ctx.font = `${H * 0.02}px "Oswald", sans-serif`;
  ctx.fillStyle = 'rgba(242,234,216,0.65)';
  ctx.fillText('One scene, every post size. Each cover below is the PNG the exporter writes.', W * 0.03, H * 0.098);

  const order = ['portrait', 'square', 'landscape'];
  const slotW = W / 3;
  const top = H * 0.14;
  const availH = H * 0.76;
  order.forEach((sizeKey, i) => {
    const dims = COVER_SIZES[sizeKey];
    const scale = Math.min((slotW * 0.88) / dims.w, availH / dims.h);
    const dw = dims.w * scale;
    const dh = dims.h * scale;
    const x = i * slotW + (slotW - dw) / 2;
    const y = top + (availH - dh) / 2;
    const off = document.createElement('canvas');
    off.width = dims.w;
    off.height = dims.h;
    const octx = off.getContext('2d');
    const sub = { ...scene, size: sizeKey };
    drawCover(octx, dims.w, dims.h, sub, images);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = H * 0.02;
    ctx.drawImage(off, x, y, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(x, y, dw, dh);
    ctx.fillStyle = '#f2ead8';
    ctx.font = `${H * 0.021}px "Archivo Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(COVER_SIZES[sizeKey].label.toUpperCase(), x + dw / 2, y + dh + H * 0.038);
    ctx.textAlign = 'left';
  });
}
