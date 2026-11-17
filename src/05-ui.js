// ===================================================================
// UI: HUD, sidebar, inspector, screens, input, tutorial, save
// ===================================================================

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');

const UIState = {
  screen: 'title', placing: null, selected: null, hover: null, spell: null, pendingTouch: null,
  speed: 1, paused: false, mapId: 'vale', diff: 'knight', mode: 'campaign', infoType: null,
};

// ---------- Save ----------
const SAVE_KEY = 'lumen-keep.v1';
let Save = { maps: {}, settings: { sfx: true, music: true }, tutorial: false };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') Save = Object.assign(Save, s, { settings: Object.assign(Save.settings, s.settings || {}) });
  } catch (e) { /* storage blocked: play without saving */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(Save)); } catch (e) { /* ignore */ } }
// The battle in progress is stored separately, so a broken battle save can
// never cost the player their unlocked maps and stars.
const BATTLE_KEY = 'lumen-keep.battle.v1';
const roundNums = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);
function saveBattle() {
  if (!G || G.demo) return;
  if (G.over) { clearBattle(); return; }
  const data = serializeBattle();
  if (!data) return;
  data.speed = UIState.speed;
  try { localStorage.setItem(BATTLE_KEY, JSON.stringify(data, roundNums)); } catch (e) { /* storage full or blocked */ }
}
function loadBattle() {
  try {
    const s = JSON.parse(localStorage.getItem(BATTLE_KEY) || 'null');
    return validBattle(s) ? s : null;
  } catch (e) { return null; }
}
function clearBattle() { try { localStorage.removeItem(BATTLE_KEY); } catch (e) { /* ignore */ } }
const mapRec = id => (Save.maps[id] = Save.maps[id] || { stars: 0, legend: false, best: 0 });
const mapUnlocked = i => i === 0 || (Save.maps[MAPS[i - 1].id] || {}).stars > 0;

// ---------- Screens ----------
const SCREENS = ['scrTitle', 'scrMaps', 'scrPause', 'scrEnd', 'scrHelp'];
let helpReturn = 'title';
function show(screen) {
  UIState.screen = screen;
  const map = { title: 'scrTitle', maps: 'scrMaps', pause: 'scrPause', end: 'scrEnd', help: 'scrHelp' };
  for (const id of SCREENS) $(id).hidden = map[screen] !== id;
  const inGame = G && !G.demo;
  $('app').classList.toggle('on-title', !inGame);
  requestAnimationFrame(resizeCanvas);
  if (screen === 'maps') buildMapScreen();
  if (screen === 'title') refreshContinue();
}

function toTitle() {
  startDemo();
  show('title');
}

// ---------- Demo battle behind the title ----------
function startDemo() {
  newGame('vale', 'knight', 'campaign', { demo: true });
  G.gold = 1e9;
  const plan = [
    ['archer', 3, 5, 0], ['mage', 5, 5, 0], ['bombard', 7, 7, 0], ['frost', 10, 4, 1], ['flame', 13, 5, 0],
    ['mage', 8, 4, 1], ['archer', 15, 6, 1], ['beacon', 6, 6, 0], ['archer', 3, 3, -1], ['frost', 5, 9, -1],
    ['bombard', 12, 7, 1], ['flame', 10, 7, 1], ['mage', 15, 9, -1], ['archer', 16, 7, 0],
  ];
  for (const [type, c, r, br] of plan) {
    const t = buildTower(type, c, r);
    if (!t) continue;
    upgradeTower(t); upgradeTower(t);
    if (br >= 0) upgradeTower(t, br);
    t.born = 1;
  }
  G.particles.length = 0; G.fx.length = 0;
  startNextWave();
  UIState.selected = null; UIState.placing = null; UIState.spell = null;
  hideInspect();
}

// ---------- Starting a battle ----------
function startBattle(mapId, diff, mode) {
  Sound.init();
  clearBattle();
  UIState.mapId = mapId; UIState.diff = diff; UIState.mode = mode;
  newGame(mapId, diff, mode);
  enterBattleUI();
  tutorial('start');
}

// Picks up a saved battle, paused behind a welcome-back screen.
function resumeBattle(s) {
  Sound.init();
  let ok = false;
  try { ok = restoreBattle(s); } catch (e) { ok = false; }
  if (!ok) { clearBattle(); toTitle(); return false; }
  UIState.mapId = s.mapId; UIState.diff = s.diff; UIState.mode = s.mode;
  enterBattleUI();
  setSpeed(s.speed >= 1 && s.speed <= 3 ? s.speed : 1);
  UIState.paused = true;
  $('pauseTitle').textContent = 'Welcome back';
  show('pause');
  return true;
}

