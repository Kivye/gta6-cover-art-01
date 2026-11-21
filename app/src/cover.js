// VICEFRAME — cover rendering engine.
// One pure canvas pipeline: state -> panel quads -> clipped photos -> one
// shared grade -> halftone -> furniture -> lettering. No network, no random
// source in the render path: the same state always paints the same bytes.

export const SIZES = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1920, 1080],
};

export const SAMPLES = {
  'ai-hero2':   { src: 'samples/ai-hero2.webp',   callout: 'THE DRIVER' },
  'ai-moto':    { src: 'samples/ai-moto.webp',    callout: 'THE RIDER' },
  'ai-chase':   { src: 'samples/ai-chase.webp',   callout: 'THE GETAWAY' },
  'ai-partner': { src: 'samples/ai-partner.webp', callout: 'THE COURIER' },
  'ai-city2':   { src: 'samples/ai-city2.webp',   callout: 'THE CITY' },
  'ai-city':    { src: 'samples/ai-city.webp',    callout: 'THE CITY' },
  'ai-heroine': { src: 'samples/ai-heroine.webp', callout: 'THE DRIVER' },
  'boulevard': { src: 'samples/boulevard.jpg',   callout: 'THE STRIP' },
  'pier':       { src: 'samples/pier.jpg',        callout: 'THE PIER' },
};

export const GALLERY_POOL = ['ai-hero2', 'ai-moto', 'ai-chase', 'ai-partner', 'ai-city2'];

// A scene pins a photo cast, captions and a grade. Photo lists are written
// in panel order: landscape panels read hero/rider/getaway/city/courier,
// portrait and square panels read hero/getaway/rider/driver/courier.
export const SCENES = {
  viceheat: {
    label: 'Vice Heat',
    title: 'VICE\nHEAT',
    script: 'after dark',
    tagline: 'TWO HEARTS · ONE GETAWAY · NO WAY BACK',
    preset: 'illustrated',
    landscape: ['ai-hero2', 'ai-moto', 'ai-chase', 'ai-city2', 'ai-partner'],
    portrait: ['ai-hero2', 'ai-chase', 'ai-moto', 'ai-hero2', 'ai-partner'],
  },
  midnight: {
    label: 'Midnight Run',
    title: 'MIDNIGHT\nRUN',
    script: 'last ride out',
    tagline: 'TWO HEARTS · ONE GETAWAY · NO WAY BACK',
    preset: 'midnight',
    landscape: ['ai-city2', 'ai-moto', 'ai-chase', 'ai-city2', 'ai-partner'],
    portrait: ['ai-city2', 'ai-chase', 'ai-moto', 'ai-hero2', 'ai-partner'],
  },
};

export function defaultState() {
  return {
    photos: SCENES.viceheat.landscape.slice(),
    scene: 'viceheat',
    layout: 'hero',
    size: 'landscape',
    preset: 'illustrated',
    nightDeep: false,
    comic: false,
    finish: 'clean',
    title: SCENES.viceheat.title,
    script: SCENES.viceheat.script,
    tagline: SCENES.viceheat.tagline,
    quote: 'VICE NEVER LOOKED THIS GOOD',
    source: 'THE PALMS GAZETTE',
    credits: 'A VICEFRAME PICTURE · STARRING YOU · SHOT ON YOUR OWN CAMERA · CUT BY HAND',
    platform: 'NEXT-GEN CONSOLE',
    edition: 'VICEFRAME EDITION',
    descriptors: 'Intense Violence · Blood and Gore\nStrong Language · Drug Reference',
    assign: {},
    crops: { 4: { z: 1, dx: 0, dy: 0.62, flip: false } },
    selected: 0,
    furniture: { header: true, press: true, rating: true, seal: true, barcode: true, studio: true, keyline: true, callouts: true },
  };
}

export function applyScene(state, name) {
  const sc = SCENES[name];
  if (!sc) return state;
  state.scene = name;
  state.title = sc.title;
  state.script = sc.script;
  state.tagline = sc.tagline;
  state.preset = sc.preset;
  state.nightDeep = false;
  state.photos = scenePhotos(name, state.layout, state.size);
  state.assign = {};
  return state;
}

export function orientOf(W, H) {
  if (Math.abs(W - H) < 4) return 'square';
  return W > H ? 'landscape' : 'portrait';
}

export function scenePhotos(sceneName, layout, size) {
  const sc = SCENES[sceneName] || SCENES.viceheat;
  const orient = size === 'portrait' || size === 'square' ? 'portrait' : 'landscape';
  return (orient === 'portrait' ? sc.portrait : sc.landscape).slice();
}

// URL shot parameters -> state. Mirrors the locked shots.json manifest.
export function stateFromParams(q) {
  const st = defaultState();
  const scene = q.get('scene');
  if (scene && SCENES[scene]) applyScene(st, scene);
  const photos = q.get('photos');
  if (photos) st.photos = photos.split(',').filter(Boolean);
  if (q.get('layout')) st.layout = q.get('layout');
  if (q.get('size')) st.size = q.get('size');
  if (q.get('preset')) st.preset = q.get('preset');
  if (q.get('night') === 'deep') st.nightDeep = true;
  if (q.get('title')) st.title = q.get('title');
  if (q.get('script') !== null && q.get('script') !== undefined) st.script = q.get('script') || '';
  if (q.get('tagline')) st.tagline = q.get('tagline');
  const assign = q.get('assign');
  if (assign) {
    for (const pair of assign.split(',')) {
      const [p, f] = pair.split(':');
      st.assign[Number(p)] = Number(f);
    }
  }
  const crop = q.get('crop');
  if (crop) {
    const [p, z, dx, dy] = crop.split(':');
    st.crops[Number(p)] = { z: Number(z) || 1, dx: Number(dx) || 0, dy: Number(dy) || 0, flip: false };
  }
  return st;
}

