// ===================================================================
// MAIN: loop, boot, live-update snapshot
// ===================================================================

let lastFrame = performance.now(), acc = 0, uiTimer = 0, rtime = 0, saveTimer = 0;
// Quality governor: lower detail when frames arrive late, restore it once
// the frame's own work leaves plenty of headroom again.
const perf = { gap: 16.7, work: 4, slow: 0, fast: 0 };
function governQuality(gapMs, workMs, dt) {
  if (gapMs > 200) return;  // tab was hidden or stalled: not a signal
  perf.gap += (gapMs - perf.gap) * 0.08;
  perf.work += (workMs - perf.work) * 0.08;
  if (perf.gap > 23) { perf.slow += dt; perf.fast = 0; }
  else if (perf.gap < 18.5 && perf.work < 6) { perf.fast += dt; perf.slow = 0; }
  else { perf.slow = 0; perf.fast = 0; }
  if (perf.slow > 1.5 && QUALITY > 0) { QUALITY--; perf.slow = 0; }
  if (perf.fast > 8 && QUALITY < 2) { QUALITY++; perf.fast = 0; }
}

function frame(now) {
  const gap = now - lastFrame;
  const dt = Math.min(0.1, gap / 1000);
  lastFrame = now;
  rtime += dt;
  const t0 = performance.now();
  if (G && !UIState.paused && (G.demo || UIState.screen === 'game')) {
    acc += dt * (G.demo ? 1 : UIState.speed);
    let n = 0;
    while (acc >= STEP && n < 12) { update(STEP); acc -= STEP; n++; }
    if (n >= 12) acc = 0;
  }
  render(rtime);
  governQuality(gap, performance.now() - t0, dt);
  // Autosave the battle every couple of seconds of real time.
  if (G && !G.demo && !G.over) {
    saveTimer += dt;
    if (saveTimer >= 2) { saveTimer = 0; saveBattle(); }
  }
  uiTimer -= dt;
  if (uiTimer <= 0) { uiTimer = 0.1; tickUI(); }
  requestAnimationFrame(frame);
}

// A battle in progress survives a live page update, using the same save
// format as closing and reopening the page.
function snapshot() {
  return { v: 2, ui: { mapId: UIState.mapId, diff: UIState.diff, mode: UIState.mode }, battle: serializeBattle() };
}
function restore(data) {
  const s = data && data.battle;
  return validBattle(s) ? resumeBattle(s) : false;
}

function start(data) {
  loadSave();
  if (data && data.ui) Object.assign(UIState, { mapId: data.ui.mapId || 'vale', diff: data.ui.diff || 'knight', mode: data.ui.mode || 'campaign' });
  Sound.setSfx(Save.settings.sfx);
  Sound.setMusic(Save.settings.music);
  syncToggles();
  resizeCanvas();
  if (!restore(data)) toTitle();
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
}

try { window.claude?.hot?.snapshot?.(snapshot); } catch (e) { /* not in a viewer */ }
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});

// Test hook used by automated balance runs; harmless in play.
window.__LK = {
  get G() { return G; }, newGame, buildTower, upgradeTower, sellTower, canBuild, startNextWave, update, castSpell,
  TOWERS, ENEMIES, MAPS, makeWave, getWave, UIState, startBattle, Hooks, hpScale, spawnEnemy, serializeBattle, restoreBattle,
  get quality() { return QUALITY; },
};
