// VICEFRAME poster renderer: tilted comic-panel grids, one shared tritone grade, canvas-drawn
// dressing and stacked lettering. Pure functions of the editor state — the same state always
// renders the same poster, in the preview and in every export size.

export const POSTER_SIZES = [
  { id: 'square', label: '1080 x 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 x 1350', w: 1080, h: 1350 },
  { id: 'landscape', label: '1920 x 1080', w: 1920, h: 1080 },
];

const INK = '#050508';
const PINK = '#FF2E88';
const TEAL = '#00E5FF';
/** Platform header height as a fraction of poster height (kept slim so the art breathes). */
const PLATFORM_BAR_RATIO = 0.048;

// The four grades. One LUT is shared by every panel of a poster: that single light is what
// makes unrelated photos read as one printed cover.
export const GRADE_PRESETS = {
  vice: {
    label: 'Vice Sunset',
    stops: [[0, '#150829'], [0.30, '#4A1D6B'], [0.55, '#C13B78'], [0.75, '#FF7E47'], [1, '#FFD98A']],
    blend: 0.58, saturation: 1.25, brightness: 1.02, curve: 0.18, posterize: 0,
    halftone: { alpha: 0.10, shadow: 0.45 }, sun: 'sunset',
  },
  illustrated: {
    label: 'Illustrated',
    // The Vice Sunset light, pushed toward print: fewer, flatter colour steps, a harder
    // contrast curve, and dark ink edges traced over the strongest luminance breaks, so a
    // photograph reads as a painted panel beside the drawn scene panels.
    stops: [[0, '#150829'], [0.30, '#4A1D6B'], [0.55, '#C13B78'], [0.75, '#FF7E47'], [1, '#FFD98A']],
    blend: 0.50, saturation: 1.32, brightness: 1.03, curve: 0.30, posterize: 5,
    halftone: { alpha: 0.20, shadow: 0.62 }, sun: 'sunset', edges: 0.6,
  },
  neon: {
    label: 'Neon Night',
    stops: [[0, '#02141F'], [0.5, '#0E7C86'], [0.8, '#FF5DA2'], [1, '#DFF9FF']],
    blend: 0.58, saturation: 1.25, brightness: 1.02, curve: 0.18, posterize: 0,
    halftone: null, sun: 'moon',
  },
  comic: {
    label: 'Comic Duotone',
    stops: [[0, '#101018'], [0.45, '#E33E5A'], [0.75, '#FF8C42'], [1, '#FFE8C9']],
    blend: 0.58, saturation: 1.15, brightness: 1.02, curve: 0.18, posterize: 6,
    halftone: { alpha: 0.16, shadow: 1.01 }, sun: 'sunset',
  },
  golden: {
    label: 'Golden Hour',
    stops: [[0, '#1A0E14'], [0.5, '#7A3B2E'], [1, '#FFCE7A']],
    blend: 0.40, saturation: 1.10, brightness: 1.03, curve: 0.12, posterize: 0,
    halftone: null, sun: null,
  },
};

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Builds the 256-entry per-channel gradient map for a preset's colour stops. */
export function buildTritoneLut(stops) {
  const pts = stops.map(([t, hex]) => [t, hexToRgb(hex)]);
  const lut = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = pts[0];
    let b = pts[pts.length - 1];
    for (let s = 0; s < pts.length - 1; s++) {
      if (t >= pts[s][0] && t <= pts[s + 1][0]) { a = pts[s]; b = pts[s + 1]; break; }
    }
    const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[c][i] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
  }
  return lut;
}

const lutCache = new Map();
function lutFor(preset) {
  if (!lutCache.has(preset)) lutCache.set(preset, buildTritoneLut(GRADE_PRESETS[preset].stops));
  return lutCache.get(preset);
}

/** Posterizes a channel value to `levels` steps (the comic grade's print feel). */
export function posterizeLevels(value, levels) {
  return Math.round(value * (levels - 1)) / (levels - 1);
}

/**
 * The grade itself, one pass over a panel's pixels: contrast S-curve, saturation, the shared
 * tritone map blended over the top, and halftone dots pressed into the shadows. originX and
 * originY are the panel's top-left in poster coordinates, unit is poster pixels per device
 * pixel, so the dot grid sits at poster scale whatever size we render at.
 */
export function applyTritoneGrade(imageData, presetId, intensity, originX, originY, unit, light = false) {
  const preset = GRADE_PRESETS[presetId];
  const lut = lutFor(presetId);
  // `light` is the touch for art that arrives already painted (the AI sample photos): a kiss
  // of the shared tritone and a whisper of halftone for print unity, but no posterize steps
  // and no ink-edge pass — the painting keeps its own shading.
  const blend = Math.min(0.85, preset.blend * intensity * (light ? 0.30 : 1));
  const { data, width, height } = imageData;
  const curve = light ? preset.curve * 0.45 : preset.curve;
  const sat = light ? 1 + (preset.saturation - 1) * 0.5 : preset.saturation;
  const bright = preset.brightness;
  const levels = light ? 0 : preset.posterize;
  const dots = light && preset.halftone
    ? { alpha: preset.halftone.alpha * 0.45, shadow: preset.halftone.shadow }
    : preset.halftone;
  const lumArr = preset.edges && !light ? new Float32Array(width * height) : null;
  const cos = Math.cos(0.2618); // halftone screen at 15 degrees
  const sin = Math.sin(0.2618);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      r = Math.min(1, Math.max(0, (r * bright) + curve * (r * bright) * (1 - r * bright) * (r * bright - 0.5) * 2));
      g = Math.min(1, Math.max(0, (g * bright) + curve * (g * bright) * (1 - g * bright) * (g * bright - 0.5) * 2));
      b = Math.min(1, Math.max(0, (b * bright) + curve * (b * bright) * (1 - b * bright) * (b * bright - 0.5) * 2));
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
      if (levels) {
        r = posterizeLevels(Math.min(1, Math.max(0, r)), levels);
        g = posterizeLevels(Math.min(1, Math.max(0, g)), levels);
        b = posterizeLevels(Math.min(1, Math.max(0, b)), levels);
      }
      const li = Math.round(Math.min(1, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)) * 255);
      if (lumArr) lumArr[y * width + x] = li / 255;
      r = r * (1 - blend) + (lut[0][li] / 255) * blend;
      g = g * (1 - blend) + (lut[1][li] / 255) * blend;
      b = b * (1 - blend) + (lut[2][li] / 255) * blend;
      if (dots && li / 255 < dots.shadow) {
        const px = originX + x * unit;
        const py = originY + y * unit;
        const gx = px * cos + py * sin;
        const gy = py * cos - px * sin;
        const dx = gx - (Math.floor(gx / 9) + 0.5) * 9;
        const dy = gy - (Math.floor(gy / 9) + 0.5) * 9;
        if (dx * dx + dy * dy < 6.76) { // inside a 2.6 px dot
          r *= 1 - dots.alpha;
          g *= 1 - dots.alpha;
          b *= 1 - dots.alpha;
        }
      }
      data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    }
  }
  if (lumArr) {
    // Poster edges: wherever the graded luminance breaks hard against a neighbour, press
    // the pixel toward ink. Flat areas keep their colour steps; silhouettes get the dark
    // outline of a printed illustration.
    const strength = preset.edges;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const l = lumArr[idx];
        const rgt = lumArr[y * width + Math.min(width - 1, x + 1)];
        const dn = lumArr[Math.min(height - 1, y + 1) * width + x];
        const g = Math.min(1, (Math.abs(rgt - l) + Math.abs(dn - l)) * 3.2);
        if (g > 0.03) {
          const dark = 1 - strength * 0.5 * g;
          const i = idx * 4;
          data[i] = Math.round(data[i] * dark);
          data[i + 1] = Math.round(data[i + 1] * dark);
          data[i + 2] = Math.round(data[i + 2] * dark);
        }
      }
    }
  }
  return imageData;
}

// Fixed tilt tables: every panel corner nudged off its grid cell by a few poster pixels, the
// same table every render, so exports are deterministic. Half the V cover's maximum tilt, so
// photo cropping stays sane.
const TILTS = [
  [[-7, -5], [9, -3], [6, 8], [-5, 6]],
  [[5, -8], [-6, -4], [8, 5], [-9, 7]],
  [[-4, 6], [7, -7], [-8, 4], [5, 9]],
  [[8, 3], [-5, 8], [4, -6], [-7, -5]],
  [[-9, -2], [4, 7], [9, -4], [-3, 8]],
  [[3, 9], [-8, -6], [6, 3], [7, -8]],
];

function panel(x, y, w, h, opts = {}) {
  return {
    x, y, w, h,
    kind: opts.kind ?? 'photo',
    photo: opts.photo ?? 0,
    crop: opts.crop ?? 'std',
    fx: opts.fx ?? 0.5,
    fy: opts.fy ?? 0.35,
    zoom: opts.zoom ?? 1,
    code: opts.code ?? 'pink',
    scene: opts.scene ?? null,
  };
}

const codeFor = (i) => (i % 2 === 0 ? 'pink' : 'teal');

/**
 * The grid for a layout at one poster aspect. Panels are fractional rects dealt to the photos:
 * HERO fills five panels from one photo, DUO colour-codes two leads pink and teal, CLASSIC
 * NINE deals photos round-robin around an ink title panel. With fewer photos than panels the
 * deal wraps, and the crop changes so no panel ever repeats the same crop twice.
 */
