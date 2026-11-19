// VICEFRAME editor: wires the rail controls to a scene, keeps the stage
// canvas painted with cover.js, and handles the maker's screenshot mode.
//
// Two ways in:
//   - a person opens index.html and gets the editor;
//   - the page URL carries ?shot=... and the app builds the prescribed
//     scene, renders it, and raises window.__shotReady for the camera.

import {
  COVER_SIZES,
  SAMPLE_PHOTOS,
  GRADE_PRESETS,
  PANEL_NAMES,
  defaultScene,
  defaultAssign,
  panelQuads,
  drawCover,
  drawSheet,
} from './cover.js';

const stage = document.getElementById('stage');
const sheetCanvas = document.getElementById('sheet');
const stageCtx = stage.getContext('2d');
const sheetCtx = sheetCanvas.getContext('2d');

let scene = defaultScene();
let view = 'cover'; // 'cover' | 'sheet'
let selectedPanel = 0;
let uploadCount = 0;
const images = new Map(); // photoKey -> HTMLImageElement
const photoLabels = new Map(SAMPLE_PHOTOS.map((p) => [p.key, p.label]));

const FONT_FACES = [
  '64px "Archivo Black"',
  '64px "Yellowtail"',
  '64px "Anton"',
  '64px "Oswald"',
  '64px "Bebas Neue"',
  '64px "Archivo"',
];

function loadFonts() {
  const jobs = FONT_FACES.map((f) => document.fonts.load(f).catch(() => null));
  return Promise.all(jobs).then(() => document.fonts.ready);
}

function loadImage(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(key, img); resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function loadSamples() {
  return Promise.all(SAMPLE_PHOTOS.map((p) => loadImage(p.key, p.file)));
}

// ------------------------------------------------------------- rendering

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    paint();
  });
}

function paint() {
  if (view === 'sheet') {
    stage.hidden = true;
    sheetCanvas.hidden = false;
    drawSheet(sheetCtx, sheetCanvas.width, sheetCanvas.height, scene, images);
  } else {
    sheetCanvas.hidden = true;
    stage.hidden = false;
    const dims = COVER_SIZES[scene.size];
    if (stage.width !== dims.w || stage.height !== dims.h) {
      stage.width = dims.w;
      stage.height = dims.h;
    }
    drawCover(stageCtx, dims.w, dims.h, scene, images);
  }
}

