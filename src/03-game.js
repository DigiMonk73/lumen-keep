// ===================================================================
// GAME: state + fixed-step simulation (no DOM access here)
// ===================================================================

let G = null;
const C_FREE = 0, C_PATH = 1, C_BLOCK = 2;
const Hooks = {};                              // UI subscribes: Hooks.name = fn
const emit = (name, data) => { const f = Hooks[name]; if (f) f(data); };
const sfx = name => { if (G && !G.demo && !G.headless) Sound.play(name); };

const SPELLS = {
  starfall: { name: 'Starfall', key: 'Q', cd: 40, radius: 1.7, color: '#FFD84D',
              blurb: 'Call down a falling star: heavy damage in an area, air and ground.' },
  snare:    { name: 'Arcane Snare', key: 'W', cd: 30, radius: 2.0, color: '#C38BFF',
              blurb: 'Roots every foe in the circle for 2.5s. Bosses are slowed instead.' },
};
const TARGET_MODES = ['first', 'last', 'strong', 'close'];
const TARGET_LABEL = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };
const NEXT_WAVE_DELAY = 20;
const PARTICLE_CAP = [450, 900, 1600];

// ---------- Paths ----------
// Waypoints become a dense polyline with rounded corners, so movement and
// the drawn road share one smooth curve.
function buildPaths(map) {
  return map.paths.map(wps => {
    const pts = wps.map(([c, r]) => [(c + 0.5) * T, (r + 0.5) * T]);
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
      const r = Math.min(T * 0.6, l1 / 2, l2 / 2);
      const ax = cx - (cx - px) / l1 * r, ay = cy - (cy - py) / l1 * r;
      const bx = cx + (nx - cx) / l2 * r, by = cy + (ny - cy) / l2 * r;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, u = 1 - t;
        out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
      }
    }
    out.push(pts[pts.length - 1]);
    const xs = [], ys = [], cum = [];
    let L = 0;
    for (let i = 0; i < out.length; i++) {
      if (xs.length) {
        const dl = Math.hypot(out[i][0] - xs[xs.length - 1], out[i][1] - ys[ys.length - 1]);
        if (dl < 0.01) continue;
        L += dl;
      }
      xs.push(out[i][0]); ys.push(out[i][1]); cum.push(L);
    }
    const angs = [];
    for (let i = 0; i < xs.length - 1; i++) angs.push(Math.atan2(ys[i + 1] - ys[i], xs[i + 1] - xs[i]));
    angs.push(angs[angs.length - 1]);
    return { xs, ys, cum, angs, len: L, wps };
  });
}
function findSeg(p, d) {
  let lo = 0, hi = p.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m] <= d) lo = m; else hi = m; }
  return lo;
}
const _pt = { x: 0, y: 0, ang: 0 };
function pointAt(p, d, off = 0) {
  d = clamp(d, 0, p.len);
  const i = Math.min(findSeg(p, d), p.cum.length - 2);
  const L = p.cum[i + 1] - p.cum[i];
  const t = L > 0 ? (d - p.cum[i]) / L : 0;
  const a = p.angs[i];
  _pt.x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t - Math.sin(a) * off;
  _pt.y = p.ys[i] + (p.ys[i + 1] - p.ys[i]) * t + Math.cos(a) * off;
  _pt.ang = a;
  return _pt;
}
function placeEnemy(e) {
  const p = e.p, cum = p.cum;
  let i = e.seg;
  while (i < cum.length - 2 && cum[i + 1] <= e.d) i++;
  e.seg = i;
  const L = cum[i + 1] - cum[i];
  const t = L > 0 ? clamp((e.d - cum[i]) / L, 0, 1) : 0;
  const a = p.angs[i];
  e.x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t - Math.sin(a) * e.off;
  e.y = p.ys[i] + (p.ys[i + 1] - p.ys[i]) * t + Math.cos(a) * e.off;
  e.ang = a;
}

// ---------- Grid ----------
function setupGrid(map) {
  const grid = new Uint8Array(COLS * ROWS);
  const kind = new Array(COLS * ROWS).fill(null);
  const decor = [];
  const pathTiles = [];
  for (const wps of map.paths) {
    for (let i = 0; i < wps.length - 1; i++) {
      let [c, r] = wps[i];
      const [c2, r2] = wps[i + 1];
      const dc = Math.sign(c2 - c), dr = Math.sign(r2 - r);
      for (;;) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS && grid[r * COLS + c] !== C_PATH) {
          grid[r * COLS + c] = C_PATH; pathTiles.push([c, r]);
        }
        if (c === c2 && r === r2) break;
        c += dc; r += dr;
      }
    }
  }
  const water = (map.water || []).slice();
  if (map.river) for (let r = 0; r < ROWS; r++) for (const c of map.river) water.push([c, r]);
  for (const [c, r] of water) {
    const i = r * COLS + c;
    if (grid[i] === C_PATH) kind[i] = 'bridge';
    else { grid[i] = C_BLOCK; kind[i] = 'water'; }
  }
  for (const [c, r] of (map.lava || [])) { const i = r * COLS + c; grid[i] = C_BLOCK; kind[i] = 'lava'; }

  // Scenery blocks only tiles well away from the road, so prime spots stay open.
  const rng = mulberry32(hashStr(map.id + ':decor'));
  const styles = {
    forest: ['tree', 'tree', 'tree', 'rock'], river: ['tree', 'tree', 'rock', 'reed'],
    crystal: ['crystal', 'crystal', 'rock', 'tree'], ember: ['rock', 'spire', 'spire', 'rock'],
  }[map.decor];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    if (grid[i] !== C_FREE) continue;
    let near = 99;
    for (const [pc, pr] of pathTiles) near = Math.min(near, Math.max(Math.abs(pc - c), Math.abs(pr - r)));
    const roll = rng();
    if (near >= 2 && roll < 0.2) {
      grid[i] = C_BLOCK; kind[i] = 'decor';
      decor.push({ c, r, type: styles[Math.floor(rng() * styles.length)], s: rng(), block: true });
    } else if (roll > 0.72) {
      decor.push({ c, r, type: 'sprig', s: rng(), block: false });
    }
  }
  return { grid, kind, decor };
}