function enterBattleUI() {
  UIState.selected = null; UIState.placing = null; UIState.spell = null; UIState.pendingTouch = null;
  UIState.paused = false; $('paused-tag').hidden = true;
  hideInspect();
  $('intro').hidden = true; introQueue.length = 0;
  $('toast').hidden = true;
  $('bossbar').hidden = true;
  buildSide();
  show('game');
  lastGold = -1; lastLives = -1;
  updateWaveButton(true);
}

// ---------- Sidebar ----------
function buildSide() {
  $('buildGrid').innerHTML = TOWER_ORDER.map(k => {
    const d = TOWERS[k];
    return `<button type="button" class="bcard" data-type="${k}" style="--c:${d.color}" title="${esc(d.name)}: ${esc(d.blurb)}">
      <span class="key">${d.key}</span><img src="${iconURL('tower', k)}" alt=""><span class="nm">${esc(d.short)}</span>
      <span class="cost">${d.cost}</span></button>`;
  }).join('');
  $('spellRow').innerHTML = Object.entries(SPELLS).map(([id, s]) => `
    <button type="button" class="spell" data-spell="${id}" style="--c:${s.color}" title="${esc(s.name)}: ${esc(s.blurb)}">
      <span class="key">${s.key}</span><svg><use href="#i-${id}"/></svg><span class="nm">${esc(s.name)}</span>
      <span class="cdfill"></span><span class="cdtxt"></span></button>`).join('');
  showInfo(null);
  lastNextWaveKey = '';
}

$('buildGrid').addEventListener('click', ev => {
  const b = ev.target.closest('.bcard');
  if (!b) return;
  setPlacing(UIState.placing === b.dataset.type ? null : b.dataset.type);
});
$('buildGrid').addEventListener('pointerover', ev => {
  const b = ev.target.closest('.bcard');
  if (b && ev.pointerType === 'mouse') showInfo(b.dataset.type);
});
$('buildGrid').addEventListener('pointerleave', () => showInfo(UIState.placing));
$('spellRow').addEventListener('click', ev => {
  const b = ev.target.closest('.spell');
  if (b) armSpell(b.dataset.spell);
});

function setPlacing(type) {
  if (type && G.gold < TOWERS[type].cost) { toast(`Not enough gold for the <b>${esc(TOWERS[type].name)}</b>.`, 2200); sfx('deny'); return; }
  UIState.placing = type;
  UIState.spell = null;
  UIState.pendingTouch = null;
  if (type) select(null);
  for (const b of document.querySelectorAll('.bcard')) b.classList.toggle('on', b.dataset.type === type);
  for (const b of document.querySelectorAll('.spell')) b.classList.remove('on');
  showInfo(type);
  if (type) sfx('click');
}
function armSpell(id) {
  if (!G || G.demo) return;
  if (G.spells[id].cd > 0) { sfx('deny'); return; }
  UIState.spell = UIState.spell === id ? null : id;
  UIState.placing = null;
  for (const b of document.querySelectorAll('.bcard')) b.classList.remove('on');
  for (const b of document.querySelectorAll('.spell')) b.classList.toggle('on', b.dataset.spell === UIState.spell);
  if (UIState.spell) { select(null); toast(`Click the battlefield to cast <b>${esc(SPELLS[id].name)}</b>.`, 2200); }
}
function cancelAll() {
  setPlacing(null);
  UIState.spell = null;
  for (const b of document.querySelectorAll('.spell')) b.classList.remove('on');
  select(null);
}

function statRows(type, s) {
  const r = [];
  const pct = v => Math.round(v * 100) + '%';
  const range = ['Range', s.range.toFixed(1) + ' tiles'];
  switch (s.attack || TOWERS[type].attack) {
    case 'arrow':
      r.push(['Damage', s.multishot ? `${s.dmg} ×${s.multishot}` : s.dmg], ['Attacks', s.rate.toFixed(2) + '/s'], range);
      if (s.crit) r.push(['Crit', `${pct(s.crit)} for ×${s.critMult}`]);
      if (s.pierce) r.push(['Armor pierce', pct(s.pierce)]);
      break;
    case 'bolt':
      r.push(['Damage', s.dmg], ['Attacks', s.rate.toFixed(2) + '/s'], range);
      if (s.splash) r.push(['Blast', s.splash.toFixed(1) + ' tiles']);
      if (s.weaken) r.push(['Weaken', '+' + pct(s.weaken) + ' taken']);
      break;
    case 'chain':
      r.push(['Damage', s.dmg], ['Leaps', s.chain + ' foes'], ['Attacks', s.rate.toFixed(2) + '/s'], range);
      break;
    case 'shell':
      r.push(['Damage', s.cluster ? `${s.dmg} ×${s.cluster}` : s.dmg], ['Blast', s.splash.toFixed(2) + ' tiles'], ['Attacks', s.rate.toFixed(2) + '/s'], range);
      if (s.stun) r.push(['Stun', s.stun + 's']);
      if (s.burnGround) r.push(['Burning ground', s.burnGround + '/s']);
      break;
    case 'pulse':
      r.push(['Damage', s.dmg], ['Slow', pct(s.slow)], ['Pulses', s.rate.toFixed(1) + '/s'], range);
      if (s.freeze) r.push(['Freeze', pct(s.freeze)]);
      if (s.brittle) r.push(['Brittle', '+' + pct(s.brittle) + ' taken']);
      break;
    case 'cone':
      r.push(['Damage', s.dps + '/s'], ['Burn', s.burn + '/s'], range);
      if (s.phoenix) r.push(['Death blast', s.phoenix]);
      break;
    case 'aura':
      r.push(['Damage boost', '+' + pct(s.bDmg)], ['Aura', s.range.toFixed(1) + ' tiles']);
      if (s.bRate) r.push(['Speed boost', '+' + pct(s.bRate)]);
      if (s.bRange) r.push(['Range boost', '+' + pct(s.bRange)]);
      if (s.goldWave) r.push(['Gold per wave', '+' + s.goldWave]);
      if (s.bounty) r.push(['Bounty', '+' + pct(s.bounty)]);
      break;
  }
  return r;
}
function towerTags(def) {
  const tags = [];
  if (def.attack === 'aura') tags.push('Support');
  else {
    tags.push({ phys: 'Physical', magic: 'Magic', fire: 'Fire' }[def.dmgType]);
    tags.push(def.air ? 'Air + ground' : 'Ground only');
  }
  return tags;
}