export function loadImages(names) {
  const map = new Map();
  const jobs = [...new Set(names)].map((name) => new Promise((resolve) => {
    const info = SAMPLES[name];
    const img = new Image();
    img.onload = () => { map.set(name, img); resolve(); };
    img.onerror = () => resolve();
    img.src = info ? info.src : name;
    if (!info) map.set(name, img);
  }));
  return Promise.all(jobs).then(() => map);
}

// ------------------------------------------------------------- grading

const LUTS = {
  illustrated: [[0.0, '#1B1035'], [0.35, '#7A2E6B'], [0.6, '#E85D75'], [0.8, '#FF9E57'], [1.0, '#FFE9B0']],
  sunset: [[0.0, '#150829'], [0.30, '#4A1D6B'], [0.55, '#C13B78'], [0.75, '#FF7E47'], [1.0, '#FFD98A']],
  neon: [[0.0, '#02141F'], [0.5, '#0E7C86'], [0.8, '#FF5DA2'], [1.0, '#DFF9FF']],
  golden: [[0.0, '#1A0E14'], [0.5, '#7A3B2E'], [1.0, '#FFCE7A']],
  midnight: [[0.0, '#05070F'], [0.45, '#16264F'], [0.75, '#3D5A99'], [1.0, '#C7D5FF']],
  deep: [[0.0, '#1B1040'], [0.55, '#5B2A86'], [1.0, '#C9D6FF']],
};

function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function buildLUT(stops) {
  const pts = stops.map(([t, h]) => [t, hexRGB(h)]);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = pts[0], b = pts[pts.length - 1];
    for (let k = 0; k < pts.length - 1; k++) {
      if (t >= pts[k][0] && t <= pts[k + 1][0]) { a = pts[k]; b = pts[k + 1]; break; }
    }
    const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
  }
  return lut;
}

const lutCache = new Map();
function lutFor(name) {
  if (!lutCache.has(name)) lutCache.set(name, buildLUT(LUTS[name]));
  return lutCache.get(name);
}

function sCurve(x, amt) {
  const s = x * x * (3 - 2 * x);
  return x + (s - x) * amt * 2;
}

// One graded working copy per photo+grade, capped at 1600 px on the long
// side. The grade is shared by every panel: one light for the whole poster.
const gradeCache = new Map();
export function gradedPhoto(img, name, preset, nightDeep, comic) {
  const key = name + '|' + preset + '|' + (nightDeep ? 'deep' : '') + '|' + (comic ? 'ink' : '');
  if (gradeCache.has(key)) return gradeCache.get(key);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h);
  const d = id.data;
  const satMul = preset === 'golden' ? 1.10 : 1.25;
  const blend = preset === 'golden' ? 0.40 : preset === 'midnight' ? 0.42 : 0.58;
  const lut = lutFor(LUTS[preset] ? preset : 'illustrated');
  const levels = comic ? 6 : preset === 'illustrated' ? 9 : 0;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    r = sCurve(r, 0.18); g = sCurve(g, 0.18); b = sCurve(b, 0.18);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * satMul;
    g = luma + (g - luma) * satMul;
    b = luma + (b - luma) * satMul;
    r *= 1.02; g *= 1.02; b *= 1.02;
    if (levels) {
      const q = levels - 1;
      r = Math.round(Math.min(1, Math.max(0, r)) * q) / q;
      g = Math.round(Math.min(1, Math.max(0, g)) * q) / q;
      b = Math.round(Math.min(1, Math.max(0, b)) * q) / q;
    }
    const li = Math.max(0, Math.min(255, Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 255))) * 3;
    d[i]     = Math.max(0, Math.min(255, (r * 255) + (lut[li]     - r * 255) * blend));
    d[i + 1] = Math.max(0, Math.min(255, (g * 255) + (lut[li + 1] - g * 255) * blend));
    d[i + 2] = Math.max(0, Math.min(255, (b * 255) + (lut[li + 2] - b * 255) * blend));
  }
  if (nightDeep && preset === 'neon') {
    const deep = lutFor('deep');
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * (2 / 3);
      g = luma + (g - luma) * (2 / 3);
      b = luma + (b - luma) * (2 / 3);
      r *= 0.64; b *= 1.30;
      const li = Math.max(0, Math.min(255, Math.round(luma))) * 3;
      d[i]     = Math.max(0, Math.min(255, r + (deep[li]     - r) * 0.30));
      d[i + 1] = Math.max(0, Math.min(255, g + (deep[li + 1] - g) * 0.30));
      d[i + 2] = Math.max(0, Math.min(255, b + (deep[li + 2] - b) * 0.30));
    }
  }
  cx.putImageData(id, 0, 0);
  gradeCache.set(key, cv);
  return cv;
}

// ------------------------------------------------------------- geometry