// ---------- Game lifecycle ----------
function newGame(mapId, diffId = 'knight', mode = 'campaign', opts = {}) {
  const map = MAPS.find(m => m.id === mapId) || MAPS[0];
  const diff = DIFFS[diffId] || DIFFS.knight;
  const { grid, kind, decor } = setupGrid(map);
  const paths = buildPaths(map);
  const p0 = paths[0];
  const keep = { x: p0.xs[p0.xs.length - 1], y: p0.ys[p0.ys.length - 1] };
  const portals = [];
  for (const p of paths) {
    const x = clamp(p.xs[0], 6, W - 6), y = clamp(p.ys[0], 6, H - 6);
    if (!portals.some(q => Math.hypot(q.x - x, q.y - y) < 10)) portals.push({ x, y, ang: p.angs[0] });
  }
  G = {
    map, diff, diffId, mode, endless: mode === 'endless', demo: !!opts.demo, headless: !!opts.headless,
    grid, kind, decor, paths, keep, portals,
    towerAt: new Array(COLS * ROWS).fill(null),
    gold: Math.round(map.startGold * diff.gold), lives: diff.lives, maxLives: diff.lives,
    wave: 0, waves: map.waves, waveCache: {},
    towers: [], enemies: [], projectiles: [], zones: [], fx: [], particles: [], texts: [],
    spawners: [], nextWaveT: -1, time: 0, over: false, won: false,
    spells: { starfall: { cd: 0 }, snare: { cd: 0 } },
    stats: { kills: 0, gold: 0, leaked: 0, built: 0, spent: 0, maxWave: 0 },
    seen: {}, shake: 0, keepHit: 0, uid: 1, bosses: [],
  };
  return G;
}

function getWave(w) {
  if (!G.waveCache[w]) {
    const gen = G.demo ? 3 + ((w - 1) % 9) : w;
    G.waveCache[w] = makeWave(G.map, gen, G.endless);
  }
  return G.waveCache[w];
}
const wavesLeft = () => G.endless || G.demo || G.wave < G.waves;
const spawning = () => G.spawners.some(s => !s.done);
const canCallWave = () => !G.over && wavesLeft() && !spawning();

function startNextWave(early = false) {
  if (!canCallWave()) return false;
  if (early && G.nextWaveT > 0) {
    const bonus = Math.round(G.nextWaveT * (1.2 + G.wave * 0.12));
    if (bonus > 0) { addGold(bonus); floatText(ROT ? 40 : W / 2, ROT ? H / 2 : 40, `+${bonus} early call`, '#FFD84D', 15); sfx('coin'); }
  }
  const w = ++G.wave;
  G.stats.maxWave = Math.max(G.stats.maxWave, w);
  const def = getWave(w);
  G.spawners.push({
    w, done: false, cleared: false, alt: 0,
    groups: def.groups.map(g => ({ ...g, n: 0, t: -g.delay })),
  });
  G.nextWaveT = -1;
  for (const t of G.towers) {
    t.fresh = false;
    if (t.stats.goldWave) { addGold(t.stats.goldWave); floatText(upx(t.x, 22), upy(t.y, 22), `+${t.stats.goldWave}`, '#FFF06B'); }
  }
  sfx(def.bosses ? 'boss' : 'horn');
  emit('wave', { w, bosses: def.bosses });
  return true;
}

function addGold(n) { G.gold += n; G.stats.gold += n; }

// ---------- Enemies ----------
function spawnEnemy(type, pi, w, o = {}) {
  const def = ENEMIES[type];
  const p = G.paths[pi];
  const scale = def.boss ? Math.pow(hpScale(G.map, w), 0.8) : hpScale(G.map, w);
  const hp = def.hp * scale * G.diff.hp * (G.demo ? 0.8 : 1);
  const e = {
    id: G.uid++, type, def, p, pi, d: o.d || 0, seg: 0,
    off: o.off !== undefined ? o.off : (def.boss ? 0 : rand(-9, 9)),
    hp, maxHp: hp, speed: def.speed * (1 + Math.min(0.2, 0.004 * w)),
    armor: def.armor, ward: def.ward,
    gold: Math.max(1, Math.round(def.gold * (1 + 0.03 * (w - 1)) * G.diff.bounty)),
    lives: def.lives, size: def.size, flying: !!def.flying, z: def.flying ? (def.boss ? 26 : 18) : 0,
    boss: !!def.boss, wave: w, x: 0, y: 0, ang: 0,
    slow: 0, slowT: 0, brittle: 0, frozenT: 0, stunT: 0, rootT: 0,
    burnDps: 0, burnT: 0, burnSrc: null, phoenix: 0, weak: 0, weakT: 0,
    phased: false, phaseT: def.phase ? rand(1.5, def.phase.every) : 0,
    abilT: def.heal ? def.heal.every : def.summon ? def.summon.every * 0.6 : def.stomp ? def.stomp.every * 0.5 : 0,
    hit: 0, anim: Math.random() * 10, dead: false,
  };
  if (e.d > 0) e.seg = findSeg(p, e.d);
  placeEnemy(e);
  G.enemies.push(e);
  if (e.boss) G.bosses.push(e);
  if (!def.minor && !G.seen[type]) { G.seen[type] = true; emit('intro', type); }
  return e;
}

function hurt(e, amt, type, src, o) {
  if (e.dead || e.phased) return 0;
  let m = 1;
  if (type === 'phys') m = 1 - e.armor * (1 - ((o && o.pierce) || 0));
  else if (type === 'magic') m = 1 - e.ward;
  else if (type === 'fire') m = (1 - (e.def.fireRes || 0)) * (1 - e.armor * 0.5);
  if (e.weakT > 0) m *= 1 + e.weak;
  if (e.brittle > 0 && e.slowT > 0) m *= 1 + e.brittle;
  const dmg = amt * m;
  e.hp -= dmg;
  if (!(o && o.dot)) e.hit = 0.1;
  if (src) src.dealt += dmg;
  if (e.hp <= 0) kill(e, src);
  return dmg;
}