function showInfo(type) {
  UIState.infoType = type;
  const el = $('info');
  if (!type) {
    el.innerHTML = `<h4>Build a tower</h4><p>Pick one above, then click an open tile beside the road. Hover a tower to read about it.</p>`;
    return;
  }
  const d = TOWERS[type];
  const rows = statRows(type, d.levels[0]);
  el.innerHTML = `<h4 style="color:${d.color}">${esc(d.name)}</h4><p>${esc(d.blurb)}</p>
    <div class="kv">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>
    <div class="tags">${towerTags(d).map(t => `<span class="tag">${t}</span>`).join('')}</div>`;
}

let lastNextWaveKey = '';
function renderNextWave() {
  const el = $('nextWave');
  const nextW = G.wave + 1;
  const done = !G.endless && G.wave >= G.waves;
  const key = done ? 'done' : 'w' + nextW;
  if (key === lastNextWaveKey) return;
  lastNextWaveKey = key;
  if (done) { el.innerHTML = `<div class="nw-head"><span>Final wave</span></div><div class="nw-list" style="color:var(--muted);font-size:13px">Clear the field to win.</div>`; return; }
  const wave = getWave(nextW);
  const chips = waveSummary(wave).map(([type, n]) => {
    const e = ENEMIES[type];
    return `<span class="chip" title="${esc(e.name)}: ${esc(e.blurb || '')}"><img src="${iconURL('enemy', type)}" alt="${esc(e.name)}">×${n}</span>`;
  }).join('');
  el.innerHTML = `<div class="nw-head"><span>Next · wave ${nextW}</span>${wave.bosses ? '<span class="boss-tag">Boss</span>' : ''}</div><div class="nw-list">${chips}</div>`;
}

// ---------- Inspector ----------
function select(t) {
  UIState.selected = t;
  if (!t) { hideInspect(); return; }
  renderInspect();
  sfx('click');
}
function hideInspect() { $('inspect').hidden = true; $('inspect').dataset.id = ''; }