function exportPng(sizeKey) {
  const dims = COVER_SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = dims.w;
  off.height = dims.h;
  drawCover(off.getContext('2d'), dims.w, dims.h, { ...scene, size: sizeKey }, images);
  off.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `viceframe-cover-${sizeKey}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

// ------------------------------------------------------------- rail build

const $ = (id) => document.getElementById(id);

function markActive(container, key) {
  for (const btn of container.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.key === key);
  }
}

function buildPhotoTray() {
  const tray = $('photoTray');
  tray.innerHTML = '';
  scene.pool.forEach((key, poolIndex) => {
    const def = SAMPLE_PHOTOS.find((p) => p.key === key);
    const btn = document.createElement('button');
    btn.className = 'thumb';
    btn.title = photoLabels.get(key) || key;
    if (def) {
      const img = document.createElement('img');
      img.src = def.file;
      img.alt = def.label;
      btn.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.className = 'thumbText';
      span.textContent = photoLabels.get(key) || 'Your photo';
      btn.appendChild(span);
    }
    const caption = document.createElement('small');
    caption.textContent = photoLabels.get(key) || key;
    btn.appendChild(caption);
    btn.addEventListener('click', () => {
      scene.assign[selectedPanel] = poolIndex;
      buildPanelList();
      render();
    });
    tray.appendChild(btn);
  });
}

function buildPanelList() {
  const list = $('panelList');
  list.innerHTML = '';
  const names = PANEL_NAMES[scene.layout];
  names.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'panelRow' + (i === selectedPanel ? ' selected' : '');
    const title = document.createElement('button');
    title.className = 'panelName';
    title.textContent = name;
    title.addEventListener('click', () => { selectedPanel = i; buildPanelList(); });
    const select = document.createElement('select');
    scene.pool.forEach((key, poolIndex) => {
      const opt = document.createElement('option');
      opt.value = String(poolIndex);
      opt.textContent = photoLabels.get(key) || key;
      select.appendChild(opt);
    });
    select.value = String(scene.assign[i] !== undefined ? scene.assign[i] : i % scene.pool.length);
    select.addEventListener('change', () => {
      scene.assign[i] = Number(select.value);
      render();
    });
    const zoomOut = document.createElement('button');
    zoomOut.textContent = '−';
    zoomOut.title = 'Zoom out';
    const zoomIn = document.createElement('button');
    zoomIn.textContent = '+';
    zoomIn.title = 'Zoom in';
    const crop = scene.crops[i] || { z: 1 };
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'zoomLabel';
    zoomLabel.textContent = `${Math.round((crop.z || 1) * 100)}%`;
    const nudge = (factor) => {
      const c = scene.crops[i] || { z: 1, dx: 0, dy: 0 };
      c.z = Math.min(4, Math.max(0.45, (c.z || 1) * factor));
      scene.crops[i] = c;
      zoomLabel.textContent = `${Math.round(c.z * 100)}%`;
      render();
    };
    zoomOut.addEventListener('click', () => nudge(0.9));
    zoomIn.addEventListener('click', () => nudge(1.1));
    row.append(title, select, zoomOut, zoomLabel, zoomIn);
    list.appendChild(row);
  });
}

function buildChoiceRow(containerId, options, current, onPick) {
  const box = $(containerId);
  box.innerHTML = '';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.dataset.key = opt.key;
    if (opt.key === current) btn.classList.add('active');
    btn.addEventListener('click', () => { onPick(opt.key); markActive(box, opt.key); });
    box.appendChild(btn);
  }
}

function buildFurniture() {
  const box = $('furnitureToggles');
  box.innerHTML = '';
  const items = [
    ['header', 'Platform header bar'],
    ['rating', 'Rating block + descriptors'],
    ['badge', 'Studio badge'],
    ['sheen', 'Box sheen sweep'],
  ];
  for (const [key, label] of items) {
    const row = document.createElement('label');
    row.className = 'toggleRow';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!scene.furniture[key];
    input.addEventListener('change', () => { scene.furniture[key] = input.checked; render(); });
    const span = document.createElement('span');
    span.textContent = label;
    row.append(input, span);
    box.appendChild(row);
  }
}

function buildRail() {
  buildPhotoTray();
  buildPanelList();
  buildChoiceRow('layoutBtns', [
    { key: 'hero', label: 'Hero collage' },
    { key: 'duo', label: 'Duo' },
    { key: 'nine', label: 'Classic Nine' },
  ], scene.layout, (key) => {
    scene.layout = key;
    scene.assign = defaultAssign(key, scene.pool.length);
    scene.crops = {};
    selectedPanel = 0;
    buildPanelList();
    render();
  });
  buildChoiceRow('sizeBtns', Object.entries(COVER_SIZES).map(([key, v]) => ({ key, label: v.label })), scene.size, (key) => {
    scene.size = key;
    render();
  });
  buildChoiceRow('gradeBtns', GRADE_PRESETS.map((p) => ({ key: p.key, label: p.label })), scene.preset, (key) => {
    scene.preset = key;
    render();
  });
  $('titleInput').value = scene.title;
  $('scriptInput').value = scene.script;
  buildFurniture();
}

// ------------------------------------------------------------ interaction

function canvasPoint(evt) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (stage.width / rect.width),
    y: (evt.clientY - rect.top) * (stage.height / rect.height),
  };
}

function quadHit(quad, pt) {
  // Ray-cast point-in-polygon over the panel's four corners.
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = quad[i], b = quad[j];
    if ((a.y > pt.y) !== (b.y > pt.y)) {
      const xCross = a.x + ((pt.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (pt.x < xCross) inside = !inside;
    }
  }
  return inside;
}

function panelAt(pt) {
  const quads = panelQuads(scene, stage.width, stage.height);
  for (let i = quads.length - 1; i >= 0; i--) {
    if (quadHit(quads[i], pt)) return i;
  }
  return -1;
}

function wireStage() {
  let drag = null;
  stage.addEventListener('pointerdown', (evt) => {
    if (view !== 'cover') return;
    const pt = canvasPoint(evt);
    const hit = panelAt(pt);
    if (hit < 0) return;
    selectedPanel = hit;
    buildPanelList();
    const crop = scene.crops[hit] || { z: 1, dx: 0, dy: 0 };
    scene.crops[hit] = crop;
    drag = { panel: hit, lastX: pt.x, lastY: pt.y };
    stage.setPointerCapture(evt.pointerId);
  });
  stage.addEventListener('pointermove', (evt) => {
    if (!drag) return;
    const pt = canvasPoint(evt);
    const quads = panelQuads(scene, stage.width, stage.height);
    const q = quads[drag.panel];
    const bw = Math.max(1, Math.max(...q.map((p) => p.x)) - Math.min(...q.map((p) => p.x)));
    const bh = Math.max(1, Math.max(...q.map((p) => p.y)) - Math.min(...q.map((p) => p.y)));
    const crop = scene.crops[drag.panel];
    crop.dx = Math.min(0.85, Math.max(-0.85, (crop.dx || 0) + (pt.x - drag.lastX) / bw));
    crop.dy = Math.min(0.85, Math.max(-0.85, (crop.dy || 0) + (pt.y - drag.lastY) / bh));
    drag.lastX = pt.x;
    drag.lastY = pt.y;
    render();
  });
  const endDrag = () => { drag = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (evt) => {
    if (view !== 'cover') return;
    evt.preventDefault();
    const pt = canvasPoint(evt);
    const hit = panelAt(pt);
    const target = hit >= 0 ? hit : selectedPanel;
    const crop = scene.crops[target] || { z: 1, dx: 0, dy: 0 };
    crop.z = Math.min(4, Math.max(0.45, (crop.z || 1) * (evt.deltaY < 0 ? 1.09 : 0.92)));
    scene.crops[target] = crop;
    buildPanelList();
    render();
  }, { passive: false });
}

function addUserPhoto(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      uploadCount += 1;
      const key = `user-${uploadCount}`;
      images.set(key, img);
      photoLabels.set(key, file.name.replace(/\.[a-z0-9]+$/i, '') || 'Your photo');
      scene.pool.push(key);
      scene.assign[selectedPanel] = scene.pool.length - 1;
      buildPhotoTray();
      buildPanelList();
      render();
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function wireInputs() {
  $('titleInput').addEventListener('input', (evt) => { scene.title = evt.target.value; render(); });
  $('scriptInput').addEventListener('input', (evt) => { scene.script = evt.target.value; render(); });
  $('uploadBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (evt) => {
    for (const file of evt.target.files) addUserPhoto(file);
    evt.target.value = '';
  });
  window.addEventListener('dragover', (evt) => { evt.preventDefault(); document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', (evt) => { if (!evt.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (evt) => {
    evt.preventDefault();
    document.body.classList.remove('dragging');
    for (const file of evt.dataTransfer.files) {
      if (file.type.startsWith('image/')) addUserPhoto(file);
    }
  });
  $('exportSquare').addEventListener('click', () => exportPng('square'));
  $('exportPortrait').addEventListener('click', () => exportPng('portrait'));
  $('exportLandscape').addEventListener('click', () => exportPng('landscape'));
  $('sheetBtn').addEventListener('click', () => {
    view = view === 'sheet' ? 'cover' : 'sheet';
    $('sheetBtn').textContent = view === 'sheet' ? 'Back to the editor' : 'Export sheet — all three sizes';
    render();
  });
  $('exportSheetPng').addEventListener('click', () => {
    sheetCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'viceframe-export-sheet.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });
}

// ------------------------------------------------------------ shot mode

function sceneFromParams(params) {
  const s = defaultScene();
  if (params.get('layout')) s.layout = params.get('layout');
  if (params.get('size')) s.size = params.get('size');
  if (params.get('preset')) s.preset = params.get('preset');
  const photos = (params.get('photos') || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (photos.length) s.pool = photos;
  s.assign = defaultAssign(s.layout, s.pool.length);
  if (params.get('assign')) {
    for (const pair of params.get('assign').split(',')) {
      const [panel, photo] = pair.split(':').map(Number);
      if (Number.isFinite(panel) && Number.isFinite(photo)) s.assign[panel] = photo;
    }
  }
  if (params.get('crop')) {
    for (const item of params.get('crop').split(',')) {
      const [panel, z, dx, dy] = item.split(':').map(Number);
      if (Number.isFinite(panel)) s.crops[panel] = { z: z || 1, dx: dx || 0, dy: dy || 0 };
    }
  }
  if (params.get('title') !== null) s.title = params.get('title');
  if (params.get('script') !== null) s.script = params.get('script');
  return s;
}

// ------------------------------------------------------------------ main

async function main() {
  const params = new URLSearchParams(location.search);
  const shotKind = params.get('shot');
  if (shotKind) scene = sceneFromParams(params);

  buildRail();
  wireStage();
  wireInputs();
  await Promise.all([loadFonts(), loadSamples()]);
  if (shotKind === 'cover') {
    document.body.classList.add('shotCover');
    view = 'cover';
  } else if (shotKind === 'sheet') {
    document.body.classList.add('shotSheet');
    view = 'sheet';
  } else if (shotKind === 'editor') {
    document.body.classList.add('shotEditor');
    view = 'cover';
  }
  paint();
  if (shotKind) {
    // One more frame after the first paint so graded panels are in place.
    requestAnimationFrame(() => {
      paint();
      window.__shotReady = true;
    });
  }
}

main();