function kill(e, src) {
  if (e.dead) return;
  e.dead = true; e.hp = 0;
  let gold = e.gold;
  for (const t of G.towers) {
    if (t.stats.bounty && d2(t.x, t.y, e.x, e.y) <= t.range * t.range) { gold = Math.round(gold * (1 + t.stats.bounty)); break; }
  }
  addGold(gold);
  G.stats.kills++;
  if (src) src.kills++;
  floatText(upx(e.x, e.z + 10), upy(e.y, e.z + 10), `+${gold}`, '#FFD36B');
  const ex = upx(e.x, e.z), ey = upy(e.y, e.z);
  burst(ex, ey, e.def.color, e.boss ? 60 : 8 + e.size, e.boss ? 260 : 120, e.boss ? 4 : 2.5);
  ring(ex, ey, 4, e.size * 2.2, 0.35, e.def.color, 2);
  sfx('pop');
  if (e.def.split) {
    sfx('split');
    for (let k = 0; k < e.def.split.count; k++) {
      spawnEnemy(e.def.split.type, e.pi, e.wave, { d: Math.max(0, e.d + (k ? 8 : -8)), off: clamp(e.off + rand(-8, 8), -12, 12) });
    }
  }
  if (e.burnT > 0 && e.phoenix > 0) {
    const R = 1.2 * T, dmg = e.phoenix;
    ring(e.x, e.y, 6, R, 0.4, '#FFC23D', 3);
    burst(e.x, e.y, '#FFC23D', 18, 160, 3);
    for (let i = 0, n = G.enemies.length; i < n; i++) {
      const o = G.enemies[i];
      if (o.dead || o.flying || d2(o.x, o.y, e.x, e.y) > R * R) continue;
      o.burnDps = Math.max(o.burnDps, dmg * 0.25); o.burnT = 2; o.burnSrc = e.burnSrc; o.phoenix = Math.max(o.phoenix, e.phoenix);
      hurt(o, dmg, 'fire', e.burnSrc);
    }
  }
  if (e.boss) {
    G.shake = Math.max(G.shake, 16);
    sfx('bossdie');
    for (let k = 0; k < 4; k++) ring(e.x, e.y, 10, 90 + k * 40, 0.6 + k * 0.15, k % 2 ? '#FFFFFF' : e.def.color, 3);
    emit('bossDown', e);
  }
}

function leak(e) {
  e.dead = true;
  if (G.demo) return;
  G.lives = Math.max(0, G.lives - e.lives);
  G.stats.leaked += e.lives;
  G.shake = Math.max(G.shake, e.boss ? 18 : 7);
  G.keepHit = 1;
  sfx('leak');
  burst(G.keep.x, G.keep.y, '#FF4D5E', 16, 160, 3);
  emit('leak', e);
  if (G.lives <= 0 && !G.over) { G.over = true; G.won = false; sfx('defeat'); emit('end', false); }
}

function updateEnemies(dt) {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    e.anim += dt;
    e.hit = Math.max(0, e.hit - dt);
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slow = 0; e.brittle = 0; } }
    if (e.frozenT > 0) e.frozenT -= dt;
    if (e.stunT > 0) e.stunT -= dt;
    if (e.rootT > 0) e.rootT -= dt;
    if (e.weakT > 0) e.weakT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt;
      hurt(e, e.burnDps * dt, 'fire', e.burnSrc, { dot: true });
      if (e.burnT <= 0) { e.burnDps = 0; e.phoenix = 0; }
      if (Math.random() < dt * 14) particle(upx(e.x, e.z) + rand(-5, 5), upy(e.y, e.z) + rand(-5, 5), rand(-10, 10) + UP.x * 35, rand(-10, 10) + UP.y * 35, 0.5, 2.2, '#FF7A2B', 'ember');
      if (e.dead) continue;
    }
    const def = e.def;
    const onBoard = e.d > T * 0.6;
    if (def.regen && e.burnT <= 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.regen * dt);
    if (def.phase && onBoard) {
      e.phaseT -= dt;
      if (e.phaseT <= 0) {
        e.phased = !e.phased;
        e.phaseT = e.phased ? def.phase.dur : def.phase.every;
        if (e.phased) { burst(e.x, e.y, def.color, 8, 60, 2); sfx('phase'); }
      }
    }
    if (def.heal && onBoard) {
      e.abilT -= dt;
      if (e.abilT <= 0) {
        e.abilT = def.heal.every;
        const R = def.heal.radius * T;
        ring(e.x, e.y, 6, R, 0.6, def.color, 2);
        for (let j = 0; j < list.length; j++) {
          const o = list[j];
          if (o.dead || (o.def.heal && o !== e) || o.hp >= o.maxHp || d2(o.x, o.y, e.x, e.y) > R * R) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct * (o.boss ? 0.15 : 1));
          particle(upx(o.x, o.z + 8), upy(o.y, o.z + 8), UP.x * 30, UP.y * 30, 0.7, 3, def.color, 'plus');
        }
        sfx('heal');
      }
    }
    if (def.summon && onBoard) {
      e.abilT -= dt;
      if (e.abilT <= 0) {
        e.abilT = def.summon.every;
        for (let k = 0; k < def.summon.count; k++) {
          spawnEnemy(def.summon.type, e.pi, e.wave, { d: Math.max(0, e.d - 14 - k * 12), off: rand(-12, 12) });
        }
        ring(e.x, e.y, 10, 60, 0.6, def.color, 3);
        burst(e.x, e.y, def.color, 14, 90, 2.5);
        sfx('summon');
      }
    }
    if (def.stomp && onBoard) {
      e.abilT -= dt;
      if (e.abilT <= 0) {
        e.abilT = def.stomp.every;
        const R = def.stomp.radius * T;
        for (const t of G.towers) if (d2(t.x, t.y, e.x, e.y) <= R * R) t.disabledT = Math.max(t.disabledT, def.stomp.dur);
        ring(e.x, e.y, 10, R, 0.55, '#FF4040', 5);
        ring(e.x, e.y, 6, R * 0.7, 0.45, '#FFB347', 3);
        burst(e.x, e.y, '#FFB347', 20, 200, 3);
        G.shake = Math.max(G.shake, 10);
        sfx('stomp');
      }
    }
    let f = e.slowT > 0 ? 1 - e.slow : 1;
    if (e.frozenT > 0 || e.stunT > 0 || e.rootT > 0) f = 0;
    e.d += e.speed * T * f * dt;
    if (e.d >= e.p.len) { leak(e); continue; }
    placeEnemy(e);
  }
}

