// ===================================================================
// MAIN: loop, boot, live-update snapshot
// ===================================================================

let lastFrame = performance.now(), acc = 0, uiTimer = 0, rtime = 0;
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
  uiTimer -= dt;
  if (uiTimer <= 0) { uiTimer = 0.1; tickUI(); }
  requestAnimationFrame(frame);
}

// A battle in progress survives a page update: towers, gold and the wave reached.
function snapshot() {
  const game = G && !G.demo && !G.over ? {
    mapId: G.map.id, diff: G.diffId, mode: G.mode, gold: G.gold, lives: G.lives, seen: G.seen,
    wave: G.spawners.length || G.enemies.length ? Math.max(0, G.wave - 1) : G.wave,
    towers: G.towers.map(t => ({ type: t.type, c: t.c, r: t.r, level: t.level, branch: t.branch, spent: t.spent, mode: t.mode, kills: t.kills, dealt: t.dealt })),
    stats: G.stats,
  } : null;
  return { v: 1, ui: { mapId: UIState.mapId, diff: UIState.diff, mode: UIState.mode, speed: UIState.speed }, game };
}
function restore(data) {
  const s = data && data.game;
  if (!s || !MAPS.some(m => m.id === s.mapId)) return false;
  startBattle(s.mapId, s.diff, s.mode);
  G.gold = 1e9;
  for (const o of s.towers) {
    const t = buildTower(o.type, o.c, o.r);
    if (!t) continue;
    for (let i = 0; i < o.level; i++) upgradeTower(t);
    if (o.branch >= 0) upgradeTower(t, o.branch);
    Object.assign(t, { spent: o.spent, mode: o.mode, kills: o.kills, dealt: o.dealt, fresh: false, born: 1 });
  }
  Object.assign(G, { gold: s.gold, lives: s.lives, wave: s.wave, seen: s.seen || {}, stats: s.stats || G.stats });
  G.particles.length = 0; G.fx.length = 0; G.texts.length = 0;
  UIState.paused = true;
  $('paused-tag').hidden = false;
  $('toast').hidden = true;
  return true;
}

function start(data) {
  loadSave();
  if (data && data.ui) Object.assign(UIState, { mapId: data.ui.mapId || 'vale', diff: data.ui.diff || 'knight', mode: data.ui.mode || 'campaign' });
  Sound.setSfx(Save.settings.sfx);
  Sound.setMusic(Save.settings.music);
  syncToggles();
  resizeCanvas();
  if (!restore(data)) toTitle();
  if (data && data.ui && data.ui.speed) setSpeed(data.ui.speed);
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
}

try { window.claude?.hot?.snapshot?.(snapshot); } catch (e) { /* not in a viewer */ }
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});

// Test hook used by automated balance runs; harmless in play.
window.__LK = {
  get G() { return G; }, newGame, buildTower, upgradeTower, sellTower, canBuild, startNextWave, update, castSpell,
  TOWERS, ENEMIES, MAPS, makeWave, getWave, UIState, startBattle, Hooks, hpScale, spawnEnemy,
  get quality() { return QUALITY; },
};
