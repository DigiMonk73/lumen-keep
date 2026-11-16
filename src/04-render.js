// ===================================================================
// RENDER: cached map background + per-frame neon entities
// ===================================================================

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const view = { s: 1, dpr: 1, k: 1 };
let bgCache = null;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); }
function additive(g, on) { g.globalCompositeOperation = on ? 'lighter' : 'source-over'; }

function resizeCanvas() {
  const st = document.getElementById('stage');
  const r = st.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  // Turn the field on tall screens when that makes it substantially bigger.
  const sN = Math.min(r.width / W, r.height / H), sR = Math.min(r.width / H, r.height / W);
  ROT = sR > sN * 1.2;
  UP.x = ROT ? -1 : 0; UP.y = ROT ? 0 : -1;
  const s = ROT ? sR : sN;
  const cssW = Math.floor((ROT ? H : W) * s), cssH = Math.floor((ROT ? W : H) * s);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssH * dpr));
  view.s = s; view.dpr = dpr; view.k = cv.width / (ROT ? H : W);
  bgCache = null;
}
// World -> canvas pixels. Turned 90° clockwise, the road runs top to bottom.
function applyView(g, sx = 0, sy = 0) {
  const k = view.k;
  if (ROT) g.setTransform(0, k, -k, 0, H * k + sx, sy);
  else g.setTransform(k, 0, 0, k, sx, sy);
}
// Keep a drawing upright on screen when the field is turned.
function upright(g) { if (ROT) g.rotate(-Math.PI / 2); }
const rotOff = () => (ROT ? Math.PI / 2 : 0);
function flatEllipse(g, x, y, rx, ry) {
  g.beginPath();
  if (ROT) g.ellipse(x, y, ry, rx, 0, 0, TAU); else g.ellipse(x, y, rx, ry, 0, 0, TAU);
}

// ---------- Static map art ----------
function drawMapBase(g, map, L, time = 0) {
  const acc = map.accent;
  g.fillStyle = map.ground;
  g.fillRect(0, 0, W, H);
  let grd = g.createRadialGradient(W * 0.55, H * 0.45, 40, W * 0.5, H * 0.5, W * 0.75);
  grd.addColorStop(0, rgba(acc, 0.075));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // Buildable tiles get a faint inset outline, like an arcane survey grid.
  g.lineWidth = 1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c, x = c * T, y = r * T;
    if (L.grid[i] === C_FREE) {
      rr(g, x + 4, y + 4, T - 8, T - 8, 7);
      g.strokeStyle = rgba(acc, 0.06);
      g.stroke();
      g.fillStyle = rgba(acc, 0.13);
      g.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
    } else if (L.kind[i] === 'water') {
      g.fillStyle = '#04122a';
      g.fillRect(x, y, T, T);
      g.strokeStyle = rgba('#4DA8FF', 0.18);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const yy = y + 10 + k * 14;
        g.moveTo(x + 4, yy);
        g.quadraticCurveTo(x + T / 4, yy - 4, x + T / 2, yy);
        g.quadraticCurveTo(x + T * 0.75, yy + 4, x + T - 4, yy);
        g.stroke();
      }
    } else if (L.kind[i] === 'lava') {
      g.fillStyle = '#2a0703';
      g.fillRect(x, y, T, T);
      const rg = mulberry32(i * 31 + 7);
      g.strokeStyle = rgba('#FF5A1F', 0.55);
      g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        let px = x + rg() * T, py = y + rg() * T;
        g.moveTo(px, py);
        for (let s = 0; s < 3; s++) { px += rg() * 20 - 10; py += rg() * 20 - 10; g.lineTo(clamp(px, x, x + T), clamp(py, y, y + T)); }
        g.stroke();
      }
      g.lineWidth = 1;
    }
  }
  // Soften water and lava edges into a single body.
  for (const kindName of ['water', 'lava']) {
    const col = kindName === 'water' ? '#4DA8FF' : '#FF5A1F';
    g.save();
    g.shadowColor = col; g.shadowBlur = 14;
    g.strokeStyle = rgba(col, 0.45); g.lineWidth = 1.5;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (L.kind[r * COLS + c] !== kindName) continue;
      const same = (cc, rr2) => cc < 0 || rr2 < 0 || cc >= COLS || rr2 >= ROWS || L.kind[rr2 * COLS + cc] === kindName || L.kind[rr2 * COLS + cc] === 'bridge';
      const x = c * T, y = r * T;
      if (!same(c, r - 1)) { line(g, x, y, x + T, y); g.stroke(); }
      if (!same(c, r + 1)) { line(g, x, y + T, x + T, y + T); g.stroke(); }
      if (!same(c - 1, r)) { line(g, x, y, x, y + T); g.stroke(); }
      if (!same(c + 1, r)) { line(g, x + T, y, x + T, y + T); g.stroke(); }
    }
    g.restore();
  }

  // Roads: every path's halo, then edges, then fill, so forks merge cleanly.
  const P = L.paths.map(p => {
    const path = new Path2D();
    path.moveTo(p.xs[0], p.ys[0]);
    for (let i = 1; i < p.xs.length; i++) path.lineTo(p.xs[i], p.ys[i]);
    return path;
  });
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save();
  g.shadowColor = acc; g.shadowBlur = 24;
  g.strokeStyle = rgba(acc, 0.3); g.lineWidth = 44;
  P.forEach(p => g.stroke(p));
  g.restore();
  g.strokeStyle = acc; g.lineWidth = 41;
  P.forEach(p => g.stroke(p));
  g.strokeStyle = map.road; g.lineWidth = 37;
  P.forEach(p => g.stroke(p));
  g.setLineDash([2, 10]);
  g.strokeStyle = rgba(acc, 0.08); g.lineWidth = 28;
  P.forEach(p => g.stroke(p));
  g.setLineDash([]);
  g.strokeStyle = rgba(acc, 0.1); g.lineWidth = 1;
  P.forEach(p => g.stroke(p));

  // Bridges over the river
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (L.kind[r * COLS + c] !== 'bridge') continue;
    const x = c * T, y = r * T;
    g.strokeStyle = rgba('#E8C27A', 0.5); g.lineWidth = 2;
    for (let k = 3; k < T; k += 7) { line(g, x + k, y + 6, x + k, y + T - 6); g.stroke(); }
    g.strokeStyle = '#E8C27A'; g.lineWidth = 2;
    line(g, x, y + 4, x + T, y + 4); g.stroke();
    line(g, x, y + T - 4, x + T, y + T - 4); g.stroke();
  }

  for (const d of L.decor) drawDecor(g, d, map);

  // Vignette
  grd = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