function renderInspect() {
  const t = UIState.selected, el = $('inspect');
  if (!t || !G.towers.includes(t)) { hideInspect(); return; }
  const d = t.def, s = t.stats;
  const name = t.branch >= 0 ? s.name : d.name;
  const lvTxt = t.branch >= 0 ? 'Specialist' : `Level ${t.level + 1}`;
  const now = statRows(t.type, s);
  const next = t.level < 2 && t.branch < 0 ? statRows(t.type, d.levels[t.level + 1]) : null;
  const rows = now.map(([k, v], i) => {
    const n = next && next[i] && next[i][0] === k && String(next[i][1]) !== String(v) ? ` <em>→ ${next[i][1]}</em>` : '';
    return `<span>${k}</span><span>${v}${n}</span>`;
  }).join('');
  const boost = t.buff.dmg > 1 ? `<span>Beacon boost</span><span style="color:var(--gold)">+${Math.round((t.buff.dmg - 1) * 100)}% dmg${t.buff.rate > 1 ? `, +${Math.round((t.buff.rate - 1) * 100)}% speed` : ''}</span>` : '';
  let upgrade = '';
  if (t.branch >= 0) upgrade = `<p class="maxed">Fully upgraded</p>`;
  else if (t.level < 2) {
    const c = d.levels[t.level + 1].cost;
    upgrade = `<button type="button" class="up-btn" data-act="up" data-cost="${c}">Upgrade to level ${t.level + 2}<span class="cost">${c}</span></button>`;
  } else {
    upgrade = `<div class="branch-lbl">Choose a specialist</div><div class="branches">${d.branches.map((b, i) => `
      <button type="button" class="branch" data-act="branch" data-b="${i}" data-cost="${b.cost}" style="--c:${b.color}">
        <img src="${iconURL('tower', t.type, i)}" alt=""><b>${esc(b.name)}<span class="cost">${b.cost}</span></b><p>${esc(b.blurb)}</p>
      </button>`).join('')}</div>`;
  }
  const targeting = t.attack === 'aura' || t.attack === 'pulse' ? '' : `
    <div class="ins-row"><span class="lbl">Target</span><div class="seg" role="group" aria-label="Targeting">${TARGET_MODES.map(m =>
      `<button type="button" data-act="mode" data-mode="${m}" class="${t.mode === m ? 'on' : ''}">${TARGET_LABEL[m]}</button>`).join('')}</div></div>`;
  el.innerHTML = `
    <div class="ins-head" style="--c:${t.color}">
      <img src="${iconURL('tower', t.type, t.branch, t.level)}" alt="">
      <div><div class="ins-name">${esc(name)}</div><div class="ins-sub" id="insSub"></div></div>
      <button type="button" class="x" data-act="close" aria-label="Close">×</button>
    </div>
    <div class="ins-stats">${rows}${boost}</div>
    ${targeting}
    <div style="--c:${t.color}">${upgrade}</div>
    <button type="button" class="sell-btn" data-act="sell">Sell<span class="cost" id="insSell"></span></button>`;
  // Dock on the side of the screen away from the tower.
  const sxf = ROT ? 1 - t.y / H : t.x / W, syf = ROT ? t.x / W : t.y / H;
  el.classList.toggle('left', sxf > 0.5);
  el.classList.toggle('right', sxf <= 0.5);
  el.classList.toggle('sheet-top', syf > 0.5);
  el.hidden = false;
  el.dataset.id = t.id;
  updateInspectLive();
}
function updateInspectLive() {
  const t = UIState.selected;
  if (!t || $('inspect').hidden) return;
  const sub = $('insSub');
  if (sub) {
    const lv = t.branch >= 0 ? 'Specialist' : `Level ${t.level + 1}`;
    sub.textContent = t.attack === 'aura' ? lv : `${lv} · ${fmt(t.kills)} slain · ${fmt(t.dealt)} dmg`;
  }
  const sell = $('insSell');
  if (sell) sell.textContent = '+' + sellValue(t);
  for (const b of $('inspect').querySelectorAll('[data-cost]')) b.disabled = G.gold < +b.dataset.cost;
}
$('inspect').addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  const t = UIState.selected;
  if (!b || !t) return;
  const act = b.dataset.act;
  if (act === 'close') select(null);
  else if (act === 'up') { if (upgradeTower(t)) { renderInspect(); tutorial('upgraded'); } }
  else if (act === 'branch') { if (upgradeTower(t, +b.dataset.b)) renderInspect(); }
  else if (act === 'sell') { sellTower(t); select(null); }
  else if (act === 'mode') { t.mode = b.dataset.mode; renderInspect(); sfx('click'); }
});

// ---------- HUD ----------
let lastGold = -1, lastLives = -1;
function tickUI() {
  if (!G || G.demo) return;
  if (G.gold !== lastGold) {
    if (lastGold >= 0 && G.gold > lastGold) bump('statGold');
    lastGold = G.gold;
    $('hudGold').textContent = fmt(G.gold);
    for (const b of document.querySelectorAll('.bcard')) b.classList.toggle('poor', G.gold < TOWERS[b.dataset.type].cost);
  }
  if (G.lives !== lastLives) {
    if (lastLives >= 0 && G.lives < lastLives) bump('statLives');
    lastLives = G.lives;
    $('hudLives').textContent = G.lives;
  }
  $('hudWave').textContent = G.endless ? `${G.wave}` : `${Math.min(G.wave, G.waves)} / ${G.waves}`;
  updateWaveButton();
  renderNextWave();
  for (const b of document.querySelectorAll('.spell')) {
    const sp = G.spells[b.dataset.spell], def = SPELLS[b.dataset.spell];
    b.querySelector('.cdfill').style.transform = `scaleY(${sp.cd / def.cd})`;
    b.querySelector('.cdtxt').textContent = sp.cd > 0 ? Math.ceil(sp.cd) : '';
    b.classList.toggle('cooling', sp.cd > 0);
  }
  const boss = G.bosses[0];
  $('bossbar').hidden = !boss || G.over;
  if (boss) {
    $('bossName').textContent = boss.def.name;
    $('bossFill').style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  }
  if (UIState.selected && !G.towers.includes(UIState.selected)) select(null);
  updateInspectLive();
  Sound.intensity = G.enemies.length > 0 ? 1 : 0;
  if (G.wave >= 2 && G.gold >= 120) tutorial('spells');
}
function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