export function buildPanelLayout(aspect, layoutId, photoCount) {
  const n = Math.max(1, photoCount);
  const pick = (i) => i % n;
  const cropCycle = ['std', 'detail', 'wide'];
  const deal = (i, fx, fy) => ({
    photo: pick(i),
    crop: cropCycle[i % 3],
    fx, fy,
    zoom: cropCycle[i % 3] === 'detail' ? 1.9 : cropCycle[i % 3] === 'wide' ? 0.92 : 1,
    code: codeFor(i),
  });
  const key = `${aspect}:${layoutId}`;
  if (key === 'square:hero' || key === 'portrait:hero') {
    const top = aspect === 'square' ? 0.024 : 0.019;
    const heroH = aspect === 'square' ? 0.616 : 0.580;
    const rowY = top + heroH + 0.024;
    const rowH = (aspect === 'square' ? 0.890 : 0.905) - rowY;
    return [
      panel(0.024, top, 0.952, heroH, { photo: 0, crop: 'hero', fx: 0.5, fy: 0.32, code: 'pink' }),
      panel(0.024, rowY, 0.300, rowH, { photo: 0, crop: 'detail', fx: 0.38, fy: 0.24, zoom: 2.2, code: 'teal' }),
      panel(0.348, rowY, 0.300, rowH, { photo: 0, crop: 'detail', fx: 0.20, fy: 0.80, zoom: 2.0, code: 'pink' }),
      panel(0.672, rowY, 0.304, rowH, { photo: 0, crop: 'wide', fx: 0.5, fy: 0.66, zoom: 0.92, code: 'teal' }),
    ];
  }
  if (key === 'landscape:hero') {
    return [
      panel(0.0135, 0.024, 0.560, 0.876, { photo: 0, crop: 'hero', fx: 0.5, fy: 0.30, code: 'pink' }),
      panel(0.587, 0.024, 0.3995, 0.272, { photo: 0, crop: 'detail', fx: 0.42, fy: 0.22, zoom: 2.2, code: 'teal' }),
      panel(0.587, 0.320, 0.3995, 0.272, { photo: 0, crop: 'detail', fx: 0.18, fy: 0.78, zoom: 2.0, code: 'pink' }),
      panel(0.587, 0.616, 0.1935, 0.284, { photo: 0, crop: 'wide', fx: 0.30, fy: 0.26, zoom: 0.92, code: 'teal' }),
      panel(0.793, 0.616, 0.1935, 0.284, { photo: 0, crop: 'wide', fx: 0.64, fy: 0.58, zoom: 0.92, code: 'pink' }),
    ];
  }
  if (key === 'square:duo' || key === 'portrait:duo') {
    const botY = aspect === 'square' ? 0.780 : 0.800;
    const colBot = botY - 0.024;
    const colH = (colBot - 0.024) / 3;
    const top = aspect === 'square' ? 0.024 : 0.019;
    return [
      panel(0.024, top, 0.516, colBot - top, { photo: 0, crop: 'hero', fx: 0.5, fy: 0.32, code: 'pink' }),
      panel(0.564, top, 0.412, colH - 0.012, { photo: pick(1), crop: 'std', fx: 0.5, fy: 0.35, code: 'teal' }),
      panel(0.564, top + colH + 0.012, 0.412, colH - 0.012, { photo: 0, crop: 'detail', fx: 0.42, fy: 0.26, zoom: 1.9, code: 'pink' }),
      panel(0.564, top + 2 * colH + 0.012, 0.412, colH - 0.024, { photo: pick(1), crop: 'detail', fx: 0.58, fy: 0.44, zoom: 1.9, code: 'teal' }),
      panel(0.024, botY, 0.464, (aspect === 'square' ? 0.890 : 0.905) - botY, { photo: pick(1), crop: 'wide', fx: 0.5, fy: 0.6, zoom: 0.92, code: 'teal' }),
      panel(0.512, botY, 0.464, (aspect === 'square' ? 0.890 : 0.905) - botY, { photo: 0, crop: 'wide', fx: 0.5, fy: 0.55, zoom: 0.92, code: 'pink' }),
    ];
  }
  if (key === 'landscape:duo') {
    return [
      panel(0.0135, 0.024, 0.400, 0.876, { photo: 0, crop: 'hero', fx: 0.5, fy: 0.32, code: 'pink' }),
      panel(0.427, 0.024, 0.270, 0.426, { photo: pick(1), crop: 'std', fx: 0.5, fy: 0.35, code: 'teal' }),
      panel(0.427, 0.474, 0.270, 0.426, { photo: 0, crop: 'detail', fx: 0.42, fy: 0.26, zoom: 1.9, code: 'pink' }),
      panel(0.711, 0.024, 0.2755, 0.272, { photo: pick(1), crop: 'detail', fx: 0.58, fy: 0.4, zoom: 1.9, code: 'teal' }),
      panel(0.711, 0.320, 0.2755, 0.272, { photo: pick(1), crop: 'std', fx: 0.5, fy: 0.5, code: 'teal' }),
      panel(0.711, 0.616, 0.2755, 0.284, { photo: 0, crop: 'wide', fx: 0.5, fy: 0.58, zoom: 0.92, code: 'pink' }),
    ];
  }
  if (key === 'square:nine') {
    return [
      panel(0.024, 0.024, 0.300, 0.150, deal(0, 0.5, 0.3)),
      panel(0.348, 0.024, 0.300, 0.150, deal(1, 0.42, 0.30)),
      panel(0.672, 0.024, 0.304, 0.150, deal(2, 0.6, 0.35)),
      panel(0.024, 0.198, 0.266, 0.209, deal(3, 0.45, 0.4)),
      panel(0.024, 0.431, 0.266, 0.209, deal(4, 0.55, 0.5)),
      panel(0.314, 0.198, 0.286, 0.442, { kind: 'title', code: 'pink' }),
      panel(0.624, 0.198, 0.352, 0.692, { photo: 0, crop: 'hero', fx: 0.5, fy: 0.32, code: 'teal' }),
      panel(0.024, 0.664, 0.266, 0.226, deal(5, 0.5, 0.55)),
      panel(0.314, 0.664, 0.286, 0.226, deal(6, 0.45, 0.45)),
    ];
  }
  if (key === 'portrait:nine') {
    const cols = [0.024, 0.348, 0.672];
    const rows = [[0.019, 0.200], [0.235, 0.240], [0.491, 0.240], [0.747, 0.183]];
    const out = [];
    let d = 0;
    rows.forEach(([ry, rh], r) => {
      cols.forEach((cx, c) => {
        if (r === 2 && c === 1) { out.push(panel(cx, ry, 0.300, rh, { kind: 'title', code: 'pink' })); return; }
        out.push(panel(cx, ry, c === 2 ? 0.304 : 0.300, rh, deal(d++, 0.3 + 0.2 * ((d + c) % 3), 0.3 + 0.12 * ((d + r) % 3))));
      });
    });
    return out;
  }
  // landscape:nine — four columns by two rows, wide title panel at the right.
  const out = [];
  let d = 0;
  [0.024, 0.474].forEach((ry) => {
    [0.0135, 0.1915, 0.3695, 0.5475].forEach((cx) => {
      out.push(panel(cx, ry, 0.166, 0.426, deal(d++, 0.3 + 0.2 * (d % 3), 0.35)));
    });
  });
  out.push(panel(0.7275, 0.024, 0.259, 0.876, { kind: 'title', code: 'pink' }));
  return out;
}

/** The four tilted corners of a panel, in poster pixels. */
export function panelQuad(p, index, W, H) {
  const u = Math.min(W, H) / 1080;
  const t = TILTS[index % TILTS.length];
  const x0 = p.x * W;
  const y0 = p.y * H;
  const x1 = (p.x + p.w) * W;
  const y1 = (p.y + p.h) * H;
  return [
    [x0 + t[0][0] * u, y0 + t[0][1] * u],
    [x1 + t[1][0] * u, y0 + t[1][1] * u],
    [x1 + t[2][0] * u, y1 + t[2][1] * u],
    [x0 + t[3][0] * u, y1 + t[3][1] * u],
  ];
}

function traceQuad(ctx, quad) {
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(quad[i][0], quad[i][1]);
  ctx.closePath();
}

/**
 * The retro sun: a gradient disc cut by growing horizontal gaps, drawn on its own layer so the
 * stripes punch clean through, then screened over the hero panel. The neon grade swaps it for
 * a plain teal moon.
 */