function drawDecor(g, d, map) {
  const cx = (d.c + 0.5) * T + (d.s - 0.5) * 8, cy = (d.r + 0.5) * T + ((d.s * 7) % 1 - 0.5) * 8;
  g.save();
  g.translate(cx, cy);
  upright(g);
  drawDecorAt(g, d, map, 0, 0);
  g.restore();
}
function drawDecorAt(g, d, map, x, y) {
  const acc = map.accent;
  g.lineJoin = 'round';
  switch (d.type) {
    case 'tree': {
      const col = mix(acc, '#7CFF6B', 0.5), sz = 0.8 + d.s * 0.4;
      additive(g, true); glow(g, x, y, 30 * sz, col, 0.12); additive(g, false);
      for (let k = 0; k < 3; k++) {
        const w = (14 - k * 3.5) * sz, top = y - (4 + k * 7) * sz;
        g.beginPath();
        g.moveTo(x, top - 10 * sz); g.lineTo(x + w, top + 6 * sz); g.lineTo(x - w, top + 6 * sz); g.closePath();
        g.fillStyle = shade(col); g.fill();
        g.strokeStyle = rgba(col, 0.55); g.lineWidth = 1.5; g.stroke();
      }
      g.strokeStyle = rgba(col, 0.4); line(g, x, y + 2 * sz, x, y + 10 * sz); g.stroke();
      break;
    }
    case 'rock': {
      const rg = mulberry32(Math.floor(d.s * 1e6));
      g.beginPath();
      const n = 6, R = 9 + d.s * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, rad = R * (0.7 + rg() * 0.4);
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.75;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = '#0d0f1d'; g.fill();
      g.strokeStyle = rgba('#8A93C8', 0.4); g.lineWidth = 1.5; g.stroke();
      break;
    }
    case 'crystal': {
      additive(g, true); glow(g, x, y, 34, acc, 0.22); additive(g, false);
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * 7, h = 16 + ((d.s * (k + 3) * 13) % 1) * 10, a = (k - 1) * 0.35;
        g.save(); g.translate(x + ox, y + 8); g.rotate(a);
        g.beginPath(); g.moveTo(0, -h); g.lineTo(4, -h * 0.4); g.lineTo(0, 0); g.lineTo(-4, -h * 0.4); g.closePath();
        neon(g, acc, 1.5);
        g.restore();
      }
      break;
    }
    case 'reed': {
      g.strokeStyle = rgba('#7CFFB0', 0.35); g.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) {
        const ox = (k - 2) * 4;
        g.beginPath(); g.moveTo(x + ox, y + 10); g.quadraticCurveTo(x + ox + 3, y, x + ox + (k - 2) * 3, y - 12 - (k % 2) * 4); g.stroke();
      }
      break;
    }
    case 'spire': {
      additive(g, true); glow(g, x, y + 8, 26, '#FF5A1F', 0.25); additive(g, false);
      g.beginPath(); g.moveTo(x - 7, y + 10); g.lineTo(x - 1, y - 16 - d.s * 6); g.lineTo(x + 3, y - 4); g.lineTo(x + 8, y + 10); g.closePath();
      g.fillStyle = '#120808'; g.fill();
      g.strokeStyle = rgba('#FF6B3D', 0.6); g.lineWidth = 1.5; g.stroke();
      break;
    }
    case 'sprig': {
      g.fillStyle = rgba(acc, 0.25);
      const rg = mulberry32(Math.floor(d.s * 1e6));
      for (let k = 0; k < 4; k++) g.fillRect(x - T / 2 + 6 + rg() * (T - 12), y - T / 2 + 6 + rg() * (T - 12), 1.5, 1.5);
      break;
    }
  }
}

function getBg() {
  if (bgCache && bgCache.map === G.map.id && bgCache.w === cv.width && bgCache.rot === ROT) return bgCache.c;
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d');
  applyView(g);
  drawMapBase(g, G.map, G);
  bgCache = { c, map: G.map.id, w: cv.width, rot: ROT };
  return c;
}

// ---------- Landmarks ----------
function drawPortal(g, p, time) {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.ang);
  additive(g, true);
  glow(g, 4, 0, 56, '#B23DFF', 0.5 + Math.sin(time * 3) * 0.1);
  glow(g, 0, 0, 26, '#FF4DD8', 0.5);
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.ellipse(0, 0, 6 + k * 3, 18 + k * 4 + Math.sin(time * 3 + k) * 2, 0, 0, TAU);
    g.strokeStyle = rgba(k % 2 ? '#FF4DD8' : '#B23DFF', 0.75 - k * 0.15);
    g.lineWidth = 2;
    g.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const a = time * 2.2 + (k / 6) * TAU;
    glow(g, Math.cos(a) * 9, Math.sin(a) * 26, 6, '#FFB3F5', 0.8);
  }
  additive(g, false);
  g.restore();
}

function drawKeep(g, k, time) {
  const hit = G.keepHit;
  const low = !G.demo && G.lives <= G.maxLives * 0.3;
  const col = hit > 0 ? mix('#FFD84D', '#FF4D5E', Math.min(1, hit * 1.5)) : low && Math.sin(time * 6) > 0 ? '#FF8A6B' : '#FFD84D';
  g.save();
  g.translate(k.x, k.y);
  upright(g);
  additive(g, true);
  glow(g, 0, 0, 74, col, 0.3 + Math.sin(time * 2) * 0.05);
  additive(g, false);
  // Rune circle the keep stands on
  g.save();
  g.rotate(time * 0.25);
  g.setLineDash([3, 6]);
  circle(g, 0, 0, 30);
  g.strokeStyle = rgba(col, 0.45); g.lineWidth = 1.5; g.stroke();
  g.setLineDash([]);
  g.restore();
  // Towers and walls
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-15, 14); g.lineTo(-15, -6);
  for (let i = 0; i < 4; i++) { const x0 = -15 + i * 7.5; g.lineTo(x0, -10); g.lineTo(x0 + 3.75, -10); g.lineTo(x0 + 3.75, -6); g.lineTo(x0 + 7.5, -6); }
  g.lineTo(15, 14); g.closePath();
  neon(g, col, 2);
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 15, 14); g.lineTo(sx * 15, -12); g.lineTo(sx * 21, -12); g.lineTo(sx * 21, 14); g.closePath();
    neon(g, col, 2);
    g.beginPath(); g.moveTo(sx * 14, -12); g.lineTo(sx * 18, -22); g.lineTo(sx * 22, -12); g.closePath();
    neon(g, col, 1.5);
  }
  // Central spire + banner
  g.beginPath(); g.moveTo(-5, -10); g.lineTo(-5, -20); g.lineTo(0, -28); g.lineTo(5, -20); g.lineTo(5, -10);
  neon(g, col, 1.5, false);
  line(g, 0, -28, 0, -36); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
  g.beginPath(); g.moveTo(0, -36); g.lineTo(9 + Math.sin(time * 4) * 1.5, -33); g.lineTo(0, -30); g.closePath();
  g.fillStyle = col; g.fill();
  // Gate
  g.beginPath(); g.moveTo(-5, 14); g.lineTo(-5, 5); g.arc(0, 5, 5, Math.PI, 0); g.lineTo(5, 14);
  g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
  additive(g, true);
  glow(g, 0, 8, 10, '#FFE9A8', 0.6 + Math.random() * 0.15);
  glow(g, -18, -4, 5, '#FFE9A8', 0.7);
  glow(g, 18, -4, 5, '#FFE9A8', 0.7);
  additive(g, false);
  g.restore();
}

// ---------- Towers ----------
function towerLevel(t) { return t.branch >= 0 ? 3 : t.level; }

