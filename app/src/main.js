// VICEFRAME editor: wires the page to the poster renderer. Photos land and the layout deals
// itself, the caption edits the lettering live, and one click exports the PNG. A `?shot=`
// query instead sets up a fixed scene for a screenshot (./shots.js).
import {
  GRADE_PRESETS, POSTER_SIZES, aspectOf, autoLayout, buildPanelLayout, panelQuad,
  renderPoster, exportCoverPng,
} from './cover.js';
import { runShot } from './shots.js';

const state = {
  photos: [],
  layoutMode: 'auto',
  presetId: 'vice',
  intensity: 1,
  caption: { title: 'VICE\nHEAT', script: 'after dark', subtitle: '', credits: '' },
  sizeId: 'square',
  neonFrame: true,
  dressing: true,
  platformBar: true,
  ratingBadge: true,
  adjusts: {},
  selected: -1,
};

const canvas = document.getElementById('coverCanvas');
const status = document.getElementById('status');

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function sizeOf() {
  return POSTER_SIZES.find((s) => s.id === state.sizeId);
}

/** The state as the renderer wants it: layout resolved from Auto, aspect from the size. */
function viewState() {
  const size = sizeOf();
  return {
    ...state,
    size: { w: size.w, h: size.h },
    aspect: aspectOf(size.w, size.h),
    layoutId: state.layoutMode === 'auto' ? autoLayout(state.photos.length) : state.layoutMode,
  };
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!state.photos.length) return;
    const view = viewState();
    const scale = Math.min(1, 980 / view.size.w);
    renderPoster(canvas, view, state.photos, scale);
  });
}

/* ---------------- photos ---------------- */