// Panel rectangles in fractions of the panel area, per layout + orientation.
const RECTS = {
  hero: {
    landscape: [
      [0.000, 0.000, 0.577, 1.000],
      [0.584, 0.000, 0.416, 0.436],
      [0.584, 0.448, 0.416, 0.302],
      [0.584, 0.762, 0.225, 0.238],
      [0.815, 0.762, 0.185, 0.238],
    ],
    portrait: [
      [0.000, 0.000, 1.000, 0.395],
      [0.000, 0.405, 0.492, 0.208],
      [0.508, 0.405, 0.492, 0.208],
      [0.000, 0.621, 0.492, 0.379],
      [0.508, 0.621, 0.492, 0.379],
    ],
    square: [
      [0.000, 0.000, 0.562, 1.000],
      [0.572, 0.000, 0.428, 0.295],
      [0.572, 0.305, 0.428, 0.270],
      [0.572, 0.772, 0.208, 0.228],
      [0.788, 0.772, 0.212, 0.228],
    ],
  },
  split: {
    landscape: [
      [0.000, 0.000, 0.352, 0.640],
      [0.360, 0.000, 0.312, 0.640],
      [0.680, 0.000, 0.320, 0.640],
      [0.000, 0.652, 0.492, 0.348],
      [0.508, 0.652, 0.492, 0.348],
    ],
  },
  slashed: {
    landscape: [
      [0.000, 0.000, 0.577, 1.000],
      [0.584, 0.000, 0.416, 0.436],
      [0.584, 0.448, 0.416, 0.302],
      [0.584, 0.762, 0.225, 0.238],
      [0.815, 0.762, 0.185, 0.238],
    ],
  },
};

// Fixed corner offsets (TL, TR, BR, BL) in px at 1280-wide reference.
// Never random: the same state must always paint the same poster.
const TILTS = {
  hero: [
    [[3, 1], [-5, 3], [-2, -2], [1, -4]],
    [[-2, 2], [2, 0], [3, -3], [-4, -1]],
    [[2, -1], [-3, 2], [2, 3], [-2, -2]],
    [[-3, 0], [2, 2], [-1, 3], [3, -2]],
    [[2, 2], [-2, -1], [1, -3], [-3, 2]],
  ],
  split: [
    [[2, 1], [-4, 2], [-2, -2], [1, -3]],
    [[-2, 2], [3, 0], [2, -3], [-3, -1]],
    [[2, -1], [-3, 2], [3, 3], [-2, -2]],
    [[-3, 0], [2, 2], [-1, 3], [3, -2]],
    [[2, 2], [-2, -1], [1, -3], [-3, 2]],
  ],
  slashed: [
    [[10, 0], [-72, 34], [-30, -6], [2, -8]],
    [[-40, 16], [-6, 2], [14, -10], [46, 22]],
    [[-24, 8], [8, 0], [-6, -8], [30, 12]],
    [[-16, 4], [10, 0], [-4, -4], [18, 6]],
    [[-12, 6], [4, 0], [-2, -4], [14, 4]],
  ],
};

export function frameMetrics(W, H, st) {
  const vs = H / 720;
  const headerH = st.furniture.header ? 30 * vs : 0;
  const pressH = st.furniture.press ? 22 * vs : 0;
  const m = Math.max(5, W * 0.006);
  const top = headerH + pressH + 6 * vs;
  return { vs, headerH, pressH, m, area: { x: m, y: top, w: W - 2 * m, h: H - top - 8 * vs } };
}

export function panelQuads(W, H, st) {
  const { area } = frameMetrics(W, H, st);
  const orient = orientOf(W, H);
  const table = (RECTS[st.layout] && (RECTS[st.layout][orient] || RECTS[st.layout].landscape)) || RECTS.hero.landscape;
  const tilts = TILTS[st.layout] || TILTS.hero;
  const s = W / 1280;
  return table.map((r, i) => {
    const x = area.x + r[0] * area.w, y = area.y + r[1] * area.h;
    const w = r[2] * area.w, h = r[3] * area.h;
    const t = tilts[i % tilts.length];
    const pts = [
      [x + t[0][0] * s, y + t[0][1] * s],
      [x + w + t[1][0] * s, y + t[1][1] * s],
      [x + w + t[2][0] * s, y + h + t[2][1] * s],
      [x + t[3][0] * s, y + h + t[3][1] * s],
    ];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bbox = {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
    };
    return { pts, bbox, index: i };
  });
}

function pathQuad(cx, pts) {
  cx.beginPath();
  cx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 4; i++) cx.lineTo(pts[i][0], pts[i][1]);
  cx.closePath();
}

function defaultCrop(st, i) {
  if (st.layout === 'split' && i === 4) return { z: 1, dx: 0, dy: 1.0, flip: false };
  return { z: 1, dx: 0, dy: 0, flip: false };
}

export function cropOf(st, i) {
  return st.crops[i] || defaultCrop(st, i);
}

// Paint one graded photo into a panel quad: clip, cover-fit, pan/zoom/flip.
function paintPhoto(cx, quad, img, crop) {
  const b = quad.bbox;
  const iw = img.width, ih = img.height;
  const z = crop.z || 1;
  const sc = Math.max(b.w / iw, b.h / ih) * z;
  const dw = iw * sc, dh = ih * sc;
  const fx = Math.max(0, Math.min(1, 0.5 - (crop.dx || 0) * 0.5));
  const fy = Math.max(0, Math.min(1, 0.5 - (crop.dy || 0) * 0.5));
  let ox = b.x - (dw - b.w) * fx;
  let oy = b.y - (dh - b.h) * fy;
  cx.save();
  pathQuad(cx, quad.pts);
  cx.clip();
  if (crop.flip) {
    cx.translate(b.x + b.w / 2, 0);
    cx.scale(-1, 1);
    cx.translate(-(b.x + b.w / 2), 0);
    ox = 2 * (b.x + b.w / 2) - ox - dw;
  }
  cx.drawImage(img, ox, oy, dw, dh);
  // print sheen: a 2 px light line just inside the panel's top edge
  cx.strokeStyle = 'rgba(255,255,255,0.10)';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(quad.pts[0][0] + 1, quad.pts[0][1] + 2);
  cx.lineTo(quad.pts[1][0] - 1, quad.pts[1][1] + 2);
  cx.stroke();
  cx.restore();
}

