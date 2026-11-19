// Fixed scenes for screenshots, driven by the ?shot= query (see shots.json):
//   ?shot=cover   the exported cover alone, filling the window
//   ?shot=editor  the editor with photos loaded and the caption filled in
//   ?shot=sheet   the export sheet showing all three post sizes
// Params: photos (comma list of sample names), layout, size, title, script, credits,
// preset, drag (a panel index shown selected, mid-drag), scenes (comma list of
// panelIndex:sceneId stamped into the current view), platform / rating (1 or 0 for the
// export furniture). window.__shotReady is set once the scene is painted, as the kit's
// starter did.

async function setPhotos(api, names) {
  api.state.photos.length = 0;
  api.state.adjusts = {};
  api.state.selected = -1;
  for (const name of names) await api.addPhoto(`samples/${name}.jpg`);
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

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
  } else if (shot === 'sheet') {
    document.body.classList.add('shot-sheet');
    // The sheet renders all three aspects from this one state, so the scene stamps are
    // dealt per aspect: the same cover story at every post size.
    api.setSceneFor('hero', 'landscape', 1, 'heli');
    api.setSceneFor('hero', 'landscape', 2, 'car');
    api.setSceneFor('hero', 'landscape', 3, 'skyline');
    api.setSceneFor('hero', 'landscape', 4, 'money');
    api.setSceneFor('hero', 'square', 1, 'heli');
    api.setSceneFor('hero', 'square', 2, 'car');
    api.setSceneFor('hero', 'square', 3, 'skyline');
    api.setSceneFor('hero', 'portrait', 1, 'car');
    api.setSceneFor('hero', 'portrait', 2, 'skyline');
    api.setSceneFor('hero', 'portrait', 3, 'money');
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
