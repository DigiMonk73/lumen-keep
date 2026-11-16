// ===================================================================
// DATA: towers, enemies, maps, difficulties, wave generation
// ===================================================================

const TOWER_ORDER = ['archer', 'mage', 'bombard', 'frost', 'flame', 'beacon'];

// Ranges are in tiles, rates in attacks per second, damage per hit.
const TOWERS = {
  archer: {
    name: 'Archer Tower', short: 'Archer', color: '#7CFF6B', cost: 70,
    air: true, ground: true, attack: 'arrow', dmgType: 'phys',
    blurb: 'Fast, cheap arrows. Hits flyers.',
    levels: [
      { dmg: 11, rate: 1.3, range: 3.0 },
      { cost: 65, dmg: 19, rate: 1.45, range: 3.2 },
      { cost: 120, dmg: 30, rate: 1.6, range: 3.4 },
    ],
    branches: [
      { name: 'Ranger Spire', color: '#C2FF4D', cost: 240, dmg: 34, rate: 1.75, range: 3.6, multishot: 3,
        blurb: 'Looses three arrows at three different foes.' },
      { name: 'Marksman Roost', color: '#4DFFD2', cost: 260, dmg: 100, rate: 0.9, range: 5.2, crit: 0.25, critMult: 3, pierce: 0.5,
        blurb: 'Huge range. 25% chance to crit for triple damage. Ignores half of armor.' },
    ],
  },
  mage: {
    name: 'Mage Tower', short: 'Mage', color: '#B46BFF', cost: 110,
    air: true, ground: true, attack: 'bolt', dmgType: 'magic',
    blurb: 'Arcane bolts that ignore armor. Hits flyers.',
    levels: [
      { dmg: 27, rate: 0.75, range: 2.8 },
      { cost: 95, dmg: 46, rate: 0.8, range: 3.0 },
      { cost: 160, dmg: 74, rate: 0.85, range: 3.2 },
    ],
    branches: [
      { name: 'Archmage Spire', color: '#6BC8FF', cost: 300, dmg: 95, rate: 0.95, range: 3.4, chain: 5, chainFall: 0.8, attack: 'chain',
        blurb: 'Chain lightning leaps between up to five foes.' },
      { name: 'Void Obelisk', color: '#FF4DD8', cost: 300, dmg: 200, rate: 0.6, range: 3.4, splash: 1.0, weaken: 0.25,
        blurb: 'A slow void orb that bursts in an area. Struck foes take 25% more damage for 3s.' },
    ],
  },
  bombard: {
    name: 'Dwarven Bombard', short: 'Bombard', color: '#FFA23D', cost: 125,
    air: false, ground: true, attack: 'shell', dmgType: 'phys',
    blurb: 'Explosive shells hit every foe in the blast. Ground only.',
    levels: [
      { dmg: 34, rate: 0.55, range: 3.0, splash: 0.85 },
      { cost: 105, dmg: 56, rate: 0.55, range: 3.1, splash: 0.95 },
      { cost: 175, dmg: 88, rate: 0.6, range: 3.3, splash: 1.05 },
    ],
    branches: [
      { name: 'Siege Mortar', color: '#FF6A2B', cost: 320, dmg: 175, rate: 0.42, range: 5.6, splash: 1.45, burnGround: 30,
        blurb: 'Enormous range and blast. Leaves the ground burning for 3s.' },
      { name: 'Thunder Cannon', color: '#FFE14D', cost: 320, dmg: 78, rate: 0.62, range: 3.5, splash: 0.85, cluster: 3, stun: 0.6,
        blurb: 'Fires three shells at once. Each blast stuns for 0.6s.' },
    ],
  },
  frost: {
    name: 'Frost Spire', short: 'Frost', color: '#5CE1FF', cost: 90,
    air: true, ground: true, attack: 'pulse', dmgType: 'magic',
    blurb: 'Pulses cold that slows every foe in range. Hits flyers.',
    levels: [
      { dmg: 6, rate: 1.0, range: 2.2, slow: 0.35, slowDur: 1.6 },
      { cost: 80, dmg: 11, rate: 1.0, range: 2.3, slow: 0.45, slowDur: 1.6 },
      { cost: 130, dmg: 18, rate: 1.0, range: 2.5, slow: 0.55, slowDur: 1.8 },
    ],
    branches: [
      { name: 'Glacier Heart', color: '#D2F4FF', cost: 260, dmg: 34, rate: 1.0, range: 2.6, slow: 0.6, slowDur: 2, freeze: 0.15, freezeDur: 1.3,
        blurb: '15% chance per pulse to freeze a foe solid for 1.3s. Bosses resist.' },
      { name: 'Blizzard Spire', color: '#4DFFF0', cost: 260, dmg: 55, rate: 1.0, range: 3.1, slow: 0.5, slowDur: 2, brittle: 0.25,
        blurb: 'Wide storm. Slowed foes are brittle and take 25% more damage from everything.' },
    ],
  },
  flame: {
    name: 'Flame Brazier', short: 'Flame', color: '#FF5236', cost: 100,
    air: false, ground: true, attack: 'cone', dmgType: 'fire',
    blurb: 'Breathes a cone of fire. Burning stops trolls healing. Ground only.',
    levels: [
      { dps: 26, burn: 6, range: 2.0 },
      { cost: 90, dps: 44, burn: 10, range: 2.05 },
      { cost: 155, dps: 70, burn: 16, range: 2.2 },
    ],
    branches: [
      { name: 'Inferno Pit', color: '#FF2E4D', cost: 300, dps: 140, burn: 36, range: 2.4,
        blurb: 'A roaring jet of flame with a long, heavy burn.' },
      { name: 'Phoenix Roost', color: '#FFC23D', cost: 300, dps: 95, burn: 22, range: 2.3, phoenix: 90,
        blurb: 'Foes that die burning explode, scorching everything near them.' },
    ],
  },
  beacon: {
    name: 'Rune Beacon', short: 'Beacon', color: '#FFD84D', cost: 150,
    air: false, ground: false, attack: 'aura', dmgType: null,
    blurb: 'Empowers nearby towers. Does not attack.',
    levels: [
      { range: 2.0, bDmg: 0.15, bRate: 0, bRange: 0 },
      { cost: 130, range: 2.2, bDmg: 0.22, bRate: 0, bRange: 0 },
      { cost: 190, range: 2.4, bDmg: 0.3, bRate: 0, bRange: 0.1 },
    ],
    branches: [
      { name: 'War Banner', color: '#FF8A4D', cost: 320, range: 2.5, bDmg: 0.4, bRate: 0.25, bRange: 0.1,
        blurb: 'Nearby towers deal 40% more damage and attack 25% faster.' },
      { name: 'Gilded Shrine', color: '#FFF06B', cost: 260, range: 2.6, bDmg: 0.3, bRate: 0, bRange: 0.1, goldWave: 60, bounty: 0.35,
        blurb: '+60 gold every wave. Foes slain in its glow drop 35% more gold.' },
    ],
  },
};
// Branches inherit anything they don't override from level 3.
for (const k of TOWER_ORDER) {
  const d = TOWERS[k];
  d.key = String(TOWER_ORDER.indexOf(k) + 1);
  d.branches = d.branches.map(b => Object.assign({}, d.levels[2], { cost: 0 }, b));
}