// ------------------------------------------------------------- furniture

function star(cx, x, y, r, fill) {
  cx.save();
  cx.fillStyle = fill;
  cx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
    if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
  }
  cx.closePath();
  cx.fill();
  cx.restore();
}

function sparkle(cx, x, y, r, fill) {
  cx.save();
  cx.fillStyle = fill;
  cx.beginPath();
  cx.moveTo(x, y - r);
  cx.quadraticCurveTo(x, y, x + r, y);
  cx.quadraticCurveTo(x, y, x, y + r);
  cx.quadraticCurveTo(x, y, x - r, y);
  cx.quadraticCurveTo(x, y, x, y - r);
  cx.fill();
  cx.restore();
}

function drawCallout(cx, quad, text, place, s) {
  const b = quad.bbox;
  cx.save();
  cx.font = `italic 800 ${Math.round(17 * s)}px Archivo, sans-serif`;
  const tw = cx.measureText(text).width;
  const w = tw + 22 * s, h = 27 * s;
  const x = b.x + 14 * s;
  const y = place === 'bottom' ? b.y + b.h - h - 12 * s : b.y + 40 * s;
  cx.transform(1, 0, -0.14, 1, 0, 0);
  const sx = x + 0.14 * y;
  cx.fillStyle = 'rgba(0,0,0,0.35)';
  cx.fillRect(sx + 3 * s, y + 3 * s, w, h);
  cx.fillStyle = '#0A0A0F';
  cx.fillRect(sx, y, w, h);
  cx.fillStyle = '#FFC61A';
  cx.fillRect(sx, y + h - 3 * s, w, 3 * s);
  cx.fillStyle = '#FFFFFF';
  cx.textBaseline = 'middle';
  cx.fillText(text, sx + 11 * s, y + h / 2 + 1);
  cx.restore();
}

function drawSeal(cx, x, y, r, s) {
  cx.save();
  cx.translate(x, y);
  cx.rotate(-0.14);
  const grad = cx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  grad.addColorStop(0, '#FFE066');
  grad.addColorStop(1, '#FF9E2E');
  cx.fillStyle = grad;
  cx.beginPath();
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i * Math.PI) / spikes;
    const rad = i % 2 === 0 ? r : r * 0.84;
    const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
    if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
  }
  cx.closePath();
  cx.fill();
  cx.strokeStyle = '#B97A0E';
  cx.lineWidth = 1.2 * s;
  cx.stroke();
  cx.fillStyle = '#3A2403';
  cx.textAlign = 'center';
  cx.font = `900 ${Math.round(10.5 * s)}px "Archivo Black", Archivo, sans-serif`;
  cx.fillText('VICEFRAME', 0, -2 * s);
  cx.font = `900 ${Math.round(12.5 * s)}px "Archivo Black", Archivo, sans-serif`;
  cx.fillText('ORIGINAL', 0, 12 * s);
  cx.restore();
}

const BAR_PATTERN = [2, 1, 3, 1, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 1, 4, 1, 2, 1, 1, 3, 1, 2];

function drawBarcode(cx, quad, s) {
  const b = quad.bbox;
  const w = Math.min(66 * s, b.w * 0.44), h = w * 0.82;
  const x = b.x + b.w - w - 6 * s, y = b.y + 6 * s;
  cx.save();
  cx.fillStyle = '#FFFFFF';
  cx.fillRect(x, y, w, h);
  cx.fillStyle = '#111111';
  cx.textAlign = 'center';
  cx.font = `800 ${Math.max(4, 5.5 * s)}px Archivo, sans-serif`;
  cx.fillText('COLLECTOR EDITION', x + w / 2, y + 8 * s);
  let bx = x + 5 * s;
  const unit = (w - 10 * s) / BAR_PATTERN.reduce((a, n) => a + n, 0);
  cx.fillStyle = '#111111';
  for (let i = 0; i < BAR_PATTERN.length; i++) {
    if (i % 2 === 0) cx.fillRect(bx, y + 12 * s, BAR_PATTERN[i] * unit * 0.8, h * 0.52);
    bx += BAR_PATTERN[i] * unit;
  }
  cx.font = `700 ${Math.max(4, 7 * s)}px Archivo, sans-serif`;
  cx.fillText('VF-2026-0891', x + w / 2, y + h - 4 * s);
  cx.restore();
}

function drawStudioBox(cx, quad, s) {
  const b = quad.bbox;
  const w = Math.min(64 * s, b.w * 0.44), h = w * 0.78;
  const x = b.x + b.w - w - 6 * s, y = b.y + b.h - h - 6 * s;
  cx.save();
  cx.fillStyle = '#FFC61A';
  cx.fillRect(x, y, w, h);
  cx.fillStyle = '#14100A';
  sparkle(cx, x + w / 2, y + h * 0.26, 6 * s, '#14100A');
  cx.textAlign = 'center';
  cx.font = `900 ${Math.max(4, 8.5 * s)}px "Archivo Black", Archivo, sans-serif`;
  cx.fillText('VICEFRAME', x + w / 2, y + h * 0.58);
  cx.font = `700 ${Math.max(4, 7 * s)}px Archivo, sans-serif`;
  cx.fillText('S T U D I O S', x + w / 2, y + h * 0.78);
  cx.restore();
}

