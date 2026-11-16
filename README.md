# Lumen Keep

A neon-lit fantasy tower defense that runs in any modern browser. The whole
game is one HTML file: no install, no server, no downloads beyond two web fonts.

Raise towers of arrow, spell, frost and flame along glowing rune-roads, and
hold the keep until dawn.

## Play

- **Download and open:** save [`index.html`](index.html) and open it in a browser.
- **On the web:** with GitHub Pages turned on for this repository
  (Settings → Pages → Deploy from a branch → `main`, `/ (root)`), the game is
  at `https://<owner>.github.io/lumen-keep/`.

It works with a mouse and keyboard or on a touch screen. On a phone held
upright, the battlefield turns to fill the screen.

## What's in it

- **Six towers, twelve specialists.** Each tower has three levels, then a
  choice of two specialists:

  | Tower | Role | Specialists |
  |---|---|---|
  | Archer | Fast, cheap, hits flyers | Ranger Spire (three arrows) · Marksman Roost (long range, crits, armor pierce) |
  | Mage | Magic that ignores armor | Archmage Spire (chain lightning) · Void Obelisk (area orb that weakens) |
  | Bombard | Area damage, ground only | Siege Mortar (huge range, burning ground) · Thunder Cannon (three shells that stun) |
  | Frost | Slows everything in range | Glacier Heart (freezes solid) · Blizzard Spire (slowed foes take more damage) |
  | Flame | Cone of fire, burn over time | Inferno Pit (heavy burn) · Phoenix Roost (burning foes explode) |
  | Beacon | Empowers nearby towers | War Banner (faster attacks) · Gilded Shrine (more gold) |

- **Thirteen foes with real abilities:** healers, slimes that split, trolls
  that regenerate (fire stops it), wraiths that fade out of reach, heavily
  armored knights, flyers, and three bosses: an ogre that knocks towers out,
  a lich that raises skeletons, and a flying dragon that fire barely warms.
- **Four maps:** a winding forest road, two roads meeting at a river bridge,
  a road that crosses itself, and a road that forks around a lake of fire.
- **Three difficulties** (Squire, Knight, Legend), star ratings, and an
  Endless mode for each map you have won. Progress is saved in the browser.
- **Two spells,** speed control, early-call gold bonus, a preview of the next
  wave, and per-tower targeting (first, last, strongest, closest).
- Synthesized sound effects and an ambient score, made in the browser with
  the Web Audio API. There are no audio files.

## Keys

| Key | Action |
|---|---|
| `1`–`6` | Choose a tower to build (hold `Shift` to place several) |
| `Q` / `W` | Starfall / Arcane Snare |
| `N` | Call the next wave |
| `U` | Upgrade the selected tower |
| `T` | Change its target |
| `Del` | Sell it |
| `F` | Change speed |
| `Space` | Pause and plan |
| `Esc` | Cancel, or open the menu |

## Development

The game is plain JavaScript on a 2D canvas, with no framework and no
dependencies. The source lives in `src/` and is joined into `index.html` by
the build script:

```bash
sh build.sh
```

| File | Contents |
|---|---|
| `src/head.html`, `src/body.html` | Page layout and styles |
| `src/00-util.js` | Math, colors and the glow sprites behind the neon look |
| `src/01-audio.js` | Sound effects and music |
| `src/02-data.js` | Towers, foes, maps, difficulties and the wave generator |
| `src/03-game.js` | The simulation, a fixed 60 steps per second |
| `src/04-render.js` | Drawing the battlefield |
| `src/05-ui.js` | Menus, sidebar, tower inspector and input |
| `src/06-main.js` | Game loop, automatic quality adjustment and start-up |

Two test scripts drive the game in a headless browser:

```bash
npm install
npx playwright install chromium
```

```bash
npm test
```

```bash
npm run balance
```

`npm test` plays through building, upgrading, spells, pausing, selling and
winning a map with real clicks and keys. `npm run balance` has an automated
player run each map and reports how far it gets and how many lives it keeps,
for tuning the numbers in `src/02-data.js`.

## License

MIT. See [LICENSE](LICENSE).

Built with [Claude Code](https://claude.com/claude-code).