let lastWaveBtn = '';
function updateWaveButton(force) {
  const b = $('btnWave');
  let html, dis = false, pulse = false;
  if (G.over) { html = 'Battle over'; dis = true; }
  else if (G.wave === 0) { html = 'Start wave 1'; pulse = true; }
  else if (!wavesLeft()) { html = 'Final wave'; dis = true; }
  else if (spawning()) { html = `Wave ${G.wave} marching`; dis = true; }
  else {
    const s = Math.max(0, Math.ceil(G.nextWaveT));
    const bonus = Math.round(Math.max(0, G.nextWaveT) * (1.2 + G.wave * 0.12));
    html = `Call wave ${G.wave + 1} · ${s}s <small>+${bonus} gold</small>`;
  }
  if (html === lastWaveBtn && !force) return;
  lastWaveBtn = html;
  b.innerHTML = html;
  b.disabled = dis;
  b.classList.toggle('pulse', pulse);
}
$('btnWave').addEventListener('click', () => callWave());
function callWave() {
  if (!G || G.demo || UIState.screen !== 'game') return;
  if (startNextWave(G.wave > 0)) { updateWaveButton(true); tutorial('waveStarted'); }
}

$('speedSeg').addEventListener('click', ev => {
  const b = ev.target.closest('[data-speed]');
  if (b) setSpeed(+b.dataset.speed);
});
function setSpeed(n) {
  UIState.speed = n;
  for (const b of $('speedSeg').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.speed === n);
}
$('btnMenu').addEventListener('click', () => openPause());

function openPause() {
  if (!G || G.demo || G.over) return;
  saveBattle();
  $('pauseTitle').textContent = 'Paused';
  UIState.paused = true;
  show('pause');
}
function resume() {
  UIState.paused = false;
  $('paused-tag').hidden = true;
  show('game');
}
function tacticalPause() {
  if (UIState.screen !== 'game' || G.over) return;
  UIState.paused = !UIState.paused;
  $('paused-tag').hidden = !UIState.paused;
}