function drawTower(g, t, time, alpha = 1) {
  const col = t.color, lv = towerLevel(t), dis = t.disabledT > 0;
  const pop = t.born < 1 ? easeOut(t.born) : 1;
  g.save();
  g.globalAlpha = alpha;
  g.translate(t.x, t.y);
  upright(g);
  if (pop < 1) g.scale(0.55 + 0.45 * pop, 0.55 + 0.45 * pop);
  additive(g, true);
  glow(g, 0, 0, 32 + lv * 4, col, dis ? 0.08 : (0.2 + t.flash * 0.25) * alpha);
  additive(g, false);
  g.lineJoin = 'round';
  const c = dis ? '#5a5f80' : col;

  // Base plate
  switch (t.type) {
    case 'archer': poly(g, 0, 0, 17, 6, Math.PI / 6); break;
    case 'mage': poly(g, 0, 0, 17, 8, Math.PI / 8); break;
    case 'bombard': rr(g, -15.5, -15.5, 31, 31, 6); break;
    case 'frost': circle(g, 0, 0, 16.5); break;
    case 'flame': poly(g, 0, 0, 17.5, 5, -Math.PI / 2); break;
    case 'beacon': poly(g, 0, 0, 19, 4, 0); break;
  }
  neon(g, c, 2);
  if (lv >= 1) {
    switch (t.type) {
      case 'archer': poly(g, 0, 0, 12, 6, Math.PI / 6); break;
      case 'mage': poly(g, 0, 0, 12, 8, Math.PI / 8); break;
      case 'bombard': rr(g, -10.5, -10.5, 21, 21, 4); break;
      case 'frost': circle(g, 0, 0, 12); break;
      case 'flame': poly(g, 0, 0, 12, 5, -Math.PI / 2); break;
      case 'beacon': poly(g, 0, 0, 13, 4, 0); break;
    }
    g.strokeStyle = rgba(c, 0.35); g.lineWidth = 1; g.stroke();
  }
  if (lv >= 2) {
    const n = { archer: 6, mage: 8, bombard: 4, frost: 6, flame: 5, beacon: 4 }[t.type];
    const R = t.type === 'bombard' ? 19 : 18.5;
    const rot = { archer: Math.PI / 6, mage: Math.PI / 8, bombard: Math.PI / 4, frost: 0, flame: -Math.PI / 2, beacon: 0 }[t.type];
    g.fillStyle = c;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      g.fillRect(Math.cos(a) * R - 1.5, Math.sin(a) * R - 1.5, 3, 3);
    }
  }
  if (lv >= 3) {
    g.save();
    g.rotate(time * 0.4);
    g.setLineDash([4, 5]);
    circle(g, 0, 0, 22);
    g.strokeStyle = rgba(c, 0.45); g.lineWidth = 1; g.stroke();
    g.restore();
  }

  // Turret
  switch (t.type) {
    case 'archer': drawArcherTop(g, t, c, time); break;
    case 'mage': drawMageTop(g, t, c, time); break;
    case 'bombard': drawBombardTop(g, t, c, time); break;
    case 'frost': drawFrostTop(g, t, c, time); break;
    case 'flame': drawFlameTop(g, t, c, time); break;
    case 'beacon': drawBeaconTop(g, t, c, time); break;
  }

  // Level pips
  if (t.branch < 0) {
    for (let i = 0; i <= t.level; i++) {
      g.fillStyle = c;
      g.beginPath(); g.arc((i - t.level / 2) * 5, 19.5, 1.6, 0, TAU); g.fill();
    }
  }
  if (dis) {
    for (let k = 0; k < 3; k++) {
      const a = time * 4 + (k / 3) * TAU;
      additive(g, true); glow(g, Math.cos(a) * 12, -18 + Math.sin(a) * 4, 5, '#FFE14D', 0.9); additive(g, false);
    }
  }
  g.restore();
}

function drawArcherTop(g, t, c, time) {
  g.save();
  g.rotate(t.ang + rotOff());
  const rate = t.stats.rate * t.buff.rate;
  const pull = t.cd > 0 ? clamp(1 - t.cd * rate, 0, 1) : 1;
  if (t.branch === 1) {
    // Marksman: long sighted crossbow
    rr(g, -8, -3, 26, 6, 2); neon(g, c, 1.5);
    g.beginPath(); g.arc(4, 0, 12, -1.2, 1.2); neon(g, c, 2, false);
    circle(g, -2, -6, 3); neon(g, c, 1, false);
    additive(g, true); glow(g, 18, 0, 6 + t.flash * 8, c, 0.7); additive(g, false);
  } else {
    const bows = t.branch === 0 ? [-0.38, 0, 0.38] : [0];
    for (const off of bows) {
      g.save();
      g.rotate(off);
      const R = t.branch === 0 ? 10 : 11 + t.level;
      const tipX = 2 + R * Math.cos(1.15), tipY = R * Math.sin(1.15);
      g.beginPath(); g.arc(2, 0, R, -1.15, 1.15); neon(g, c, 2, false);
      const sx = -3 - pull * 5;
      g.beginPath(); g.moveTo(tipX, -tipY); g.lineTo(sx, 0); g.lineTo(tipX, tipY);
      g.strokeStyle = rgba('#FFFFFF', 0.6); g.lineWidth = 1; g.stroke();
      if (pull > 0.25) { line(g, sx, 0, 15, 0); g.strokeStyle = '#EFFFE8'; g.lineWidth = 1.5; g.stroke(); }
      g.restore();
    }
  }
  g.restore();
}

function drawMageTop(g, t, c, time) {
  const bob = Math.sin(time * 2.2 + t.id) * 2;
  if (t.branch === 1) {
    // Void obelisk: a dark sphere in a spinning ring
    additive(g, true); glow(g, 0, -6 + bob, 22 + t.flash * 10, c, 0.55); additive(g, false);
    circle(g, 0, -6 + bob, 8);
    g.fillStyle = '#05010a'; g.fill();
    g.strokeStyle = c; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(0, -6 + bob); g.rotate(time * 1.5);
    g.beginPath(); g.ellipse(0, 0, 14, 4, 0, 0, TAU); g.strokeStyle = rgba(c, 0.8); g.lineWidth = 1.5; g.stroke();
    g.restore();
    return;
  }
  const s = 1 + t.level * 0.1 + (t.branch === 0 ? 0.15 : 0);
  g.beginPath();
  g.moveTo(0, -16 * s + bob); g.lineTo(7 * s, -5 * s + bob); g.lineTo(0, 6 * s + bob); g.lineTo(-7 * s, -5 * s + bob); g.closePath();
  neon(g, c, 2);
  line(g, 0, -16 * s + bob, 0, 6 * s + bob); g.strokeStyle = rgba(c, 0.4); g.lineWidth = 1; g.stroke();
  additive(g, true);
  glow(g, 0, -5 + bob, 12 + t.flash * 14, c, 0.6);
  const n = 2 + Math.min(2, t.level);
  for (let k = 0; k < n; k++) {
    const a = time * 2 + (k / n) * TAU;
    glow(g, Math.cos(a) * 14, -4 + Math.sin(a) * 5 + bob, 4, '#FFFFFF', 0.8);
    glow(g, Math.cos(a) * 14, -4 + Math.sin(a) * 5 + bob, 7, c, 0.8);
  }
  if (t.branch === 0 && Math.random() < 0.3) {
    g.beginPath();
    let x = 0, y = -16 * s + bob;
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += rand(-6, 6); y -= rand(2, 5); g.lineTo(x, y); }
    g.strokeStyle = rgba('#E6F6FF', 0.8); g.lineWidth = 1; g.stroke();
  }
  additive(g, false);
}