const thumbs = document.getElementById('photoThumbs');
function renderThumbs() {
  thumbs.innerHTML = '';
  state.photos.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const pic = document.createElement('img');
    pic.src = img.src;
    pic.alt = `Photo ${i + 1}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = 'Remove photo';
    x.addEventListener('click', () => {
      state.photos.splice(i, 1);
      state.adjusts = {};
      state.selected = -1;
      renderThumbs();
      render();
    });
    div.append(pic, x);
    thumbs.append(div);
  });
}

async function addPhoto(url) {
  const img = await loadImage(url);
  state.photos.push(img);
  renderThumbs();
  render();
  return img;
}

async function addFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) await addPhoto(URL.createObjectURL(file));
  }
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});
document.querySelectorAll('[data-sample]').forEach((btn) => {
  btn.addEventListener('click', () => addPhoto(`samples/${btn.dataset.sample}.jpg`));
});

const stage = document.getElementById('dropZone');
['dragover', 'dragenter'].forEach((ev) => stage.addEventListener(ev, (e) => {
  e.preventDefault();
  stage.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((ev) => stage.addEventListener(ev, (e) => {
  e.preventDefault();
  stage.classList.remove('dragover');
}));
stage.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) addFiles(files);
});

/* ---------------- panel pointing ---------------- */

function posterPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const view = viewState();
  return {
    x: ((e.clientX - rect.left) / rect.width) * view.size.w,
    y: ((e.clientY - rect.top) / rect.height) * view.size.h,
    view,
  };
}

function panelAt(pt) {
  const layout = buildPanelLayout(pt.view.aspect, pt.view.layoutId, state.photos.length);
  for (let i = layout.length - 1; i >= 0; i--) {
    const q = panelQuad(layout[i], i, pt.view.size.w, pt.view.size.h);
    // Point-in-quad via consistent cross-product signs.
    let sign = 0;
    let inside = true;
    for (let e = 0; e < 4; e++) {
      const a = q[e];
      const b = q[(e + 1) % 4];
      const cross = (b[0] - a[0]) * (pt.y - a[1]) - (b[1] - a[1]) * (pt.x - a[0]);
      if (cross !== 0) {
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) { inside = false; break; }
      }
    }
    if (inside) return { index: i, panel: layout[i] };
  }
  return null;
}

function adjustKey(index, view) {
  return `${view.layoutId}:${view.aspect}:${index}`;
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const pt = posterPoint(e);
  const hit = panelAt(pt);
  if (!hit || hit.panel.kind === 'title') return;
  const key = adjustKey(hit.index, pt.view);
  const cur = state.adjusts[key] ?? {};
  drag = {
    index: hit.index, key, startX: pt.x, startY: pt.y,
    dx: cur.dx ?? 0, dy: cur.dy ?? 0,
    pw: hit.panel.w * pt.view.size.w * hit.panel.zoom,
    ph: hit.panel.h * pt.view.size.h * hit.panel.zoom,
    moved: false,
  };
  state.selected = hit.index;
  canvas.setPointerCapture(e.pointerId);
  render();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pt = posterPoint(e);
  const dx = pt.x - drag.startX;
  const dy = pt.y - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  state.adjusts[drag.key] = {
    ...(state.adjusts[drag.key] ?? {}),
    dx: Math.min(1, Math.max(-1, drag.dx - dx / drag.pw)),
    dy: Math.min(1, Math.max(-1, drag.dy - dy / drag.ph)),
  };
  render();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const pt = posterPoint(e);
  const hit = panelAt(pt);
  if (!hit || hit.panel.kind === 'title') return;
  const key = adjustKey(hit.index, pt.view);
  const cur = state.adjusts[key] ?? {};
  const zoom = Math.min(3, Math.max(0.45, (cur.zoom ?? 1) * Math.exp(-e.deltaY * 0.0012)));
  state.adjusts[key] = { ...cur, zoom };
  state.selected = hit.index;
  render();
}, { passive: false });

document.getElementById('swapPhoto').addEventListener('click', () => {
  if (state.selected < 0 || state.photos.length < 2) return;
  const view = viewState();
  const key = adjustKey(state.selected, view);
  const layout = buildPanelLayout(view.aspect, view.layoutId, state.photos.length);
  const cur = state.adjusts[key] ?? {};
  const now = cur.photo ?? layout[state.selected].photo;
  state.adjusts[key] = { ...cur, photo: (now + 1) % state.photos.length };
  render();
});
document.getElementById('resetPanel').addEventListener('click', () => {
  if (state.selected < 0) return;
  delete state.adjusts[adjustKey(state.selected, viewState())];
  render();
});
document.getElementById('shuffleLayout').addEventListener('click', () => {
  const view = viewState();
  const layout = buildPanelLayout(view.aspect, view.layoutId, state.photos.length);
  layout.forEach((p, i) => {
    if (p.kind === 'title') return;
    state.adjusts[adjustKey(i, view)] = {
      photo: Math.floor(Math.random() * state.photos.length),
      dx: (Math.random() - 0.5) * 0.24,
      dy: (Math.random() - 0.5) * 0.24,
    };
  });
  render();
});

/* ---------------- controls ---------------- */

const presetBar = document.getElementById('presetBar');
Object.entries(GRADE_PRESETS).forEach(([id, preset]) => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip${id === state.presetId ? ' on' : ''}`;
  chip.textContent = preset.label;
  chip.addEventListener('click', () => {
    state.presetId = id;
    presetBar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
    render();
  });
  presetBar.append(chip);
});

document.querySelectorAll('[data-layout]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.layoutMode = btn.dataset.layout;
    document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b === btn));
    state.selected = -1;
    render();
  });
});
document.querySelectorAll('[data-size]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.sizeId = btn.dataset.size;
    document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b === btn));
    state.selected = -1;
    render();
  });
});

const captionFields = {
  title: document.getElementById('capTitle'),
  script: document.getElementById('capScript'),
  subtitle: document.getElementById('capSubtitle'),
  credits: document.getElementById('capCredits'),
};
Object.entries(captionFields).forEach(([key, field]) => {
  if (!field) return;
  field.addEventListener('input', () => {
    state.caption[key] = field.value;
    render();
  });
});
document.getElementById('captionForm').addEventListener('submit', (e) => e.preventDefault());

/* ---------------- scene panels ---------------- */

document.querySelectorAll('[data-scene]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.selected < 0) {
      status.textContent = 'Click a panel on the cover first, then stamp a scene into it.';
      return;
    }
    const key = adjustKey(state.selected, viewState());
    state.adjusts[key] = { ...(state.adjusts[key] ?? {}), scene: btn.dataset.scene };
    status.textContent = `Panel ${state.selected + 1} is now the ${btn.textContent.trim()} scene.`;
    render();
  });
});
document.getElementById('clearScene').addEventListener('click', () => {
  if (state.selected < 0) return;
  const key = adjustKey(state.selected, viewState());
  const cur = { ...(state.adjusts[key] ?? {}) };
  delete cur.scene;
  state.adjusts[key] = cur;
  status.textContent = `Panel ${state.selected + 1} is back to its photo.`;
  render();
});