// Enemy speed is in tiles per second.
const ENEMIES = {
  goblin:   { name: 'Goblin Raider', hp: 44, speed: 1.1, gold: 4, size: 9, color: '#FF5D8F', shape: 'goblin',
              blurb: 'Quick and plentiful.' },
  wolf:     { name: 'Dire Wolf', hp: 36, speed: 2.0, gold: 4, size: 10, color: '#FF9A5C', shape: 'wolf',
              blurb: 'Very fast. Slow it down.' },
  orc:      { name: 'Orc Brute', hp: 150, speed: 0.75, armor: 0.45, gold: 10, size: 13, color: '#FF3D5A', shape: 'orc',
              blurb: 'Armor blunts arrows and shells. Magic and fire cut through.' },
  harpy:    { name: 'Harpy', hp: 62, speed: 1.35, flying: true, gold: 7, size: 11, color: '#FF6BE0', shape: 'harpy',
              blurb: 'Flies. Only Archer, Mage and Frost towers reach it.' },
  shaman:   { name: 'Goblin Shaman', hp: 95, speed: 0.9, ward: 0.3, gold: 12, size: 10, color: '#D6FF5C', shape: 'shaman',
              heal: { every: 3.5, pct: 0.12, radius: 1.6 }, blurb: 'Heals nearby foes. Kill it first.' },
  slime:    { name: 'Bog Slime', hp: 125, speed: 0.85, gold: 6, size: 13, color: '#6BFFB0', shape: 'slime',
              split: { type: 'slimelet', count: 2 }, blurb: 'Splits in two when slain.' },
  slimelet: { name: 'Slimelet', hp: 42, speed: 1.25, gold: 2, size: 8, color: '#6BFFB0', shape: 'slime', minor: true },
  troll:    { name: 'Cave Troll', hp: 280, speed: 0.7, armor: 0.2, gold: 20, lives: 2, size: 15, color: '#FFB347', shape: 'troll',
              regen: 0.02, blurb: 'Regenerates fast. Fire stops the healing.' },
  wraith:   { name: 'Wraith', hp: 115, speed: 1.25, ward: 0.5, gold: 12, size: 11, color: '#B8A6FF', shape: 'wraith',
              phase: { every: 4, dur: 1.2 }, blurb: 'Fades out of reach every few seconds. Resists magic.' },
  knight:   { name: 'Ashen Knight', hp: 270, speed: 0.8, armor: 0.7, gold: 18, lives: 2, size: 13, color: '#FF7A7A', shape: 'knight',
              blurb: 'Heavy armor. Arrows and shells barely scratch it.' },
  skeleton: { name: 'Skeleton', hp: 38, speed: 1.05, armor: 0.2, gold: 1, size: 8, color: '#E4E6FF', shape: 'skeleton', minor: true },
  warlord:  { name: 'Ogre Warlord', hp: 1800, speed: 0.5, armor: 0.3, gold: 150, lives: 8, size: 24, color: '#FF4040', shape: 'ogre', boss: true,
              stomp: { every: 8, radius: 1.6, dur: 2.5 }, blurb: 'Boss. Stomps the ground and knocks nearby towers out for a few seconds.' },
  lich:     { name: 'The Hollow Lich', hp: 1900, speed: 0.55, ward: 0.55, gold: 180, lives: 8, size: 20, color: '#9D7BFF', shape: 'lich', boss: true,
              summon: { every: 5, type: 'skeleton', count: 3 }, blurb: 'Boss. Raises skeletons as it walks. Wards against magic.' },
  wyrm:     { name: 'Ember Wyrm', hp: 3600, speed: 0.6, flying: true, fireRes: 0.8, gold: 300, lives: 12, size: 28, color: '#FF6A2B', shape: 'wyrm', boss: true,
              blurb: 'Boss. Flies, and fire barely warms it.' },
};
for (const k in ENEMIES) {
  const e = ENEMIES[k];
  e.id = k; e.armor = e.armor || 0; e.ward = e.ward || 0; e.lives = e.lives || 1;
}