function drawBombardTop(g, t, c, time) {
  g.save();
  g.rotate(t.ang + rotOff());
  const rc = t.recoil * 5;
  if (t.branch === 0) {
    rr(g, -4 - rc, -8, 18, 16, 3); neon(g, c, 2);
    circle(g, 0, 0, 11); neon(g, c, 2);
    circle(g, 0, 0, 5); g.fillStyle = '#000'; g.fill(); g.strokeStyle = c; g.lineWidth = 1; g.stroke();
  } else if (t.branch === 1) {
    for (const oy of [-7, 0, 7]) { rr(g, -2 - rc, oy - 2.5, 20, 5, 1.5); neon(g, c, 1.5); }
    circle(g, -2, 0, 8); neon(g, c, 2);
  } else {
    const len = 17 + t.level * 2;
    rr(g, -2 - rc, -5, len, 10, 2); neon(g, c, 2);
    rr(g, len - 4 - rc, -6.5, 4, 13, 1.5); neon(g, c, 1.5);
    circle(g, 0, 0, 8.5); neon(g, c, 2);
  }
  if (t.recoil > 0.6) { additive(g, true); glow(g, 22, 0, 16, '#FFE9A8', t.recoil); additive(g, false); }
  g.restore();
}

function drawFrostTop(g, t, c, time) {
  g.save();
  g.rotate(time * 0.5 + t.id);
  if (t.branch === 0) {
    poly(g, 0, 0, 10, 6, 0); neon(g, c, 2);
    poly(g, 0, 0, 5, 6, Math.PI / 6); neon(g, c, 1.5);
  } else if (t.branch === 1) {
    for (let k = 0; k < 3; k++) {
      g.rotate(TAU / 3);
      g.beginPath(); g.arc(0, 0, 12, 0, 1.6); g.strokeStyle = c; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(0, 0, 7, 0.5, 1.9); g.strokeStyle = rgba(c, 0.6); g.lineWidth = 1.5; g.stroke();
    }
  }
  const L = 11 + t.level;
  if (t.branch !== 1) {
    g.strokeStyle = c; g.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) {
      g.save();
      g.rotate((k / 6) * TAU);
      line(g, 0, 0, L, 0); g.stroke();
      line(g, L * 0.6, 0, L * 0.85, -3.5); g.stroke();
      line(g, L * 0.6, 0, L * 0.85, 3.5); g.stroke();
      g.restore();
    }
  }
  g.restore();
  additive(g, true); glow(g, 0, 0, 12 + t.flash * 16, c, 0.6); additive(g, false);
}

function drawFlameTop(g, t, c, time) {
  const big = t.branch === 0 ? 1.4 : 1;
  g.save();
  g.rotate(t.ang + rotOff());
  rr(g, 4, -4, 10, 8, 2); neon(g, c, 1.5);
  g.restore();
  g.beginPath(); g.arc(0, 0, 10, 0, Math.PI); g.closePath(); neon(g, c, 2);
  if (t.branch === 1) {
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 6, -2); g.quadraticCurveTo(s * 20, -14, s * 18, 4); g.quadraticCurveTo(s * 14, -2, s * 8, 2);
      g.strokeStyle = c; g.lineWidth = 1.5; g.stroke();
    }
  }
  additive(g, true);
  const fl = 0.75 + Math.sin(time * 17 + t.id) * 0.12 + Math.random() * 0.12;
  glow(g, 0, -3, (14 + t.level * 2) * big * fl + t.firing * 20, c, 0.75);
  glow(g, 0, -5, 7 * big * fl, '#FFE14D', 0.9);
  additive(g, false);
}

function drawBeaconTop(g, t, c, time) {
  const bob = Math.sin(time * 1.6 + t.id) * 1.5;
  if (t.branch === 0) {
    line(g, -4, 10, -4, -20); g.strokeStyle = c; g.lineWidth = 2; g.stroke();
    const wave = Math.sin(time * 5) * 2;
    g.beginPath(); g.moveTo(-4, -20); g.quadraticCurveTo(6, -18 + wave, 14, -15); g.quadraticCurveTo(6, -12 - wave, -4, -9); g.closePath();
    neon(g, c, 1.5);
  } else {
    g.beginPath(); g.moveTo(0, -20 + bob); g.lineTo(5, -6 + bob); g.lineTo(0, 7 + bob); g.lineTo(-5, -6 + bob); g.closePath();
    neon(g, c, 2);
  }
  g.save();
  g.translate(0, -5 + bob);
  g.beginPath(); g.ellipse(0, 0, 15, 5, 0, 0, TAU);
  g.strokeStyle = rgba(c, 0.6); g.lineWidth = 1; g.stroke();
  additive(g, true);
  for (let k = 0; k < 4; k++) {
    const a = time * 1.2 + (k / 4) * TAU;
    glow(g, Math.cos(a) * 15, Math.sin(a) * 5, 5, k % 2 ? '#FFFFFF' : c, 0.9);
  }
  if (t.branch === 1) { circle(g, 0, -16, 5); g.strokeStyle = '#FFF06B'; g.lineWidth = 1.5; g.stroke(); glow(g, 0, -16, 12, '#FFF06B', 0.6); }
  glow(g, 0, -4, 14, c, 0.5);
  additive(g, false);
  g.restore();
}