function drawRating(cx, W, H, st, fm) {
  const s = W / 1280;
  const orient = orientOf(W, H);
  const w = 54 * s, h = w * 1.37;
  const x = orient === 'portrait' ? W * 0.035 : fm.m + 2;
  const y = H - 8 * fm.vs - h;
  cx.save();
  cx.fillStyle = '#F7F4EC';
  cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#0A0A0A';
  cx.lineWidth = 2 * s;
  cx.strokeRect(x, y, w, h);
  cx.fillStyle = '#0A0A0A';
  cx.textAlign = 'center';
  cx.font = `800 ${Math.max(4, 7 * s)}px Archivo, sans-serif`;
  cx.fillText('MATURE 17+', x + w / 2, y + 10 * s);
  cx.font = `900 ${Math.max(8, 32 * s)}px "Archivo Black", Archivo, sans-serif`;
  cx.fillText('M', x + w / 2, y + 10 * s + 33 * s);
  cx.font = `600 ${Math.max(3, 5 * s)}px Archivo, sans-serif`;
  cx.fillText('CONTENT RATED BY', x + w / 2, y + h - 10 * s);
  cx.font = `800 ${Math.max(3, 6.5 * s)}px Archivo, sans-serif`;
  cx.fillText('VF', x + w / 2, y + h - 3 * s);
  // descriptor card: two small lines on a slim strip right of the box
  const dh = H * 0.042;
  const dw = W * 0.14;
  const dx = x + w + W * 0.004;
  const dy = H - 46 * fm.vs;
  cx.fillStyle = 'rgba(5,5,10,0.72)';
  cx.fillRect(dx, dy, dw, dh);
  cx.fillStyle = '#F5EFE2';
  cx.textAlign = 'left';
  cx.font = `600 ${Math.max(4, dh * 0.34)}px Archivo, sans-serif`;
  const lines = st.descriptors.split('\n');
  cx.fillText(lines[0] || '', dx + dw * 0.045, dy + dh * 0.40);
  cx.fillText(lines[1] || '', dx + dw * 0.045, dy + dh * 0.79);
  cx.restore();
  return { x, y, w, h };
}

function drawTagline(cx, W, H, st, fm) {
  const s = W / 1280;
  const stripH = 24 * fm.vs;
  const y = H - stripH - 2;
  cx.save();
  cx.font = `400 ${Math.round(21 * s)}px "Bebas Neue", sans-serif`;
  try { cx.letterSpacing = `${Math.round(2 * s)}px`; } catch (e) { /* older canvas */ }
  const tw = cx.measureText(st.tagline).width;
  const w = tw + 40 * s;
  const x = W / 2 - w / 2;
  cx.fillStyle = '#07070C';
  cx.fillRect(x, y, w, stripH);
  const grad = cx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#FF2E88');
  grad.addColorStop(1, '#00E5FF');
  cx.fillStyle = grad;
  cx.fillRect(x, y + stripH - 3 * fm.vs, w, 3 * fm.vs);
  cx.fillStyle = '#FFFFFF';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(st.tagline, W / 2, y + stripH / 2 - 1);
  cx.restore();
}

// ------------------------------------------------------------- lettering

function drawLettering(cx, W, H, st, quads) {
  const s = W / 1280;
  const orient = orientOf(W, H);
  const lines = st.title.split('\n').map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 3);
  if (!lines.length) return;
  let fs = 178 * s;
  cx.save();
  const setFont = () => { cx.font = `900 ${fs}px "Archivo Black", Archivo, sans-serif`; };
  setFont();
  const heroW = quads[0].bbox.w;
  // Each line is set at full point size, then squeezed horizontally to a
  // shared target width: long words condense instead of shrinking away.
  const targetW = orient === 'portrait' ? W * 0.88 : heroW * 0.615;
  const lineW = lines.map((l) => cx.measureText(l).width);
  const squeeze = lineW.map((w) => Math.min(1, targetW / Math.max(1, w)));
  const lh = fs * 0.92;
  let baseX, lastBase;
  if (orient === 'portrait') {
    baseX = W / 2;
    lastBase = H * 0.585 + fs * 0.8 + (lines.length - 1) * lh;
  } else {
    baseX = quads[0].bbox.x + W * 0.0775 + 18 * s;
    lastBase = H - 46 * (H / 720);
  }
  cx.translate(baseX, lastBase);
  cx.rotate(-2 * Math.PI / 180);
  cx.textAlign = orient === 'portrait' ? 'center' : 'left';
  cx.textBaseline = 'alphabetic';
  const grad = cx.createLinearGradient(0, -lines.length * lh, 0, 0);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#FFE9A8');
  lines.forEach((line, i) => {
    const y = -(lines.length - 1 - i) * lh;
    cx.save();
    if (orient === 'portrait') cx.translate(-(lineW[i] * squeeze[i]) / 2, 0);
    cx.scale(squeeze[i], 1);
    cx.fillStyle = '#0A0A0A';
    cx.fillText(line, 0.045 * fs, y + 0.045 * fs);
    cx.shadowColor = 'rgba(255,46,136,0.6)';
    cx.shadowBlur = 24 * s;
    cx.fillStyle = grad;
    cx.fillText(line, 0, y);
    cx.shadowBlur = 0;
    cx.lineWidth = 0.055 * fs;
    cx.lineJoin = 'round';
    cx.strokeStyle = '#141428';
    cx.strokeText(line, 0, y);
    cx.restore();
  });
  cx.restore();
  const lastLineW = lineW[lines.length - 1] * squeeze[lines.length - 1];
  // script accent: dark pass first, then the neon glow pass
  if (st.script) {
    cx.save();
    const lastW = lastLineW;
    let sx, sy;
    if (orient === 'portrait') { sx = W / 2 + lastW * 0.16; sy = lastBase + 40 * s; }
    else { sx = baseX + lastW * 0.86; sy = lastBase + 6 * s; }
    cx.translate(sx, sy);
    cx.rotate(-4 * Math.PI / 180);
    cx.font = `${Math.round(56 * s)}px Yellowtail, cursive`;
    cx.textAlign = 'left';
    cx.fillStyle = 'rgba(10,4,16,0.85)';
    cx.fillText(st.script, 2 * s, 2 * s);
    cx.shadowColor = '#FF2E88';
    cx.shadowBlur = 18 * s;
    cx.fillStyle = '#FF4D9D';
    cx.fillText(st.script, 0, 0);
    cx.shadowBlur = 36 * s;
    cx.fillText(st.script, 0, 0);
    cx.restore();
  }
}

