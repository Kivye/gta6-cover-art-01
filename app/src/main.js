// VICEFRAME editor wiring: rail controls, panel framing gestures, caption
// fields, undo, randomize and PNG export — all around cover.js's renderer.

import {
  SIZES, SAMPLES, SCENES, GALLERY_POOL, defaultState, applyScene,
  scenePhotos, stateFromParams, loadImages, renderCover, renderSheet,
  panelQuads, cropOf,
} from './cover.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const shot = params.get('shot');

const images = new Map();
let state = defaultState();
let history = [];
let sceneLinked = true;

const PANEL_NAMES = {
  hero: { landscape: ['Hero', 'Rider', 'Getaway', 'City', 'Courier'], portrait: ['Hero', 'Getaway', 'Rider', 'Driver', 'Courier'], square: ['Hero', 'Getaway', 'Rider', 'Driver', 'Courier'] },
  split: { landscape: ['Hero', 'Left', 'Right', 'City', 'Courier'] },
  slashed: { landscape: ['Hero', 'Rider', 'Getaway', 'City', 'Courier'] },
};

function orientKey() {
  return state.size === 'landscape' ? 'landscape' : state.size;
}

function panelName(i) {
  const byLayout = PANEL_NAMES[state.layout] || PANEL_NAMES.hero;
  const list = byLayout[orientKey()] || byLayout.landscape;
  return list[i] || 'Panel ' + (i + 1);
}

function snapshot() {
  return JSON.stringify(state);
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 30) history.shift();
}

function restore(json) {
  state = JSON.parse(json);
  sceneLinked = false;
  syncUI();
  draw();
}

function undo() {
  if (!history.length) return;
  restore(history.pop());
}

// Canvas-only families (Bebas Neue, Oswald) are not laid out by the page,
// so fonts.ready alone would miss them: load every face the renderer uses.
async function loadCanvasFonts() {
  const wanted = [
    '900 100px "Archivo Black"', 'italic 800 40px Archivo', '800 40px Archivo',
    '600 30px Archivo', '40px "Bebas Neue"', '500 30px Oswald', '60px Yellowtail',
  ];
  await Promise.all(wanted.map((f) => document.fonts.load(f).catch(() => [])));
  await document.fonts.ready;
}

// ------------------------------------------------------------- drawing

const canvas = $('coverCanvas');

function draw() {
  if (!canvas) return;
  const [w, h] = SIZES[state.size];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  renderCover(canvas, state, images);
  const label = { square: 'SQUARE 1080 × 1080', portrait: 'PORTRAIT 1080 × 1350', landscape: 'LANDSCAPE 1920 × 1080' }[state.size];
  $('statusText').textContent = `CANVAS READY • 300 DPI PRINT-SAFE • 5 PANELS • ${label}`;
  syncFraming();
}

function syncFraming() {
  const crop = cropOf(state, state.selected);
  $('frameName').textContent = panelName(state.selected);
  $('panX').value = Math.round((crop.dx || 0) * 100);
  $('panY').value = Math.round((crop.dy || 0) * 100);
  $('zoom').value = Math.round((crop.z || 1) * 100);
  $('panXVal').textContent = $('panX').value + '%';
  $('panYVal').textContent = $('panY').value + '%';
  $('zoomVal').textContent = $('zoom').value + '%';
}

function setCrop(patch) {
  const cur = cropOf(state, state.selected);
  state.crops[state.selected] = { ...cur, ...patch };
}

// ------------------------------------------------------------- rail sync

function markChips(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach((el) => {
    el.classList.toggle('active', el.dataset[attr] === value);
  });
}

function syncUI() {
  markChips('scene', state.scene);
  markChips('layout', state.layout);
  markChips('preset', state.preset);
  markChips('finish', state.finish);
  markChips('size', state.size);
  $('comicChk').checked = !!state.comic;
  $('capTitle').value = state.title;
  $('capScript').value = state.script;
  $('capTagline').value = state.tagline;
  $('capQuote').value = state.quote;
  $('capSource').value = state.source;
  buildTray();
}