// ---------- Enemies ----------
function drawEnemy(g, e, time) {
  const def = e.def, s = e.size, col = def.color;
  const hitc = e.hit > 0.05 ? '#FFFFFF' : col;
  const lift = e.z + (e.flying ? Math.sin(e.anim * 3) * 2 : 0);
  const x = upx(e.x, lift), y = upy(e.y, lift);
  if (e.flying) {
    flatEllipse(g, upx(e.x, -6), upy(e.y, -6), s * 0.9, s * 0.38);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill();
  }
  g.save();
  g.translate(x, y);
  if (e.phased) g.globalAlpha = 0.22;
  additive(g, true);
  if (QUALITY > 0 || e.boss) glow(g, 0, 0, s * (QUALITY > 1 ? 2.3 : 1.8), col, e.boss ? 0.45 : 0.32);
  if (e.burnT > 0) glow(g, 0, 0, s * 2, '#FF6A2B', 0.4);
  additive(g, false);
  g.lineJoin = 'round';
  const a = e.ang, t = e.anim;
  switch (def.shape) {
    case 'goblin': {
      g.rotate(a);
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.2, sd * s * 0.55); g.lineTo(-s * 0.5, sd * s * 1.45); g.lineTo(-s * 0.2, sd * s * 0.3); g.closePath(); neon(g, hitc, 1.5); }
      circle(g, 0, 0, s * 0.8); neon(g, hitc, 2);
      eyes(g, s * 0.4, s * 0.28, 1.6, '#FFF2A8');
      line(g, s * 0.4, s * 0.6, s * 1.2, s * 0.9 + Math.sin(t * 10) * 2); g.strokeStyle = '#D8DCF0'; g.lineWidth = 1.5; g.stroke();
      break;
    }
    case 'wolf': {
      g.rotate(a);
      const lg = Math.sin(t * 16) * 3;
      g.strokeStyle = rgba(hitc, 0.8); g.lineWidth = 1.5;
      for (const [lx, sd, ph] of [[s * 0.5, 1, 1], [s * 0.5, -1, -1], [-s * 0.5, 1, -1], [-s * 0.5, -1, 1]]) { line(g, lx, sd * s * 0.4, lx + lg * ph, sd * s * 0.85); g.stroke(); }
      g.beginPath(); g.ellipse(0, 0, s * 1.15, s * 0.55, 0, 0, TAU); neon(g, hitc, 2);
      g.beginPath(); g.moveTo(-s * 1.1, 0); g.quadraticCurveTo(-s * 1.6, Math.sin(t * 8) * 4, -s * 2, Math.sin(t * 8 + 1) * 5); g.strokeStyle = hitc; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.moveTo(s * 0.8, -s * 0.45); g.lineTo(s * 1.75, 0); g.lineTo(s * 0.8, s * 0.45); g.closePath(); neon(g, hitc, 1.5);
      eyes(g, s * 1.15, s * 0.18, 1.4, '#FFE14D');
      break;
    }
    case 'orc': {
      g.rotate(a);
      for (const sd of [-1, 1]) { circle(g, -s * 0.05, sd * s * 0.85, s * 0.45); neon(g, hitc, 1.5); }
      circle(g, 0, 0, s * 0.9); neon(g, hitc, 2);
      circle(g, s * 0.45, 0, s * 0.45); neon(g, hitc, 1.5);
      g.strokeStyle = '#FFF6E0'; g.lineWidth = 1.5;
      for (const sd of [-1, 1]) { line(g, s * 0.75, sd * s * 0.2, s * 1.05, sd * s * 0.32); g.stroke(); }
      eyes(g, s * 0.62, s * 0.18, 1.5, '#FFE14D');
      break;
    }
    case 'harpy': {
      g.rotate(a);
      const fl = 0.55 + 0.45 * Math.sin(t * 13);
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(s * 0.3, 0); g.lineTo(-s * 0.4, sd * s * 1.7 * fl); g.lineTo(-s * 0.9, sd * s * 1.2 * fl); g.lineTo(-s * 0.4, sd * s * 0.2); g.closePath();
        neon(g, hitc, 1.5);
      }
      g.beginPath(); g.ellipse(0, 0, s * 0.75, s * 0.4, 0, 0, TAU); neon(g, hitc, 2);
      g.beginPath(); g.moveTo(s * 0.7, -s * 0.15); g.lineTo(s * 1.15, 0); g.lineTo(s * 0.7, s * 0.15); g.closePath(); g.fillStyle = '#FFE14D'; g.fill();
      break;
    }
    case 'shaman': {
      g.rotate(a);
      line(g, -s * 0.6, s * 0.8, s * 1.3, s * 0.9); g.strokeStyle = '#C9A66B'; g.lineWidth = 2; g.stroke();
      additive(g, true); glow(g, s * 1.4, s * 0.9, 10 + Math.sin(t * 5) * 3, col, 0.9); additive(g, false);
      poly(g, 0, 0, s * 0.95, 3, 0); neon(g, hitc, 2);
      circle(g, s * 0.1, 0, s * 0.45); neon(g, hitc, 1.5);
      eyes(g, s * 0.35, s * 0.15, 1.3, '#FFFFFF');
      break;
    }
    case 'slime': {
      const n = 10, R = s;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * TAU, rad = R * (1 + 0.13 * Math.sin(t * 6 + i * 1.7));
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * 0.85;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = rgba(col, 0.18); g.fill();
      g.lineWidth = 6; g.strokeStyle = rgba(hitc, 0.16); g.stroke();
      g.lineWidth = 2; g.strokeStyle = hitc; g.stroke();
      g.rotate(a);
      eyes(g, s * 0.35, s * 0.3, s > 9 ? 2.2 : 1.5, '#FFFFFF');
      break;
    }
    case 'troll': {
      g.rotate(a);
      for (let k = 0; k < 5; k++) {
        const yy = (k - 2) * s * 0.38;
        g.beginPath(); g.moveTo(-s * 0.6, yy - 3); g.lineTo(-s * 1.25, yy); g.lineTo(-s * 0.6, yy + 3); g.closePath(); neon(g, hitc, 1.2);
      }
      for (const sd of [-1, 1]) { circle(g, s * 0.55, sd * s * 0.75, s * 0.3); neon(g, hitc, 1.5); }
      circle(g, 0, 0, s * 0.85); neon(g, hitc, 2.2);
      circle(g, s * 0.55, 0, s * 0.32); neon(g, hitc, 1.5);
      eyes(g, s * 0.7, s * 0.12, 1.4, '#FF4D4D');
      if (e.hp < e.maxHp && e.burnT <= 0) { additive(g, true); glow(g, 0, 0, s * 1.4, '#7CFF6B', 0.18 + Math.sin(t * 6) * 0.08); additive(g, false); }
      break;
    }
    case 'wraith': {
      g.rotate(a);
      for (let k = 0; k < 3; k++) {
        const yy = (k - 1) * s * 0.45;
        g.beginPath(); g.moveTo(0, yy);
        g.quadraticCurveTo(-s * 1.2, yy + Math.sin(t * 7 + k) * 5, -s * 2.1, yy + Math.sin(t * 7 + k + 1) * 7);
        g.strokeStyle = rgba(col, 0.55); g.lineWidth = 2.5 - k * 0.4; g.stroke();
      }
      g.beginPath(); g.arc(s * 0.2, 0, s * 0.75, -Math.PI / 2, Math.PI / 2); g.lineTo(-s * 0.6, s * 0.5); g.lineTo(-s * 0.3, 0); g.lineTo(-s * 0.6, -s * 0.5); g.closePath();
      neon(g, hitc, 2);
      eyes(g, s * 0.45, s * 0.25, 1.8, '#E6FFFF');
      break;
    }
    case 'knight': {
      g.rotate(a);
      circle(g, -s * 0.15, 0, s * 0.8); neon(g, hitc, 2);
      g.beginPath(); g.moveTo(s * 0.45, -s * 0.95); g.quadraticCurveTo(s * 1.35, -s * 0.6, s * 1.15, 0); g.quadraticCurveTo(s * 1.35, s * 0.6, s * 0.45, s * 0.95); g.closePath();
      neon(g, hitc, 2);
      line(g, s * 0.75, -s * 0.5, s * 0.75, s * 0.5); g.strokeStyle = rgba(hitc, 0.7); g.lineWidth = 1.5; g.stroke();
      line(g, -s * 0.15, -s * 0.35, -s * 0.15, s * 0.35); g.strokeStyle = '#FFE14D'; g.lineWidth = 2; g.stroke();
      break;
    }
    case 'skeleton': {
      g.rotate(a);
      g.strokeStyle = rgba(hitc, 0.8); g.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { line(g, -s * 0.2 - k * 3, -s * 0.6, -s * 0.2 - k * 3, s * 0.6); g.stroke(); }
      line(g, -s * 0.9, 0, s * 0.2, 0); g.stroke();
      circle(g, s * 0.5, 0, s * 0.6); neon(g, hitc, 1.5);
      eyes(g, s * 0.65, s * 0.22, 1.3, '#9D7BFF');
      break;
    }
    case 'ogre': {
      g.rotate(a);
      const sw = Math.sin(t * 2.4) * 0.5;
      g.save(); g.translate(s * 0.3, s * 0.85); g.rotate(sw);
      rr(g, 0, -3, s * 1.2, 6, 3); neon(g, '#C9A66B', 2);
      circle(g, s * 1.2, 0, 5.5); neon(g, '#C9A66B', 2);
      g.restore();
      for (const sd of [-1, 1]) { circle(g, s * 0.1, sd * s * 0.8, s * 0.35); neon(g, hitc, 2); }
      circle(g, 0, 0, s * 0.85); neon(g, hitc, 2.5);
      circle(g, s * 0.5, 0, s * 0.38); neon(g, hitc, 2);
      g.strokeStyle = '#FFE14D'; g.lineWidth = 2;
      for (const sd of [-1, 1]) { line(g, s * 0.45, sd * s * 0.3, s * 0.3, sd * s * 0.6); g.stroke(); }
      eyes(g, s * 0.7, s * 0.14, 2.2, '#FFE14D');
      break;
    }
    case 'lich': {
      g.save(); g.rotate(t * 0.8);
      g.setLineDash([3, 5]); circle(g, 0, 0, s * 1.5); g.strokeStyle = rgba(col, 0.5); g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
      g.restore();
      g.rotate(a);
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * TAU, rad = s * (i % 2 ? 0.75 : 1);
        if (i) g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); else g.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      g.closePath(); neon(g, hitc, 2);
      circle(g, s * 0.15, 0, s * 0.42); neon(g, '#E4E6FF', 1.5);
      g.fillStyle = '#FFE14D';
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-s * 0.2, k * 4); g.lineTo(-s * 0.55, k * 4 - 1.5); g.lineTo(-s * 0.55, k * 4 + 1.5); g.fill(); }
      line(g, 0, s * 0.95, s * 1.4, s * 0.95); g.strokeStyle = '#C9A66B'; g.lineWidth = 2; g.stroke();
      additive(g, true); glow(g, s * 1.5, s * 0.95, 12, col, 0.9); additive(g, false);
      eyes(g, s * 0.35, s * 0.15, 1.8, '#7DFFB0');
      break;
    }
    case 'wyrm': {
      g.rotate(a);
      const fl = 0.6 + 0.4 * Math.sin(t * 6);
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 0.3, sd * s * 0.2);
        g.lineTo(-s * 0.1, sd * s * 1.9 * fl);
        g.lineTo(-s * 0.5, sd * s * 1.4 * fl);
        g.lineTo(-s * 0.8, sd * s * 1.75 * fl);
        g.lineTo(-s * 0.9, sd * s * 0.9 * fl);
        g.lineTo(-s * 0.5, sd * s * 0.25);
        g.closePath();
        neon(g, hitc, 2);
      }
      g.beginPath(); g.moveTo(-s * 0.6, 0);
      g.quadraticCurveTo(-s * 1.3, Math.sin(t * 3) * 8, -s * 1.9, Math.sin(t * 3 + 1) * 12);
      g.strokeStyle = hitc; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.ellipse(0, 0, s * 0.75, s * 0.35, 0, 0, TAU); neon(g, hitc, 2.2);
      g.beginPath(); g.moveTo(s * 0.6, -s * 0.2); g.lineTo(s * 1.3, -s * 0.12); g.lineTo(s * 1.5, 0); g.lineTo(s * 1.3, s * 0.12); g.lineTo(s * 0.6, s * 0.2); g.closePath();
      neon(g, hitc, 2);
      eyes(g, s * 1.2, s * 0.08, 1.8, '#FFE14D');
      additive(g, true); glow(g, s * 1.6, 0, 12 + Math.random() * 6, '#FFC23D', 0.8); additive(g, false);
      break;
    }
  }
  g.restore();

  // Status overlays, drawn upright on screen around the creature
  if (!(e.frozenT > 0 || e.slowT > 0 || e.rootT > 0 || e.weakT > 0 || e.stunT > 0)) return;
  g.save();
  g.translate(x, y);
  upright(g);
  if (e.frozenT > 0) {
    poly(g, 0, 0, s + 5, 6, Math.PI / 6);
    g.fillStyle = rgba('#D2F4FF', 0.22); g.fill();
    g.strokeStyle = '#D2F4FF'; g.lineWidth = 1.5; g.stroke();
  } else if (e.slowT > 0 && e.slow > 0) {
    g.beginPath(); g.ellipse(0, s * 0.5 + lift, s * 1.1, s * 0.45, 0, 0, TAU);
    g.strokeStyle = rgba('#5CE1FF', 0.7); g.lineWidth = 1.5; g.stroke();
  }
  if (e.rootT > 0) {
    g.save(); g.translate(0, lift); g.rotate(time * 3);
    poly(g, 0, 0, s + 6, 3, 0); g.strokeStyle = rgba('#C38BFF', 0.85); g.lineWidth = 1.5; g.stroke();
    poly(g, 0, 0, s + 6, 3, Math.PI); g.stroke();
    g.restore();
  }
  if (e.weakT > 0) {
    g.setLineDash([2, 3]); circle(g, 0, 0, s + 4); g.strokeStyle = rgba('#FF4DD8', 0.8); g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
  }
  if (e.stunT > 0) {
    additive(g, true);
    for (let k = 0; k < 3; k++) { const an = time * 6 + (k / 3) * TAU; glow(g, Math.cos(an) * (s + 2), -s - 4 + Math.sin(an) * 3, 5, '#FFE14D', 0.9); }
    additive(g, false);
  }
  g.restore();
}
function eyes(g, x, spread, r, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(x, -spread, r, 0, TAU); g.arc(x, spread, r, 0, TAU); g.fill();
}

