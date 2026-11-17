// Bot brains for COCO BRAWL: each bot keeps a little memory (target, strafe
// side, reaction delay) and, ten times a second, picks a new intent for its
// fighter: where to move, where to aim, when to shoot, when to spend its
// ability. Bots see through the same line-of-sight rules as the player, react
// slower than a human, and miss on purpose at range, so fights stay fair.

import { FIELD } from './config.js';
import { HEROES } from './heroes.js';

const THINK_INTERVAL = 0.12;
const SHOOT_RANGE = 540;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createBots(world) {
  const brains = new Map();

  function brainFor(fighter) {
    let brain = brains.get(fighter.id);
    if (!brain) {
      brain = {
        targetId: -1,
        strafe: 1,
        strafeTimer: 0,
        thinkTimer: Math.random() * THINK_INTERVAL,
        reaction: 0,
        fleeTimer: 0,
        unstickTimer: 0,
        lastX: fighter.x,
        lastY: fighter.y,
        stuckTimer: 0,
        wanderX: FIELD.width / 2,
        wanderY: FIELD.height / 2,
      };
      brains.set(fighter.id, brain);
    }
    return brain;
  }

  function nearestVisibleEnemy(fighter, state) {
    let best = null;
    let bestDist = Infinity;
    for (const other of state.fighters) {
      if (!other.alive || other.team === fighter.team) continue;
      const dist = distance(fighter, other);
      if (dist > SHOOT_RANGE || dist >= bestDist) continue;
      if (!world.lineOfSight(fighter.x, fighter.y, other.x, other.y)) continue;
      best = other;
      bestDist = dist;
    }
    return best;
  }

  function nearestEnemy(fighter, state) {
    let best = null;
    let bestDist = Infinity;
    for (const other of state.fighters) {
      if (!other.alive || other.team === fighter.team) continue;
      const dist = distance(fighter, other);
      if (dist < bestDist) {
        best = other;
        bestDist = dist;
      }
    }
    return best;
  }

  function preferredRange(heroId) {
    if (heroId === 'choco') return 170;
    if (heroId === 'waffle') return 380;
    if (heroId === 'mochi') return 260;
    return 300;
  }

  function think(fighter, brain, state, dt) {
    brain.thinkTimer -= dt;
    if (brain.thinkTimer > 0) return;
    brain.thinkTimer = THINK_INTERVAL;

    const hero = HEROES[fighter.heroId];
    const target = nearestVisibleEnemy(fighter, state);
    if (target && target.id !== brain.targetId) {
      brain.targetId = target.id;
      brain.reaction = 0.25 + Math.random() * 0.3;
    } else if (!target) {
      brain.targetId = -1;
    }
    if (brain.reaction > 0) brain.reaction -= THINK_INTERVAL;

    brain.strafeTimer -= THINK_INTERVAL;
    if (brain.strafeTimer <= 0) {
      brain.strafe = Math.random() < 0.5 ? -1 : 1;
      brain.strafeTimer = 0.6 + Math.random() * 0.9;
    }

    // Flee when hurt: run home for a moment instead of fighting.
    if (fighter.hp < 30 && brain.fleeTimer <= 0) brain.fleeTimer = 1.0;
    if (brain.fleeTimer > 0) brain.fleeTimer -= THINK_INTERVAL;

    // Stuck against a table: sidestep for a moment.
    const moved = Math.hypot(fighter.x - brain.lastX, fighter.y - brain.lastY);
    brain.lastX = fighter.x;
    brain.lastY = fighter.y;
    if (moved < 4 && (fighter.moveX !== 0 || fighter.moveY !== 0)) {
      brain.stuckTimer += THINK_INTERVAL;
      if (brain.stuckTimer > 0.5 && brain.unstickTimer <= 0) {
        brain.unstickTimer = 0.6;
        brain.stuckTimer = 0;
      }
    } else {
      brain.stuckTimer = 0;
    }
    if (brain.unstickTimer > 0) brain.unstickTimer -= THINK_INTERVAL;

    // Ability: spend it when it clearly helps, not the instant it is ready.
    fighter.wantAbility = false;
    if (fighter.abilityCd <= 0 && target) {
      const dist = distance(fighter, target);
      if (hero.ability.id === 'burst' && dist < 300) fighter.wantAbility = true;
      else if (hero.ability.id === 'shield' && fighter.hp < 50 && dist < 320) fighter.wantAbility = true;
      else if (hero.ability.id === 'wall' && fighter.hp < 55 && dist < 360) fighter.wantAbility = true;
      else if (hero.ability.id === 'dash' && (fighter.hp < 40 || dist > 420)) fighter.wantAbility = true;
    }

    // Aim: at the target with an error that grows with distance.
    if (target) {
      const dist = distance(fighter, target);
      const error = 14 + dist * 0.06;
      fighter.aimX = target.x + (Math.random() * 2 - 1) * error;
      fighter.aimY = target.y + (Math.random() * 2 - 1) * error;
      fighter.shooting = brain.reaction <= 0 && dist < SHOOT_RANGE;
    } else {
      fighter.shooting = false;
      const roam = nearestEnemy(fighter, state);
      if (roam) {
        fighter.aimX = roam.x;
        fighter.aimY = roam.y;
      }
    }

    // Move: hold the hero's preferred range, strafe, flee, or head for the fountain.
    let tx;
    let ty;
    if (brain.fleeTimer > 0) {
      tx = fighter.team === 'coco' ? 80 : FIELD.width - 80;
      ty = fighter.y;
      fighter.shooting = false;
    } else if (target) {
      const dist = distance(fighter, target);
      const want = preferredRange(fighter.heroId);
      const dx = target.x - fighter.x;
      const dy = target.y - fighter.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const toward = dist > want + 30 ? 1 : dist < want - 30 ? -1 : 0;
      const px = -dy / len;
      const py = dx / len;
      tx = fighter.x + (dx / len) * toward * 120 + px * brain.strafe * 120;
      ty = fighter.y + (dy / len) * toward * 120 + py * brain.strafe * 120;
    } else if (state.mode === 'fountain') {
      tx = state.fountain.x + (Math.random() * 2 - 1) * 30;
      ty = state.fountain.y + (Math.random() * 2 - 1) * 30;
    } else {
      const roam = nearestEnemy(fighter, state);
      if (roam) {
        tx = roam.x;
        ty = roam.y;
      } else {
        tx = brain.wanderX;
        ty = brain.wanderY;
        if (distance(fighter, { x: tx, y: ty }) < 60) {
          brain.wanderX = 120 + Math.random() * (FIELD.width - 240);
          brain.wanderY = 120 + Math.random() * (FIELD.height - 240);
        }
      }
    }
    if (brain.unstickTimer > 0) {
      const px = -(ty - fighter.y);
      const py = tx - fighter.x;
      const len = Math.max(1, Math.hypot(px, py));
      tx = fighter.x + (px / len) * 140;
      ty = fighter.y + (py / len) * 140;
    }
    const mdx = tx - fighter.x;
    const mdy = ty - fighter.y;
    const mlen = Math.hypot(mdx, mdy);
    if (mlen > 8) {
      fighter.moveX = mdx / mlen;
      fighter.moveY = mdy / mlen;
    } else {
      fighter.moveX = 0;
      fighter.moveY = 0;
    }
  }

  return {
    /** Set every bot fighter's intent for this step. In attract mode the
     *  player fighter is bot-driven too, so the title backdrop is a live
     *  match with ten fighters in it. */
    update(dt, attract) {
      const state = world.state;
      for (const fighter of state.fighters) {
        if (!fighter.alive || (fighter.isPlayer && !attract)) continue;
        think(fighter, brainFor(fighter), state, dt);
      }
    },
    /** Forget all bot memory (a fresh match starts clean). */
    reset() {
      brains.clear();
    },
  };
}