// ---------- Towers ----------
function canBuild(c, r) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && G.grid[r * COLS + c] === C_FREE && !G.towerAt[r * COLS + c];
}
function refreshTower(t) {
  t.stats = t.branch >= 0 ? t.def.branches[t.branch] : t.def.levels[t.level];
  t.range = t.stats.range * T * t.buff.range;
  t.color = t.branch >= 0 ? t.stats.color : t.def.color;
  t.attack = t.stats.attack || t.def.attack;
}
function recomputeBuffs() {
  for (const t of G.towers) { t.buff = { dmg: 1, rate: 1, range: 1 }; refreshTower(t); }
  const beacons = G.towers.filter(t => t.def.attack === 'aura');
  for (const t of G.towers) {
    if (t.def.attack !== 'aura') {
      for (const b of beacons) {
        const s = b.stats, R = s.range * T;
        if (d2(t.x, t.y, b.x, b.y) > R * R + 1) continue;
        t.buff.dmg = Math.max(t.buff.dmg, 1 + s.bDmg);
        t.buff.rate = Math.max(t.buff.rate, 1 + s.bRate);
        t.buff.range = Math.max(t.buff.range, 1 + s.bRange);
      }
    }
    refreshTower(t);
  }
}
function makeTower(type, c, r) {
  const def = TOWERS[type];
  return {
    id: G.uid++, type, def, c, r, x: (c + 0.5) * T, y: (r + 0.5) * T,
    level: 0, branch: -1, spent: def.cost, cd: 0.3, ang: -Math.PI / 2, mode: 'first',
    disabledT: 0, kills: 0, dealt: 0, fresh: true, buff: { dmg: 1, rate: 1, range: 1 },
    recoil: 0, flash: 0, born: 0, firing: 0, tick: 0, target: null, stats: null, range: 0, color: def.color, attack: def.attack,
  };
}
function buildTower(type, c, r) {
  const def = TOWERS[type];
  if (!canBuild(c, r) || G.gold < def.cost) return null;
  const t = makeTower(type, c, r);
  G.gold -= def.cost;
  G.stats.spent += def.cost; G.stats.built++;
  G.towers.push(t);
  G.towerAt[r * COLS + c] = t;
  recomputeBuffs();
  ring(t.x, t.y, 8, 34, 0.4, def.color, 2);
  burst(t.x, t.y, def.color, 14, 110, 2.2);
  sfx('build');
  emit('built', t);
  return t;
}
function upgradeCost(t, branch = -1) {
  if (t.branch >= 0) return null;
  if (t.level < 2) return t.def.levels[t.level + 1].cost;
  return branch >= 0 ? t.def.branches[branch].cost : null;
}
function upgradeTower(t, branch = -1) {
  const cost = upgradeCost(t, branch);
  if (cost == null || G.gold < cost) return false;
  G.gold -= cost; t.spent += cost; G.stats.spent += cost;
  if (t.level < 2) t.level++;
  else t.branch = branch;
  recomputeBuffs();
  t.born = 0.4;
  ring(t.x, t.y, 6, 40, 0.5, t.color, 3);
  burst(t.x, t.y, t.color, 22, 140, 2.5);
  sfx('upgrade');
  return true;
}
function sellValue(t) { return t.fresh ? t.spent : Math.floor(t.spent * 0.7); }
function sellTower(t) {
  const v = sellValue(t);
  addGold(v); G.stats.gold -= v;
  G.towers.splice(G.towers.indexOf(t), 1);
  G.towerAt[t.r * COLS + t.c] = null;
  recomputeBuffs();
  floatText(upx(t.x, 16), upy(t.y, 16), `+${v}`, '#FFD36B');
  burst(t.x, t.y, t.color, 16, 120, 2);
  sfx('sell');
}