// ---------- Banner / intro / toast ----------
function banner(big, sub, boss) {
  const el = $('banner');
  el.innerHTML = `<div class="big">${esc(big)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
  el.className = boss ? 'boss' : '';
  void el.offsetWidth;
  el.classList.add('show');
}
const introQueue = [];
let introTimer = 0;
function showIntro(type) {
  if (introTimer) { introQueue.push(type); return; }
  const e = ENEMIES[type];
  const tags = [];
  if (e.flying) tags.push('Flies');
  if (e.armor) tags.push(`Armor ${Math.round(e.armor * 100)}%`);
  if (e.ward) tags.push(`Ward ${Math.round(e.ward * 100)}%`);
  if (e.speed >= 1.6) tags.push('Fast');
  if (e.lives > 1) tags.push(`Costs ${e.lives} lives`);
  const el = $('intro');
  el.style.setProperty('--c', e.color);
  el.innerHTML = `<img src="${iconURL('enemy', type)}" alt=""><div><div class="eyebrow">${e.boss ? 'Boss' : 'New foe'}</div><div class="nm">${esc(e.name)}</div>
    <p>${esc(e.blurb || '')}</p>${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}</div>`;
  el.hidden = false;
  introTimer = setTimeout(() => {
    el.hidden = true; introTimer = 0;
    if (introQueue.length) showIntro(introQueue.shift());
  }, 6500);
}
let toastTimer = 0;
function toast(html, ms = 5000) {
  const el = $('toast');
  el.innerHTML = html;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

const TUTORIAL = {
  start: 'Pick a tower on the right, or press <b>1</b>–<b>6</b>. Then click an open tile beside the road.',
  built: 'Good. Press <b>Start wave 1</b> when you are ready. After that, waves keep coming on a timer.',
  waveStarted: 'Click any tower to <b>upgrade</b> it, change who it targets, or sell it.',
  upgraded: 'At level 3, each tower can become one of two <b>specialists</b>. Choose to suit the foes ahead.',
  spells: 'Your spells are ready: <b>Q</b> drops a Starfall and <b>W</b> casts an Arcane Snare.',
};
const tutorialSeen = {};
function tutorial(step) {
  if (Save.tutorial || G.demo || G.map.id !== 'vale' || tutorialSeen[step]) return;
  const order = ['start', 'built', 'waveStarted', 'upgraded', 'spells'];
  const i = order.indexOf(step);
  if (i > 0 && !tutorialSeen[order[i - 1]] && step !== 'spells') return;
  tutorialSeen[step] = true;
  toast(TUTORIAL[step], step === 'start' ? 12000 : 8000);
  if (step === 'spells') { Save.tutorial = true; writeSave(); }
}

// ---------- Game events ----------
Hooks.wave = ({ w, bosses }) => {
  if (G.demo) return;
  if (bosses) banner(`Wave ${w}`, bosses.map(b => ENEMIES[b].name).join(' and ') + ' approaches', true);
  else banner(`Wave ${w}`, !G.endless && w === G.waves ? 'The final wave' : '');
};
Hooks.intro = type => { if (!G.demo) showIntro(type); };
Hooks.built = () => tutorial('built');
Hooks.leak = () => {};
Hooks.end = won => {
  clearBattle();
  setTimeout(() => showEnd(won), won ? 900 : 1200);
};

function showEnd(won) {
  if (!G || G.demo) return;
  select(null);
  UIState.placing = null; UIState.spell = null;
  $('intro').hidden = true; introQueue.length = 0;
  $('toast').hidden = true;
  $('bossbar').hidden = true;
  $('paused-tag').hidden = true;
  const rec = mapRec(G.map.id);
  const idx = MAPS.indexOf(G.map);
  let stars = 0;
  if (won) {
    const k = G.lives / G.maxLives;
    stars = k >= 0.9 ? 3 : k >= 0.5 ? 2 : 1;
    rec.stars = Math.max(rec.stars, stars);
    if (G.diffId === 'legend') rec.legend = true;
  }
  if (G.endless) rec.best = Math.max(rec.best, G.wave - 1);
  writeSave();
  const starSvg = i => `<svg class="${i < stars ? 'got' : ''}" style="animation-delay:${0.2 + i * 0.25}s"><use href="#i-star"/></svg>`;
  const statsHtml = `<div class="stat-grid">
    <div><b>${fmt(G.stats.kills)}</b><span>Foes slain</span></div>
    <div><b>${fmt(G.stats.gold)}</b><span>Gold earned</span></div>
    <div><b>${G.stats.built}</b><span>Towers built</span></div>
    <div><b>${G.lives}/${G.maxLives}</b><span>Lives kept</span></div></div>`;
  const next = MAPS[idx + 1];
  let html;
  if (won) {
    html = `<h2 class="win">Dawn breaks over ${esc(G.map.name)}</h2>
      <div class="big-stars">${[0, 1, 2].map(starSvg).join('')}</div>
      <p>${stars === 3 ? 'A flawless defense.' : stars === 2 ? 'The keep stands, scarred but proud.' : 'The keep stands, barely. Lose fewer lives for more stars.'}${G.diffId === 'legend' ? ' Won on Legend.' : ''}</p>
      ${statsHtml}
      <div class="menu">
        ${next ? `<button class="btn primary" data-end="next" type="button">Next: ${esc(next.name)}</button>` : ''}
        <button class="btn ${next ? '' : 'primary'}" data-end="endless" type="button">Play endless</button>
        <button class="btn" data-end="maps" type="button">Choose map</button>
      </div>`;
  } else if (G.endless) {
    html = `<h2 class="lose">The keep has fallen</h2>
      <p>You held ${esc(G.map.name)} for ${G.wave - 1} waves of the endless night. Your best is ${rec.best}.</p>${statsHtml}
      <div class="menu"><button class="btn primary" data-end="retry" type="button">Try again</button><button class="btn" data-end="maps" type="button">Choose map</button></div>`;
  } else {
    html = `<h2 class="lose">The keep has fallen</h2>
      <p>You held until wave ${G.wave} of ${G.waves}. Try placing towers where the road bends, so they fire longer, and mix damage types for armored foes.</p>${statsHtml}
      <div class="menu"><button class="btn primary" data-end="retry" type="button">Try again</button><button class="btn" data-end="maps" type="button">Choose map</button></div>`;
  }
  $('endCard').innerHTML = html;
  show('end');
}
$('endCard').addEventListener('click', ev => {
  const b = ev.target.closest('[data-end]');
  if (!b) return;
  const act = b.dataset.end, idx = MAPS.indexOf(G.map);
  if (act === 'next') startBattle(MAPS[idx + 1].id, UIState.diff, 'campaign');
  else if (act === 'endless') startBattle(G.map.id, UIState.diff, 'endless');
  else if (act === 'retry') startBattle(G.map.id, UIState.diff, UIState.mode);
  else { UIState.mapId = G.map.id; startDemo(); show('maps'); }
});

// ---------- Map select ----------
function buildMapScreen() {
  const grid = $('mapGrid');
  if (!mapUnlocked(MAPS.findIndex(m => m.id === UIState.mapId))) UIState.mapId = 'vale';
  grid.innerHTML = MAPS.map((m, i) => {
    const rec = Save.maps[m.id] || { stars: 0 };
    const locked = !mapUnlocked(i);
    const stars = [0, 1, 2].map(k => `<span class="${k < rec.stars ? '' : 'off'}">★</span>`).join('');
    return `<button type="button" class="map-card ${locked ? 'locked' : ''} ${m.id === UIState.mapId ? 'on' : ''}" data-map="${m.id}" style="--c:${m.accent}" ${locked ? 'aria-disabled="true"' : ''}>
      <canvas></canvas>
      <div class="body"><div class="nm">${esc(m.name)}</div>
      <div class="meta"><span>${m.waves} waves${m.paths.length > 1 ? ' · 2 roads' : ''}</span><span class="stars" aria-label="${rec.stars} of 3 stars">${stars}</span></div>
      <div class="${locked ? 'lock' : 'blurb'}">${locked ? `Win ${esc(MAPS[i - 1].name)} to unlock.` : esc(m.blurb)}</div>
      ${rec.legend ? '<div class="lock" style="color:var(--gold)">Won on Legend</div>' : ''}
      ${rec.best ? `<div class="lock">Endless best: wave ${rec.best}</div>` : ''}</div></button>`;
  }).join('');
  requestAnimationFrame(() => {
    grid.querySelectorAll('.map-card').forEach((card, i) => drawThumb(card.querySelector('canvas'), MAPS[i]));
  });
  $('diffSeg').innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button type="button" data-diff="${k}" class="${k === UIState.diff ? 'on' : ''}">${d.name}</button>`).join('');
  refreshOptions();
}
function refreshOptions() {
  $('diffNote').textContent = DIFFS[UIState.diff].note;
  const saved = loadBattle();
  const savedMap = saved && MAPS.find(m => m.id === saved.mapId);
  $('beginNote').textContent = saved ? `Replaces your unfinished battle on ${savedMap.name}, wave ${saved.wave}.` : '';
  const rec = Save.maps[UIState.mapId] || { stars: 0 };
  const endlessOk = rec.stars > 0;
  if (!endlessOk && UIState.mode === 'endless') UIState.mode = 'campaign';
  for (const b of $('modeSeg').querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.mode === UIState.mode);
    if (b.dataset.mode === 'endless') b.disabled = !endlessOk;
  }
  $('modeNote').textContent = UIState.mode === 'endless' ? 'Waves never stop. How long can you hold?' : endlessOk ? 'Fight every wave to win the map.' : 'Win this map to unlock Endless.';
}
$('mapGrid').addEventListener('click', ev => {
  const c = ev.target.closest('.map-card');
  if (!c || c.classList.contains('locked')) { if (c) sfx('deny'); return; }
  UIState.mapId = c.dataset.map;
  for (const el of $('mapGrid').querySelectorAll('.map-card')) el.classList.toggle('on', el === c);
  refreshOptions();
});
$('diffSeg').addEventListener('click', ev => {
  const b = ev.target.closest('[data-diff]');
  if (!b) return;
  UIState.diff = b.dataset.diff;
  for (const x of $('diffSeg').querySelectorAll('button')) x.classList.toggle('on', x === b);
  refreshOptions();
});
$('modeSeg').addEventListener('click', ev => {
  const b = ev.target.closest('[data-mode]');
  if (!b || b.disabled) return;
  UIState.mode = b.dataset.mode;
  refreshOptions();
});
$('btnBegin').addEventListener('click', () => startBattle(UIState.mapId, UIState.diff, UIState.mode));
$('btnMapsBack').addEventListener('click', () => show('title'));
$('btnPlay').addEventListener('click', () => { Sound.init(); show('maps'); });
$('btnContinue').addEventListener('click', () => {
  const s = loadBattle();
  if (!s || !resumeBattle(s)) refreshContinue();
});
function refreshContinue() {
  const s = loadBattle(), b = $('btnContinue');
  b.hidden = !s;
  $('btnPlay').classList.toggle('primary', !s);
  if (!s) return;
  const m = MAPS.find(x => x.id === s.mapId);
  b.innerHTML = `Continue <small>${esc(m.name)} · wave ${s.wave}${s.mode === 'endless' ? ' · Endless' : ''}</small>`;
}
$('btnHelpTitle').addEventListener('click', () => { helpReturn = 'title'; buildBestiary(); show('help'); });
$('btnHelpPause').addEventListener('click', () => { helpReturn = 'pause'; buildBestiary(); show('help'); });
$('btnHelpBack').addEventListener('click', () => show(helpReturn));
$('btnResume').addEventListener('click', resume);
$('btnRestart').addEventListener('click', () => startBattle(G.map.id, UIState.diff, UIState.mode));
$('btnQuit').addEventListener('click', () => { saveBattle(); UIState.paused = false; startDemo(); show('title'); });