function drawHealth(g, e) {
  if (e.boss || e.hp >= e.maxHp || e.dead) return;
  const w = Math.max(18, e.size * 2.2), x = -w / 2, y = -e.size - 9;
  const k = clamp(e.hp / e.maxHp, 0, 1);
  g.save();
  g.translate(upx(e.x, e.z), upy(e.y, e.z));
  upright(g);
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(x - 1, y - 1, w + 2, 5);
  g.fillStyle = k > 0.5 ? '#7CFF6B' : k > 0.25 ? '#FFD84D' : '#FF4D5E';
  g.fillRect(x, y, w * k, 3);
  g.restore();
}

// ---------- Projectiles / FX ----------
function drawProjectiles(g) {
  for (const p of G.projectiles) {
    if (p.kind !== 'shell') continue;
    const sh = 1 - p.h / (p.arc + 1) * 0.6;
    flatEllipse(g, p.x, p.y, 5 * sh, 2.5 * sh);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
  }
  additive(g, true);
  for (const p of G.projectiles) {
    if (p.kind === 'shell') {
      const sz = p.big ? 6 : 4.5;
      glow(g, upx(p.x, p.h), upy(p.y, p.h), sz * 4, p.color, 0.8);
      circle(g, upx(p.x, p.h), upy(p.y, p.h), sz);
      g.fillStyle = '#FFF2C2'; g.fill();
      continue;
    }
    const tr = p.trail;
    if (tr.length >= 4) {
      g.beginPath();
      g.moveTo(tr[0], tr[1]);
      for (let i = 2; i < tr.length; i += 2) g.lineTo(tr[i], tr[i + 1]);
      g.lineTo(p.x, p.y);
      g.strokeStyle = rgba(p.color, 0.45); g.lineWidth = p.kind === 'bolt' ? p.size * 1.2 : 2; g.lineCap = 'round'; g.stroke();
    }
    if (p.kind === 'arrow') {
      const a = p.ang !== undefined ? p.ang : 0;
      line(g, p.x - Math.cos(a) * 9, p.y - Math.sin(a) * 9, p.x, p.y);
      g.strokeStyle = '#F4FFF0'; g.lineWidth = 1.8; g.stroke();
      glow(g, p.x, p.y, 10, p.color, 0.8);
    } else {
      glow(g, p.x, p.y, p.size * 4, p.color, 0.95);
      glow(g, p.x, p.y, p.size * 1.6, '#FFFFFF', 0.9);
    }
  }
  additive(g, false);
}

function drawZones(g, time) {
  additive(g, true);
  for (const z of G.zones) {
    const k = z.t / z.max;
    glow(g, z.x, z.y, z.r * 1.5, '#FF5A1F', 0.45 * k);
    glow(g, z.x + Math.sin(time * 9) * 3, z.y, z.r * 0.8, '#FFC23D', 0.3 * k);
  }
  additive(g, false);
}