const TRAY_POOL = ['ai-hero2', 'ai-moto', 'ai-chase', 'ai-heroine', 'ai-city', 'ai-partner', 'ai-city2', 'boulevard', 'pier'];

function buildTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  TRAY_POOL.forEach((name) => {
    const img = images.get(name);
    if (!img) return;
    const inState = state.photos.indexOf(name);
    const cell = document.createElement('button');
    cell.className = 'thumb ' + (inState >= 0 ? 'in' : 'pool');
    cell.title = inState >= 0 ? name + ' — click to frame its panel' : name + ' — click to add';
    const t = document.createElement('img');
    t.src = img.src;
    t.alt = name;
    cell.appendChild(t);
    cell.addEventListener('click', () => {
      if (inState >= 0) {
        state.selected = Math.min(inState, 4);
        syncFraming();
      } else {
        addPhoto(name);
      }
    });
    tray.appendChild(cell);
  });
  // photos the user brought in are not in the pool: show them too
  state.photos.forEach((name, i) => {
    if (TRAY_POOL.includes(name)) return;
    const img = images.get(name);
    if (!img) return;
    const cell = document.createElement('button');
    cell.className = 'thumb in';
    cell.title = name;
    const t = document.createElement('img');
    t.src = img.src;
    t.alt = name;
    cell.appendChild(t);
    cell.addEventListener('click', () => {
      state.selected = Math.min(i, 4);
      syncFraming();
    });
    tray.appendChild(cell);
  });
}

async function addPhoto(name, img) {
  if (img) images.set(name, img);
  if (!images.has(name)) {
    const loaded = await loadImages([name]);
    if (loaded.get(name)) images.set(name, loaded.get(name));
  }
  pushHistory();
  state.photos.push(name);
  if (state.photos.length === 1) state.layout = 'hero';
  sceneLinked = false;
  buildTray();
  draw();
}

// ------------------------------------------------------------- events