function canHit(t, e) {
  return !e.dead && !e.phased && (e.flying ? t.def.air : t.def.ground);
}
function priority(t, e) {
  switch (t.mode) {
    case 'last': return e.p.len - e.d;
    case 'strong': return e.hp;
    case 'close': return -d2(t.x, t.y, e.x, e.y);
    default: return e.d - e.p.len;
  }
}
function acquire(t, exclude) {
  const R = t.range;
  let best = null, bv = -Infinity;
  for (let i = 0, n = G.enemies.length; i < n; i++) {
    const e = G.enemies[i];
    if (!canHit(t, e) || (exclude && exclude.includes(e))) continue;
    const rr = R + e.size * 0.5;
    if (d2(t.x, t.y, e.x, e.y) > rr * rr) continue;
    const v = priority(t, e);
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}
function turnTo(t, x, y, dt, rate = 14) {
  const want = Math.atan2(y - t.y, x - t.x);
  const d = angDiff(t.ang, want);
  t.ang += clamp(d, -rate * dt, rate * dt);
}

function updateTowers(dt) {
  for (const t of G.towers) {
    t.recoil = Math.max(0, t.recoil - dt * 5);
    t.flash = Math.max(0, t.flash - dt * 4);
    t.born = Math.min(1, t.born + dt * 2.5);
    t.firing = Math.max(0, t.firing - dt);
    if (t.disabledT > 0) { t.disabledT -= dt; t.target = null; continue; }
    if (t.attack === 'aura') continue;
    if (t.attack === 'cone') { updateFlame(t, dt); continue; }
    const tg = t.target;
    if (tg && (!canHit(t, tg) || d2(t.x, t.y, tg.x, tg.y) > (t.range + tg.size) ** 2)) t.target = null;
    if (t.target) turnTo(t, upx(t.target.x, t.target.z), upy(t.target.y, t.target.z), dt);
    t.cd -= dt;
    if (t.cd > 0) continue;
    if (t.attack === 'pulse') {
      if (frostPulse(t)) t.cd = 1 / (t.stats.rate * t.buff.rate); else t.cd = 0;
      continue;
    }
    const target = acquire(t);
    t.target = target;
    if (!target) { t.cd = 0; continue; }
    t.cd = 1 / (t.stats.rate * t.buff.rate);
    t.ang = Math.atan2(upy(target.y, target.z) - t.y, upx(target.x, target.z) - t.x);
    fire(t, target);
  }
}

function fire(t, target) {
  const s = t.stats, dmg = (s.dmg || 0) * t.buff.dmg;
  t.flash = 1; t.recoil = 1;
  const mx = upx(t.x + Math.cos(t.ang) * 14, 4), my = upy(t.y + Math.sin(t.ang) * 14, 4);
  switch (t.attack) {
    case 'arrow': {
      const targets = [target];
      if (s.multishot) {
        while (targets.length < s.multishot) {
          const extra = acquire(t, targets);
          if (!extra) break;
          targets.push(extra);
        }
      }
      for (const e of targets) {
        G.projectiles.push({
          kind: 'arrow', x: mx, y: my, tx: upx(e.x, e.z), ty: upy(e.y, e.z), target: e, speed: s.crit ? 1100 : 760,
          dmg, pierce: s.pierce || 0, crit: s.crit || 0, critMult: s.critMult || 1, src: t, color: t.color, life: 2, trail: [],
        });
      }
      sfx(s.crit ? 'snipe' : 'arrow');
      break;
    }
    case 'bolt':
      G.projectiles.push({
        kind: 'bolt', x: upx(t.x, 16), y: upy(t.y, 16), tx: upx(target.x, target.z), ty: upy(target.y, target.z), target, speed: s.splash ? 320 : 440,
        dmg, splash: s.splash ? s.splash * T : 0, weaken: s.weaken || 0, src: t, color: t.color, life: 3, trail: [],
        size: s.splash ? 7 : 4.5,
      });
      sfx(s.splash ? 'void' : 'bolt');
      break;
    case 'chain':
      chainLightning(t, target, dmg);
      sfx('zap');
      break;
    case 'shell': {
      const n = s.cluster || 1;
      for (let k = 0; k < n; k++) {
        const dist = Math.hypot(target.x - t.x, target.y - t.y);
        const dur = 0.45 + dist / 650 + k * 0.06;
        const lead = target.speed * T * (target.slowT > 0 ? 1 - target.slow : 1) * (target.frozenT > 0 || target.stunT > 0 || target.rootT > 0 ? 0 : 1) * dur;
        const p = pointAt(target.p, target.d + lead, target.off);
        let tx = p.x, ty = p.y;
        if (k > 0) { const a = rand(0, TAU), r = rand(18, 34); tx += Math.cos(a) * r; ty += Math.sin(a) * r; }
        G.projectiles.push({
          kind: 'shell', sx: mx, sy: my, x: mx, y: my, tx, ty, t: 0, dur, h: 0, arc: 40 + dist * 0.25,
          dmg, splash: s.splash * T, stun: s.stun || 0, burnGround: s.burnGround ? s.burnGround * t.buff.dmg : 0,
          src: t, color: t.color, big: !!s.burnGround,
        });
      }
      for (let k = 0; k < 6; k++) particle(mx, my, Math.cos(t.ang) * rand(30, 90) + rand(-20, 20), Math.sin(t.ang) * rand(30, 90) + rand(-20, 20), 0.6, 4, '#8a8aa8', 'smoke');
      sfx('cannon');
      break;
    }
  }
}

function chainLightning(t, first, dmg) {
  const s = t.stats, hit = [];
  const pts = [[upx(t.x, 18), upy(t.y, 18)]];
  let cur = first;
  for (let k = 0; k < s.chain && cur; k++) {
    hit.push(cur);
    pts.push([upx(cur.x, cur.z), upy(cur.y, cur.z)]);
    hurt(cur, dmg, 'magic', t);
    burst(upx(cur.x, cur.z), upy(cur.y, cur.z), t.color, 5, 90, 1.8);
    dmg *= s.chainFall;
    let best = null, bd = (2.2 * T) ** 2;
    for (let i = 0, n = G.enemies.length; i < n; i++) {
      const e = G.enemies[i];
      if (!canHit(t, e) || hit.includes(e)) continue;
      const dd = d2(cur.x, cur.y, e.x, e.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    cur = best;
  }
  G.fx.push({ kind: 'lightning', pts, life: 0.24, max: 0.24, color: t.color });
}

function frostPulse(t) {
  const s = t.stats, R = t.range;
  let any = false;
  for (let i = 0, n = G.enemies.length; i < n; i++) {
    const e = G.enemies[i];
    if (!canHit(t, e)) continue;
    const rr = R + e.size * 0.5;
    if (d2(t.x, t.y, e.x, e.y) > rr * rr) continue;
    any = true;
    const slow = e.boss ? s.slow * 0.5 : s.slow;
    if (slow >= e.slow || e.slowT <= 0.1) e.slow = slow;
    e.slowT = Math.max(e.slowT, s.slowDur);
    if (s.brittle) e.brittle = Math.max(e.brittle, s.brittle);
    if (s.freeze && !e.boss && e.frozenT <= 0 && Math.random() < s.freeze) {
      e.frozenT = s.freezeDur;
      burst(upx(e.x, e.z), upy(e.y, e.z), '#D2F4FF', 10, 80, 2);
      sfx('freeze');
    }
    hurt(e, s.dmg * t.buff.dmg, 'magic', t);
  }
  if (any) {
    t.flash = 1;
    ring(t.x, t.y, 10, R, 0.5, t.color, 2.5);
    for (let k = 0; k < 6; k++) {
      const a = rand(0, TAU), v = rand(40, R * 1.6);
      particle(t.x, t.y, Math.cos(a) * v, Math.sin(a) * v, 0.55, 2.2, t.color, 'shard');
    }
    sfx('frost');
  }
  return any;
}

function updateFlame(t, dt) {
  const s = t.stats;
  const tg = t.target;
  if (tg && (!canHit(t, tg) || d2(t.x, t.y, tg.x, tg.y) > (t.range + tg.size) ** 2)) t.target = null;
  t.tick -= dt;
  if (t.tick <= 0) {
    t.tick = 0.1;
    t.target = acquire(t);
    if (t.target) {
      const R = t.range, half = 0.45;
      const tick = s.dps * 0.1 * t.buff.dmg * t.buff.rate;
      const aim = Math.atan2(t.target.y - t.y, t.target.x - t.x);
      for (let i = 0, n = G.enemies.length; i < n; i++) {
        const e = G.enemies[i];
        if (!canHit(t, e)) continue;
        const dd = d2(t.x, t.y, e.x, e.y), rr = R + e.size * 0.5;
        if (dd > rr * rr) continue;
        if (dd > 400 && Math.abs(angDiff(aim, Math.atan2(e.y - t.y, e.x - t.x))) > half) continue;
        e.burnDps = Math.max(e.burnDps, s.burn * t.buff.dmg); e.burnT = 2; e.burnSrc = t;
        if (s.phoenix) e.phoenix = Math.max(e.phoenix, s.phoenix * t.buff.dmg);
        hurt(e, tick, 'fire', t);
      }
      t.firing = 0.16;
      sfx('flame');
    }
  }
  if (t.target) turnTo(t, t.target.x, t.target.y, dt, 10);
  if (t.firing > 0 && !G.headless) {
    const n = G.particles.length > 900 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const a = t.ang + rand(-0.32, 0.32), v = rand(t.range * 1.6, t.range * 2.5);
      particle(t.x + Math.cos(t.ang) * 12, t.y + Math.sin(t.ang) * 12 - 4, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.45), rand(3, 6), Math.random() < 0.35 ? '#FFD84D' : t.color, 'flame', 2.2);
    }
  }
}

// ---------- Projectiles ----------
function updateProjectiles(dt) {
  for (const pr of G.projectiles) {
    if (pr.dead) continue;
    if (pr.kind === 'shell') {
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.dur);
      pr.x = lerp(pr.sx, pr.tx, k); pr.y = lerp(pr.sy, pr.ty, k);
      pr.h = Math.sin(Math.PI * k) * pr.arc;
      if (k >= 1) { explodeShell(pr); pr.dead = true; }
      else if (!G.headless && Math.random() < 0.5) particle(upx(pr.x, pr.h), upy(pr.y, pr.h), rand(-8, 8), rand(-8, 8), 0.35, 2, pr.color, 'ember', 3);
      continue;
    }
    pr.life -= dt;
    const e = pr.target;
    if (e && canTrack(e)) { pr.tx = upx(e.x, e.z); pr.ty = upy(e.y, e.z); } else pr.target = null;
    const dx = pr.tx - pr.x, dy = pr.ty - pr.y, dist = Math.hypot(dx, dy), step = pr.speed * dt;
    pr.trail.push(pr.x, pr.y);
    if (pr.trail.length > 12) pr.trail.splice(0, 2);
    if (dist <= step + (pr.target ? pr.target.size * 0.5 : 2)) {
      pr.x = pr.tx; pr.y = pr.ty; pr.dead = true;
      impact(pr, pr.target);
    } else {
      pr.x += dx / dist * step; pr.y += dy / dist * step;
      pr.ang = Math.atan2(dy, dx);
    }
    if (pr.life <= 0) pr.dead = true;
  }
  G.projectiles = G.projectiles.filter(p => !p.dead);
}
const canTrack = e => !e.dead && !e.phased;