function drawFx(g, time) {
  additive(g, true);
  for (const f of G.fx) {
    const k = clamp(f.life / f.max, 0, 1);
    if (f.kind === 'ring') {
      const r = lerp(f.r0, f.r1, easeOut(1 - k));
      circle(g, f.x, f.y, r);
      g.strokeStyle = rgba(f.color, k * 0.9); g.lineWidth = f.w * (0.4 + k); g.stroke();
    } else if (f.kind === 'lightning') {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [wdt, col, al] of [[6, f.color, 0.35 * k], [1.8, '#FFFFFF', k]]) {
        g.beginPath();
        g.moveTo(f.pts[0][0], f.pts[0][1]);
        for (let i = 1; i < f.pts.length; i++) {
          const [ax, ay] = f.pts[i - 1], [bx, by] = f.pts[i];
          const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
          for (let s = 1; s < 6; s++) {
            const tt = s / 6, j = rand(-7, 7);
            g.lineTo(lerp(ax, bx, tt) + nx * j, lerp(ay, by, tt) + ny * j);
          }
          g.lineTo(bx, by);
        }
        g.strokeStyle = rgba(col, al); g.lineWidth = wdt; g.stroke();
      }
      for (const [x, y] of f.pts) glow(g, x, y, 14, f.color, k * 0.8);
    } else if (f.kind === 'meteor') {
      if (!f.done) {
        const p = clamp(f.t / f.delay, 0, 1);
        const sx = f.x + 260, sy = f.y - 420;
        const hx = lerp(sx, f.x, p * p), hy = lerp(sy, f.y, p * p);
        line(g, lerp(sx, hx, 0.6), lerp(sy, hy, 0.6), hx, hy);
        g.strokeStyle = rgba('#FFD84D', 0.7); g.lineWidth = 4; g.stroke();
        glow(g, hx, hy, 40, '#FFD84D', 0.95);
        glow(g, hx, hy, 14, '#FFFFFF', 1);
        circle(g, f.x, f.y, f.r * (0.5 + p * 0.5));
        g.strokeStyle = rgba('#FFD84D', 0.5 + Math.sin(time * 20) * 0.2); g.lineWidth = 2; g.stroke();
      }
    } else if (f.kind === 'rune') {
      const a = Math.min(1, k * 3);
      g.save(); g.translate(f.x, f.y);
      g.rotate(time * 0.8);
      circle(g, 0, 0, f.r); g.strokeStyle = rgba(f.color, 0.7 * a); g.lineWidth = 2; g.stroke();
      circle(g, 0, 0, f.r * 0.82); g.strokeStyle = rgba(f.color, 0.35 * a); g.lineWidth = 1; g.stroke();
      poly(g, 0, 0, f.r * 0.8, 3, 0); g.stroke();
      poly(g, 0, 0, f.r * 0.8, 3, Math.PI); g.stroke();
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * TAU;
        glow(g, Math.cos(an) * f.r * 0.91, Math.sin(an) * f.r * 0.91, 6, f.color, 0.8 * a);
      }
      g.restore();
      glow(g, f.x, f.y, f.r * 1.2, f.color, 0.18 * a);
    }
  }
  additive(g, false);
}

function drawParticles(g) {
  for (const p of G.particles) {
    if (p.kind !== 'smoke') continue;
    const k = p.life / p.max;
    circle(g, p.x, p.y, p.size * (1 + (1 - k) * 1.6));
    g.fillStyle = rgba(p.color, k * 0.22); g.fill();
  }
  additive(g, true);
  for (const p of G.particles) {
    const k = p.life / p.max;
    switch (p.kind) {
      case 'dot': glow(g, p.x, p.y, p.size * (QUALITY > 0 ? 3 : 2), p.color, k); break;
      case 'ember': glow(g, p.x, p.y, p.size * 2.5, p.color, k); break;
      case 'flame': glow(g, p.x, p.y, p.size * (1.6 + (1 - k) * (QUALITY > 0 ? 2.6 : 1.4)), p.color, k * 0.6); break;
      case 'spark':
        line(g, p.x, p.y, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        g.strokeStyle = rgba(p.color, k); g.lineWidth = p.size * 0.7; g.stroke();
        break;
      case 'shard':
        g.save(); g.translate(p.x, p.y); g.rotate(p.vx);
        g.beginPath(); g.moveTo(0, -p.size * 1.6); g.lineTo(p.size * 0.6, 0); g.lineTo(0, p.size * 1.6); g.lineTo(-p.size * 0.6, 0); g.closePath();
        g.strokeStyle = rgba(p.color, k); g.lineWidth = 1; g.stroke();
        g.restore();
        break;
      case 'plus':
        g.strokeStyle = rgba(p.color, k); g.lineWidth = 2;
        line(g, p.x - 3, p.y, p.x + 3, p.y); g.stroke();
        line(g, p.x, p.y - 3, p.x, p.y + 3); g.stroke();
        break;
    }
  }
  additive(g, false);
}

function drawTexts(g) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const t of G.texts) {
    const k = t.life / t.max;
    g.globalAlpha = Math.min(1, k * 2);
    g.font = `800 ${t.size}px "Alegreya Sans", "Segoe UI", sans-serif`;
    g.save();
    g.translate(t.x, t.y);
    upright(g);
    g.lineWidth = 3; g.strokeStyle = 'rgba(5,6,13,0.9)';
    g.strokeText(t.text, 0, 0);
    g.fillStyle = t.color;
    g.fillText(t.text, 0, 0);
    g.restore();
  }
  g.globalAlpha = 1;
}

// ---------- Overlays: range, placement ghost, spell cursor ----------
function rangeCircle(g, x, y, R, col, strong) {
  circle(g, x, y, R);
  g.fillStyle = rgba(col, strong ? 0.07 : 0.04); g.fill();
  g.setLineDash([6, 6]);
  g.strokeStyle = rgba(col, strong ? 0.75 : 0.4); g.lineWidth = 1.5; g.stroke();
  g.setLineDash([]);
}

function previewBuff(c, r) {
  const x = (c + 0.5) * T, y = (r + 0.5) * T;
  let range = 1;
  for (const b of G.towers) {
    if (b.def.attack !== 'aura') continue;
    const R = b.stats.range * T;
    if (d2(x, y, b.x, b.y) <= R * R + 1) range = Math.max(range, 1 + b.stats.bRange);
  }
  return range;
}