const DIFFS = {
  squire: { name: 'Squire', hp: 0.8, gold: 1.2, bounty: 1.1, lives: 30, note: 'Gentler foes, more gold, 30 lives.' },
  knight: { name: 'Knight', hp: 1.0, gold: 1.0, bounty: 1.0, lives: 20, note: 'The intended challenge. 20 lives.' },
  legend: { name: 'Legend', hp: 1.25, gold: 1.0, bounty: 0.9, lives: 10, note: 'Tougher foes, leaner purse, 10 lives.' },
};

// Paths are tile waypoints [col,row]; -1 or 20 is just off the board.
// The last waypoint of each path is the keep.
const MAPS = [
  {
    id: 'vale', name: 'Whisperwood Vale', waves: 15, startGold: 280, hp: 1.0, budget: 1.0,
    blurb: 'One winding road through the old forest. Learn the craft here.',
    accent: '#38F2C2', ground: '#050c10', road: '#0b171c', decor: 'forest',
    paths: [[[-1, 2], [4, 2], [4, 8], [9, 8], [9, 3], [14, 3], [14, 8], [18, 8]]],
    water: [[11, 10], [12, 10], [11, 11], [12, 11], [13, 11], [0, 11], [1, 11], [0, 10]],
    roster: [['goblin', 1], ['wolf', 3], ['orc', 5], ['harpy', 7], ['shaman', 9], ['slime', 11]],
    bosses: { 15: ['warlord'] },
  },
  {
    id: 'fords', name: 'Twin Fords', waves: 20, startGold: 330, hp: 1.0, budget: 1.0,
    blurb: 'Two roads meet at the river bridge. Hold the crossing.',
    accent: '#4DA8FF', ground: '#050913', road: '#0b1222', decor: 'river',
    paths: [
      [[-1, 2], [5, 2], [5, 6], [11, 6], [11, 9], [16, 9], [16, 3], [18, 3]],
      [[-1, 10], [5, 10], [5, 6], [11, 6], [11, 9], [16, 9], [16, 3], [18, 3]],
    ],
    river: [8, 9],
    roster: [['goblin', 1], ['wolf', 2], ['orc', 3], ['harpy', 5], ['shaman', 6], ['slime', 8], ['troll', 11], ['wraith', 14]],
    bosses: { 10: ['warlord'], 20: ['lich'] },
  },
  {
    id: 'coil', name: "Serpent's Coil", waves: 25, startGold: 380, hp: 1.42, budget: 1.0,
    blurb: 'The road loops back across itself. Towers at the crossing strike twice.',
    accent: '#C77DFF', ground: '#09060f', road: '#140d20', decor: 'crystal',
    paths: [[[-1, 5], [14, 5], [14, 1], [9, 1], [9, 10], [17, 10], [17, 6]]],
    roster: [['goblin', 1], ['wolf', 1], ['orc', 2], ['harpy', 4], ['shaman', 5], ['slime', 6], ['troll', 8], ['wraith', 10], ['knight', 14]],
    bosses: { 12: ['lich'], 25: ['wyrm'] },
  },
  {
    id: 'maw', name: "Dragon's Maw", waves: 30, startGold: 500, hp: 0.95, budget: 1.0,
    blurb: 'The road forks around a lake of fire. Foes take both ways.',
    accent: '#FF6B3D', ground: '#0d0606', road: '#1a0b0b', decor: 'ember',
    paths: [
      [[-1, 6], [4, 6], [4, 2], [13, 2], [13, 6], [18, 6]],
      [[-1, 6], [4, 6], [4, 10], [13, 10], [13, 6], [18, 6]],
    ],
    lava: [[8, 5], [9, 5], [8, 6], [9, 6], [8, 7], [9, 7], [7, 6], [10, 6]],
    roster: [['goblin', 1], ['wolf', 2], ['orc', 3], ['harpy', 4], ['shaman', 6], ['slime', 7], ['troll', 9], ['wraith', 11], ['knight', 14]],
    bosses: { 12: ['warlord'], 22: ['lich'], 30: ['wyrm', 'warlord'] },
  },
];