function impact(pr, e) {
  const t = pr.src;
  if (pr.kind === 'arrow') {
    if (!e) { burst(pr.x, pr.y, pr.color, 3, 40, 1.5); return; }
    let dmg = pr.dmg;
    if (pr.crit && Math.random() < pr.crit) {
      dmg *= pr.critMult;
      floatText(upx(e.x, e.z + 22), upy(e.y, e.z + 22), 'CRIT', '#4DFFD2', 13);
      burst(pr.x, pr.y, '#FFFFFF', 10, 150, 2);
    }
    hurt(e, dmg, 'phys', t, pr);
    burst(pr.x, pr.y, pr.color, 4, 70, 1.6);
  } else if (pr.kind === 'bolt') {
    if (pr.splash) {
      splash(pr.x - UP.x * (e ? e.z : 0), pr.y - UP.y * (e ? e.z : 0), pr.splash, pr.dmg, 'magic', t, { air: true, weaken: pr.weaken });
      ring(pr.x, pr.y, 6, pr.splash, 0.4, pr.color, 3);
      burst(pr.x, pr.y, pr.color, 16, 140, 2.4);
      sfx('boom');
    } else if (e) {
      hurt(e, pr.dmg, 'magic', t);
      burst(pr.x, pr.y, pr.color, 7, 90, 2);
    }
  }
}