// ------------------------------------------------------------- the cover

export function renderCover(canvas, st, images) {
  const W = canvas.width, H = canvas.height;
  const cx = canvas.getContext('2d');
  const s = W / 1280;
  const fm = frameMetrics(W, H, st);
  const orient = orientOf(W, H);
  cx.fillStyle = '#050508';
  cx.fillRect(0, 0, W, H);

  // platform header bar
  if (st.furniture.header) {
    const grad = cx.createLinearGradient(0, 0, 0, fm.headerH);
    grad.addColorStop(0, '#1E6FD9');
    grad.addColorStop(1, '#0A4BB0');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, W, fm.headerH);
    cx.fillStyle = '#FFFFFF';
    cx.font = `800 ${Math.round(15 * s)}px Archivo, sans-serif`;
    try { cx.letterSpacing = `${Math.round(3 * s)}px`; } catch (e) { /* noop */ }
    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    cx.fillText(st.platform, 14 * s, fm.headerH / 2 + 1);
    cx.textAlign = 'right';
    cx.fillText(st.edition, W - 14 * s, fm.headerH / 2 + 1);
    try { cx.letterSpacing = '0px'; } catch (e) { /* noop */ }
  }
  // press strip: five stars, the quote, the source
  if (st.furniture.press) {
    const y0 = fm.headerH;
    cx.fillStyle = '#0A0A10';
    cx.fillRect(0, y0, W, fm.pressH);
    for (let i = 0; i < 5; i++) star(cx, 16 * s + i * 15 * s, y0 + fm.pressH / 2, 5.5 * s, '#FFC61A');
    cx.fillStyle = '#FFFFFF';
    cx.font = `400 ${Math.round(13.5 * s)}px "Bebas Neue", sans-serif`;
    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    const qx = 96 * s;
    cx.fillText('“' + st.quote + '”', qx, y0 + fm.pressH / 2 + 1);
    const qw = cx.measureText('“' + st.quote + '”').width;
    cx.fillStyle = '#9A97A8';
    cx.font = `500 ${Math.round(10 * s)}px Oswald, sans-serif`;
    cx.fillText('— ' + st.source, qx + qw + 10 * s, y0 + fm.pressH / 2 + 1);
  }

  // panels
  const quads = panelQuads(W, H, st);
  const calloutAt = orient === 'landscape'
    ? ['top', 'bottom', 'top', 'top', 'bottom']
    : ['top', 'top', 'top', 'top', 'bottom'];
  quads.forEach((quad, i) => {
    const photoIdx = st.assign[i] !== undefined ? st.assign[i] : i;
    const name = st.photos[photoIdx % st.photos.length];
    const img = images.get(name);
    if (img) {
      const graded = gradedPhoto(img, name, st.preset, st.nightDeep, st.comic);
      paintPhoto(cx, quad, graded, cropOf(st, i));
    } else {
      cx.save(); pathQuad(cx, quad.pts); cx.clip();
      cx.fillStyle = '#1A1A26'; cx.fillRect(quad.bbox.x, quad.bbox.y, quad.bbox.w, quad.bbox.h);
      cx.restore();
    }
    if (i === quads.length - 1) {
      if (st.furniture.barcode) drawBarcode(cx, quad, s);
      if (st.furniture.studio) drawStudioBox(cx, quad, s);
    }
  });
  // second pass: corner ticks and callout chips always sit on top of the art
  quads.forEach((quad, i) => {
    cx.save();
    cx.strokeStyle = i % 2 === 0 ? '#FF2E88' : '#00E5FF';
    cx.lineWidth = 2.5 * s;
    const [tx, ty] = quad.pts[0];
    cx.beginPath();
    cx.moveTo(tx + 2, ty + 12 * s);
    cx.lineTo(tx + 2, ty + 2);
    cx.lineTo(tx + 12 * s, ty + 2);
    cx.stroke();
    cx.restore();
    const photoIdx = st.assign[i] !== undefined ? st.assign[i] : i;
    const name = st.photos[photoIdx % st.photos.length];
    if (st.furniture.callouts && name && SAMPLES[name] && SAMPLES[name].callout) {
      drawCallout(cx, quad, SAMPLES[name].callout, calloutAt[i] || 'top', s);
    }
  });

  // retro sun for the Sunset grade, screened over the hero panel
  if (st.preset === 'sunset') {
    const hb = quads[0].bbox;
    const r = hb.w * 0.17;
    const x = hb.x + hb.w * 0.80, y = hb.y + hb.h * 0.20;
    cx.save();
    pathQuad(cx, quads[0].pts);
    cx.clip();
    cx.globalCompositeOperation = 'screen';
    cx.globalAlpha = 0.55;
    const grad = cx.createLinearGradient(0, y - r, 0, y + r);
    grad.addColorStop(0, '#FFD319');
    grad.addColorStop(1, '#FF2975');
    cx.fillStyle = grad;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    cx.globalCompositeOperation = 'destination-out';
    let gy = y + r * 0.08, gh = 2 * s;
    while (gy < y + r) { cx.fillRect(x - r, gy, r * 2, gh); gy += gh + r * 0.16; gh += 2 * s; }
    cx.restore();
  }

  // comic halftone: dots in the darks only
  if (st.comic) {
    const step = 9 * s, r = 2.6 * s;
    const id = cx.getImageData(0, 0, W, H).data;
    cx.save();
    cx.fillStyle = 'rgba(8,6,10,0.10)';
    const cos = Math.cos(15 * Math.PI / 180), sin = Math.sin(15 * Math.PI / 180);
    for (let gy = 0; gy < H + step; gy += step) {
      for (let gx = 0; gx < W + step; gx += step) {
        const px = Math.round(gx * cos - gy * sin), py = Math.round(gx * sin + gy * cos);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const o = (py * W + px) * 4;
        const luma = (0.2126 * id[o] + 0.7152 * id[o + 1] + 0.0722 * id[o + 2]) / 255;
        if (luma < 0.45) { cx.beginPath(); cx.arc(px, py, r, 0, Math.PI * 2); cx.fill(); }
      }
    }
    cx.restore();
  }

  // palm silhouette: bezier fronds fanning from one hub, ink black, in the
  // hero panel's top-left sky — a drawn decoration, not an asset
  const hb = quads[0].bbox;
  cx.save();
  cx.strokeStyle = 'rgba(8,6,14,0.88)';
  cx.lineCap = 'round';
  const hubX = hb.x + hb.w * 0.055, hubY = hb.y + hb.h * 0.045;
  const fronds = [[-1.45, 1.05], [-1.10, 1.18], [-0.72, 1.24], [-0.34, 1.16], [0.02, 0.98], [0.36, 0.72]];
  for (const [ang, lf] of fronds) {
    const len = hb.w * 0.155 * lf;
    const ex = hubX + Math.sin(ang) * len, ey = hubY + (1 - Math.cos(ang)) * len * 0.4 - len * 0.34;
    const mx = hubX + Math.sin(ang) * len * 0.5, my = hubY - len * 0.30;
    cx.lineWidth = 3.2 * s;
    cx.beginPath();
    cx.moveTo(hubX, hubY);
    cx.quadraticCurveTo(mx, my, ex, ey + len * 0.16);
    cx.stroke();
  }
  cx.restore();

  // lettering + furniture
  drawLettering(cx, W, H, st, quads);
  if (st.furniture.seal) {
    const pos = orient === 'landscape' ? [0.762, 0.700] : orient === 'portrait' ? [0.865, 0.745] : [0.815, 0.700];
    drawSeal(cx, W * pos[0], H * pos[1], 46 * s, s);
  }
  if (st.furniture.rating) drawRating(cx, W, H, st, fm);
  drawTagline(cx, W, H, st, fm);
  // credits microtext along the foot of the city panel, over the strip's end
  cx.save();
  cx.shadowColor = 'rgba(0,0,0,0.8)';
  cx.shadowBlur = 2 * s;
  cx.fillStyle = 'rgba(255,246,233,0.85)';
  cx.font = `500 ${Math.max(4, 8 * s)}px Oswald, sans-serif`;
  if (orient === 'landscape' && st.layout !== 'split') {
    cx.textAlign = 'right';
    cx.fillText(st.credits, quads[3].bbox.x + quads[3].bbox.w - 6 * s, H - 8 * fm.vs - 5 * s);
  } else {
    cx.textAlign = 'center';
    cx.fillText(st.credits, W / 2, H - 8 * fm.vs - 5 * s);
  }
  cx.restore();

  // vignette, sheen, neon keyline
  const vg = cx.createRadialGradient(W / 2, H * 0.45, W * 0.42, W / 2, H * 0.45, W * 0.95);
  vg.addColorStop(0, 'rgba(5,2,12,0)');
  vg.addColorStop(1, 'rgba(5,2,12,0.35)');
  cx.fillStyle = vg;
  cx.fillRect(0, 0, W, H);
  const sheenAlpha = st.finish === 'glossy' ? 0.11 : st.finish === 'worn' ? 0.03 : 0.05;
  const sh = cx.createLinearGradient(0, 0, W, H);
  sh.addColorStop(0.30, 'rgba(255,255,255,0)');
  sh.addColorStop(0.48, `rgba(255,255,255,${sheenAlpha})`);
  sh.addColorStop(0.62, 'rgba(255,255,255,0)');
  cx.fillStyle = sh;
  cx.fillRect(0, 0, W, H);
  sparkle(cx, W * 0.30, H * 0.16, 9 * s, 'rgba(255,255,255,0.9)');
  sparkle(cx, W * 0.88, H * 0.30, 7 * s, 'rgba(255,77,157,0.9)');
  if (st.furniture.keyline) {
    const kg = cx.createLinearGradient(0, 0, W, H);
    kg.addColorStop(0, '#FF2E88');
    kg.addColorStop(1, '#00E5FF');
    cx.strokeStyle = kg;
    cx.lineWidth = 3 * s;
    cx.strokeRect(1.5 * s, 1.5 * s, W - 3 * s, H - 3 * s);
  }
  return canvas;
}