function wire() {
  $('randomBtn').addEventListener('click', randomizeVibe);
  document.querySelectorAll('[data-scene]').forEach((el) => el.addEventListener('click', () => {
    pushHistory();
    applyScene(state, el.dataset.scene);
    sceneLinked = true;
    syncUI();
    draw();
  }));
  document.querySelectorAll('[data-layout]').forEach((el) => el.addEventListener('click', () => {
    pushHistory();
    state.layout = el.dataset.layout;
    if (sceneLinked) state.photos = scenePhotos(state.scene, state.layout, state.size);
    markChips('layout', state.layout);
    draw();
  }));
  document.querySelectorAll('[data-preset]').forEach((el) => el.addEventListener('click', () => {
    pushHistory();
    state.preset = el.dataset.preset;
    state.nightDeep = false;
    markChips('preset', state.preset);
    draw();
  }));
  document.querySelectorAll('[data-finish]').forEach((el) => el.addEventListener('click', () => {
    pushHistory();
    state.finish = el.dataset.finish;
    markChips('finish', state.finish);
    draw();
  }));
  document.querySelectorAll('[data-size]').forEach((el) => el.addEventListener('click', () => {
    pushHistory();
    state.size = el.dataset.size;
    if (sceneLinked) state.photos = scenePhotos(state.scene, state.layout, state.size);
    markChips('size', state.size);
    draw();
  }));
  $('comicChk').addEventListener('change', () => {
    pushHistory();
    state.comic = $('comicChk').checked;
    draw();
  });
  const bindText = (id, key) => $(id).addEventListener('input', () => {
    state[key] = $(id).value;
    draw();
  });
  bindText('capTitle', 'title');
  bindText('capScript', 'script');
  bindText('capTagline', 'tagline');
  bindText('capQuote', 'quote');
  bindText('capSource', 'source');

  $('panX').addEventListener('input', () => { setCrop({ dx: Number($('panX').value) / 100 }); $('panXVal').textContent = $('panX').value + '%'; draw(); });
  $('panY').addEventListener('input', () => { setCrop({ dy: Number($('panY').value) / 100 }); $('panYVal').textContent = $('panY').value + '%'; draw(); });
  $('zoom').addEventListener('input', () => { setCrop({ z: Number($('zoom').value) / 100 }); $('zoomVal').textContent = $('zoom').value + '%'; draw(); });
  $('panX').addEventListener('change', pushHistorySoon);
  $('panY').addEventListener('change', pushHistorySoon);
  $('zoom').addEventListener('change', pushHistorySoon);
  $('flipBtn').addEventListener('click', () => {
    pushHistory();
    const cur = cropOf(state, state.selected);
    setCrop({ flip: !cur.flip });
    draw();
  });
  $('resetBtn').addEventListener('click', () => {
    pushHistory();
    delete state.crops[state.selected];
    if (state.selected === 4 && state.scene === 'viceheat') state.crops[4] = { z: 1, dx: 0, dy: 0.62, flip: false };
    draw();
  });
  $('undoBtn').addEventListener('click', undo);
  $('shuffleBtn').addEventListener('click', () => {
    pushHistory();
    const order = ['hero', 'split', 'slashed'];
    state.layout = order[(order.indexOf(state.layout) + 1) % order.length];
    if (sceneLinked) state.photos = scenePhotos(state.scene, state.layout, state.size);
    markChips('layout', state.layout);
    draw();
  });

  $('uploadBtn').addEventListener('click', () => $('filePick').click());
  $('filePick').addEventListener('change', async () => {
    for (const file of $('filePick').files) await readFile(file);
    $('filePick').value = '';
  });
  $('sampleBtn').addEventListener('click', () => {
    const next = GALLERY_POOL.find((n) => !state.photos.includes(n)) || 'ai-heroine';
    addPhoto(next);
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) if (file.type.startsWith('image/')) await readFile(file);
  });
  window.addEventListener('paste', async (e) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) await readFile(item.getAsFile());
    }
  });

  // canvas gestures: click selects a panel, drag pans it, wheel zooms it
  let drag = null;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  const hitPanel = (x, y) => {
    const quads = panelQuads(canvas.width, canvas.height, state);
    for (let i = quads.length - 1; i >= 0; i--) {
      const b = quads[i].bbox;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toCanvas(e);
    const hit = hitPanel(x, y);
    if (hit >= 0) {
      state.selected = hit;
      drag = { x, y, crop: { ...cropOf(state, hit) }, moved: false };
      canvas.setPointerCapture(e.pointerId);
      syncFraming();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = toCanvas(e);
    const quads = panelQuads(canvas.width, canvas.height, state);
    const b = quads[state.selected].bbox;
    const dx = Math.max(-1, Math.min(1, drag.crop.dx + (x - drag.x) / b.w * 1.2));
    const dy = Math.max(-1, Math.min(1, drag.crop.dy + (y - drag.y) / b.h * 1.2));
    if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 3) drag.moved = true;
    setCrop({ dx, dy });
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved) pushHistory();
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cur = cropOf(state, state.selected);
    const z = Math.max(0.45, Math.min(4, cur.z * (e.deltaY < 0 ? 1.06 : 0.94)));
    setCrop({ z });
    draw();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => $('capTitle').focus());

  $('exportBtn').addEventListener('click', exportPNG);
  $('caseBtn').addEventListener('click', exportCase);
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'r') randomizeVibe();
  });
}

let historyTimer = null;
function pushHistorySoon() {
  if (historyTimer) return;
  historyTimer = setTimeout(() => { historyTimer = null; }, 400);
}

async function readFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = url; });
  await addPhoto('user-' + Math.round(url.length) + '-' + state.photos.length, img);
}