function splash(x, y, R, dmg, type, src, o = {}) {
  for (let i = 0, n = G.enemies.length; i < n; i++) {
    const e = G.enemies[i];
    if (e.dead || e.phased || (e.flying && !o.air)) continue;
    const rr = R + e.size * 0.5, dd = d2(x, y, e.x, e.y);
    if (dd > rr * rr) continue;
    const fall = 1 - 0.4 * clamp(Math.sqrt(dd) / R, 0, 1);
    if (o.weaken) { e.weak = Math.max(e.weak, o.weaken); e.weakT = 3; }
    if (o.stun && !e.boss) e.stunT = Math.max(e.stunT, o.stun);
    hurt(e, dmg * fall, type, src, o);
  }
}

function explodeShell(pr) {
  splash(pr.tx, pr.ty, pr.splash, pr.dmg, 'phys', pr.src, { stun: pr.stun });
  ring(pr.tx, pr.ty, 4, pr.splash, 0.35, pr.color, 3);
  burst(pr.tx, pr.ty, pr.color, pr.big ? 22 : 12, pr.big ? 180 : 130, 2.6);
  burst(pr.tx, pr.ty, '#FFF2C2', 5, 60, 3);
  for (let k = 0; k < 4; k++) particle(pr.tx + rand(-8, 8), pr.ty + rand(-8, 8), rand(-20, 20), rand(-30, -5), rand(0.6, 1), rand(5, 9), '#6c6a86', 'smoke', 1.5);
  if (pr.burnGround) G.zones.push({ x: pr.tx, y: pr.ty, r: pr.splash * 0.85, dps: pr.burnGround, t: 3, max: 3, src: pr.src });
  if (pr.stun) for (let k = 0; k < 6; k++) { const a = rand(0, TAU); particle(pr.tx, pr.ty, Math.cos(a) * 120, Math.sin(a) * 120, 0.25, 2, '#FFF6A0', 'spark', 4); }
  G.shake = Math.max(G.shake, pr.big ? 4 : 2);
  sfx('boom');
}

function updateZones(dt) {
  for (const z of G.zones) {
    z.t -= dt;
    for (let i = 0, n = G.enemies.length; i < n; i++) {
      const e = G.enemies[i];
      if (e.dead || e.flying || d2(z.x, z.y, e.x, e.y) > z.r * z.r) continue;
      hurt(e, z.dps * dt, 'fire', z.src, { dot: true });
    }
    if (!G.headless && Math.random() < dt * 30) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * z.r;
      particle(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, rand(-6, 6), rand(-40, -15), rand(0.4, 0.7), rand(2, 4), Math.random() < 0.5 ? '#FF6A2B' : '#FFC23D', 'ember');
    }
  }
  G.zones = G.zones.filter(z => z.t > 0);
}

// ---------- Spells ----------
function castSpell(id, x, y) {
  const sp = G.spells[id], def = SPELLS[id];
  if (!sp || sp.cd > 0 || G.over) return false;
  sp.cd = def.cd;
  const R = def.radius * T;
  if (id === 'starfall') {
    G.fx.push({ kind: 'meteor', x, y, t: 0, delay: 0.6, r: R, dmg: 130 + 32 * Math.max(1, G.wave), life: 1.6, max: 1.6, done: false });
    sfx('meteor');
  } else if (id === 'snare') {
    for (let i = 0, n = G.enemies.length; i < n; i++) {
      const e = G.enemies[i];
      if (e.dead || d2(x, y, e.x, e.y) > R * R) continue;
      if (e.boss) { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 2.5); }
      else e.rootT = 2.5;
    }
    G.fx.push({ kind: 'rune', x, y, r: R, life: 2.5, max: 2.5, color: def.color });
    ring(x, y, 4, R, 0.5, def.color, 3);
    sfx('snare');
  }
  return true;
}

// ---------- Effects ----------
function particle(x, y, vx, vy, life, size, color, kind = 'dot', drag = 2, grav = 0) {
  if (G.headless || G.particles.length > PARTICLE_CAP[QUALITY]) return;
  G.particles.push({ x, y, vx, vy, life, max: life, size, color, kind, drag, grav });
}
function burst(x, y, color, n, speed, size) {
  if (G.headless) return;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(0.25, 1) * speed;
    particle(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), size * rand(0.6, 1.2), color, i % 3 ? 'dot' : 'spark', 3);
  }
}
function ring(x, y, r0, r1, life, color, w = 2) {
  if (G.headless) return;
  G.fx.push({ kind: 'ring', x, y, r0, r1, life, max: life, color, w });
}
function floatText(x, y, text, color, size = 12) {
  if (G.headless) return;
  G.texts.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
}

function updateFx(dt) {
  for (const f of G.fx) {
    f.life -= dt;
    if (f.kind === 'meteor') {
      f.t += dt;
      if (!f.done && f.t >= f.delay) {
        f.done = true;
        for (let i = 0, n = G.enemies.length; i < n; i++) {
          const e = G.enemies[i];
          if (e.dead || e.phased || d2(f.x, f.y, e.x, e.y) > f.r * f.r) continue;
          hurt(e, f.dmg, 'magic', null);
        }
        ring(f.x, f.y, 10, f.r, 0.5, '#FFD84D', 5);
        ring(f.x, f.y, 6, f.r * 1.4, 0.7, '#FFFFFF', 2);
        burst(f.x, f.y, '#FFD84D', 40, 260, 3.2);
        burst(f.x, f.y, '#FF8A3D', 24, 180, 3);
        G.zones.push({ x: f.x, y: f.y, r: f.r * 0.7, dps: 0, t: 1.2, max: 1.2, src: null });
        G.shake = Math.max(G.shake, 12);
        sfx('impact');
      }
    }
  }
  G.fx = G.fx.filter(f => f.life > 0);
  for (const p of G.particles) {
    p.life -= dt;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const t of G.texts) { t.life -= dt; t.x += UP.x * 26 * dt; t.y += UP.y * 26 * dt; }
  G.texts = G.texts.filter(t => t.life > 0);
}