/* ---------------- grade and box toggles ---------------- */

document.getElementById('intensity').addEventListener('input', (e) => {
  state.intensity = Number(e.target.value) / 100;
  render();
});
document.getElementById('platformBar').addEventListener('change', (e) => {
  state.platformBar = e.target.checked;
  render();
});
document.getElementById('ratingBadge').addEventListener('change', (e) => {
  state.ratingBadge = e.target.checked;
  render();
});
document.getElementById('neonFrame').addEventListener('change', (e) => {
  state.neonFrame = e.target.checked;
  render();
});
document.getElementById('dressing').addEventListener('change', (e) => {
  state.dressing = e.target.checked;
  render();
});

/* ---------------- export ---------------- */

function downloadPng(w, h) {
  const view = viewState();
  const out = exportCoverPng({ ...view, size: { w: sizeOf().w, h: sizeOf().h } }, state.photos, w, h);
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `viceframe-cover-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status.textContent = `Saved viceframe-cover-${w}x${h}.png`;
  }, 'image/png');
}

document.getElementById('exportPng').addEventListener('click', () => {
  const s = sizeOf();
  downloadPng(s.w, s.h);
});
document.getElementById('exportTop').addEventListener('click', () => {
  const s = sizeOf();
  downloadPng(s.w, s.h);
});

const sheet = document.getElementById('exportSheet');
function renderSheet() {
  const base = viewState();
  const targets = [
    ['sheetSquare', POSTER_SIZES[0], 0.5],
    ['sheetPortrait', POSTER_SIZES[1], 0.4],
    ['sheetLandscape', POSTER_SIZES[2], 880 / 1920],
  ];
  for (const [id, size, scale] of targets) {
    const c = document.getElementById(id);
    renderPoster(c, { ...base, size: { w: size.w, h: size.h }, aspect: aspectOf(size.w, size.h), selected: -1 }, state.photos, scale);
  }
}
function openSheet() {
  sheet.hidden = false;
  renderSheet();
}
document.getElementById('openSheet').addEventListener('click', openSheet);
document.getElementById('closeSheet').addEventListener('click', () => { sheet.hidden = true; });
document.querySelectorAll('[data-download]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const size = POSTER_SIZES.find((s) => s.id === btn.dataset.download);
    downloadPng(size.w, size.h);
  });
});

/* ---------------- boot and screenshot scenes ---------------- */

const shotApi = {
  state,
  captionFields,
  addPhoto,
  render,
  openSheet,
  selectPanel(index) { state.selected = index; },
  setLayoutMode(id) {
    state.layoutMode = id;
    document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === id));
  },
  setSize(id) {
    state.sizeId = id;
    document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === id));
  },
  nudgePanel(index, dx, dy) {
    const view = viewState();
    const key = adjustKey(index, view);
    state.adjusts[key] = { ...(state.adjusts[key] ?? {}), dx, dy };
  },
  setScene(index, sceneId) {
    const view = viewState();
    const key = adjustKey(index, view);
    const cur = { ...(state.adjusts[key] ?? {}) };
    if (sceneId) cur.scene = sceneId;
    else delete cur.scene;
    state.adjusts[key] = cur;
  },
  setSceneFor(layoutId, aspect, index, sceneId) {
    const key = `${layoutId}:${aspect}:${index}`;
    const cur = { ...(state.adjusts[key] ?? {}) };
    if (sceneId) cur.scene = sceneId;
    else delete cur.scene;
    state.adjusts[key] = cur;
  },
  setExportFlag(name, on) {
    state[name] = on;
    const el = document.getElementById(name);
    if (el) el.checked = on;
  },
  setPreset(id) {
    state.presetId = id;
    const order = Object.keys(GRADE_PRESETS);
    presetBar.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', order[i] === id));
  },
};

async function boot() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('100px "Archivo Black"'),
      document.fonts.load('60px Yellowtail'),
      document.fonts.load('40px "Bebas Neue"'),
      document.fonts.load('500 24px Oswald'),
      document.fonts.load('600 20px Archivo'),
    ]);
  } catch { /* fonts fall back gracefully */ }
  await addPhoto('samples/boulevard.jpg');
  const params = new URLSearchParams(location.search);
  if (params.get('shot')) {
    await runShot(params.get('shot'), params, shotApi);
  }
  render();
}

boot();
