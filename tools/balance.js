const { chromium } = require('playwright');
const runs = (process.argv[2] || 'vale:knight,fords:knight,coil:knight,maw:knight').split(',');
const verbose = process.argv[3] === 'v';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto('file://' + require('path').join(__dirname, '..', 'index.html'));
  await p.waitForTimeout(800);
  for (const run of runs) {
    const [mapId, diff, skill = 'good'] = run.split(':');
    const res = await p.evaluate(([mapId, diff, skill]) => {
      const L = window.__LK, T = 48, COLS = 20, ROWS = 12;
      L.newGame(mapId, diff, 'campaign', { headless: true });
      const G = L.G;
      const pts = [];
      for (const path of G.paths) for (let d = 0; d < path.len; d += 8) {
        let i = 0; while (i < path.cum.length - 2 && path.cum[i + 1] < d) i++;
        const t = (d - path.cum[i]) / (path.cum[i + 1] - path.cum[i] || 1);
        pts.push([path.xs[i] + (path.xs[i + 1] - path.xs[i]) * t, path.ys[i] + (path.ys[i + 1] - path.ys[i]) * t]);
      }
      const cover = (c, r, R) => { const x = (c + .5) * T, y = (r + .5) * T; let n = 0; for (const [px, py] of pts) if ((px - x) ** 2 + (py - y) ** 2 <= (R * T) ** 2) n++; return n; };
      const cand = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (L.canBuild(c, r)) cand.push({ c, r, s3: cover(c, r, 3), s2: cover(c, r, 2.1) });
      const rot = skill === 'weak' ? ['archer', 'archer', 'mage', 'bombard', 'archer', 'mage'] :
        ['archer', 'mage', 'bombard', 'frost', 'archer', 'flame', 'mage', 'beacon', 'bombard', 'archer', 'mage', 'flame', 'frost', 'beacon'];
      let ri = 0;
      const branchPick = { archer: 1, mage: 0, bombard: 0, frost: 1, flame: 0, beacon: 0 };
      const useSpells = skill !== 'weak';
      function spend() {
        for (let guard = 0; guard < 10; guard++) {
          const want = rot[ri % rot.length];
          const cost = L.TOWERS[want].cost;
          const targetN = 3 + Math.floor(G.wave * 0.55);
          let did = false;
          if (G.towers.length < targetN) {
            if (G.gold < cost) break; // save up
            const key = want === 'flame' || want === 'frost' ? 's2' : 's3';
            let best = null;
            for (const k of cand) { if (!L.canBuild(k.c, k.r)) continue;
              let sc = k[key];
              if (want === 'beacon') { sc = 0; for (const t of G.towers) if ((t.c - k.c) ** 2 + (t.r - k.r) ** 2 <= 4.5) sc += 10; }
              if (!best || sc > best.sc) best = { ...k, sc }; }
            if (best && L.buildTower(want, best.c, best.r)) { ri++; did = true; }
          } else {
            let bestT = null, bestC = 1e9;
            for (const t of G.towers) {
              if (t.branch >= 0) continue;
              const c = t.level < 2 ? t.def.levels[t.level + 1].cost : t.def.branches[branchPick[t.type]].cost;
              if (c < bestC) { bestC = c; bestT = t; }
            }
            if (bestT && G.gold >= bestC) { L.upgradeTower(bestT, bestT.level < 2 ? -1 : branchPick[bestT.type]); did = true; }
            else if (!bestT && G.gold >= cost) { const k = cand.find(k => L.canBuild(k.c, k.r)); if (k && L.buildTower(want, k.c, k.r)) { ri++; did = true; } }
          }
          if (!did) break;
        }
      }
      function spells() {
        if (!useSpells) return;
        for (const id of ['starfall', 'snare']) {
          if (G.spells[id].cd > 0) continue;
          // densest point among enemies, prefer boss
          let best = null, bs = 0;
          for (const e of G.enemies) {
            let s = e.boss ? 8 : 0;
            for (const o of G.enemies) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < (1.6 * T) ** 2) s += 1;
            if (e.d / e.p.len > 0.55) s += 2;
            if (s > bs) { bs = s; best = e; }
          }
          if (best && bs >= 6) L.castSpell(id, best.x, best.y);
        }
      }
      const leaks = {};
      L.Hooks.leak = e => { const k = 'w' + G.wave + ':' + e.type; leaks[k] = (leaks[k] || 0) + 1; };
      spend();
      L.startNextWave();
      let t = 0, lastWave = 0, prevLives = G.lives;
      const lines = [];
      while (!G.over && t < 5000) {
        for (let k = 0; k < 30; k++) L.update(1 / 60);
        t += 0.5;
        spend(); spells();
        if (G.wave !== lastWave) {
          const inv = G.towers.reduce((a, t) => a + t.spent, 0);
          lines.push(`w${lastWave}->${G.wave} lives ${G.lives}${G.lives < prevLives ? ' (-' + (prevLives - G.lives) + ')' : ''} inv ${inv} gold ${G.gold} towers ${G.towers.length}`);
          prevLives = G.lives; lastWave = G.wave;
        }
      }
      const inv = G.towers.reduce((a, t) => a + t.spent, 0);
      return { won: G.won, wave: G.wave, lives: G.lives, towers: G.towers.length, invested: inv, leaks: JSON.stringify(leaks), lines };
    }, [mapId, diff, skill]);
    console.log(run.padEnd(20), JSON.stringify({ ...res, lines: undefined }));
    if (verbose) console.log(res.lines.join('\n'));
  }
  if (errs.length) console.log('ERRORS', errs.join('\n'));
  await b.close();
})();