// ---------- Waves ----------
function updateSpawners(dt) {
  for (const sp of G.spawners) {
    if (sp.done) continue;
    let all = true;
    for (const g of sp.groups) {
      if (g.n >= g.count) continue;
      all = false;
      g.t += dt;
      while (g.n < g.count && g.t >= g.n * g.gap) {
        let pi = 0;
        if (g.path === 'alt') pi = (sp.alt++) % G.paths.length;
        else pi = g.path % G.paths.length;
        spawnEnemy(g.type, pi, sp.w);
        g.n++;
      }
    }
    if (all) sp.done = true;
  }
  for (const sp of G.spawners) {
    if (sp.done && !sp.cleared && !G.enemies.some(e => e.wave === sp.w && !e.dead)) {
      sp.cleared = true;
      if (!G.demo) {
        const bonus = 15 + sp.w * 4;
        addGold(bonus);
        floatText(upx(G.keep.x, 34), upy(G.keep.y, 34), `Wave ${sp.w} cleared +${bonus}`, '#FFD84D', 13);
        sfx('wave');
      }
      emit('cleared', sp.w);
    }
  }
  G.spawners = G.spawners.filter(s => !s.cleared);
}

// ---------- Main step ----------
function update(dt) {
  if (!G || G.over) return;
  G.time += dt;
  if (G.wave > 0) for (const k in G.spells) G.spells[k].cd = Math.max(0, G.spells[k].cd - dt);
  updateSpawners(dt);
  updateEnemies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateZones(dt);
  updateFx(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  G.bosses = G.bosses.filter(e => !e.dead);
  G.shake = Math.max(0, G.shake - dt * 30);
  G.keepHit = Math.max(0, G.keepHit - dt * 2);

  if (G.over) return;
  if (!spawning() && G.wave > 0 && wavesLeft()) {
    if (G.nextWaveT < 0) G.nextWaveT = G.demo ? 4 : NEXT_WAVE_DELAY;
    G.nextWaveT -= dt;
    if (G.nextWaveT <= 0) startNextWave(false);
  }
  if (!G.endless && !G.demo && G.wave >= G.waves && !G.spawners.length && !G.enemies.length) {
    G.over = true; G.won = true;
    sfx('victory');
    emit('end', true);
  }
}

// ---------- Battle save ----------
// A battle in progress as plain data, so it can be stored and picked up later.
// Links between objects (an enemy's definition, its road, the tower that set it
// burning) are stored as names and ids and rebuilt on load. Shots in flight and
// sparks are left out: they last under a second.
const BATTLE_VERSION = 1;
function plainFields(o, skip) {
  const out = {};
  for (const k in o) {
    const v = o[k];
    if ((typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') && !skip.includes(k)) out[k] = v;
  }
  return out;
}
function serializeBattle() {
  if (!G || G.demo || G.over) return null;
  return {
    v: BATTLE_VERSION, mapId: G.map.id, diff: G.diffId, mode: G.mode,
    gold: G.gold, lives: G.lives, wave: G.wave, nextWaveT: G.nextWaveT, time: G.time, uid: G.uid,
    spells: { starfall: G.spells.starfall.cd, snare: G.spells.snare.cd },
    stats: G.stats, seen: G.seen,
    towers: G.towers.map(t => plainFields(t, ['x', 'y', 'range', 'color', 'attack'])),
    enemies: G.enemies.filter(e => !e.dead).map(e => ({ ...plainFields(e, ['x', 'y', 'ang', 'seg', 'hit', 'dead']), burnSrc: e.burnSrc ? e.burnSrc.id : 0 })),
    spawners: G.spawners,
    zones: G.zones.map(z => ({ ...plainFields(z, []), src: z.src ? z.src.id : 0 })),
  };
}
function validBattle(s) {
  return !!s && s.v === BATTLE_VERSION && MAPS.some(m => m.id === s.mapId) && !!DIFFS[s.diff] &&
    Array.isArray(s.towers) && Array.isArray(s.enemies) && Array.isArray(s.spawners);
}
// Rebuilds G from saved data. Returns false, leaving G unusable, if the data is bad.
function restoreBattle(s) {
  if (!validBattle(s)) return false;
  newGame(s.mapId, s.diff, s.mode);
  const byId = new Map();
  for (const o of s.towers) {
    const def = TOWERS[o.type];
    if (!def || !canBuild(o.c, o.r) || !def.levels[o.level] || !(o.branch >= -1 && o.branch < def.branches.length)) continue;
    const t = Object.assign(makeTower(o.type, o.c, o.r), o, { target: null });
    G.towers.push(t);
    G.towerAt[t.r * COLS + t.c] = t;
    byId.set(t.id, t);
  }
  recomputeBuffs();
  for (const o of s.enemies) {
    const def = ENEMIES[o.type], p = G.paths[o.pi];
    if (!def || !p || !(o.hp > 0)) continue;
    const e = Object.assign({}, o, { def, p, burnSrc: byId.get(o.burnSrc) || null, seg: findSeg(p, o.d), x: 0, y: 0, ang: 0, hit: 0, dead: false });
    placeEnemy(e);
    G.enemies.push(e);
    if (e.boss) G.bosses.push(e);
  }
  G.spawners = s.spawners.map(sp => ({ ...sp, groups: sp.groups.map(g => ({ ...g })) }));
  G.zones = (s.zones || []).map(z => ({ ...z, src: byId.get(z.src) || null }));
  Object.assign(G.stats, s.stats || {});
  Object.assign(G, {
    gold: s.gold, lives: s.lives, wave: s.wave, nextWaveT: s.nextWaveT, time: s.time,
    uid: Math.max(G.uid, s.uid || 0), seen: s.seen || {},
  });
  G.spells.starfall.cd = (s.spells && s.spells.starfall) || 0;
  G.spells.snare.cd = (s.spells && s.spells.snare) || 0;
  return true;
}