function drawOverlays(g, time) {
  const ui = UIState;
  // Selected tower range and beacon links
  const sel = ui.selected;
  if (sel && G.towers.includes(sel)) {
    rangeCircle(g, sel.x, sel.y, sel.range, sel.color, true);
    if (sel.def.attack === 'aura') {
      g.strokeStyle = rgba(sel.color, 0.45); g.lineWidth = 1.5; g.setLineDash([3, 4]);
      const R = sel.stats.range * T;
      for (const t of G.towers) {
        if (t === sel || t.def.attack === 'aura' || d2(t.x, t.y, sel.x, sel.y) > R * R + 1) continue;
        line(g, sel.x, sel.y, t.x, t.y); g.stroke();
      }
      g.setLineDash([]);
    }
    rr(g, sel.c * T + 2, sel.r * T + 2, T - 4, T - 4, 9);
    g.strokeStyle = rgba('#FFFFFF', 0.6 + Math.sin(time * 5) * 0.2); g.lineWidth = 1.5; g.stroke();
  }
  // Beacons always show a faint aura
  for (const t of G.towers) {
    if (t.def.attack !== 'aura' || t === sel) continue;
    circle(g, t.x, t.y, t.stats.range * T);
    g.strokeStyle = rgba(t.color, 0.12 + Math.sin(time * 2 + t.id) * 0.04); g.lineWidth = 1; g.stroke();
  }
  const h = ui.hover;
  if (ui.placing) {
    const def = TOWERS[ui.placing];
    // Show every open tile while placing
    g.fillStyle = rgba(def.color, 0.16);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (canBuild(c, r)) g.fillRect(c * T + T / 2 - 2, r * T + T / 2 - 2, 4, 4);
    }
    if (h) {
      const ok = canBuild(h.c, h.r) && G.gold >= def.cost;
      const col = ok ? def.color : '#FF4D5E';
      rr(g, h.c * T + 2, h.r * T + 2, T - 4, T - 4, 9);
      g.fillStyle = rgba(col, 0.14); g.fill();
      g.strokeStyle = rgba(col, 0.8); g.lineWidth = 1.5; g.stroke();
      if (canBuild(h.c, h.r)) {
        const R = def.levels[0].range * T * (def.attack === 'aura' ? 1 : previewBuff(h.c, h.r));
        rangeCircle(g, (h.c + 0.5) * T, (h.r + 0.5) * T, R, col, true);
        const ghost = ghostTower(ui.placing, h.c, h.r);
        drawTower(g, ghost, time, 0.65);
        if (ui.pendingTouch && ui.pendingTouch.c === h.c && ui.pendingTouch.r === h.r) {
          g.save();
          g.translate((h.c + 0.5) * T, (h.r + 0.5) * T);
          upright(g);
          g.font = '800 13px "Alegreya Sans", sans-serif'; g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = 'rgba(5,6,13,0.9)'; g.strokeText('Tap again to build', 0, -32);
          g.fillStyle = '#FFFFFF'; g.fillText('Tap again to build', 0, -32);
          g.restore();
        }
      }
    }
  } else if (ui.spell) {
    if (h) {
      const sp = SPELLS[ui.spell];
      g.save(); g.translate(h.x, h.y); g.rotate(time);
      circle(g, 0, 0, sp.radius * T);
      g.fillStyle = rgba(sp.color, 0.08); g.fill();
      g.setLineDash([8, 6]); g.strokeStyle = sp.color; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
      g.restore();
    }
  } else if (h && !sel) {
    const t = G.towerAt[h.r * COLS + h.c];
    if (t) rangeCircle(g, t.x, t.y, t.range, t.color, false);
  }
}

function ghostTower(type, c, r, level = 0, branch = -1) {
  const def = TOWERS[type];
  const t = {
    id: 0, type, def, c, r, x: (c + 0.5) * T, y: (r + 0.5) * T, level, branch, cd: 0, ang: -Math.PI / 4,
    disabledT: 0, buff: { dmg: 1, rate: 1, range: 1 }, recoil: 0, flash: 0, born: 1, firing: 0, stats: null, range: 0,
  };
  t.stats = branch >= 0 ? def.branches[branch] : def.levels[level];
  t.color = branch >= 0 ? t.stats.color : def.color;
  return t;
}

// ---------- Frame ----------
function render(time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (!G) return;
  const k = view.k;
  const sx = G.shake > 0.3 ? (Math.random() - 0.5) * G.shake * k : 0;
  const sy = G.shake > 0.3 ? (Math.random() - 0.5) * G.shake * k : 0;
  ctx.drawImage(getBg(), sx, sy);
  applyView(ctx, sx, sy);
  const g = ctx;

  // Living terrain
  additive(g, true);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const kd = G.kind[r * COLS + c];
    if (kd === 'lava') glow(g, (c + 0.5) * T, (r + 0.5) * T, T * 0.9, '#FF4D1A', 0.22 + Math.sin(time * 1.7 + c * 1.3 + r) * 0.1);
    else if (kd === 'water' && (c * 7 + r * 3) % 4 === 0) glow(g, (c + 0.5) * T + Math.sin(time + r) * 10, (r + 0.5) * T, 14, '#4DA8FF', 0.15 + Math.sin(time * 2 + c) * 0.08);
  }
  additive(g, false);
  // Road flow shows which way foes march
  g.setLineDash([2, 26]);
  g.lineDashOffset = -time * 34;
  g.lineCap = 'round';
  for (const p of G.paths) {
    g.beginPath();
    g.moveTo(p.xs[0], p.ys[0]);
    for (let i = 1; i < p.xs.length; i++) g.lineTo(p.xs[i], p.ys[i]);
    g.strokeStyle = rgba(G.map.accent, 0.5); g.lineWidth = 2.5; g.stroke();
  }
  g.setLineDash([]);
  g.lineDashOffset = 0;

  for (const p of G.portals) drawPortal(g, p, time);
  drawKeep(g, G.keep, time);
  drawZones(g, time);
  drawOverlays(g, time);
  for (const t of G.towers) drawTower(g, t, time);
  for (const e of G.enemies) if (!e.flying) drawEnemy(g, e, time);
  drawProjectiles(g);
  for (const e of G.enemies) if (e.flying) drawEnemy(g, e, time);
  drawFx(g, time);
  drawParticles(g);
  for (const e of G.enemies) drawHealth(g, e);
  drawTexts(g);
}

// ---------- Icons for the HTML UI ----------
const _icons = new Map();
function iconURL(kind, id, branch = -1, level = 0, px = 88) {
  const key = kind + id + branch + level + px;
  if (_icons.has(key)) return _icons.get(key);
  const rot = ROT;
  ROT = false;
  try { return makeIcon(key, kind, id, branch, level, px); } finally { ROT = rot; }
}
function makeIcon(key, kind, id, branch, level, px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  if (kind === 'tower') {
    const s = px / 52;
    g.setTransform(s, 0, 0, s, px / 2, px / 2);
    const t = ghostTower(id, 0, 0, level, branch);
    t.x = 0; t.y = 0;
    drawTower(g, t, 1.2);
  } else {
    const def = ENEMIES[id];
    const s = px / Math.max(40, def.size * 4.4);
    g.setTransform(s, 0, 0, s, px / 2, px / 2);
    const e = {
      def, size: def.size, x: 0, y: 0, z: 0, ang: -Math.PI / 2, anim: 0.12, hit: 0, flying: false, phased: false, boss: !!def.boss,
      burnT: 0, frozenT: 0, slowT: 0, slow: 0, rootT: 0, weakT: 0, stunT: 0, hp: 1, maxHp: 1,
    };
    drawEnemy(g, e, 0);
  }
  const url = c.toDataURL();
  _icons.set(key, url);
  return url;
}

function drawThumb(canvas, map) {
  const rot = ROT;
  ROT = false;
  try { drawThumbFlat(canvas, map); } finally { ROT = rot; }
}
function drawThumbFlat(canvas, map) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 240, h = w * (H / W);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  const L = setupGrid(map);
  L.paths = buildPaths(map);
  const k = canvas.width / W;
  g.setTransform(k, 0, 0, k, 0, 0);
  drawMapBase(g, map, L);
  const p0 = L.paths[0];
  additive(g, true);
  glow(g, p0.xs[p0.xs.length - 1], p0.ys[p0.ys.length - 1], 70, '#FFD84D', 0.8);
  for (const p of L.paths) glow(g, clamp(p.xs[0], 6, W - 6), p.ys[0], 60, '#B23DFF', 0.9);
  additive(g, false);
}
