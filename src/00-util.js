'use strict';
// ===================================================================
// UTIL: constants, math, color, glow sprites
// ===================================================================

const TAU = Math.PI * 2;
const COLS = 20, ROWS = 12, T = 48, W = COLS * T, H = ROWS * T;
const STEP = 1 / 60;
// On tall screens the battlefield is drawn turned 90°. UP is the world-space
// direction that points up on screen, for flyer height and rising text.
let ROT = false;
// Render quality: 2 full, 1 no neon halos, 0 also fewer glows and particles.
// Lowered automatically when frames run slow.
let QUALITY = 2;
const UP = { x: 0, y: -1 };
const upx = (x, d) => x + UP.x * d;
const upy = (y, d) => y + UP.y * d;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const easeOut = t => 1 - (1 - t) * (1 - t);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- Color ----------
const _rgb = new Map();
function rgb(hex) {
  let v = _rgb.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgb.set(hex, v); }
  return v;
}
const _rgba = new Map();
function rgba(hex, a) {
  a = Math.round(clamp(a, 0, 1) * 50) / 50;
  const key = hex + a;
  let s = _rgba.get(key);
  if (!s) { const c = rgb(hex); s = `rgba(${c[0]},${c[1]},${c[2]},${a})`; _rgba.set(key, s); }
  return s;
}
const _mix = new Map();
function mix(a, b, t) {
  const key = a + b + t;
  let s = _mix.get(key);
  if (!s) {
    const x = rgb(a), y = rgb(b);
    const c = [0, 1, 2].map(i => Math.round(lerp(x[i], y[i], t)));
    s = '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    _mix.set(key, s);
  }
  return s;
}
const NIGHT = '#05060d';
const shade = hex => mix(hex, NIGHT, 0.8);

// ---------- Glow ----------
// Pre-rendered radial gradients drawn additively give a cheap neon bloom.
const _glow = new Map();
function glowSprite(hex) {
  let c = _glow.get(hex);
  if (c) return c;
  const s = 64;
  c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const [r, gg, b] = rgb(hex);
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, `rgba(${r},${gg},${b},0.85)`);
  grd.addColorStop(0.22, `rgba(${r},${gg},${b},0.42)`);
  grd.addColorStop(0.55, `rgba(${r},${gg},${b},0.11)`);
  grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  _glow.set(hex, c);
  return c;
}
function glow(g, x, y, r, hex, a = 1) {
  if (a <= 0.01) return;
  g.globalAlpha = a;
  g.drawImage(glowSprite(hex), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}
// Stroke the current path as a neon tube: soft halo plus a bright core.
function neon(g, hex, w = 2, fill = true) {
  if (fill) { g.fillStyle = shade(hex); g.fill(); }
  if (QUALITY > 1) { g.lineWidth = w + 4; g.strokeStyle = rgba(hex, 0.16); g.stroke(); }
  g.lineWidth = w; g.strokeStyle = hex; g.stroke();
}
function poly(g, x, y, r, n, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
