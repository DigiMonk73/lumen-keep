const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + require('path').join(__dirname, '..', 'index.html'));
  await p.waitForTimeout(600);
  await p.click('#btnPlay');
  await p.click('#btnBegin');
  await p.waitForTimeout(300);
  const G = () => p.evaluate(() => { const g = window.__LK.G; return { gold: g.gold, wave: g.wave, towers: g.towers.map(t => [t.type, t.c, t.r, t.level, t.branch, t.mode]), lives: g.lives }; });
  const box = await p.locator('#cv').boundingBox();
  const at = (c, r) => [box.x + (c + 0.5) * 48 * box.width / 960, box.y + (r + 0.5) * 48 * box.height / 576];
  let s0 = await G();
  // Build archer via card then tile
  await p.click('.bcard[data-type="archer"]');
  await p.mouse.click(...at(3, 3));
  let s = await G();
  assert(s.towers.length === 1 && s.gold === s0.gold - 70, 'build archer with card + click (gold ' + s0.gold + ' -> ' + s.gold + ')');
  // Build mage with hotkey 2
  await p.keyboard.press('2');
  await p.mouse.click(...at(5, 5));
  s = await G();
  assert(s.towers.length === 2, 'build mage with hotkey');
  // Try to build on the road: should fail
  await p.keyboard.press('1');
  await p.mouse.click(...at(4, 4));
  s = await G();
  assert(s.towers.length === 2, 'cannot build on the road');
  await p.keyboard.press('Escape');
  // Start wave with button
  await p.click('#btnWave');
  s = await G();
  assert(s.wave === 1, 'start wave 1 with button');
  // Select archer, upgrade twice via inspector, then specialise
  await p.evaluate(() => { window.__LK.G.gold = 2000; });
  await p.mouse.click(...at(3, 3));
  assert(await p.isVisible('#inspect'), 'clicking tower opens inspector');
  await p.click('#inspect [data-act="up"]');
  await p.click('#inspect [data-act="up"]');
  await p.click('#inspect [data-act="branch"][data-b="1"]');
  s = await G();
  assert(s.towers[0][3] === 2 && s.towers[0][4] === 1, 'upgrade x2 then Marksman branch via inspector');
  await p.click('#inspect [data-act="mode"][data-mode="strong"]');
  s = await G();
  assert(s.towers[0][5] === 'strong', 'targeting mode set to Strongest');
  // Spell: Q then click field
  await p.keyboard.press('Escape');
  await p.keyboard.press('q');
  await p.mouse.click(...at(4, 6));
  const cd = await p.evaluate(() => window.__LK.G.spells.starfall.cd);
  assert(cd > 30, 'Starfall cast via Q + click (cooldown ' + cd.toFixed(1) + ')');
  // Space tactical pause
  await p.keyboard.press(' ');
  assert(await p.evaluate(() => window.__LK.UIState.paused), 'Space pauses');
  const t1 = await p.evaluate(() => window.__LK.G.time); await p.waitForTimeout(300); const t2 = await p.evaluate(() => window.__LK.G.time);
  assert(t1 === t2, 'time frozen while paused');
  await p.keyboard.press(' ');
  // Esc opens menu, Resume
  await p.keyboard.press('Escape');
  assert(await p.isVisible('#scrPause'), 'Esc opens pause menu');
  await p.click('#btnResume');
  assert(!(await p.isVisible('#scrPause')), 'Resume closes menu');
  // Sell mage with Delete
  await p.mouse.click(...at(5, 5));
  const g1 = (await G()).gold;
  await p.keyboard.press('Delete');
  s = await G();
  assert(s.towers.length === 1 && s.gold > g1, 'sell with Delete (+' + (s.gold - g1) + ')');
  // Speed hotkey
  await p.keyboard.press('f');
  assert(await p.evaluate(() => window.__LK.UIState.speed) === 2, 'F cycles speed');
  // Force victory on vale and check unlock + next-map button
  await p.evaluate(() => { const L = window.__LK; const G = L.G; G.wave = G.waves; G.spawners = []; G.enemies = []; });
  await p.waitForTimeout(1600);
  assert(await p.isVisible('#scrEnd'), 'victory screen appears');
  const txt = await p.textContent('#endCard');
  assert(/Dawn breaks/.test(txt) && /Next: Twin Fords/.test(txt), 'victory text + next map button');
  await p.click('[data-end="next"]');
  await p.waitForTimeout(300);
  assert(await p.evaluate(() => window.__LK.G.map.id) === 'fords', 'Next map starts Twin Fords');
  // Save persisted
  const saved = await p.evaluate(() => localStorage.getItem('lumen-keep.v1'));
  assert(saved && JSON.parse(saved).maps.vale.stars >= 1, 'progress saved to localStorage');
  // Reload: map 2 should be unlocked in map select
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#btnPlay');
  const locked = await p.evaluate(() => [...document.querySelectorAll('.map-card')].map(c => c.classList.contains('locked')));
  assert(!locked[1] && locked[2], 'after reload, Twin Fords unlocked and Serpent\'s Coil locked');
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
  await b.close();
})();
