// COCO BRAWL: boot, the fixed-step loop, screens, and the wiring between the
// world, the bots, the renderer and the sound. The simulation runs at a fixed
// 60 Hz no matter the frame rate; the renderer paints whatever the world
// holds. With ?shot=menu|fight|fountain|win the game stages that scene and
// paints it twice instead of looping, for the screenshots.

import { STEP, BEST_KEY, WIN_KILLS } from './config.js';
import { createRandom } from './random.js';
import { HERO_IDS, HEROES, DEFAULT_HERO } from './heroes.js';
import { createWorld, EVENT_FOUNTAIN, EVENT_WIN } from './world.js';
import { createBots } from './bots.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from './render.js';
import { createAudio } from './audio.js';
import {
  createInput,
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_ABILITY,
  ACTION_RELOAD,
  ACTION_MUTE,
  ACTION_MODE,
} from './input.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const world = createWorld(createRandom(seed), 'death');
const bots = createBots(world);
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let selectedHero = DEFAULT_HERO;
let currentMode = 'death';
let time = 0;
let hitTimer = 0;
let killTimer = 0;
let hurtTimer = 0;
let banner = null;
let bannerTimer = 0;
let winTimer = 0;
let abilityQueued = false;
let reloadQueued = false;

let best = 0;
try {
  best = Number(window.localStorage.getItem(BEST_KEY) || '0') || 0;
} catch {
  best = 0;
}

function announce(message) {
  if (status) status.textContent = message;
}

function saveBest() {
  try {
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // A browser that refuses storage still plays fine.
  }
}

function startGame() {
  world.reset(selectedHero, currentMode);
  bots.reset();
  screen = SCREEN_PLAY;
  winTimer = 0;
  banner = {
    title: currentMode === 'fountain' ? 'FOUNTAIN CONTROL' : 'TEAM DEATHMATCH',
    sub:
      currentMode === 'fountain'
        ? 'Stand in the fountain to fill your bottle to 100!'
        : `First team to ${WIN_KILLS} pops wins!`,
  };
  bannerTimer = 2.4;
  audio.unlock();
  audio.click();
  announce(`Match started. You are ${HEROES[selectedHero].name}.`);
}

function toggleMode() {
  currentMode = currentMode === 'death' ? 'fountain' : 'death';
  audio.click();
  announce(currentMode === 'fountain' ? 'Mode: Fountain Control.' : 'Mode: Team Deathmatch.');
}

/** The player's intent for one fixed step, from the held keys and the mouse. */
function buildIntent() {
  const move = input.moveVector();
  const mouse = input.mouse();
  const aim = renderer.toField(mouse.x, mouse.y);
  const intent = {
    moveX: move.x,
    moveY: move.y,
    aimX: aim.x,
    aimY: aim.y,
    shooting: mouse.down,
    ability: abilityQueued,
    reload: reloadQueued,
  };
  abilityQueued = false;
  reloadQueued = false;
  return intent;
}

/** Sounds and juice from what changed for the player in one step. */
function handleStep(player, before, events) {
  if (player.mag < before.mag) audio.shoot(player.heroId);
  if (player.shotsHit > before.shotsHit) {
    hitTimer = 0.18;
    audio.hit();
  }
  if (player.kills > before.kills) {
    killTimer = 0.3;
    audio.kill();
  }
  if (player.hp < before.hp || (!player.alive && before.alive)) {
    hurtTimer = 0.4;
    audio.hurt();
  }
  if (player.reloading && !before.reloading) audio.reload();
  if (player.abilityCd > before.abilityCd + 0.01) audio.ability();
  if (events & EVENT_FOUNTAIN) audio.fountain();
  if (events & EVENT_WIN) {
    winTimer = 1.4;
    if (world.state.winner === 'coco') {
      best += 1;
      saveBest();
      audio.win();
      announce('COCO wins the match!');
    } else if (world.state.winner === 'berry') {
      audio.lose();
      announce('BERRY wins the match.');
    } else {
      audio.lose();
      announce('The match is a draw.');
    }
  }
}

function handleActions(actions) {
  if (actions & ACTION_MUTE) audio.toggleMute();
  const pick = input.takeHeroPick();
  if (pick >= 0 && pick < HERO_IDS.length) {
    selectedHero = HERO_IDS[pick];
    audio.click();
    announce(`Hero: ${HEROES[selectedHero].name}.`);
  }
  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_MODE) toggleMode();
    if (actions & ACTION_CONFIRM) {
      const mouse = input.mouse();
      const aim = renderer.toField(mouse.x, mouse.y);
      const card = renderer.heroCardAt(aim.x, aim.y);
      if (card >= 0) {
        selectedHero = HERO_IDS[card];
        audio.click();
        announce(`Hero: ${HEROES[selectedHero].name}.`);
      } else {
        startGame();
      }
    }
  } else if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      audio.click();
      announce('Paused.');
    }
    if (actions & ACTION_ABILITY) abilityQueued = true;
    if (actions & ACTION_RELOAD) reloadQueued = true;
  } else if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      audio.unlock();
      audio.click();
      announce('Resumed.');
    }
  } else if (screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) startGame();
  }
}

function stepSimulation() {
  if (screen === SCREEN_TITLE) {
    bots.update(STEP, true);
    world.step(STEP, null, true);
  } else if (screen === SCREEN_PLAY) {
    bots.update(STEP, false);
    const player = world.player();
    const before = {
      mag: player.mag,
      shotsHit: player.shotsHit,
      kills: player.kills,
      hp: player.hp,
      alive: player.alive,
      reloading: player.reloading,
      abilityCd: player.abilityCd,
    };
    const events = world.step(STEP, buildIntent(), false);
    handleStep(player, before, events);
  }
}

function tick(dt) {
  time += dt;
  hitTimer = Math.max(0, hitTimer - dt);
  killTimer = Math.max(0, killTimer - dt);
  hurtTimer = Math.max(0, hurtTimer - dt);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) banner = null;
  }
  if (winTimer > 0) {
    winTimer -= dt;
    if (winTimer <= 0 && world.state.over && screen === SCREEN_PLAY) {
      screen = SCREEN_OVER;
    }
  }
  handleActions(input.takeActions());
  const mouse = input.mouse();
  const ui = {
    time,
    mouse: screen === SCREEN_PLAY ? renderer.toField(mouse.x, mouse.y) : null,
    hitTimer,
    killTimer,
    hurtTimer,
    banner,
    heroId: selectedHero,
    mode: currentMode,
    best,
    muted: audio.isMuted(),
  };
  renderer.draw(world.state, screen, ui);
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    stepSimulation();
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;
  tick(dt);
  requestAnimationFrame(frame);
}

if (shot) {
  // Screenshot mode: stage the scene, paint it twice, and say so.
  screen = stageShot(shot, world, bots);
  const mouse = screen === SCREEN_PLAY ? { x: 900, y: 300 } : null;
  world.state.shake = 0;
  const ui = {
    time: 12,
    mouse,
    hitTimer: 0,
    killTimer: 0,
    hurtTimer: 0,
    banner: null,
    heroId: selectedHero,
    mode: world.state.mode,
    best,
    muted: false,
  };
  renderer.draw(world.state, screen, ui);
  renderer.draw(world.state, screen, ui);
  window.__shotReady = true;
  // Keep repainting the frozen scene: resizing the window clears a canvas,
  // and the screenshot may land after a resize.
  (function repaint() {
    renderer.draw(world.state, screen, ui);
    requestAnimationFrame(repaint);
  })();
} else {
  requestAnimationFrame(frame);
}