const VIBES = [
  { preset: 'illustrated', title: 'VICE\nHEAT', script: 'after dark', tagline: 'TWO HEARTS · ONE GETAWAY · NO WAY BACK' },
  { preset: 'neon', title: 'NIGHT\nSHIFT', script: 'city of lights', tagline: 'THE CITY SLEEPS · THEY DON’T' },
  { preset: 'sunset', title: 'PALM\nFEVER', script: 'one last summer', tagline: 'SUMMER ENDS · THE HEAT DOESN’T' },
  { preset: 'golden', title: 'GOLDEN\nHOUR', script: 'stay golden', tagline: 'EVERY LEGEND HAS A LAST RIDE' },
  { preset: 'midnight', title: 'MIDNIGHT\nRUN', script: 'last ride out', tagline: 'NO BRAKES · NO MERCY · NO MAP' },
];

function randomizeVibe() {
  pushHistory();
  const vibe = VIBES[Math.floor(Math.random() * VIBES.length)];
  state.preset = vibe.preset;
  state.title = vibe.title;
  state.script = vibe.script;
  state.tagline = vibe.tagline;
  state.nightDeep = vibe.preset === 'neon';
  syncUI();
  draw();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportPNG() {
  const [w, h] = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  renderCover(off, state, images);
  off.toBlob((blob) => download(blob, `viceframe-cover-${w}x${h}.png`), 'image/png');
}

function exportCase() {
  const off = document.createElement('canvas');
  off.width = 1200; off.height = 1350;
  const cx = off.getContext('2d');
  cx.fillStyle = '#0C0A13';
  cx.fillRect(0, 0, 1200, 1350);
  const st = { ...state, size: 'portrait', photos: scenePhotos(state.scene, 'hero', 'portrait') };
  const front = document.createElement('canvas');
  front.width = 1080; front.height = 1350;
  renderCover(front, st, images);
  const strips = 72, x = 130, y = 90, w = 940, h = 1170, rise = h * 0.035, drop = h * 0.012;
  for (let i = 0; i < strips; i++) {
    const f0 = i / strips;
    const topY = y + rise * (1 - f0);
    const botY = y + h - drop * f0;
    cx.drawImage(front, f0 * front.width, 0, front.width / strips, front.height, x + f0 * w, topY, w / strips + 1, botY - topY);
  }
  off.toBlob((blob) => download(blob, 'viceframe-3d-case.png'), 'image/png');
}

// ------------------------------------------------------------- boot

async function boot() {
  if (shot === 'cover' || shot === 'sheet') {
    document.body.classList.add('shotmode');
    $('app').hidden = true;
    const cv = $('shotCanvas');
    cv.hidden = false;
    const st = stateFromParams(params);
    if (shot === 'sheet') {
      cv.width = 1280; cv.height = 800;
      const names = [...SCENES[st.scene].landscape, ...SCENES[st.scene].portrait];
      const loaded = await loadImages(names);
      loaded.forEach((v, k) => images.set(k, v));
      await loadCanvasFonts();
      renderSheet(cv, st.scene, images);
    } else {
      const dims = { landscape: [1280, 720], portrait: [1024, 1280], square: [1080, 1080] };
      const [w, h] = dims[st.size] || dims.landscape;
      cv.width = w; cv.height = h;
      const loaded = await loadImages(st.photos);
      loaded.forEach((v, k) => images.set(k, v));
      await loadCanvasFonts();
      renderCover(cv, st, images);
    }
    window.__shotReady = true;
    return;
  }
  // editor (also used for the studio screenshot)
  if (params.get('scene') || params.get('photos') || params.get('preset')) {
    state = stateFromParams(params);
    sceneLinked = !!params.get('scene');
  }
  const loaded = await loadImages([...GALLERY_POOL, 'ai-city', 'ai-heroine', 'boulevard', 'pier']);
  loaded.forEach((v, k) => images.set(k, v));
  await loadCanvasFonts();
  wire();
  syncUI();
  draw();
  window.__shotReady = true;
}

boot();