function buildBestiary() {
  const el = $('bestiary');
  if (el.childElementCount) return;
  el.innerHTML = Object.entries(ENEMIES).filter(([, e]) => !e.minor).map(([k, e]) => `
    <div class="beast" style="--c:${e.color}"><img src="${iconURL('enemy', k)}" alt=""><div><b>${esc(e.name)}</b><p>${esc(e.blurb)}</p></div></div>`).join('');
}

// ---------- Settings toggles ----------
function syncToggles() {
  for (const b of document.querySelectorAll('[data-toggle]')) {
    const on = Save.settings[b.dataset.toggle];
    b.classList.toggle('on', on);
    b.querySelector('span').textContent = (b.dataset.toggle === 'sfx' ? 'Sound ' : 'Music ') + (on ? 'on' : 'off');
  }
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-toggle]');
  if (!b) return;
  const k = b.dataset.toggle;
  Save.settings[k] = !Save.settings[k];
  Sound.init();
  if (k === 'sfx') Sound.setSfx(Save.settings.sfx); else Sound.setMusic(Save.settings.music);
  writeSave();
  syncToggles();
});

// ---------- Canvas input ----------
function toWorld(ev) {
  const r = cv.getBoundingClientRect();
  const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
  const x = ROT ? fy * W : fx * W, y = ROT ? H - fx * H : fy * H;
  return { x, y, c: Math.floor(x / T), r: Math.floor(y / T) };
}
cv.addEventListener('pointermove', ev => {
  if (!G || G.demo) return;
  UIState.hover = toWorld(ev);
  const t = G.towerAt[UIState.hover.r * COLS + UIState.hover.c];
  cv.style.cursor = UIState.placing || UIState.spell ? 'crosshair' : t ? 'pointer' : 'default';
});
cv.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') UIState.hover = null; });
cv.addEventListener('contextmenu', ev => { ev.preventDefault(); if (G && !G.demo) cancelAll(); });
cv.addEventListener('pointerdown', ev => {
  if (!G || G.demo || UIState.screen !== 'game' || G.over) return;
  if (ev.button === 2) return;
  Sound.init();
  const p = toWorld(ev);
  UIState.hover = p;
  if (UIState.spell) {
    if (castSpell(UIState.spell, p.x, p.y)) {
      UIState.spell = null;
      for (const b of document.querySelectorAll('.spell')) b.classList.remove('on');
    }
    return;
  }
  if (UIState.placing) {
    const type = UIState.placing, def = TOWERS[type];
    if (!canBuild(p.c, p.r)) {
      const t = G.towerAt[p.r * COLS + p.c];
      if (t) { setPlacing(null); select(t); } else sfx('deny');
      return;
    }
    if (G.gold < def.cost) { toast(`Not enough gold for the <b>${esc(def.name)}</b>.`, 2000); sfx('deny'); return; }
    if (ev.pointerType === 'touch' && !(UIState.pendingTouch && UIState.pendingTouch.c === p.c && UIState.pendingTouch.r === p.r)) {
      UIState.pendingTouch = { c: p.c, r: p.r };
      return;
    }
    buildTower(type, p.c, p.r);
    UIState.pendingTouch = null;
    if (!ev.shiftKey || G.gold < def.cost) setPlacing(null);
    return;
  }
  const t = p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS ? G.towerAt[p.r * COLS + p.c] : null;
  select(t && t !== UIState.selected ? t : null);
});

