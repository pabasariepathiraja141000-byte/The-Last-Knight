# 🔴 Blood Moon: The Last Knight

A small, hard, replayable isometric pixel-art roguelite built with plain HTML5 Canvas — no engine, no build step, no external assets. Three files, runs anywhere.

**[Play it →](#deploying-to-github-pages)** (see setup below)

## The Story

The Kingdom of Elarion has fallen. Queen Elowen has vanished. Princess Seraphine is
chained inside the Black Fortress, held for sacrifice when the Blood Moon rises.
The King's army is dead. Only one knight still draws breath.

You are **Sir Alaric**. You have **15 minutes** before the moon turns red. Fight
your way through 5 themed levels, grow stronger, and reach the Dragon King's
throne room before time runs out.

## How to Play

**Keyboard/mouse:**

| Action | Key |
|---|---|
| Move | `WASD` or Arrow Keys |
| Swing weapon | `Space` or Left Click |
| Shoot bow (once found) | `F` |
| Throw bomb (once found) | `B` |
| Dash (once unlocked) | `Shift` |
| Interact / open chest | `E` |
| Pause | `P` |

**Touch (phone/tablet):** the game detects touch devices automatically and
shows on-screen controls — a virtual joystick (bottom-left) for movement, and
buttons (bottom-right) for **⚔ Swing** (manual, one tap = one swing, same as
Space), **🏹 Shoot**, **💣 Bomb**, **DASH**, and **E Interact**, plus a pause
button (**II**) top-center. The whole game scales to fit the screen.

Clear every enemy in a level to summon its boss. Defeat the boss to open a
portal to the next level. Reach and defeat the **Dragon King** in the Throne
Room before the 15-minute timer hits zero to rescue the Princess and win.
If you run out of time, or die anywhere along the way, the run ends — start
over from Level 1. Enemy spawns, elites, ambushes, and item drops are
randomized every run, so no two attempts play out the same.

### Levels
1. Whispering Forest — Wolves, Goblins, Bandits → **Giant Wolf**
2. Cursed Graveyard — Zombies, Skeletons, Ghosts → **Vampire Lord**
3. Frozen Mountains — Wolves, Trolls, Dark Archers → **Ice Dragon**
4. Orc Volcano Camp — Orcs, Minotaurs, Witches → **Stone Golem**
5. Dragon King's Throne Room — Knights, Necromancers, Demons → **Dragon King**

### Loot
Potions, weapon upgrades (Rusty Sword → Long Sword → Great Sword → Battle
Axe, plus a Longbow), bombs, gold, and upgrade orbs (Sharper Blade, Swift
Strikes, Vitality, Regeneration, Iron Skin, Dash, Multi-Shot, Critical Eye).
A hidden treasure chest sits somewhere in every level — press `E` next to it.

## Files

```
index.html   – page structure & HUD/screen overlays
style.css    – dark fantasy UI styling
game.js      – the entire game engine (rendering, combat, AI, levels)
```

No build tools, no dependencies, no bundler — just static files.

## Deploying to GitHub Pages

1. Create a new repository on GitHub and push these three files to it
   (e.g. via the web UI "Add file → Upload files", or `git push`).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`, then **Save**.
4. Wait a minute, then your game will be live at:
   `https://<your-username>.github.io/<repo-name>/`
5. Share that link — it works on desktop browsers out of the box (keyboard
   required, so it's not built for mobile touch).

## Notes

Difficulty is tuned to be genuinely hard to finish inside the time limit —
that's intentional (it's a roguelite: expect to lose a few runs before you
learn the enemy patterns and loot priorities). Everything renders procedurally
on `<canvas>` (no image files), so the whole game is fully contained in the
three files above. Touch controls make it playable on phones/tablets, but a
larger screen (tablet or desktop) gives more room to see incoming enemies.