// ---------- Waves ----------
const UNIT_COST = { goblin: 1, wolf: 1, orc: 3, harpy: 2, shaman: 3, slime: 4, troll: 8, wraith: 3, knight: 6 };
const UNIT_GAP = { goblin: 0.75, wolf: 0.55, orc: 1.3, harpy: 0.9, shaman: 1.6, slime: 1.3, troll: 2.2, wraith: 1.1, knight: 1.8 };
const ENDLESS_BOSSES = ['warlord', 'lich', 'wyrm'];

function hpScale(map, w) {
  const x = w - 1;
  let s = 1 + 0.1 * x + 0.0075 * x * x;
  if (w > map.waves) s *= Math.pow(1.045, w - map.waves);
  return s * map.hp;
}

function bossesFor(map, w, endless) {
  if (map.bosses[w]) return map.bosses[w];
  if (endless && w > map.waves && w % 5 === 0) return [ENDLESS_BOSSES[(w / 5) % 3]];
  return null;
}

// Deterministic per map + wave, so the preview always matches what spawns.
function makeWave(map, w, endless) {
  const rng = mulberry32(hashStr(map.id) ^ (w * 2654435761));
  const unlocked = map.roster.filter(r => r[1] <= w).map(r => r[0]);
  const fresh = map.roster.find(r => r[1] === w && w > 1);
  const bosses = bossesFor(map, w, endless);
  let budget = Math.round((9 + 3.1 * w) * map.budget);
  if (bosses) budget = Math.round(budget * 0.35);
  const multi = map.paths.length > 1;
  const groups = [];

  if (w === 1) return { groups: [{ type: 'goblin', count: Math.round(10 * map.budget), gap: 1.0, delay: 0, path: multi ? 'alt' : 0 }], bosses: null };
  const types = [];
  if (fresh) types.push(fresh[0]);
  let want = w <= 2 ? 1 : w < 6 ? 2 : (rng() < 0.55 ? 2 : 3);
  if (fresh) want = Math.max(want, 2);
  let guard = 0;
  while (types.length < Math.min(want, unlocked.length) && guard++ < 40) {
    // Later unlocks are likelier, so waves keep evolving.
    let total = 0;
    const weights = unlocked.map((t, i) => (total += 1 + i * 0.9));
    const r = rng() * total;
    const t = unlocked[weights.findIndex(x => x >= r)];
    if (!types.includes(t)) types.push(t);
  }
  if (!types.length) types.push('goblin');

  let t0 = 0;
  let remaining = budget;
  types.forEach((type, i) => {
    const last = i === types.length - 1;
    const share = last ? remaining : Math.round(budget * (i === 0 ? 0.5 : 0.3));
    let count = Math.max(1, Math.round(share / UNIT_COST[type]));
    if (fresh && type === fresh[0]) count = Math.max(2, Math.min(count, 1 + Math.round(budget / UNIT_COST[type] * 0.3)));
    remaining = Math.max(UNIT_COST.goblin, remaining - count * UNIT_COST[type]);
    const gap = UNIT_GAP[type] * (1 - Math.min(0.35, w * 0.011));
    const path = multi ? (rng() < 0.5 ? 'alt' : Math.floor(rng() * map.paths.length)) : 0;
    groups.push({ type, count, gap, delay: t0, path });
    t0 += count * gap * 0.55 + 1.2;
  });

  if (bosses) {
    bosses.forEach((b, i) => {
      groups.push({ type: b, count: 1, gap: 1, delay: t0 + 2 + i * 6, path: multi ? i % map.paths.length : 0 });
    });
  }
  return { groups, bosses };
}

function waveSummary(wave) {
  const counts = {};
  for (const g of wave.groups) counts[g.type] = (counts[g.type] || 0) + g.count;
  return Object.entries(counts);
}