export function drawRetroSun(ctx, cx, cy, radius, mode, u) {
  const layer = document.createElement('canvas');
  const d = Math.ceil(radius * 2);
  layer.width = d;
  layer.height = d;
  const lctx = layer.getContext('2d');
  const grad = lctx.createLinearGradient(0, 0, 0, d);
  if (mode === 'moon') {
    grad.addColorStop(0, '#CFFBFF');
    grad.addColorStop(1, '#19B8C9');
  } else {
    grad.addColorStop(0, '#FFD319');
    grad.addColorStop(0.55, '#FF7E47');
    grad.addColorStop(1, '#FF2975');
  }
  lctx.fillStyle = grad;
  lctx.beginPath();
  lctx.arc(radius, radius, radius, 0, Math.PI * 2);
  lctx.fill();
  if (mode !== 'moon') {
    lctx.globalCompositeOperation = 'destination-out';
    let y = radius * 1.02;
    let gap = 2 * u;
    while (y < d) {
      lctx.fillRect(0, y, d, gap);
      y += gap + radius * 0.16;
      gap += 2 * u;
    }
    lctx.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha = 0.48;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(layer, cx - radius, cy - radius);
  ctx.restore();
}

/**
 * A palm silhouette from our own path data: a curved trunk and seven tapered fronds drooping
 * from the hub. Drawn in ink over the title panel's gradient and at the hero panel's corner.
 */
export function drawPalmSilhouette(ctx, x, y, size, flip = 1, withTrunk = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.fillStyle = INK;
  if (withTrunk) {
    ctx.beginPath();
    ctx.moveTo(-0.03 * size, size * 1.5);
    ctx.quadraticCurveTo(0.02 * size, size * 0.7, 0, 0);
    ctx.quadraticCurveTo(0.10 * size, size * 0.7, 0.09 * size, size * 1.5);
    ctx.closePath();
    ctx.fill();
  }
  const fronds = [-2.83, -2.36, -1.88, -1.41, -0.94, -0.47, -0.05];
  for (const a of fronds) {
    const tipX = Math.cos(a) * size;
    const tipY = Math.sin(a) * size + size * 0.34;
    const midX = Math.cos(a) * size * 0.55;
    const midY = Math.sin(a) * size * 0.55 - size * 0.16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.quadraticCurveTo(midX * 0.94, midY + size * 0.075, 0, size * 0.045);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A stepped-rooftop skyline strip along a panel's bottom edge, in ink at 85%. */
export function drawSkylineStrip(ctx, x, y, w, h) {
  const steps = [0.45, 0.7, 0.35, 0.85, 0.55, 1.0, 0.62, 0.4, 0.78, 0.5, 0.9, 0.58, 0.42, 0.72, 0.52, 0.66];
  ctx.save();
  ctx.fillStyle = 'rgba(5,2,12,0.85)';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  const seg = w / steps.length;
  steps.forEach((s, i) => {
    ctx.lineTo(x + i * seg, y + h - s * h);
    ctx.lineTo(x + (i + 1) * seg, y + h - s * h);
  });
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A four-point sparkle star, white or pink, at a fixed poster spot. */
export function drawSparkle(ctx, x, y, r, colour) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

const gradedPanelCache = new Map();

/**
 * Draws one photo panel: the photo is cover-fit into the panel's box with its focal point and
 * zoom, graded there (so the halftone sits at poster scale), then clipped to the tilted quad.
 * Dressing goes on inside the same clip: the retro sun and skyline on hero panels, a palm at
 * the top-left, the panel's colour tick, and a print-sheen highlight on the top edge.
 */
export function clipPanelPhoto(ctx, p, index, photo, state, W, H, scale) {
  const quad = panelQuad(p, index, W, H);
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  const adjust = state.adjusts[`${state.layoutId}:${state.aspect}:${index}`] ?? {};
  const zoom = Math.min(3.2, Math.max(0.6, p.zoom * (adjust.zoom ?? 1)));
  const fx = Math.min(1, Math.max(0, p.fx + (adjust.dx ?? 0)));
  const fy = Math.min(1, Math.max(0, p.fy + (adjust.dy ?? 0)));
  const dw = Math.max(2, Math.round(bw * scale));
  const dh = Math.max(2, Math.round(bh * scale));
  const key = [photo.src, state.presetId, state.intensity, dw, dh, zoom.toFixed(3), fx.toFixed(3), fy.toFixed(3)].join('|');
  let tile = gradedPanelCache.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = dw;
    tile.height = dh;
    const tctx = tile.getContext('2d');
    const iw = photo.naturalWidth;
    const ih = photo.naturalHeight;
    const fit = Math.max(dw / iw, dh / ih) * zoom;
    const sw = dw / fit;
    const sh = dh / fit;
    const sx = Math.min(iw - sw, Math.max(0, fx * iw - sw / 2));
    const sy = Math.min(ih - sh, Math.max(0, fy * ih - sh / 2));
    tctx.drawImage(photo, sx, sy, sw, sh, 0, 0, dw, dh);
    const img = tctx.getImageData(0, 0, dw, dh);
    applyTritoneGrade(img, state.presetId, state.intensity, bx, by, 1 / scale, photo.__aiArt === true);
    tctx.putImageData(img, 0, 0);
    if (gradedPanelCache.size > 48) gradedPanelCache.clear();
    gradedPanelCache.set(key, tile);
  }
  const u = Math.min(W, H) / 1080;
  ctx.save();
  traceQuad(ctx, quad);
  ctx.clip();
  ctx.drawImage(tile, bx, by, bw, bh);
  if (state.dressing && (p.crop === 'hero' || index === 0)) {
    const preset = GRADE_PRESETS[state.presetId];
    // The sun sits over the panel's top-left sky, never on the subject's face. Painted art
    // brings its own sky, so the graphic sun only stamps real photographs.
    if (preset.sun && !photo.__aiArt) drawRetroSun(ctx, bx + bw * 0.15, by + bh * 0.21, bw * 0.115, preset.sun, u);
  }
  ctx.restore();
  finishPanelFrame(ctx, p, index, quad, W, H, state);
}

/**
 * The frame finish every panel shares, photo or scene: a print-sheen highlight on the top
 * edge, the panel's colour tick at its top-left corner, and the selection glow while the
 * editor has the panel picked.
 */
export function finishPanelFrame(ctx, p, index, quad, W, H, state) {
  const u = Math.min(W, H) / 1080;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  ctx.lineTo(quad[1][0], quad[1][1]);
  ctx.stroke();
  ctx.strokeStyle = p.code === 'pink' ? PINK : TEAL;
  ctx.lineWidth = 3.5 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(quad[0][0] + 2 * u, quad[0][1] + 14 * u);
  ctx.lineTo(quad[0][0] + 2 * u, quad[0][1] + 2 * u);
  ctx.lineTo(quad[0][0] + 14 * u, quad[0][1] + 2 * u);
  ctx.stroke();
  ctx.restore();
  if (state.selected === index) {
    ctx.save();
    traceQuad(ctx, quad);
    ctx.strokeStyle = p.code === 'pink' ? PINK : TEAL;
    ctx.lineWidth = 3.5 * u;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14 * u;
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- Scene Panels: our own illustrated panels, drawn in code ----------------
 * Five stock scenes a user can stamp into any grid slot, painted as flat vector art in the
 * same Vice light as the photo grade, so a cover can mix one real photo with drawn story
 * panels (the helicopter, the chase, the yacht) instead of crops of the same photograph.
 * Every path below is fixed data — the same state always paints the same scene. */

export const SCENE_PANELS = {
  heli: 'Helicopter',
  moto: 'Motorcycle',
  car: 'Chase Car',
  yacht: 'Yacht',
  skyline: 'Neon Skyline',
  money: 'Money Flight',
  partner: 'The Partner',
};

const SCENE_INK = '#0C0614';

/** Deterministic 0..1 hash for window lights and stars (never Math.random: exports must repeat). */
function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function sceneSky(ctx, bx, by, bw, bh, stops) {
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, bw, bh);
}

let dotPatternCache = null;

/** A halftone dot screen (deterministic, built once) so drawn panels carry the same print
 * texture the photo grade presses into photographs. */
function dotPattern(ctx) {
  if (dotPatternCache) return dotPatternCache;
  try {
    const tile = document.createElement('canvas');
    tile.width = 9;
    tile.height = 9;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = 'rgba(5,2,12,0.16)';
    tctx.beginPath();
    tctx.arc(4.5, 4.5, 1.35, 0, Math.PI * 2);
    tctx.fill();
    dotPatternCache = ctx.createPattern(tile, 'repeat');
  } catch { dotPatternCache = null; }
  return dotPatternCache;
}

/** A print-depth shade pressed over every scene: light at the top, shadow at the foot. */
function sceneShade(ctx, bx, by, bw, bh) {
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, bw, bh);
  const dots = dotPattern(ctx);
  if (dots) {
    ctx.save();
    ctx.fillStyle = dots;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }
}

/** A wisp of smoke: two soft bezier strokes drifting off a point. */
function drawSmokeWisp(ctx, x, y, len, u) {
  ctx.save();
  ctx.strokeStyle = 'rgba(215,215,235,0.20)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + len * 0.35, y - len * 0.16, x + len * 0.6, y + len * 0.10, x + len, y - len * 0.06);
  ctx.stroke();
  ctx.lineWidth = 2.6 * u;
  ctx.strokeStyle = 'rgba(215,215,235,0.14)';
  ctx.beginPath();
  ctx.moveTo(x + len * 0.1, y + len * 0.10);
  ctx.bezierCurveTo(x + len * 0.4, y + len * 0.02, x + len * 0.65, y + len * 0.2, x + len * 0.95, y + len * 0.08);
  ctx.stroke();
  ctx.restore();
}

/** The helicopter: ink silhouette against the sunset, searchlight cone raking the street. */
function paintHeliScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#2A0A3A'], [0.45, '#7A1E5E'], [0.75, '#E8497A'], [1, '#FF9E4F']]);
  drawRetroSun(ctx, X(0.78), Y(0.32), bw * 0.145, 'sunset', u);
  // Searchlight first, so the airframe sits on top of its own beam.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const cone = ctx.createLinearGradient(0, Y(0.48), 0, Y(1));
  cone.addColorStop(0, 'rgba(255,244,190,0.60)');
  cone.addColorStop(1, 'rgba(255,244,190,0.03)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(X(0.325), Y(0.485));
  ctx.lineTo(X(0.395), Y(0.485));
  ctx.lineTo(X(0.55), Y(1));
  ctx.lineTo(X(0.03), Y(1));
  ctx.closePath();
  ctx.fill();
  const pool = ctx.createRadialGradient(X(0.28), Y(0.97), 2, X(0.28), Y(0.97), bw * 0.20);
  pool.addColorStop(0, 'rgba(255,240,190,0.38)');
  pool.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  ctx.fillStyle = SCENE_INK;
  // Tail boom and fin.
  ctx.beginPath();
  ctx.moveTo(X(0.465), Y(0.315));
  ctx.lineTo(X(0.845), Y(0.252));
  ctx.lineTo(X(0.858), Y(0.298));
  ctx.lineTo(X(0.478), Y(0.405));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(0.845), Y(0.252));
  ctx.lineTo(X(0.888), Y(0.168));
  ctx.lineTo(X(0.902), Y(0.302));
  ctx.lineTo(X(0.858), Y(0.298));
  ctx.closePath();
  ctx.fill();
  // Tail rotor cross.
  ctx.strokeStyle = SCENE_INK;
  ctx.lineWidth = 3.2 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.880), Y(0.172));
  ctx.lineTo(X(0.880), Y(0.298));
  ctx.moveTo(X(0.852), Y(0.235));
  ctx.lineTo(X(0.908), Y(0.235));
  ctx.stroke();
  // Main rotor: mast and a long blade with a fainter ghost blade under it.
  ctx.fillRect(X(0.343), Y(0.205), bw * 0.034, bh * 0.045);
  ctx.save();
  ctx.translate(X(0.36), Y(0.196));
  ctx.rotate(-0.045);
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 0.295, bh * 0.017, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.translate(0, bh * 0.016);
  ctx.rotate(0.028);
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 0.28, bh * 0.014, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Body and cockpit glass.
  ctx.beginPath();
  ctx.ellipse(X(0.36), Y(0.365), bw * 0.155, bh * 0.148, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,225,245,0.85)';
  ctx.beginPath();
  ctx.ellipse(X(0.268), Y(0.338), bw * 0.054, bh * 0.060, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // Skids.
  ctx.strokeStyle = SCENE_INK;
  ctx.lineWidth = 4 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X(0.30), Y(0.495));
  ctx.lineTo(X(0.272), Y(0.578));
  ctx.moveTo(X(0.435), Y(0.495));
  ctx.lineTo(X(0.468), Y(0.578));
  ctx.moveTo(X(0.215), Y(0.588));
  ctx.lineTo(X(0.525), Y(0.588));
  ctx.stroke();
  drawSmokeWisp(ctx, X(0.86), Y(0.44), bw * 0.12, u);
}

