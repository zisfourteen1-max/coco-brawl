// Staged scenes for the screenshots: each shot name resets the world and plays
// it forward with a simple autopilot driving the player, so the screenshot is
// a real render of the game's own code in a lively state — a live fight, a
// fountain contest, a finished match — not a hand-drawn mock-up. The same
// seed always stages the same scene.

import { STEP } from './config.js';

/** An intent for the player that chases the nearest visible enemy, holds the
 *  hero's preferred range, strafes, and heads for the fountain when there is
 *  nothing to shoot at. */
function autopilot(world) {
  const state = world.state;
  const me = state.fighters[0];
  if (!me.alive) return null;
  let target = null;
  let best = Infinity;
  for (const fighter of state.fighters) {
    if (!fighter.alive || fighter.team === me.team) continue;
    const dist = Math.hypot(fighter.x - me.x, fighter.y - me.y);
    if (dist < best && world.lineOfSight(me.x, me.y, fighter.x, fighter.y)) {
      target = fighter;
      best = dist;
    }
  }
  const intent = {
    moveX: 0,
    moveY: 0,
    aimX: me.x + 100,
    aimY: me.y,
    shooting: false,
    ability: false,
    reload: false,
  };
  if (target) {
    intent.aimX = target.x;
    intent.aimY = target.y;
    intent.shooting = best < 520;
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const toward = best > 320 ? 1 : best < 220 ? -1 : 0;
    const strafe = Math.sin(state.elapsed * 1.3) > 0 ? 1 : -1;
    intent.moveX = (dx / len) * toward + (-dy / len) * strafe * 0.7;
    intent.moveY = (dy / len) * toward + (dx / len) * strafe * 0.7;
    const moveLen = Math.hypot(intent.moveX, intent.moveY) || 1;
    intent.moveX /= moveLen;
    intent.moveY /= moveLen;
    intent.ability = me.abilityCd <= 0 && best < 300 && Math.random() < 0.02;
    return intent;
  }
  if (state.mode === 'fountain') {
    const dx = state.fountain.x - me.x;
    const dy = state.fountain.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    intent.moveX = dx / len;
    intent.moveY = dy / len;
    intent.aimX = state.fountain.x;
    intent.aimY = state.fountain.y;
    return intent;
  }
  let near = null;
  let nearDist = Infinity;
  for (const fighter of state.fighters) {
    if (!fighter.alive || fighter.team === me.team) continue;
    const dist = Math.hypot(fighter.x - me.x, fighter.y - me.y);
    if (dist < nearDist) {
      near = fighter;
      nearDist = dist;
    }
  }
  if (near) {
    const dx = near.x - me.x;
    const dy = near.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    intent.moveX = dx / len;
    intent.moveY = dy / len;
    intent.aimX = near.x;
    intent.aimY = near.y;
  }
  return intent;
}

function playFor(world, bots, seconds, attract) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    bots.update(STEP, attract);
    world.step(STEP, attract ? null : autopilot(world), attract);
  }
}

/** Stage one named scene and return the screen it should be painted on. */
export function stageShot(name, world, bots) {
  switch (name) {
    case 'menu': {
      world.reset('boba', 'death');
      playFor(world, bots, 5, true);
      return 'title';
    }
    case 'fight': {
      world.reset('boba', 'death');
      playFor(world, bots, 20, false);
      // Make sure the player is alive and on screen for the shot.
      let waited = 0;
      while (!world.player().alive && waited < 3) {
        bots.update(STEP, false);
        world.step(STEP, null, false);
        waited += STEP;
      }
      return 'play';
    }
    case 'fountain': {
      world.reset('mochi', 'fountain');
      playFor(world, bots, 25, false);
      let waited = 0;
      while (!world.player().alive && waited < 3) {
        bots.update(STEP, false);
        world.step(STEP, null, false);
        waited += STEP;
      }
      return 'play';
    }
    case 'win': {
      // A 19-17 match, played out until somebody pops the 20th. The staged
      // shot is a COCO win, so replay the ending until the home team closes
      // it out (the seeded stream advances between attempts, so each try
      // plays differently).
      let attempts = 0;
      while (attempts < 5) {
        world.reset('waffle', 'death');
        world.state.score.coco = 19;
        world.state.score.berry = 17;
        let seconds = 0;
        while (!world.state.over && seconds < 120) {
          bots.update(STEP, false);
          world.step(STEP, autopilot(world), false);
          seconds += STEP;
        }
        if (world.state.over && world.state.winner === 'coco') break;
        attempts += 1;
      }
      // The autopilot almost always closes it out; if it did not, the
      // staged result is the same one a real 20th pop would show.
      if (!world.state.over || world.state.winner !== 'coco') {
        world.state.score.coco = 20;
        world.state.score.berry = 17;
        world.state.over = true;
        world.state.winner = 'coco';
      }
      return 'over';
    }
    default:
      world.reset('boba', 'death');
      return 'title';
  }
}
