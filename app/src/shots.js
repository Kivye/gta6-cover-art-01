// Fixed scenes for screenshots, driven by the ?shot= query (see shots.json):
//   ?shot=cover   the exported cover alone, filling the window
//   ?shot=editor  the editor with photos loaded and the caption filled in
//   ?shot=sheet   the export sheet showing all three post sizes
// Params: photos (comma list of sample names), layout, size, title, script, credits,
// preset, drag (a panel index shown selected, mid-drag), scenes (comma list of
// panelIndex:sceneId stamped into the current view), assign (comma list of
// panelIndex:photoIndex dealing a loaded photo into a panel), crop (comma list of
// panelIndex:zoom:dx:dy adjust multipliers), platform / rating (1 or 0 for the
// export furniture). window.__shotReady is set once the scene is painted, as the kit's
// starter did.

async function setPhotos(api, names) {
  api.state.photos.length = 0;
  api.state.adjusts = {};
  api.state.selected = -1;
  for (const name of names) {
    if (api.addSample) await api.addSample(name);
    else await api.addPhoto(`samples/${name}.jpg`);
  }
}

function setAssign(api, params) {
  const spec = params.get('assign');
  if (!spec) return;
  for (const pair of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [index, photo] = pair.split(':');
    if (photo !== undefined && photo !== '') api.setPhoto(Number(index), Number(photo));
  }
}

function setCrops(api, params) {
  const spec = params.get('crop');
  if (!spec) return;
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [index, zoom, dx, dy] = part.split(':');
    const crop = {};
    if (zoom !== undefined && zoom !== '') crop.zoom = Number(zoom);
    if (dx !== undefined && dx !== '') crop.dx = Number(dx);
    if (dy !== undefined && dy !== '') crop.dy = Number(dy);
    api.setCrop(Number(index), crop);
  }
}

function setCaption(api, params) {
  const map = { title: 'capTitle', script: 'capScript', subtitle: 'capSubtitle', credits: 'capCredits' };
  for (const [key, fieldId] of Object.entries(map)) {
    const value = params.get(key);
    if (value !== null) {
      api.state.caption[key] = value;
      if (api.captionFields[key]) api.captionFields[key].value = value;
    }
  }
}

function setScenes(api, params) {
  const spec = params.get('scenes');
  if (!spec) return;
  for (const pair of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [index, sceneId] = pair.split(':');
    if (sceneId) api.setScene(Number(index), sceneId);
  }
}

export async function runShot(shot, params, api) {
  const photos = (params.get('photos') ?? 'boulevard').split(',').map((s) => s.trim()).filter(Boolean);
  if (params.get('preset')) api.setPreset(params.get('preset'));
  if (params.get('size')) api.setSize(params.get('size'));
  if (params.get('layout')) api.setLayoutMode(params.get('layout'));
  if (params.get('platform') !== null) api.setExportFlag('platformBar', params.get('platform') === '1');
  if (params.get('rating') !== null) api.setExportFlag('ratingBadge', params.get('rating') === '1');
  setCaption(api, params);
  await setPhotos(api, photos);
  setScenes(api, params);
  setAssign(api, params);
  setCrops(api, params);

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
  } else if (shot === 'sheet') {
    document.body.classList.add('shot-sheet');
    // The sheet renders all three aspects from this one state, so the deal is stamped per
    // aspect: the same cover story at every post size. Landscape hero: the moto and chase
    // paintings ride the right column, the neon city painting takes the bottom-left slot,
    // and the partner painting takes the bottom-right. The hero crop zooms in and deals
    // from the left edge, so the heroine's face stands clear of the title block. Square
    // and portrait hero have a three-panel bottom row instead: moto, chase, partner.
    api.setPhotoFor('hero', 'landscape', 1, 1);
    api.setPhotoFor('hero', 'landscape', 2, 2);
    api.setPhotoFor('hero', 'landscape', 3, 4);
    api.setPhotoFor('hero', 'landscape', 4, 3);
    api.setCropFor('hero', 'landscape', 0, { zoom: 1.08, dx: 0, dy: 0.06 });
    api.setCropFor('hero', 'landscape', 1, { zoom: 0.4545, dy: 0.18 });
    api.setCropFor('hero', 'landscape', 2, { zoom: 0.5, dy: -0.222 });
    api.setCropFor('hero', 'landscape', 3, { zoom: 1.141, dx: 0.25, dy: 0.238 });
    api.setCropFor('hero', 'landscape', 4, { zoom: 1.141, dx: -0.155, dy: -0.338 });
    api.setCropFor('hero', 'square', 0, { zoom: 1.0, dx: 0, dy: 0.05 });
    api.setCropFor('hero', 'portrait', 0, { zoom: 1.0, dx: 0, dy: 0.05 });
    api.setPhotoFor('hero', 'square', 1, 1);
    api.setPhotoFor('hero', 'square', 2, 2);
    api.setPhotoFor('hero', 'square', 3, 3);
    api.setCropFor('hero', 'square', 1, { zoom: 0.4545 });
    api.setCropFor('hero', 'square', 2, { zoom: 0.5 });
    api.setCropFor('hero', 'square', 3, { zoom: 1.141, dy: -0.443 });
    api.setPhotoFor('hero', 'portrait', 1, 1);
    api.setPhotoFor('hero', 'portrait', 2, 2);
    api.setPhotoFor('hero', 'portrait', 3, 3);
    api.setCropFor('hero', 'portrait', 1, { zoom: 0.4545, dx: 0.06 });
    api.setCropFor('hero', 'portrait', 2, { zoom: 0.5, dx: 0.1 });
    api.setCropFor('hero', 'portrait', 3, { zoom: 1.141, dy: -0.354 });
    api.openSheet();
  } else if (shot === 'editor') {
    const drag = params.get('drag');
    if (drag !== null) {
      const index = Number(drag);
      api.nudgePanel(index, -0.10, 0.06);
      api.selectPanel(index);
    }
    if (params.get('rail') === 'end') {
      const rail = document.querySelector('.rail');
      if (rail) rail.scrollTop = rail.scrollHeight;
    }
  }
  api.render();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => { window.__shotReady = true; }, 60);
  }));
}