/** The chase car: a low muscle silhouette at speed, siren glow behind, headlight burning. */
function paintCarScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#1B0530'], [0.55, '#7A1E5E'], [0.8, '#E8497A'], [1, '#FF9E4F']]);
  ctx.save();
  ctx.globalAlpha = 0.8;
  drawSkylineStrip(ctx, bx, Y(0.40), bw, bh * 0.13);
  ctx.restore();
  // Siren glow, red over the tail and blue over the roof, screened into the dusk.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const red = ctx.createRadialGradient(X(0.26), Y(0.28), 2, X(0.26), Y(0.28), bw * 0.34);
  red.addColorStop(0, 'rgba(255,42,66,0.68)');
  red.addColorStop(1, 'rgba(255,42,66,0)');
  ctx.fillStyle = red;
  ctx.fillRect(bx, by, bw, bh);
  const blue = ctx.createRadialGradient(X(0.62), Y(0.22), 2, X(0.62), Y(0.22), bw * 0.34);
  blue.addColorStop(0, 'rgba(48,96,255,0.68)');
  blue.addColorStop(1, 'rgba(48,96,255,0)');
  ctx.fillStyle = blue;
  ctx.fillRect(bx, by, bw, bh);
  const under = ctx.createRadialGradient(X(0.5), Y(0.80), 2, X(0.5), Y(0.80), bw * 0.42);
  under.addColorStop(0, 'rgba(255,126,71,0.20)');
  under.addColorStop(1, 'rgba(255,126,71,0)');
  ctx.fillStyle = under;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  // Road band with a dashed centre line.
  ctx.fillStyle = '#120A20';
  ctx.fillRect(bx, Y(0.665), bw, bh * 0.335);
  ctx.fillStyle = 'rgba(255,217,138,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(X(0.04 + i * 0.21), Y(0.862), bw * 0.10, bh * 0.016);
  // Speed streaks trailing off the tail.
  ctx.strokeStyle = 'rgba(255,246,233,0.5)';
  ctx.lineWidth = 3 * u;
  ctx.lineCap = 'round';
  [[0.50, 0.905], [0.585, 0.885], [0.665, 0.918]].forEach(([fy, fx]) => {
    ctx.beginPath();
    ctx.moveTo(X(0.985), Y(fy));
    ctx.lineTo(X(fx), Y(fy));
    ctx.stroke();
  });
  // Headlight beam, spilling out of the nose toward the panel's left edge.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const beam = ctx.createLinearGradient(X(0.07), 0, bx, 0);
  beam.addColorStop(0, 'rgba(255,240,190,0.5)');
  beam.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(X(0.075), Y(0.585));
  ctx.lineTo(bx, Y(0.47));
  ctx.lineTo(bx, Y(0.76));
  ctx.lineTo(X(0.075), Y(0.66));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // The police car, close behind in the far lane: smaller, higher, lit by its own light bar.
  // Lifted and swollen a touch (a transform about its own centre) so its cabin, light bar
  // and white door clear the muscle car's tail and the chase actually reads.
  ctx.save();
  ctx.translate(0, -bh * 0.058);
  ctx.translate(X(0.82), Y(0.50));
  ctx.scale(1.16, 1.16);
  ctx.translate(-X(0.82), -Y(0.50));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const copRed = ctx.createRadialGradient(X(0.755), Y(0.415), 2, X(0.755), Y(0.415), bw * 0.13);
  copRed.addColorStop(0, 'rgba(255,42,66,0.85)');
  copRed.addColorStop(1, 'rgba(255,42,66,0)');
  ctx.fillStyle = copRed;
  ctx.fillRect(bx, by, bw, bh);
  const copBlue = ctx.createRadialGradient(X(0.865), Y(0.415), 2, X(0.865), Y(0.415), bw * 0.13);
  copBlue.addColorStop(0, 'rgba(64,120,255,0.85)');
  copBlue.addColorStop(1, 'rgba(64,120,255,0)');
  ctx.fillStyle = copBlue;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  const copBody = ctx.createLinearGradient(0, Y(0.44), 0, Y(0.63));
  copBody.addColorStop(0, '#33456E');
  copBody.addColorStop(0.55, '#1C2742');
  copBody.addColorStop(1, '#0D1424');
  ctx.fillStyle = copBody;
  ctx.beginPath();
  ctx.moveTo(X(0.662), Y(0.598));
  ctx.quadraticCurveTo(X(0.655), Y(0.520), X(0.715), Y(0.505));
  ctx.lineTo(X(0.775), Y(0.498));
  ctx.quadraticCurveTo(X(0.815), Y(0.448), X(0.878), Y(0.446));
  ctx.quadraticCurveTo(X(0.928), Y(0.452), X(0.955), Y(0.500));
  ctx.lineTo(X(0.985), Y(0.520));
  ctx.quadraticCurveTo(X(0.998), Y(0.530), X(0.992), Y(0.585));
  ctx.lineTo(X(0.985), Y(0.618));
  ctx.lineTo(X(0.668), Y(0.618));
  ctx.closePath();
  ctx.fill();
  // Cruiser glass and the white door panel.
  ctx.fillStyle = 'rgba(165,215,235,0.75)';
  ctx.beginPath();
  ctx.moveTo(X(0.792), Y(0.492));
  ctx.quadraticCurveTo(X(0.822), Y(0.458), X(0.872), Y(0.458));
  ctx.quadraticCurveTo(X(0.912), Y(0.462), X(0.938), Y(0.494));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(238,242,248,0.88)';
  ctx.beginPath();
  ctx.roundRect(X(0.795), Y(0.520), bw * 0.105, bh * 0.082, 3 * u);
  ctx.fill();
  // Light bar: red left, blue right, both burning.
  ctx.fillStyle = '#FF2A42';
  ctx.fillRect(X(0.800), Y(0.436), bw * 0.038, bh * 0.020);
  ctx.fillStyle = '#4078FF';
  ctx.fillRect(X(0.842), Y(0.436), bw * 0.038, bh * 0.020);
  // Cruiser wheels and headlight.
  [[0.725], [0.935]].forEach(([fx]) => {
    ctx.fillStyle = '#05050A';
    ctx.beginPath();
    ctx.arc(X(fx), Y(0.615), bh * 0.052, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8A93A8';
    ctx.beginPath();
    ctx.arc(X(fx), Y(0.615), bh * 0.020, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#FFE9A8';
  ctx.beginPath();
  ctx.ellipse(X(0.664), Y(0.562), 4.2 * u, 2.6 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // The car body: one low wedge, nose to the left, shaded in sunset tones (no longer a flat
  // silhouette — a magenta-lit top, an ink belly, a hot band along the flank).
  const bodyGrad = ctx.createLinearGradient(0, Y(0.36), 0, Y(0.72));
  bodyGrad.addColorStop(0, '#54204A');
  bodyGrad.addColorStop(0.45, '#2A1030');
  bodyGrad.addColorStop(1, SCENE_INK);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(X(0.07), Y(0.70));
  ctx.quadraticCurveTo(X(0.058), Y(0.585), X(0.17), Y(0.555));
  ctx.lineTo(X(0.315), Y(0.535));
  ctx.quadraticCurveTo(X(0.40), Y(0.395), X(0.545), Y(0.375));
  ctx.quadraticCurveTo(X(0.665), Y(0.375), X(0.735), Y(0.50));
  ctx.lineTo(X(0.885), Y(0.545));
  ctx.quadraticCurveTo(X(0.955), Y(0.565), X(0.945), Y(0.66));
  ctx.lineTo(X(0.93), Y(0.718));
  ctx.lineTo(X(0.075), Y(0.718));
  ctx.closePath();
  ctx.fill();
  // Sunset rim along the roofline and a hot magenta band down the flank.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,126,71,0.85)';
  ctx.lineWidth = 2.2 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X(0.17), Y(0.555));
  ctx.lineTo(X(0.315), Y(0.535));
  ctx.quadraticCurveTo(X(0.40), Y(0.395), X(0.545), Y(0.375));
  ctx.quadraticCurveTo(X(0.665), Y(0.375), X(0.735), Y(0.50));
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,73,122,0.27)';
  ctx.beginPath();
  ctx.moveTo(X(0.10), Y(0.615));
  ctx.lineTo(X(0.93), Y(0.615));
  ctx.lineTo(X(0.928), Y(0.665));
  ctx.lineTo(X(0.095), Y(0.665));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Cabin glass.
  ctx.fillStyle = 'rgba(140,220,240,0.72)';
  ctx.beginPath();
  ctx.moveTo(X(0.365), Y(0.518));
  ctx.quadraticCurveTo(X(0.425), Y(0.42), X(0.53), Y(0.412));
  ctx.quadraticCurveTo(X(0.625), Y(0.418), X(0.695), Y(0.502));
  ctx.closePath();
  ctx.fill();
  // Door cut line and tail light.
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.6 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.52), Y(0.53));
  ctx.lineTo(X(0.52), Y(0.70));
  ctx.stroke();
  ctx.fillStyle = '#FF2A42';
  ctx.fillRect(X(0.928), Y(0.585), bw * 0.016, bh * 0.035);
  // Wheels: tyre, rim ring, five spokes, teal hub.
  [[0.245], [0.775]].forEach(([fx]) => {
    const cx = X(fx);
    const cy = Y(0.715);
    const r = bh * 0.104;
    ctx.fillStyle = '#05050A';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3A3A48';
    ctx.lineWidth = 2.4 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#565668';
    ctx.lineWidth = 2 * u;
    for (let s = 0; s < 5; s++) {
      const a = (s / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58);
      ctx.stroke();
    }
    ctx.fillStyle = TEAL;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });
  // Headlight lens.
  ctx.fillStyle = '#FFE9A8';
  ctx.beginPath();
  ctx.ellipse(X(0.072), Y(0.618), 5.5 * u, 3.2 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tire smoke boiling off both rear wheels, drifting back over the road.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  [[0.815, 0.735, 0.16, 0.30], [0.885, 0.715, 0.11, 0.22], [0.955, 0.66, 0.075, 0.18]].forEach(([fx, fy, r, a]) => {
    const puff = ctx.createRadialGradient(X(fx), Y(fy), 1, X(fx), Y(fy), bw * r);
    puff.addColorStop(0, `rgba(205,205,220,${a})`);
    puff.addColorStop(1, 'rgba(205,205,220,0)');
    ctx.fillStyle = puff;
    ctx.fillRect(bx, by, bw, bh);
  });
  ctx.restore();
  drawSmokeWisp(ctx, X(0.78), Y(0.15), bw * 0.15, u);
}

/** The yacht: a white-night silhouette at anchor under the sunset, windows lit, wake foaming. */
function paintYachtScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#2A0A3A'], [0.5, '#7A1E5E'], [0.8, '#E8497A'], [1, '#FF9E4F']]);
  drawRetroSun(ctx, X(0.66), Y(0.38), bw * 0.125, 'sunset', u);
  // Sea.
  const sea = ctx.createLinearGradient(0, Y(0.56), 0, Y(1));
  sea.addColorStop(0, '#C13B78');
  sea.addColorStop(1, '#2A0A3A');
  ctx.fillStyle = sea;
  ctx.fillRect(bx, Y(0.56), bw, bh * 0.44);
  ctx.strokeStyle = 'rgba(255,217,138,0.28)';
  ctx.lineWidth = 1.6 * u;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const fy = 0.615 + hash01(i * 3.1) * 0.34;
    const fx = 0.06 + hash01(i * 7.7) * 0.8;
    const len = 0.03 + hash01(i * 5.3) * 0.07;
    ctx.beginPath();
    ctx.moveTo(X(fx), Y(fy));
    ctx.lineTo(X(fx + len), Y(fy));
    ctx.stroke();
  }
  // Hull and superstructure.
  ctx.fillStyle = SCENE_INK;
  ctx.beginPath();
  ctx.moveTo(X(0.135), Y(0.578));
  ctx.lineTo(X(0.875), Y(0.578));
  ctx.quadraticCurveTo(X(0.83), Y(0.655), X(0.755), Y(0.685));
  ctx.quadraticCurveTo(X(0.50), Y(0.715), X(0.245), Y(0.685));
  ctx.quadraticCurveTo(X(0.165), Y(0.648), X(0.135), Y(0.578));
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(X(0.355), Y(0.502), bw * 0.325, bh * 0.078);
  ctx.fillRect(X(0.425), Y(0.432), bw * 0.185, bh * 0.072);
  ctx.strokeStyle = SCENE_INK;
  ctx.lineWidth = 3.4 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.517), Y(0.432));
  ctx.lineTo(X(0.517), Y(0.205));
  ctx.moveTo(X(0.462), Y(0.262));
  ctx.lineTo(X(0.572), Y(0.262));
  ctx.stroke();
  // Lit windows: a warm row along the hull, a brighter row in the cabin.
  ctx.fillStyle = '#FFD98A';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(X(0.30 + i * 0.075), Y(0.622), 2.1 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE9A8';
  for (let i = 0; i < 4; i++) ctx.fillRect(X(0.385 + i * 0.062), Y(0.528), bw * 0.034, bh * 0.026);
  // Wake foam curling off the stern.
  ctx.strokeStyle = 'rgba(255,246,233,0.5)';
  ctx.lineWidth = 2 * u;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(X(0.115 - i * 0.012), Y(0.635 + i * 0.028), bw * (0.018 + i * 0.010), Math.PI * 0.9, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.save();
  ctx.globalAlpha = 0.8;
  drawPalmSilhouette(ctx, X(0.972), Y(0.995), bw * 0.15, -1, true);
  ctx.restore();
}

/** The neon skyline: towers over a night boulevard, windows lit, two signs burning. */
function paintSkylineScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#070B26'], [0.55, '#2A0A3A'], [1, '#7A1E5E']]);
  // Stars and the moon.
  ctx.fillStyle = '#FFF6E9';
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.25 + hash01(i * 1.7) * 0.55;
    ctx.fillRect(X(hash01(i * 3.3)), Y(hash01(i * 9.1) * 0.45), 1.4 * u, 1.4 * u);
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(X(0.80), Y(0.22), 2, X(0.80), Y(0.22), bw * 0.16);
  glow.addColorStop(0, 'rgba(207,251,255,0.5)');
  glow.addColorStop(1, 'rgba(207,251,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  ctx.fillStyle = '#DFF9FF';
  ctx.beginPath();
  ctx.arc(X(0.80), Y(0.22), bw * 0.052, 0, Math.PI * 2);
  ctx.fill();
  // Towers: fixed stepped silhouettes, windows on a hashed grid.
  const towers = [
    [0.00, 0.13, 0.38], [0.12, 0.10, 0.52], [0.21, 0.15, 0.30], [0.35, 0.09, 0.58],
    [0.43, 0.14, 0.42], [0.56, 0.10, 0.62], [0.65, 0.16, 0.34], [0.80, 0.09, 0.50], [0.88, 0.12, 0.44],
  ];
  const lit = ['#FFD319', '#FF5DA2', '#00E5FF', '#FFF6E9'];
  towers.forEach(([fx, fw, top], bi) => {
    ctx.fillStyle = '#06030E';
    ctx.fillRect(X(fx), Y(top), bw * fw, bh * (1 - top));
    const cols = Math.max(2, Math.round((fw * bw) / (11 * u)));
    const rows = Math.max(3, Math.round(((1 - top) * bh) / (13 * u)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = hash01(bi * 77 + r * 13 + c * 7);
        if (h < 0.48) continue;
        ctx.fillStyle = lit[Math.floor(hash01(bi * 31 + r * 3 + c) * 4) % 4];
        ctx.globalAlpha = 0.55 + h * 0.45;
        ctx.fillRect(
          X(fx) + (c + 0.22) * (fw * bw / cols), Y(top) + (r + 0.25) * ((1 - top) * bh / rows),
          (fw * bw / cols) * 0.52, ((1 - top) * bh / rows) * 0.5,
        );
      }
    }
    ctx.globalAlpha = 1;
  });
  // Two neon signs burning down the tower faces.
  ctx.save();
  ctx.shadowBlur = 13 * u;
  ctx.fillStyle = PINK;
  ctx.shadowColor = PINK;
  ctx.fillRect(X(0.262), Y(0.36), bw * 0.016, bh * 0.20);
  ctx.fillStyle = TEAL;
  ctx.shadowColor = TEAL;
  ctx.fillRect(X(0.700), Y(0.42), bw * 0.016, bh * 0.17);
  ctx.restore();
  // Police colour bleeding into the streets: red low at the left, blue at the right.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sirenR = ctx.createRadialGradient(X(0.16), Y(0.97), 2, X(0.16), Y(0.97), bw * 0.34);
  sirenR.addColorStop(0, 'rgba(255,42,66,0.30)');
  sirenR.addColorStop(1, 'rgba(255,42,66,0)');
  ctx.fillStyle = sirenR;
  ctx.fillRect(bx, by, bw, bh);
  const sirenB = ctx.createRadialGradient(X(0.84), Y(0.97), 2, X(0.84), Y(0.97), bw * 0.34);
  sirenB.addColorStop(0, 'rgba(64,120,255,0.30)');
  sirenB.addColorStop(1, 'rgba(64,120,255,0)');
  ctx.fillStyle = sirenB;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  // Street glow along the foot.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const street = ctx.createLinearGradient(0, Y(0.9), 0, Y(1));
  street.addColorStop(0, 'rgba(255,126,71,0)');
  street.addColorStop(1, 'rgba(255,126,71,0.22)');
  ctx.fillStyle = street;
  ctx.fillRect(bx, Y(0.9), bw, bh * 0.1);
  ctx.restore();
}

/** Money flight: a shaded figurehead in sunglasses while the bills blow past. */
function paintMoneyScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#1B0530'], [0.65, '#4A1D6B'], [1, '#7A1E5E']]);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(X(0.5), Y(0.30), 2, X(0.5), Y(0.30), bw * 0.45);
  glow.addColorStop(0, 'rgba(255,46,136,0.22)');
  glow.addColorStop(1, 'rgba(255,46,136,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  // The figure: head and shoulders in ink, pink rim light one side, teal the other.
  ctx.fillStyle = SCENE_INK;
  ctx.beginPath();
  ctx.moveTo(X(0.235), Y(1.0));
  ctx.quadraticCurveTo(X(0.26), Y(0.80), X(0.415), Y(0.752));
  ctx.lineTo(X(0.585), Y(0.752));
  ctx.quadraticCurveTo(X(0.74), Y(0.80), X(0.765), Y(1.0));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(X(0.5), Y(0.615), bw * 0.072, bh * 0.118, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sunglasses band with a neon underlight.
  ctx.fillStyle = '#1E2A33';
  ctx.beginPath();
  ctx.roundRect(X(0.5) - bw * 0.064, Y(0.572), bw * 0.128, bh * 0.062, 4 * u);
  ctx.fill();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.272), Y(0.965));
  ctx.quadraticCurveTo(X(0.30), Y(0.83), X(0.418), Y(0.772));
  ctx.stroke();
  ctx.strokeStyle = TEAL;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(X(0.728), Y(0.965));
  ctx.quadraticCurveTo(X(0.70), Y(0.83), X(0.582), Y(0.772));
  ctx.stroke();
  ctx.globalAlpha = 1;
  // The bills: fixed positions and tumbles, green with a pale border and seal.
  const bills = [
    [0.16, 0.20, -0.5, 1.0], [0.31, 0.10, 0.35, 0.8], [0.68, 0.13, 0.9, 1.1], [0.85, 0.30, -0.3, 0.9],
    [0.11, 0.47, 0.2, 0.7], [0.89, 0.60, 0.55, 0.75], [0.74, 0.44, -0.85, 0.62], [0.24, 0.66, 0.75, 0.55],
  ];
  for (const [fx, fy, rot, s] of bills) {
    const w = bw * 0.15 * s;
    const h = w * 0.44;
    ctx.save();
    ctx.translate(X(fx), Y(fy));
    ctx.rotate(rot);
    ctx.fillStyle = '#2F8F4E';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 3 * u);
    ctx.fill();
    ctx.strokeStyle = '#CDEACB';
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.15, h * 0.30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#CDEACB';
    ctx.beginPath();
    ctx.arc(-w * 0.36, 0, 1.6 * u, 0, Math.PI * 2);
    ctx.arc(w * 0.36, 0, 1.6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawSparkle(ctx, X(0.20), Y(0.80), 8 * u, '#FFFFFF');
  drawSparkle(ctx, X(0.83), Y(0.82), 6 * u, PINK);
}

/** The motorcycle: a rider at speed on the coast road at dusk, dust and streaks behind. */
function paintMotoScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#2A0A3A'], [0.5, '#7A1E5E'], [0.78, '#E8497A'], [1, '#FF9E4F']]);
  drawRetroSun(ctx, X(0.86), Y(0.34), bw * 0.068, 'sunset', u);
  // Sea glint on the horizon, then the coast road rising through the frame.
  ctx.fillStyle = 'rgba(255,217,138,0.35)';
  ctx.fillRect(bx, Y(0.545), bw, bh * 0.018);
  ctx.fillStyle = '#150B22';
  ctx.beginPath();
  ctx.moveTo(bx, Y(0.66));
  ctx.lineTo(bx + bw, Y(0.585));
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,217,138,0.45)';
  for (let i = 0; i < 4; i++) ctx.fillRect(X(0.06 + i * 0.26), Y(0.845 - i * 0.018), bw * 0.11, bh * 0.02);
  // Speed streaks streaming off the back of the bike.
  ctx.strokeStyle = 'rgba(255,246,233,0.5)';
  ctx.lineWidth = 2.6 * u;
  ctx.lineCap = 'round';
  [[0.46, 0.30], [0.55, 0.24], [0.64, 0.27], [0.72, 0.20]].forEach(([fy, len]) => {
    ctx.beginPath();
    ctx.moveTo(X(0.30), Y(fy));
    ctx.lineTo(X(0.30 - len), Y(fy));
    ctx.stroke();
  });
  // Dust kicked up behind the rear wheel.
  ctx.save();
  [[0.20, 0.82, 0.16, 0.20], [0.13, 0.76, 0.11, 0.15], [0.24, 0.70, 0.08, 0.12]].forEach(([fx, fy, r, a]) => {
    const puff = ctx.createRadialGradient(X(fx), Y(fy), 1, X(fx), Y(fy), bw * r);
    puff.addColorStop(0, `rgba(232,180,130,${a})`);
    puff.addColorStop(1, 'rgba(232,180,130,0)');
    ctx.fillStyle = puff;
    ctx.fillRect(bx, by, bw, bh);
  });
  ctx.restore();
  const wheel = (fx) => {
    const cx = X(fx);
    const cy = Y(0.815);
    const r = bh * 0.115;
    ctx.fillStyle = '#05050A';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6A6A7E';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.60, 0, Math.PI * 2);
    ctx.stroke();
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI + 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * r * 0.58, cy - Math.sin(a) * r * 0.58);
      ctx.lineTo(cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58);
      ctx.stroke();
    }
    ctx.fillStyle = '#C8C8D8';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  };
  // Frame and bodywork: ink chassis, a sunset-gradient tank and tail. The whole machine is
  // swollen about its centre so it fills its panel and reads at thumbnail size.
  ctx.save();
  ctx.translate(X(0.46), Y(0.62));
  ctx.scale(1.22, 1.22);
  ctx.translate(-X(0.46), -Y(0.62));
  ctx.strokeStyle = SCENE_INK;
  ctx.lineWidth = 5.5 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X(0.315), Y(0.815));
  ctx.lineTo(X(0.44), Y(0.635));
  ctx.lineTo(X(0.545), Y(0.60));
  ctx.lineTo(X(0.615), Y(0.815));
  ctx.moveTo(X(0.44), Y(0.635));
  ctx.lineTo(X(0.47), Y(0.76));
  ctx.moveTo(X(0.545), Y(0.60));
  ctx.lineTo(X(0.50), Y(0.76));
  ctx.lineTo(X(0.47), Y(0.76));
  ctx.stroke();
  const tankGrad = ctx.createLinearGradient(X(0.33), 0, X(0.58), 0);
  tankGrad.addColorStop(0, '#C13B78');
  tankGrad.addColorStop(1, '#FF7E47');
  ctx.fillStyle = tankGrad;
  ctx.beginPath();
  ctx.moveTo(X(0.335), Y(0.615));
  ctx.quadraticCurveTo(X(0.36), Y(0.545), X(0.44), Y(0.555));
  ctx.lineTo(X(0.565), Y(0.575));
  ctx.quadraticCurveTo(X(0.575), Y(0.625), X(0.52), Y(0.635));
  ctx.lineTo(X(0.37), Y(0.645));
  ctx.quadraticCurveTo(X(0.335), Y(0.64), X(0.335), Y(0.615));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = SCENE_INK;
  ctx.beginPath();
  ctx.ellipse(X(0.465), Y(0.735), bw * 0.052, bh * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  // A hot edge along the tank so the machine's line survives the rider sitting on it.
  ctx.strokeStyle = 'rgba(255,190,110,0.95)';
  ctx.lineWidth = 2.6 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.36), Y(0.552));
  ctx.quadraticCurveTo(X(0.44), Y(0.540), X(0.565), Y(0.572));
  ctx.stroke();
  wheel(0.315);
  wheel(0.615);
  // The rider, leaned into it: jacket, helmet, arms to the bars, boot on the peg.
  ctx.strokeStyle = '#1B4A5A';
  ctx.lineWidth = 8.5 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.415), Y(0.545));
  ctx.quadraticCurveTo(X(0.47), Y(0.44), X(0.545), Y(0.435));
  ctx.stroke();
  ctx.strokeStyle = SCENE_INK;
  ctx.lineWidth = 7 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.415), Y(0.545));
  ctx.lineTo(X(0.475), Y(0.645));
  ctx.lineTo(X(0.455), Y(0.745));
  ctx.moveTo(X(0.50), Y(0.475));
  ctx.lineTo(X(0.575), Y(0.565));
  ctx.stroke();
  ctx.fillStyle = '#175263';
  ctx.beginPath();
  ctx.ellipse(X(0.475), Y(0.475), bw * 0.044, bh * 0.090, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,126,71,0.9)';
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.ellipse(X(0.475), Y(0.475), bw * 0.044, bh * 0.090, -0.5, Math.PI * 1.02, Math.PI * 1.62);
  ctx.stroke();
  ctx.fillStyle = '#E8E4DA';
  ctx.beginPath();
  ctx.arc(X(0.562), Y(0.408), bh * 0.068, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(X(0.562), Y(0.408), bh * 0.068, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(X(0.562), Y(0.408));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#12222C';
  ctx.beginPath();
  ctx.roundRect(X(0.562), Y(0.398), bw * 0.052, bh * 0.038, 3 * u);
  ctx.fill();
  // Headlight bloom at the front.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const bloom = ctx.createRadialGradient(X(0.635), Y(0.60), 1, X(0.635), Y(0.60), bw * 0.07);
  bloom.addColorStop(0, 'rgba(255,240,190,0.7)');
  bloom.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  drawSmokeWisp(ctx, X(0.30), Y(0.70), bw * 0.10, u);
  ctx.restore();
}

/** The partner: a bearded fixer in a beach shirt, money in both hands, bills in the air. */
function paintPartnerScene(ctx, bx, by, bw, bh, u) {
  const X = (f) => bx + f * bw;
  const Y = (f) => by + f * bh;
  sceneSky(ctx, bx, by, bw, bh, [[0, '#1B0530'], [0.6, '#4A1D6B'], [1, '#7A1E5E']]);
  // Neon weather behind him, kept to the left and top so the studio badge corner stays his.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glowP = ctx.createRadialGradient(X(0.30), Y(0.26), 2, X(0.30), Y(0.26), bw * 0.52);
  glowP.addColorStop(0, 'rgba(255,46,136,0.34)');
  glowP.addColorStop(1, 'rgba(255,46,136,0)');
  ctx.fillStyle = glowP;
  ctx.fillRect(bx, by, bw, bh);
  const glowT = ctx.createRadialGradient(X(0.62), Y(0.10), 2, X(0.62), Y(0.10), bw * 0.34);
  glowT.addColorStop(0, 'rgba(0,229,255,0.26)');
  glowT.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.fillStyle = glowT;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  const cx = X(0.37);
  // Torso: dark jacket over an open patterned beach shirt, chest at the V.
  ctx.fillStyle = '#14101E';
  ctx.beginPath();
  ctx.moveTo(X(0.03), Y(1.0));
  ctx.quadraticCurveTo(X(0.05), Y(0.66), X(0.20), Y(0.575));
  ctx.lineTo(X(0.54), Y(0.575));
  ctx.quadraticCurveTo(X(0.69), Y(0.66), X(0.71), Y(1.0));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0E7C86';
  ctx.beginPath();
  ctx.moveTo(X(0.245), Y(0.585));
  ctx.lineTo(X(0.495), Y(0.585));
  ctx.lineTo(X(0.44), Y(1.0));
  ctx.lineTo(X(0.30), Y(1.0));
  ctx.closePath();
  ctx.fill();
  // Beach-shirt pattern: little sunset flowers hashed across the cloth.
  ctx.fillStyle = '#FF5DA2';
  for (let i = 0; i < 9; i++) {
    const px = X(0.27 + hash01(i * 3.1) * 0.20);
    const py = Y(0.63 + hash01(i * 7.7) * 0.32);
    ctx.beginPath();
    ctx.arc(px, py, 2.6 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFD319';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(X(0.28 + hash01(i * 5.3 + 9) * 0.18), Y(0.66 + hash01(i * 4.9 + 3) * 0.28), 1.8 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  // Skin at the open collar.
  ctx.fillStyle = '#B96F45';
  ctx.beginPath();
  ctx.moveTo(X(0.315), Y(0.575));
  ctx.lineTo(X(0.425), Y(0.575));
  ctx.lineTo(X(0.37), Y(0.70));
  ctx.closePath();
  ctx.fill();
  // Jacket lapels and a magenta rim down his left edge.
  ctx.fillStyle = '#0A0714';
  ctx.beginPath();
  ctx.moveTo(X(0.245), Y(0.585));
  ctx.lineTo(X(0.315), Y(0.575));
  ctx.lineTo(X(0.335), Y(0.78));
  ctx.lineTo(X(0.27), Y(0.86));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(0.495), Y(0.585));
  ctx.lineTo(X(0.425), Y(0.575));
  ctx.lineTo(X(0.405), Y(0.78));
  ctx.lineTo(X(0.47), Y(0.86));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.055), Y(0.97));
  ctx.quadraticCurveTo(X(0.075), Y(0.70), X(0.205), Y(0.60));
  ctx.stroke();
  // Head: skin blocks, dark hair, a full beard, and the smirk.
  ctx.fillStyle = '#C97B5A';
  ctx.beginPath();
  ctx.ellipse(cx, Y(0.375), bw * 0.148, bh * 0.185, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(122,62,34,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx + bw * 0.062, Y(0.40), bw * 0.082, bh * 0.155, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#E5A173';
  ctx.beginPath();
  ctx.ellipse(cx - bw * 0.052, Y(0.315), bw * 0.052, bh * 0.075, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Hair: swept top and sides.
  ctx.fillStyle = '#1D1216';
  ctx.beginPath();
  ctx.ellipse(cx, Y(0.235), bw * 0.152, bh * 0.085, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - bw * 0.152, Y(0.225), bw * 0.045, bh * 0.13);
  ctx.fillRect(cx + bw * 0.107, Y(0.225), bw * 0.045, bh * 0.13);
  // Beard: jaw mass with a lighter chin tuft.
  ctx.beginPath();
  ctx.ellipse(cx, Y(0.475), bw * 0.128, bh * 0.105, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(cx - bw * 0.128, Y(0.40), bw * 0.05, bh * 0.075);
  ctx.fillRect(cx + bw * 0.078, Y(0.40), bw * 0.05, bh * 0.075);
  ctx.fillStyle = '#33202A';
  ctx.beginPath();
  ctx.ellipse(cx, Y(0.50), bw * 0.07, bh * 0.05, 0, 0, Math.PI);
  ctx.fill();
  // Brows, eyes, nose shadow, and the sly mouth above the beard line.
  ctx.strokeStyle = '#1D1216';
  ctx.lineWidth = 3.4 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.095, Y(0.335));
  ctx.lineTo(cx - bw * 0.028, Y(0.322));
  ctx.moveTo(cx + bw * 0.095, Y(0.328));
  ctx.lineTo(cx + bw * 0.028, Y(0.322));
  ctx.stroke();
  ctx.fillStyle = '#16090A';
  ctx.beginPath();
  ctx.ellipse(cx - bw * 0.058, Y(0.365), bw * 0.020, bh * 0.011, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + bw * 0.058, Y(0.365), bw * 0.020, bh * 0.011, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,45,25,0.8)';
  ctx.lineWidth = 2.2 * u;
  ctx.beginPath();
  ctx.moveTo(cx + bw * 0.008, Y(0.375));
  ctx.lineTo(cx - bw * 0.006, Y(0.425));
  ctx.stroke();
  ctx.strokeStyle = '#2A0D12';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.052, Y(0.452));
  ctx.quadraticCurveTo(cx + bw * 0.01, Y(0.472), cx + bw * 0.062, Y(0.438));
  ctx.stroke();
  // One hand fans bills at his chest; the other hauls a money bag at his side.
  ctx.save();
  ctx.translate(X(0.575), Y(0.66));
  ctx.rotate(0.5);
  for (let i = -1; i <= 1; i++) {
    ctx.save();
    ctx.rotate(i * 0.28);
    ctx.fillStyle = '#2F8F4E';
    ctx.beginPath();
    ctx.roundRect(-bw * 0.016, -bh * 0.105, bw * 0.032, bh * 0.105, 2 * u);
    ctx.fill();
    ctx.strokeStyle = '#CDEACB';
    ctx.lineWidth = 1.1 * u;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#B96F45';
  ctx.beginPath();
  ctx.ellipse(X(0.575), Y(0.675), bw * 0.030, bh * 0.026, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#77813C';
  ctx.beginPath();
  ctx.moveTo(X(0.115), Y(0.72));
  ctx.quadraticCurveTo(X(0.055), Y(0.80), X(0.075), Y(0.92));
  ctx.quadraticCurveTo(X(0.09), Y(1.0), X(0.14), Y(1.0));
  ctx.lineTo(X(0.215), Y(1.0));
  ctx.quadraticCurveTo(X(0.265), Y(0.88), X(0.215), Y(0.78));
  ctx.quadraticCurveTo(X(0.185), Y(0.715), X(0.115), Y(0.72));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#59632C';
  ctx.fillRect(X(0.128), Y(0.705), bw * 0.062, bh * 0.026);
  ctx.strokeStyle = '#CDEACB';
  ctx.lineWidth = 1.6 * u;
  ctx.beginPath();
  ctx.ellipse(X(0.165), Y(0.885), bw * 0.026, bh * 0.034, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#B96F45';
  ctx.beginPath();
  ctx.ellipse(X(0.135), Y(0.725), bw * 0.026, bh * 0.022, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Bills in the air: near ones crisp, far ones ghosted twice for depth blur. The bottom-
  // right stays clear — that corner belongs to the studio badge.
  const bills = [
    [0.13, 0.13, -0.5, 1.05, 0], [0.60, 0.16, 0.4, 0.9, 0], [0.86, 0.10, 0.85, 0.7, 1],
    [0.06, 0.38, 0.25, 0.8, 0], [0.68, 0.36, -0.8, 0.62, 1], [0.90, 0.34, -0.3, 1.0, 0],
    [0.30, 0.06, 0.7, 0.55, 1], [0.52, 0.30, 1.15, 0.5, 1],
  ];
  for (const [fx, fy, rot, s, far] of bills) {
    const w = bw * 0.15 * s;
    const h = w * 0.44;
    for (let pass = far ? 2 : 0; pass >= 0; pass--) {
      ctx.save();
      ctx.translate(X(fx) + pass * 2.2 * u, Y(fy) + pass * 1.4 * u);
      ctx.rotate(rot);
      ctx.globalAlpha = pass === 0 ? 1 : 0.28;
      ctx.fillStyle = '#2F8F4E';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 3 * u);
      ctx.fill();
      if (pass === 0) {
        ctx.strokeStyle = '#CDEACB';
        ctx.lineWidth = 1.3 * u;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.15, h * 0.30, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  drawSparkle(ctx, X(0.90), Y(0.55), 7 * u, '#FFFFFF');
  drawSparkle(ctx, X(0.08), Y(0.55), 5.5 * u, PINK);
}

const SCENE_PAINTERS = {
  heli: paintHeliScene,
  moto: paintMotoScene,
  car: paintCarScene,
  yacht: paintYachtScene,
  skyline: paintSkylineScene,
  money: paintMoneyScene,
  partner: paintPartnerScene,
};

/**
 * Draws one scene panel: the painted scene clipped to the panel's tilted quad, the shared
 * print shade over it, and the same frame finish a photo panel gets.
 */
export function drawScenePanel(ctx, p, index, sceneId, state, W, H) {
  const quad = panelQuad(p, index, W, H);
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  const u = Math.min(W, H) / 1080;
  ctx.save();
  traceQuad(ctx, quad);
  ctx.clip();
  (SCENE_PAINTERS[sceneId] ?? paintSkylineScene)(ctx, bx, by, bw, bh, u);
  sceneShade(ctx, bx, by, bw, bh);
  ctx.restore();
  finishPanelFrame(ctx, p, index, quad, W, H, state);
}

/**
 * Break-the-frame: the chase car's nose bursts out of its panel, over the black gutter and
 * into the neighbouring panel's edge, headlight first — the thin 3D pop of a real cover.
 * Drawn after every panel, before the lettering, so the title can still overlap it.
 */
export function drawSceneOverflow(ctx, layout, state, W, H) {
  const u = Math.min(W, H) / 1080;
  layout.forEach((p, i) => {
    const adjust = state.adjusts[`${state.layoutId}:${state.aspect}:${i}`];
    const sceneId = (adjust && adjust.scene !== undefined ? adjust.scene : p.scene);
    if (sceneId !== 'car') return;
    const quad = panelQuad(p, i, W, H);
    const leftX = Math.min(quad[0][0], quad[3][0]);
    const topY = Math.min(quad[0][1], quad[1][1]);
    const botY = Math.max(quad[2][1], quad[3][1]);
    const noseY = topY + (botY - topY) * 0.615;
    // The beam spills first, under the nose.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beam = ctx.createLinearGradient(leftX - 62 * u, 0, leftX - 185 * u, 0);
    beam.addColorStop(0, 'rgba(255,240,190,0.55)');
    beam.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(leftX - 60 * u, noseY - 6 * u);
    ctx.lineTo(leftX - 188 * u, noseY - 28 * u);
    ctx.lineTo(leftX - 188 * u, noseY + 36 * u);
    ctx.lineTo(leftX - 60 * u, noseY + 15 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // The nose wedge itself, in ink, overlapping the gutter.
    ctx.save();
    ctx.fillStyle = SCENE_INK;
    ctx.beginPath();
    ctx.moveTo(leftX + 8 * u, noseY - 30 * u);
    ctx.lineTo(leftX - 58 * u, noseY - 11 * u);
    ctx.quadraticCurveTo(leftX - 76 * u, noseY, leftX - 64 * u, noseY + 11 * u);
    ctx.lineTo(leftX + 8 * u, noseY + 27 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath();
    ctx.ellipse(leftX - 58 * u, noseY + 1 * u, 6.5 * u, 4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/**
 * The ink title panel of CLASSIC NINE: a sunset gradient standing in for the wordmark tile,
 * with the sun, ink palms knocked out of the gradient, and the caption lettering on top.
 */
/**
 * The helicopter that lives in the hero panel's own sky (no panel of its own): a small,
 * distant airframe in the open sky at the panel's upper left, sunset-graded and slightly
 * hazed so it reads as far away on the horizon, its searchlight falling as a short, soft
 * volumetric cone that dies in the sky — clear of the subject's hair and the palm trunks.
 */
export function drawHeroHeli(ctx, heroPanel, W, H) {
  const quad = panelQuad(heroPanel, 0, W, H);
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  const u = Math.min(W, H) / 1080;
  const hx = bx + bw * 0.04;
  const hy = by + bh * 0.028;
  const hw = bw * 0.30;
  const hh = bh * 0.175;
  const X = (f) => hx + f * hw;
  const Y = (f) => hy + f * hh;
  ctx.save();
  traceQuad(ctx, quad);
  ctx.clip();
  // Warm sky-glow seating the airframe in the sunset.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const seat = ctx.createRadialGradient(X(0.42), Y(0.45), 2, X(0.42), Y(0.45), hw * 0.55);
  seat.addColorStop(0, 'rgba(255,158,79,0.20)');
  seat.addColorStop(1, 'rgba(255,158,79,0)');
  ctx.fillStyle = seat;
  ctx.fillRect(bx, by, bw, bh);
  // The volumetric cone: three nested sheers of light, widening as they fall, plus the pool.
  const apexX = X(0.33);
  const apexY = Y(0.92);
  const baseY = by + bh * 0.315;
  [[0.17, 0.10], [0.115, 0.16], [0.06, 0.24]].forEach(([spread, alpha]) => {
    const g = ctx.createLinearGradient(0, apexY, 0, baseY);
    g.addColorStop(0, `rgba(255,238,196,${alpha})`);
    g.addColorStop(1, 'rgba(255,238,196,0.03)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(apexX - 3 * u, apexY);
    ctx.lineTo(apexX + 3 * u, apexY);
    ctx.lineTo(apexX + bw * spread, baseY);
    ctx.lineTo(apexX - bw * (spread + 0.03), baseY);
    ctx.closePath();
    ctx.fill();
  });
  const pool = ctx.createRadialGradient(apexX - bw * 0.02, baseY, 2, apexX - bw * 0.02, baseY, bw * 0.12);
  pool.addColorStop(0, 'rgba(255,240,190,0.26)');
  pool.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();
  // A breath of warm dust-shadow under the cone's path, so the beam reads against a bright
  // sky as well as against the street.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const dust = ctx.createLinearGradient(0, apexY, 0, baseY);
  dust.addColorStop(0, 'rgba(255,214,150,0.30)');
  dust.addColorStop(1, 'rgba(255,214,150,0.5)');
  ctx.fillStyle = dust;
  ctx.beginPath();
  ctx.moveTo(apexX - 2 * u, apexY);
  ctx.lineTo(apexX + 2 * u, apexY);
  ctx.lineTo(apexX + bw * 0.10, baseY);
  ctx.lineTo(apexX - bw * 0.08, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // The airframe itself, hazed back a touch so distance reads before detail does.
  ctx.save();
  ctx.globalAlpha = 0.82;
  // Tail boom and fin, warm-shaded.
  const warm = ctx.createLinearGradient(0, Y(0.1), 0, Y(0.95));
  warm.addColorStop(0, '#B45A28');
  warm.addColorStop(0.5, '#6E2A1A');
  warm.addColorStop(1, '#33100E');
  ctx.fillStyle = warm;
  ctx.beginPath();
  ctx.moveTo(X(0.465), Y(0.315));
  ctx.lineTo(X(0.845), Y(0.252));
  ctx.lineTo(X(0.858), Y(0.298));
  ctx.lineTo(X(0.478), Y(0.405));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(0.845), Y(0.252));
  ctx.lineTo(X(0.888), Y(0.168));
  ctx.lineTo(X(0.902), Y(0.302));
  ctx.lineTo(X(0.858), Y(0.298));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,6,8,0.85)';
  ctx.lineWidth = 2.6 * u;
  ctx.beginPath();
  ctx.moveTo(X(0.880), Y(0.172));
  ctx.lineTo(X(0.880), Y(0.298));
  ctx.moveTo(X(0.852), Y(0.235));
  ctx.lineTo(X(0.908), Y(0.235));
  ctx.stroke();
  // Rotor mast and blades.
  ctx.fillStyle = '#2A0D10';
  ctx.fillRect(X(0.343), Y(0.205), hw * 0.034, hh * 0.05);
  ctx.save();
  ctx.translate(X(0.36), Y(0.196));
  ctx.rotate(-0.045);
  ctx.beginPath();
  ctx.ellipse(0, 0, hw * 0.295, hh * 0.020, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.translate(0, hh * 0.018);
  ctx.rotate(0.028);
  ctx.beginPath();
  ctx.ellipse(0, 0, hw * 0.28, hh * 0.016, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Body: sunset gradient, ink edge, pale cockpit glass, a hot rim along the crown.
  ctx.beginPath();
  ctx.ellipse(X(0.36), Y(0.365), hw * 0.155, hh * 0.150, 0, 0, Math.PI * 2);
  ctx.fillStyle = warm;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,6,8,0.9)';
  ctx.lineWidth = 2.2 * u;
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,190,110,0.9)';
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.ellipse(X(0.36), Y(0.365), hw * 0.150, hh * 0.145, 0, Math.PI * 1.15, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(170,230,245,0.9)';
  ctx.beginPath();
  ctx.ellipse(X(0.268), Y(0.338), hw * 0.054, hh * 0.062, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // Skids.
  ctx.strokeStyle = '#2A0D10';
  ctx.lineWidth = 3.4 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X(0.30), Y(0.495));
  ctx.lineTo(X(0.272), Y(0.578));
  ctx.moveTo(X(0.435), Y(0.495));
  ctx.lineTo(X(0.468), Y(0.578));
  ctx.moveTo(X(0.215), Y(0.588));
  ctx.lineTo(X(0.525), Y(0.588));
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

let grainTileCache = null;
let dotTileCache = null;

/**
 * The print finish over every panel: a deterministic film grain (a hashed noise tile laid
 * down as an overlay) and a few fine vertical scratches, so the whole cover feels like a
 * physical printed box rather than a clean screen render. Furniture stays crisp — this is
 * called before the badges and header are drawn.
 */
export function drawPrintFinish(ctx, W, H) {
  try {
    if (!grainTileCache) {
      const tile = document.createElement('canvas');
      tile.width = 144;
      tile.height = 144;
      const tctx = tile.getContext('2d');
      const img = tctx.createImageData(144, 144);
      for (let y = 0; y < 144; y++) {
        for (let x = 0; x < 144; x++) {
          const v = 96 + Math.floor(hash01(x * 1.37 + y * 17.31) * 64);
          const i = (y * 144 + x) * 4;
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
      grainTileCache = tile;
    }
    const pat = ctx.createPattern(grainTileCache, 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  } catch { /* grain is a finish, never a failure */ }
  // One light halftone screen over the whole cover — photos, painted panels and drawn
  // scenes alike — so every surface carries the same printed dot and reads as one sheet.
  try {
    if (!dotTileCache) {
      const tile = document.createElement('canvas');
      tile.width = 10;
      tile.height = 10;
      const tctx = tile.getContext('2d');
      tctx.fillStyle = '#0A0316';
      tctx.beginPath();
      tctx.arc(5, 5, 2.3, 0, Math.PI * 2);
      tctx.fill();
      dotTileCache = tile;
    }
    const dots = ctx.createPattern(dotTileCache, 'repeat');
    if (dots) {
      ctx.save();
      ctx.globalAlpha = 0.06;
      if (dots.setTransform) dots.setTransform(new DOMMatrix().rotate(15));
      ctx.fillStyle = dots;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  } catch { /* halftone is a finish, never a failure */ }
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x = hash01(i * 13.7 + 5) * W;
    const y0 = hash01(i * 3.9) * H * 0.35;
    const len = H * (0.25 + hash01(i * 5.1) * 0.6);
    const drift = (hash01(i * 9.3) - 0.5) * 7;
    ctx.strokeStyle = i % 3 === 2
      ? `rgba(10,5,15,${0.03 + hash01(i * 7.3) * 0.03})`
      : `rgba(255,250,240,${0.02 + hash01(i * 7.3) * 0.045})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + drift, y0 + len);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTitlePanel(ctx, p, index, state, W, H) {
  const quad = panelQuad(p, index, W, H);
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  const u = Math.min(W, H) / 1080;
  ctx.save();
  traceQuad(ctx, quad);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, by, 0, by + bh);
  grad.addColorStop(0, '#2A0A3A');
  grad.addColorStop(0.45, '#7A1E5E');
  grad.addColorStop(0.75, '#E8497A');
  grad.addColorStop(1, '#FF9E4F');
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, bw, bh);
  drawRetroSun(ctx, bx + bw * 0.72, by + bh * 0.30, bw * 0.21, 'sunset', u);
  ctx.globalAlpha = 0.55;
  drawSkylineStrip(ctx, bx, by + bh * 0.90, bw, bh * 0.10);
  ctx.globalAlpha = 1;
  drawPalmSilhouette(ctx, bx + bw * 0.04, by + bh * 0.97, bw * 0.30, 1, true);
  drawPalmSilhouette(ctx, bx + bw * 0.99, by + bh * 0.99, bw * 0.22, -1, true);
  ctx.restore();
  drawTitleLettering(ctx, state, {
    cx: bx + bw / 2, cy: by + bh / 2, maxWidth: bw * 0.88, maxSize: bh * 0.30, onPanel: true, u,
  });
}

/**
 * The stacked caption lettering: the user's title in Archivo Black, layered the comic-cover
 * way — a hard solid shadow knocked right-down, a black stroke a tenth of the letter height
 * around it, and the gradient face on top — with the script accent in Yellowtail burning
 * over its last line on a real neon glow. Drawn either centred in the title panel or
 * anchored lower-left over a hero panel; it is painted after the panels, so the block can
 * overlap the panel borders it crosses.
 */
export function drawTitleLettering(ctx, state, anchor) {
  const { u } = anchor;
  const lines = state.caption.title.split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!lines.length) return;
  let size = anchor.maxSize;
  const setFont = () => { ctx.font = `${size}px "Archivo Black", Anton, sans-serif`; };
  setFont();
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (widest() > anchor.maxWidth && size > 20 * u) { size *= 0.94; setFont(); }
  const lineH = size * 0.92;
  const blockH = lineH * lines.length;
  ctx.save();
  ctx.textAlign = anchor.onPanel ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  const baseX = anchor.onPanel ? anchor.cx : anchor.x;
  const baseY = anchor.onPanel ? anchor.cy + blockH / 2 : anchor.y;
  ctx.translate(baseX, baseY);
  ctx.rotate(-0.035);
  ctx.translate(-baseX, -baseY);
  try { ctx.letterSpacing = `${-0.01 * size}px`; } catch { /* older canvas: no tracking */ }
  lines.forEach((line, i) => {
    const y = baseY - (lines.length - 1 - i) * lineH;
    const fill = ctx.createLinearGradient(0, y - size, 0, y);
    if (anchor.onPanel) {
      fill.addColorStop(0, '#FFD319');
      fill.addColorStop(1, '#FF2975');
    } else {
      fill.addColorStop(0, '#FFFFFF');
      fill.addColorStop(1, '#FFE9A8');
    }
    ctx.lineJoin = 'round';
    // 1. The hard comic shadow: solid black, offset right-down, no blur.
    ctx.fillStyle = '#0A0A0A';
    ctx.fillText(line, baseX + size * 0.055, y + size * 0.055);
    // 2. The stroke body, 13% of the letter height, so the block reads at thumbnail size.
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = size * 0.13;
    ctx.strokeText(line, baseX, y);
    // 3. The gradient face on top.
    ctx.fillStyle = fill;
    ctx.fillText(line, baseX, y);
  });
  ctx.restore();
  const script = state.caption.script.trim();
  if (script) {
    const sSize = size * (anchor.onPanel ? 0.46 : 0.40);
    ctx.save();
    // On a hero panel the script starts where the last line's final two letters start,
    // measured in the title font itself, so it sits below those letters ("sejajar di
    // bawah huruf AT") and clear of the descriptor box in the corner (user revision, v5).
    const lastLine = lines[lines.length - 1];
    ctx.font = `${size}px "Archivo Black", Anton, sans-serif`;
    const headW = ctx.measureText(lastLine).width - ctx.measureText(lastLine.slice(-2)).width;
    ctx.font = `${sSize}px Yellowtail, cursive`;
    const sw = ctx.measureText(script).width;
    const sx = anchor.onPanel ? anchor.cx + anchor.maxWidth / 2 - sw * 0.92 : anchor.x + headW + size * 0.05;
    const sy = anchor.onPanel ? baseY + sSize * 0.28 : baseY + sSize * 0.80;
    ctx.translate(sx + sw / 2, sy);
    ctx.rotate(anchor.onPanel ? -0.07 : -0.05);
    ctx.translate(-(sx + sw / 2), -sy);
    ctx.textAlign = 'left';
    // The dark drop shadow pass (v5, second pass): the script is stamped once in
    // near-black ink, knocked right-down beneath the neon tube, so the lettering
    // lifts off the painted art instead of fighting it. Shadow first, glow second,
    // bright core last — that order is what keeps the pink readable over the hero.
    ctx.shadowColor = 'rgba(8,2,10,0.85)';
    ctx.shadowBlur = 6 * u;
    ctx.shadowOffsetX = 4 * u;
    ctx.shadowOffsetY = 5 * u;
    ctx.fillStyle = '#1A0512';
    ctx.fillText(script, sx, sy);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Neon tube: a wide pink halo, a tighter burn, then the bright core.
    ctx.shadowColor = PINK;
    ctx.shadowBlur = 30 * u;
    ctx.fillStyle = '#FF2E88';
    ctx.fillText(script, sx, sy);
    ctx.shadowBlur = 14 * u;
    ctx.fillStyle = '#FF5DA2';
    ctx.fillText(script, sx, sy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FF9CC4';
    ctx.fillText(script, sx, sy);
    ctx.restore();
  }
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
}

/** The credits microtext, top-right (below the platform bar when there is one). */
export function drawCreditsMicrotext(ctx, state, W, H) {
  const credits = state.caption.credits.trim();
  if (!credits) return;
  const u = Math.min(W, H) / 1080;
  ctx.save();
  ctx.font = `500 ${20 * u}px Oswald, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,246,233,0.85)';
  const top = state.platformBar ? H * PLATFORM_BAR_RATIO : 0;
  ctx.fillText(credits, W - 26 * u, top + 44 * u);
  ctx.restore();
}

/**
 * The platform header: a console-blue bar across the very top of the box, the platform mark
 * in white at the left and the edition line at the right. Drawn in code like everything
 * else on the cover; the panels are inset below it (see renderPoster).
 */
export function drawPlatformBar(ctx, state, W, H) {
  const u = Math.min(W, H) / 1080;
  const barH = H * PLATFORM_BAR_RATIO;
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, barH);
  grad.addColorStop(0, '#0072CE');
  grad.addColorStop(1, '#0057B8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, barH);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, barH - 2 * u, W, 2 * u);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${barH * 0.44}px "Archivo Black", sans-serif`;
  ctx.fillText('NEXT-GEN CONSOLE', 30 * u, barH * 0.54);
  ctx.font = `600 ${barH * 0.30}px Archivo, sans-serif`;
  try { ctx.letterSpacing = `${barH * 0.10}px`; } catch { /* noop */ }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('VICEFRAME EDITION', W - 30 * u, barH * 0.54);
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
  ctx.restore();
}

/**
 * The box furniture at the poster's foot: our own age-rating box bottom-left (a vertical
 * white card — maturity line on top, the great M in the middle, the rating band at the
 * foot), a thin content-descriptor strip beside it, and the studio badge bottom-right, a
 * yellow-orange rounded square carrying our own name and a four-point sparkle. All drawn,
 * none of it anyone's trademark.
 */
export function drawCoverBadges(ctx, state, W, H) {
  const u = Math.min(W, H) / 1080;
  const m = 30 * u;
  // --- rating box ---
  const bw = 118 * u;
  const bh = 170 * u;
  const bx = m;
  const by = H - m - bh;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 5 * u;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#0A0A0A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${16.5 * u}px Oswald, sans-serif`;
  try { ctx.letterSpacing = `${1.2 * u}px`; } catch { /* noop */ }
  ctx.fillText('MATURE 17+', bx + bw / 2, by + 30 * u);
  ctx.font = `${98 * u}px "Bebas Neue", sans-serif`;
  ctx.fillText('M', bx + bw / 2, by + 128 * u);
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(bx, by + bh - 30 * u, bw, 30 * u);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${11 * u}px Oswald, sans-serif`;
  ctx.fillText('CONTENT RATED BY', bx + bw / 2, by + bh - 10.5 * u);
  ctx.restore();
  // --- descriptor strip beside it: a thin light-bordered box as tall as the rating card,
  // its two lines centred in the full height so they read crisp instead of cramped. ---
  const lines = ['Intense Violence · Blood and Gore', 'Strong Language · Drug Reference'];
  ctx.save();
  ctx.font = `500 ${17 * u}px Oswald, sans-serif`;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const sw = tw + 28 * u;
  const sh = bh;
  const sx = bx + bw + 12 * u;
  const sy = by;
  ctx.fillStyle = 'rgba(5,5,10,0.66)';
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, 6 * u);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,246,233,0.38)';
  ctx.lineWidth = 1.5 * u;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,246,233,0.95)';
  ctx.textAlign = 'left';
  ctx.fillText(lines[0], sx + 14 * u, sy + sh / 2 - 10 * u);
  ctx.fillText(lines[1], sx + 14 * u, sy + sh / 2 + 18 * u);
  ctx.restore();
  // --- studio badge ---
  const swd = 148 * u;
  const sht = 124 * u;
  const sx2 = W - m - swd;
  const sy2 = H - m - sht;
  ctx.save();
  const grad = ctx.createLinearGradient(sx2, sy2, sx2, sy2 + sht);
  grad.addColorStop(0, '#FFC400');
  grad.addColorStop(1, '#FF7A00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(sx2, sy2, swd, sht, 16 * u);
  ctx.fill();
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 5 * u;
  ctx.stroke();
  drawSparkle(ctx, sx2 + swd / 2, sy2 + 30 * u, 14 * u, '#0A0A0A');
  ctx.fillStyle = '#0A0A0A';
  ctx.textAlign = 'center';
  // The studio name, slanted with a skew around the badge's own centre so it leans like a
  // badge wordmark (skewing around the poster origin would throw the text off the badge).
  ctx.translate(sx2 + swd / 2, sy2);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.font = `${15 * u}px "Archivo Black", sans-serif`;
  ctx.fillText('VICEFRAME', 0, 74 * u);
  ctx.font = `700 ${12 * u}px Archivo, sans-serif`;
  try { ctx.letterSpacing = `${3 * u}px`; } catch { /* noop */ }
  ctx.fillText('STUDIOS', 0, 96 * u);
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
  ctx.restore();
}

/**
 * The box finish: a thin diagonal plastic sheen swept over the whole export, the way light
 * runs across a shrink-wrapped game box. Very quiet — it should be felt, not seen.
 */
export function drawBoxSheen(ctx, W, H) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, W * 0.7, H);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.40, 'rgba(255,255,255,0.045)');
  grad.addColorStop(0.50, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.60, 'rgba(255,255,255,0.045)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Renders the whole poster for a state into a canvas. renderScale below 1 draws the same
 * poster smaller for the editor preview (the graded panel tiles cache per resolution);
 * exports call exportCoverPng, which always renders at full size.
 */
export function renderPoster(canvas, state, photos, renderScale = 1) {
  const W = state.size.w;
  const H = state.size.h;
  canvas.width = Math.round(W * renderScale);
  canvas.height = Math.round(H * renderScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(renderScale, renderScale);
  const u = Math.min(W, H) / 1080;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const layout = buildPanelLayout(state.aspect, state.layoutId, photos.length);
  // With the platform header on, the whole panel grid is inset below the bar.
  const inset = state.platformBar ? H * PLATFORM_BAR_RATIO : 0;
  ctx.save();
  if (inset) {
    ctx.translate(0, inset);
    ctx.scale(1, (H - inset) / H);
  }
  layout.forEach((p, i) => {
    if (p.kind === 'title') {
      drawTitlePanel(ctx, p, i, state, W, H);
      return;
    }
    const adjust = state.adjusts[`${state.layoutId}:${state.aspect}:${i}`];
    const sceneId = (adjust && adjust.scene !== undefined ? adjust.scene : p.scene);
    if (sceneId && SCENE_PANELS[sceneId]) {
      drawScenePanel(ctx, p, i, sceneId, state, W, H);
      return;
    }
    const photo = photos[(adjust && adjust.photo !== undefined ? adjust.photo : p.photo) % photos.length];
    if (photo) clipPanelPhoto(ctx, p, i, photo, state, W, H, renderScale);
  });
  drawSceneOverflow(ctx, layout, state, W, H);
  // In the HERO layout the helicopter lives in the hero photograph's own sky — unless the
  // user has stamped a scene over that panel, in which case the panel is theirs.
  if (state.layoutId === 'hero' && layout[0] && layout[0].kind !== 'title') {
    const heroAdjust = state.adjusts[`${state.layoutId}:${state.aspect}:0`];
    const heroScene = heroAdjust && heroAdjust.scene !== undefined ? heroAdjust.scene : layout[0].scene;
    // No code-drawn helicopter over the hero panel: the current hero sample paints its
    // own helicopter into the sky (user revision, preview v5), so drawHeroHeli is retired.
    void heroScene;
  }
  if (state.layoutId !== 'nine') {
    const hero = layout[0];
    drawTitleLettering(ctx, state, {
      // The rating box owns the bottom-left corner; the title block steps right of it.
      x: (hero.x + 0.035) * W + (state.ratingBadge ? 165 * u : 0),
      y: (hero.y + hero.h - 0.055) * H - (state.ratingBadge ? 20 * u : 0),
      maxWidth: hero.w * W * 0.94,
      maxSize: 210 * u,
      onPanel: false,
      u,
    });
  }
  drawSparkle(ctx, W * 0.90, H * 0.075, 13 * u, '#FFFFFF');
  drawSparkle(ctx, W * 0.065, H * 0.60, 9 * u, PINK);
  ctx.restore();
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(5,2,12,0)');
  vig.addColorStop(1, 'rgba(5,2,12,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  drawPrintFinish(ctx, W, H);
  if (state.ratingBadge) drawCoverBadges(ctx, state, W, H);
  if (state.platformBar) drawPlatformBar(ctx, state, W, H);
  drawBoxSheen(ctx, W, H);
  if (state.neonFrame) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, PINK);
    grad.addColorStop(1, TEAL);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(4 * u, 4 * u, W - 8 * u, H - 8 * u);
  }
  drawCreditsMicrotext(ctx, state, W, H);
  return canvas;
}

/** Renders the poster at an exact export size on a fresh canvas and returns it. */
export function exportCoverPng(state, photos, width, height) {
  const sized = { ...state, size: { w: width, h: height }, aspect: aspectOf(width, height), selected: -1 };
  const canvas = document.createElement('canvas');
  renderPoster(canvas, sized, photos);
  return canvas;
}

/** The aspect key for a pixel size. */
export function aspectOf(w, h) {
  if (w === h) return 'square';
  return w > h ? 'landscape' : 'portrait';
}

/** Resolves the layout a photo count gets in Auto mode. */
export function autoLayout(photoCount) {
  if (photoCount <= 1) return 'hero';
  if (photoCount === 2) return 'duo';
  return 'nine';
}