// ------------------------------------------------------------- export sheet

function coverCanvas(W, H, st, images) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  renderCover(cv, st, images);
  return cv;
}

function drawWarpedFront(cx, img, x, y, w, h) {
  // the collector case front: vertical strips eased onto a slight slant,
  // top edge rising to the right, like a box photographed at an angle
  const strips = 72;
  const rise = h * 0.035, drop = h * 0.012;
  cx.save();
  cx.beginPath();
  cx.moveTo(x, y + rise);
  cx.lineTo(x + w, y);
  cx.lineTo(x + w, y + h - drop);
  cx.lineTo(x, y + h);
  cx.closePath();
  cx.clip();
  for (let i = 0; i < strips; i++) {
    const f0 = i / strips, f1 = (i + 1) / strips;
    const dx = x + f0 * w, dw = w / strips + 1;
    const topY = y + rise * (1 - f0);
    const botY = y + h - drop * f0;
    cx.drawImage(img, f0 * img.width, 0, img.width / strips, img.height, dx, topY, dw, botY - topY);
  }
  cx.restore();
  cx.save();
  cx.strokeStyle = 'rgba(120,140,255,0.35)';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(x, y + rise);
  cx.lineTo(x + w, y);
  cx.lineTo(x + w, y + h - drop);
  cx.lineTo(x, y + h);
  cx.closePath();
  cx.stroke();
  cx.restore();
}