// ---------- Keyboard ----------
window.addEventListener('keydown', ev => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key.toLowerCase();
  if (UIState.screen === 'pause' && (k === 'escape' || k === ' ')) { ev.preventDefault(); resume(); return; }
  if (UIState.screen === 'help' && k === 'escape') { show(helpReturn); return; }
  if (UIState.screen === 'maps' && k === 'escape') { show('title'); return; }
  if (UIState.screen !== 'game' || !G || G.demo) return;
  if (k >= '1' && k <= '6') { const type = TOWER_ORDER[+k - 1]; setPlacing(UIState.placing === type ? null : type); return; }
  switch (k) {
    case 'q': armSpell('starfall'); break;
    case 'w': armSpell('snare'); break;
    case 'escape':
      if (UIState.placing || UIState.spell || UIState.selected) cancelAll(); else openPause();
      break;
    case ' ': ev.preventDefault(); tacticalPause(); break;
    case 'n': case 'enter': callWave(); break;
    case 'f': setSpeed(UIState.speed % 3 + 1); break;
    case 'u': {
      const t = UIState.selected;
      if (t && t.level < 2 && t.branch < 0 && upgradeTower(t)) renderInspect();
      break;
    }
    case 't': {
      const t = UIState.selected;
      if (t && t.attack !== 'aura' && t.attack !== 'pulse') { t.mode = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % 4]; renderInspect(); }
      break;
    }
    case 'delete': case 'backspace': {
      const t = UIState.selected;
      if (t) { sellTower(t); select(null); }
      break;
    }
  }
});

document.addEventListener('pointerup', ev => {
  const b = ev.target.closest && ev.target.closest('button');
  if (b && UIState.screen === 'game') b.blur();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  saveBattle();
  if (G && !G.demo && UIState.screen === 'game' && !G.over) openPause();
});
window.addEventListener('pagehide', saveBattle);
window.addEventListener('beforeunload', saveBattle);
window.addEventListener('resize', () => requestAnimationFrame(resizeCanvas));