export function renderSheet(canvas, sceneName, images) {
  const W = canvas.width, H = canvas.height;
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#0C0A13';
  cx.fillRect(0, 0, W, H);
  cx.fillStyle = '#FFFFFF';
  cx.font = '900 29px "Archivo Black", Archivo, sans-serif';
  cx.textAlign = 'left';
  cx.fillText('VICEFRAME — EXPORT SHEET', 56, 64);
  cx.fillStyle = '#9A97A8';
  cx.font = '400 15px Archivo, sans-serif';
  cx.fillText('One scene, every post size — and the collector case it ships in.', 56, 94);

  const base = defaultState();
  applyScene(base, sceneName);

  // collector case: spine + top face + warped portrait front
  const caseX = 118, caseY = 148, caseW = 500, caseH = 544;
  cx.save();
  cx.fillStyle = 'rgba(0,0,0,0.5)';
  cx.beginPath();
  cx.ellipse(caseX + caseW / 2, caseY + caseH + 26, caseW * 0.62, 18, 0, 0, Math.PI * 2);
  cx.fill();
  // top face
  cx.fillStyle = '#1B2450';
  cx.beginPath();
  cx.moveTo(84, 168); cx.lineTo(caseX, caseY); cx.lineTo(caseX + caseW, caseY - 20); cx.lineTo(584, 148);
  cx.closePath(); cx.fill();
  // spine
  cx.fillStyle = '#101736';
  cx.beginPath();
  cx.moveTo(84, 168); cx.lineTo(caseX, caseY); cx.lineTo(caseX, caseY + caseH); cx.lineTo(84, 712 - 20);
  cx.closePath(); cx.fill();
  cx.fillStyle = '#FFC61A';
  cx.fillRect(88, 190, 26, 26);
  cx.fillStyle = '#14100A';
  cx.font = '900 13px "Archivo Black", Archivo, sans-serif';
  cx.textAlign = 'center';
  cx.fillText('VF', 101, 208);
  cx.save();
  cx.translate(101, 470);
  cx.rotate(-Math.PI / 2);
  cx.fillStyle = '#FFFFFF';
  cx.font = '900 25px "Archivo Black", Archivo, sans-serif';
  cx.fillText(SCENES[sceneName].title.replace('\n', ' '), 0, 8);
  cx.restore();
  cx.save();
  cx.translate(101, 690);
  cx.rotate(-Math.PI / 2);
  cx.fillStyle = '#8E97C9';
  cx.font = '700 10px Archivo, sans-serif';
  cx.fillText('V I C E F R A M E', 0, 3);
  cx.restore();
  const front = coverCanvas(540, 675, { ...base, size: 'portrait', photos: scenePhotos(sceneName, 'hero', 'portrait') }, images);
  drawWarpedFront(cx, front, caseX, caseY, caseW, caseH);
  cx.restore();
  cx.fillStyle = '#EDEDF2';
  cx.font = '700 15px Archivo, sans-serif';
  cx.textAlign = 'center';
  cx.fillText('C O L L E C T O R   C A S E  —  3 D   P R E V I E W', caseX + caseW / 2 - 17, 748);

  // the three post sizes
  const portrait = coverCanvas(540, 675, { ...base, size: 'portrait', photos: scenePhotos(sceneName, 'hero', 'portrait') }, images);
  cx.drawImage(portrait, 648, 108, 272, 340);
  const square = coverCanvas(540, 540, { ...base, size: 'square', photos: scenePhotos(sceneName, 'hero', 'square') }, images);
  cx.drawImage(square, 948, 108, 272, 272);
  const landscape = coverCanvas(960, 540, { ...base, size: 'landscape', photos: scenePhotos(sceneName, 'hero', 'landscape') }, images);
  cx.drawImage(landscape, 688, 492, 492, 277);
  cx.fillStyle = '#C9C9D4';
  cx.font = '600 14px Archivo, sans-serif';
  cx.fillText('PORTRAIT 1080 × 1350', 648 + 136, 478);
  cx.fillText('SQUARE 1080 × 1080', 948 + 136, 478);
  cx.fillText('LANDSCAPE 1920 × 1080', 688 + 246, 792);
  return canvas;
}
