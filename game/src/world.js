// The game's rules and state, with no drawing and no browser in it: the arena,
// the fighters, projectiles, particles, the two modes and their win rules.
// step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sounds, feed) without the world knowing about screens.
// Nothing here allocates after createWorld returns, except the short-lived
// kill-feed strings.

import { FIELD, FIGHTER, FOUNTAIN, HEART, POOL, PROJECTILE, TEAM_SIZE, WIN_KILLS } from './config.js';
import { HEROES, HERO_IDS } from './heroes.js';
import { pick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_DIED = 4;
export const EVENT_HURT = 8;
export const EVENT_HEAL = 16;
export const EVENT_FOUNTAIN = 32;
export const EVENT_WIN = 64;
export const EVENT_ABILITY = 128;

const TEAM_COCO = 'coco';
const TEAM_BERRY = 'berry';

const BOT_NAMES = {
  coco: ['Pip', 'Nia', 'Tomo', 'Kiki', 'Bibi'],
  berry: ['Zuzu', 'Momo', 'Lulu', 'Riri', 'Cici'],
};

/** Dessert tables and candy pillars: fixed, symmetric, same for every match. */
const OBSTACLES = [
  { x: 280, y: 150, w: 150, h: 64, kind: 'table' },
  { x: 850, y: 150, w: 150, h: 64, kind: 'table' },
  { x: 280, y: 506, w: 150, h: 64, kind: 'table' },
  { x: 850, y: 506, w: 150, h: 64, kind: 'table' },
  { x: 600, y: 116, w: 80, h: 44, kind: 'pillar' },
  { x: 600, y: 560, w: 80, h: 44, kind: 'pillar' },
  { x: 116, y: 328, w: 44, h: 64, kind: 'pillar' },
  { x: 1120, y: 328, w: 44, h: 64, kind: 'pillar' },
];

const HEART_SPOTS = [
  { x: 640, y: 116 },
  { x: 640, y: 604 },
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Push a circle out of a rectangle; returns true when they overlapped. */
function circleRectPush(f, rect) {
  const cx = clamp(f.x, rect.x, rect.x + rect.w);
  const cy = clamp(f.y, rect.y, rect.y + rect.h);
  const dx = f.x - cx;
  const dy = f.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= f.radius * f.radius) return false;
  if (d2 === 0) {
    f.x = rect.x - f.radius;
    return true;
  }
  const d = Math.sqrt(d2);
  f.x = cx + (dx / d) * f.radius;
  f.y = cy + (dy / d) * f.radius;
  return true;
}

/** True when the segment (x1,y1)-(x2,y2) touches the rectangle. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** True when nothing (tables, pillars, waffle walls) blocks the line of sight. */
export function lineOfSight(state, x1, y1, x2, y2) {
  for (const rect of state.obstacles) {
    if (segmentHitsRect(x1, y1, x2, y2, rect)) return false;
  }
  for (const wall of state.walls) {
    if (!wall.active) continue;
    if (segmentHitsRect(x1, y1, x2, y2, wall)) return false;
  }
  return true;
}

export function createWorld(random, mode) {
  const state = {
    mode,
    random,
    elapsed: 0,
    remaining: FOUNTAIN.seconds,
    score: { coco: 0, berry: 0 },
    progress: { coco: 0, berry: 0 },
    fountainHolder: null,
    fountainTick: 0,
    fighters: [],
    projectiles: [],
    particles: [],
    texts: [],
    puddles: [],
    walls: [],
    hearts: [],
    feed: [],
    obstacles: OBSTACLES,
    fountain: { x: FIELD.width / 2, y: FIELD.height / 2, radius: FOUNTAIN.radius },
    winner: null,
    over: false,
    shake: 0,
    shotsFired: 0,
    shotsHit: 0,
  };

  for (let i = 0; i < POOL.projectiles; i += 1) {
    state.projectiles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, team: TEAM_COCO, ownerId: -1, radius: PROJECTILE.radius, color: '#fff', life: 0 });
  }
  for (let i = 0; i < POOL.particles; i += 1) {
    state.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', shape: 'dot', gravity: 0 });
  }
  for (let i = 0; i < POOL.texts; i += 1) {
    state.texts.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 16 });
  }

  function spawnPoint(team, index) {
    const x = team === TEAM_COCO ? 92 : FIELD.width - 92;
    const y = 170 + index * 90 + random() * 30;
    return { x, y };
  }

  function makeFighter(id, team, index) {
    const heroId = pick(random, HERO_IDS);
    const hero = HEROES[heroId];
    const spot = spawnPoint(team, index);
    return {
      id,
      team,
      heroId,
      name: index === 0 && team === TEAM_COCO ? 'YOU' : BOT_NAMES[team][index],
      isPlayer: false,
      x: spot.x,
      y: spot.y,
      vx: 0,
      vy: 0,
      angle: team === TEAM_COCO ? 0 : Math.PI,
      radius: FIGHTER.radius,
      hp: FIGHTER.maxHp,
      alive: true,
      respawnTimer: 0,
      spawnShield: 0,
      mag: hero.weapon.mag,
      reloading: false,
      reloadTimer: 0,
      fireTimer: 0,
      muzzleTimer: 0,
      abilityCd: 0,
      shield: 0,
      shieldTimer: 0,
      dashTimer: 0,
      dashX: 0,
      dashY: 0,
      slowTimer: 0,
      lastDamageAt: -99,
      kills: 0,
      deaths: 0,
      moveX: 0,
      moveY: 0,
      aimX: spot.x + (team === TEAM_COCO ? 100 : -100),
      aimY: spot.y,
      shooting: false,
      wantAbility: false,
    };
  }

  function buildFighters(heroId) {
    state.fighters.length = 0;
    let id = 0;
    for (const team of [TEAM_COCO, TEAM_BERRY]) {
      for (let index = 0; index < TEAM_SIZE; index += 1) {
        const fighter = makeFighter(id, team, index);
        if (team === TEAM_COCO && index === 0) {
          fighter.heroId = heroId;
          fighter.name = 'YOU';
          fighter.isPlayer = true;
        }
        state.fighters.push(fighter);
        id += 1;
      }
    }
  }

  function reset(heroId, nextMode) {
    state.mode = nextMode;
    state.elapsed = 0;
    state.remaining = FOUNTAIN.seconds;
    state.score = { coco: 0, berry: 0 };
    state.progress = { coco: 0, berry: 0 };
    state.fountainHolder = null;
    state.fountainTick = 0;
    state.winner = null;
    state.over = false;
    state.shake = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    for (const p of state.projectiles) p.active = false;
    for (const p of state.particles) p.active = false;
    for (const t of state.texts) t.active = false;
    state.puddles.length = 0;
    state.walls.length = 0;
    state.feed.length = 0;
    state.hearts.length = 0;
    for (const spot of HEART_SPOTS) state.hearts.push({ x: spot.x, y: spot.y, active: true, respawnTimer: 0 });
    buildFighters(heroId);
  }

  function burst(x, y, color, count, speed, shape) {
    let made = 0;
    for (const p of state.particles) {
      if (made >= count) break;
      if (p.active) continue;
      const angle = random() * Math.PI * 2;
      const spd = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.maxLife = 0.35 + random() * 0.4;
      p.life = p.maxLife;
      p.size = 2 + random() * 4;
      p.color = color;
      p.shape = shape || 'dot';
      p.gravity = 0;
      made += 1;
    }
  }

  function sprinkleDeath(x, y, colors) {
    for (let i = 0; i < 14; i += 1) burst(x, y, colors[i % colors.length], 1, 260, 'rect');
    burst(x, y, '#fff6e5', 6, 160, 'dot');
  }

  function addText(x, y, text, color, size) {
    for (const t of state.texts) {
      if (t.active) continue;
      t.active = true;
      t.x = x;
      t.y = y;
      t.life = 0.9;
      t.maxLife = 0.9;
      t.text = text;
      t.color = color;
      t.size = size || 16;
      return;
    }
  }

  function addFeed(killer, victim) {
    state.feed.unshift({ text: `${killer.name} popped ${victim.name}`, team: killer.team, life: 4 });
    if (state.feed.length > POOL.feed) state.feed.length = POOL.feed;
  }

  function firePellet(owner, angle, damage, speed, color) {
    for (const p of state.projectiles) {
      if (p.active) continue;
      const gx = owner.x + Math.cos(owner.angle) * (owner.radius + 8);
      const gy = owner.y + Math.sin(owner.angle) * (owner.radius + 8);
      p.active = true;
      p.x = gx;
      p.y = gy;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.damage = damage;
      p.team = owner.team;
      p.ownerId = owner.id;
      p.color = color;
      p.life = PROJECTILE.life;
      owner.muzzleTimer = 0.06;
      return true;
    }
    return false;
  }

  function fireWeapon(fighter) {
    const hero = HEROES[fighter.heroId];
    const weapon = hero.weapon;
    const spread = (random() * 2 - 1) * weapon.spread;
    for (let i = 0; i < weapon.pellets; i += 1) {
      const offset = weapon.pellets > 1 ? (i - (weapon.pellets - 1) / 2) * 0.09 : 0;
      firePellet(fighter, fighter.angle + spread + offset, weapon.damage, weapon.pelletSpeed, hero.color);
    }
    fighter.mag -= 1;
    fighter.fireTimer = weapon.fireInterval;
    if (fighter.isPlayer) state.shotsFired += weapon.pellets;
    if (fighter.mag <= 0) {
      fighter.reloading = true;
      fighter.reloadTimer = weapon.reloadSeconds;
    }
  }

  function useAbility(fighter) {
    const hero = HEROES[fighter.heroId];
    const ability = hero.ability;
    if (fighter.abilityCd > 0) return false;
    if (ability.id === 'burst') {
      for (let i = 0; i < ability.pellets; i += 1) {
        const offset = (i - (ability.pellets - 1) / 2) * (ability.spread / (ability.pellets - 1));
        firePellet(fighter, fighter.angle + offset, ability.damage, 820, hero.color);
      }
      burst(fighter.x, fighter.y, hero.color, 8, 200, 'dot');
    } else if (ability.id === 'dash') {
      const len = Math.hypot(fighter.moveX, fighter.moveY);
      const dx = len > 0 ? fighter.moveX / len : Math.cos(fighter.angle);
      const dy = len > 0 ? fighter.moveY / len : Math.sin(fighter.angle);
      fighter.dashTimer = 0.16;
      fighter.dashX = dx;
      fighter.dashY = dy;
      state.puddles.push({ x: fighter.x, y: fighter.y, radius: ability.puddleRadius, life: ability.puddleSeconds, maxLife: ability.puddleSeconds, team: fighter.team });
      burst(fighter.x, fighter.y, '#f2a7c3', 8, 180, 'dot');
    } else if (ability.id === 'wall') {
      const wx = fighter.x + Math.cos(fighter.angle) * 70;
      const wy = fighter.y + Math.sin(fighter.angle) * 70;
      const horizontal = Math.abs(Math.cos(fighter.angle)) < 0.7;
      state.walls.push({
        x: clamp(wx - (horizontal ? ability.width / 2 : ability.height / 2), 40, FIELD.width - 40 - ability.width),
        y: clamp(wy - (horizontal ? ability.height / 2 : ability.width / 2), 40, FIELD.height - 40 - ability.height),
        w: horizontal ? ability.width : ability.height,
        h: horizontal ? ability.height : ability.width,
        life: ability.lifeSeconds,
        maxLife: ability.lifeSeconds,
        team: fighter.team,
      });
      burst(wx, wy, '#e8a33d', 8, 160, 'rect');
    } else if (ability.id === 'shield') {
      fighter.shield = ability.absorb;
      fighter.shieldTimer = ability.shieldSeconds;
      burst(fighter.x, fighter.y, '#f2c94c', 10, 180, 'dot');
    }
    fighter.abilityCd = ability.cooldown;
    return true;
  }

  function killFighter(victim, killer) {
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnTimer = FIGHTER.respawnSeconds;
    victim.hp = 0;
    const hero = HEROES[victim.heroId];
    sprinkleDeath(victim.x, victim.y, [hero.color, '#fff6e5', '#f2c94c']);
    if (killer && !state.attract) {
      killer.kills += 1;
      state.score[killer.team] += 1;
      addFeed(killer, victim);
    }
    if (state.mode === 'death' && killer && !state.attract && state.score[killer.team] >= WIN_KILLS) {
      state.winner = killer.team;
      state.over = true;
      return EVENT_WIN;
    }
    return 0;
  }

  function damageFighter(target, amount, attacker) {
    if (!target.alive || target.spawnShield > 0) return 0;
    let remaining = amount;
    if (target.shield > 0) {
      const soaked = Math.min(target.shield, remaining);
      target.shield -= soaked;
      remaining -= soaked;
      if (target.shield <= 0) target.shieldTimer = 0;
    }
    if (remaining <= 0) return EVENT_HIT;
    target.hp -= remaining;
    target.lastDamageAt = state.elapsed;
    addText(target.x, target.y - 24, `-${Math.round(remaining)}`, target.isPlayer ? '#e5484d' : '#fff6e5', 15);
    if (attacker && attacker.isPlayer) state.shotsHit += 1;
    let events = EVENT_HIT;
    if (target.isPlayer) events |= EVENT_HURT;
    if (target.hp <= 0) {
      events |= killFighter(target, attacker);
      if (attacker && attacker.isPlayer) events |= EVENT_KILL;
      if (target.isPlayer) events |= EVENT_DIED;
      if (target.isPlayer) state.shake = Math.max(state.shake, 0.6);
    }
    return events;
  }

  function respawn(fighter) {
    const spot = spawnPoint(fighter.team, fighter.id % TEAM_SIZE);
    fighter.x = spot.x;
    fighter.y = spot.y;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.hp = FIGHTER.maxHp;
    fighter.alive = true;
    fighter.spawnShield = FIGHTER.spawnShield;
    fighter.mag = HEROES[fighter.heroId].weapon.mag;
    fighter.reloading = false;
    fighter.reloadTimer = 0;
    fighter.shield = 0;
    fighter.shieldTimer = 0;
    fighter.abilityCd = 0;
  }

  function updateFighter(fighter, dt, playerIntent, attract) {
    if (!fighter.alive) {
      fighter.respawnTimer -= dt;
      if (fighter.respawnTimer <= 0) respawn(fighter);
      return 0;
    }
    let events = 0;
    const hero = HEROES[fighter.heroId];
    const intent = fighter.isPlayer && playerIntent ? playerIntent : null;

    // Movement intent: the player from input, a bot from bots.js.
    const mx = intent ? intent.moveX : fighter.moveX;
    const my = intent ? intent.moveY : fighter.moveY;
    const aimX = intent ? intent.aimX : fighter.aimX;
    const aimY = intent ? intent.aimY : fighter.aimY;
    fighter.angle = Math.atan2(aimY - fighter.y, aimX - fighter.x);

    // Slow puddles catch enemies standing in them.
    fighter.slowTimer = 0;
    for (const puddle of state.puddles) {
      if (puddle.team === fighter.team) continue;
      const dx = fighter.x - puddle.x;
      const dy = fighter.y - puddle.y;
      if (dx * dx + dy * dy < puddle.radius * puddle.radius) fighter.slowTimer = 0.1;
    }
    const slow = fighter.slowTimer > 0 ? HEROES.mochi.ability.slow : 1;
    const speed = hero.speed * slow;

    if (fighter.dashTimer > 0) {
      fighter.dashTimer -= dt;
      fighter.vx = fighter.dashX * 900;
      fighter.vy = fighter.dashY * 900;
    } else {
      const target = Math.hypot(mx, my) > 0.01 ? { x: mx * speed, y: my * speed } : { x: 0, y: 0 };
      fighter.vx += (target.x - fighter.vx) * Math.min(1, dt * 14);
      fighter.vy += (target.y - fighter.vy) * Math.min(1, dt * 14);
    }
    fighter.x += fighter.vx * dt;
    fighter.y += fighter.vy * dt;
    fighter.x = clamp(fighter.x, fighter.radius + 8, FIELD.width - fighter.radius - 8);
    fighter.y = clamp(fighter.y, fighter.radius + 8, FIELD.height - fighter.radius - 8);
    for (const rect of state.obstacles) circleRectPush(fighter, rect);
    for (const wall of state.walls) {
      if (wall.active !== false) circleRectPush(fighter, wall);
    }
    // Soft separation so fighters never stack on one another.
    for (const other of state.fighters) {
      if (other === fighter || !other.alive) continue;
      const dx = fighter.x - other.x;
      const dy = fighter.y - other.y;
      const min = fighter.radius + other.radius - 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        fighter.x += (dx / d) * push;
        fighter.y += (dy / d) * push;
      }
    }

    if (fighter.spawnShield > 0) fighter.spawnShield = Math.max(0, fighter.spawnShield - dt);
    if (fighter.shieldTimer > 0) {
      fighter.shieldTimer -= dt;
      if (fighter.shieldTimer <= 0) fighter.shield = 0;
    }
    if (fighter.abilityCd > 0) fighter.abilityCd -= dt;
    if (fighter.fireTimer > 0) fighter.fireTimer -= dt;
    if (fighter.muzzleTimer > 0) fighter.muzzleTimer -= dt;
    if (fighter.lastDamageAt > -90 && state.elapsed - fighter.lastDamageAt > FIGHTER.regenDelay && fighter.hp < FIGHTER.maxHp) {
      fighter.hp = Math.min(FIGHTER.maxHp, fighter.hp + FIGHTER.regenPerSecond * dt);
    }

    if (fighter.reloading) {
      fighter.reloadTimer -= dt;
      if (fighter.reloadTimer <= 0) {
        fighter.reloading = false;
        fighter.mag = hero.weapon.mag;
      }
    } else if (intent && intent.reload && fighter.mag < hero.weapon.mag) {
      fighter.reloading = true;
      fighter.reloadTimer = hero.weapon.reloadSeconds;
    }

    const shooting = intent ? intent.shooting : fighter.shooting;
    if (shooting && fighter.fireTimer <= 0 && !fighter.reloading && fighter.mag > 0) {
      fireWeapon(fighter);
    }
    const wantAbility = intent ? intent.ability : fighter.wantAbility;
    if (wantAbility && useAbility(fighter) && fighter.isPlayer) events |= EVENT_ABILITY;
    fighter.wantAbility = false;
    return events;
  }

  function updateProjectiles(dt) {
    let events = 0;
    for (const p of state.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 6 || p.x > FIELD.width - 6 || p.y < 6 || p.y > FIELD.height - 6) {
        burst(p.x, p.y, p.color, 3, 120, 'dot');
        p.active = false;
        continue;
      }
      let blocked = false;
      for (const rect of state.obstacles) {
        if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        for (const wall of state.walls) {
          if (p.x > wall.x && p.x < wall.x + wall.w && p.y > wall.y && p.y < wall.y + wall.h) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        burst(p.x, p.y, p.color, 4, 140, 'dot');
        p.active = false;
        continue;
      }
      for (const fighter of state.fighters) {
        if (!fighter.alive || fighter.team === p.team) continue;
        const dx = fighter.x - p.x;
        const dy = fighter.y - p.y;
        const r = fighter.radius + p.radius;
        if (dx * dx + dy * dy < r * r) {
          const attacker = state.fighters[p.ownerId] || null;
          burst(p.x, p.y, p.color, 5, 160, 'dot');
          events |= damageFighter(fighter, p.damage, attacker);
          p.active = false;
          break;
        }
      }
    }
    return events;
  }

  function updateHearts(dt) {
    for (const heart of state.hearts) {
      if (heart.active) {
        for (const fighter of state.fighters) {
          if (!fighter.alive || fighter.hp >= FIGHTER.maxHp) continue;
          const dx = fighter.x - heart.x;
          const dy = fighter.y - heart.y;
          if (dx * dx + dy * dy < (fighter.radius + HEART.radius) * (fighter.radius + HEART.radius)) {
            fighter.hp = Math.min(FIGHTER.maxHp, fighter.hp + HEART.heal);
            addText(fighter.x, fighter.y - 24, `+${HEART.heal}`, '#7fd8a4', 16);
            burst(heart.x, heart.y, '#ff8fa3', 8, 150, 'dot');
            heart.active = false;
            heart.respawnTimer = HEART.respawnSeconds;
            break;
          }
        }
      } else {
        heart.respawnTimer -= dt;
        if (heart.respawnTimer <= 0) heart.active = true;
      }
    }
  }

  function updateFountain(dt) {
    let events = 0;
    if (state.mode !== 'fountain' || state.over) return events;
    state.remaining -= dt;
    let cocoIn = 0;
    let berryIn = 0;
    for (const fighter of state.fighters) {
      if (!fighter.alive) continue;
      const dx = fighter.x - state.fountain.x;
      const dy = fighter.y - state.fountain.y;
      if (dx * dx + dy * dy < state.fountain.radius * state.fountain.radius) {
        if (fighter.team === TEAM_COCO) cocoIn += 1;
        else berryIn += 1;
      }
    }
    let holder = null;
    if (cocoIn > 0 && berryIn === 0) holder = TEAM_COCO;
    else if (berryIn > 0 && cocoIn === 0) holder = TEAM_BERRY;
    state.fountainHolder = holder;
    if (holder) {
      state.progress[holder] = Math.min(FOUNTAIN.winProgress, state.progress[holder] + FOUNTAIN.fillPerSecond * dt);
      state.fountainTick += dt;
      if (state.fountainTick >= 1) {
        state.fountainTick = 0;
        events |= EVENT_FOUNTAIN;
      }
      if (state.progress[holder] >= FOUNTAIN.winProgress) {
        state.winner = holder;
        state.over = true;
        events |= EVENT_WIN;
      }
    }
    if (state.remaining <= 0 && !state.over) {
      state.remaining = 0;
      const pc = state.progress.coco;
      const pb = state.progress.berry;
      if (pc !== pb) state.winner = pc > pb ? TEAM_COCO : TEAM_BERRY;
      else if (state.score.coco !== state.score.berry) state.winner = state.score.coco > state.score.berry ? TEAM_COCO : TEAM_BERRY;
      else state.winner = 'draw';
      state.over = true;
      events |= EVENT_WIN;
    }
    return events;
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity || 0) * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
    }
    for (const t of state.texts) {
      if (!t.active) continue;
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) t.active = false;
    }
    for (const entry of state.feed) entry.life -= dt;
    state.feed = state.feed.filter((entry) => entry.life > 0);
    for (let i = state.puddles.length - 1; i >= 0; i -= 1) {
      state.puddles[i].life -= dt;
      if (state.puddles[i].life <= 0) state.puddles.splice(i, 1);
    }
    for (let i = state.walls.length - 1; i >= 0; i -= 1) {
      state.walls[i].life -= dt;
      if (state.walls[i].life <= 0) {
        burst(state.walls[i].x + state.walls[i].w / 2, state.walls[i].y + state.walls[i].h / 2, '#e8a33d', 8, 150, 'rect');
        state.walls.splice(i, 1);
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
  }

  /**
   * One fixed step. playerIntent drives the player fighter ({moveX, moveY, aimX,
   * aimY, shooting, ability}); bots drive themselves through their fighter's
   * intent fields, set by bots.update before this call. With attract set, kills
   * never score and nobody wins: the title screen's living backdrop.
   */
  function step(dt, playerIntent, attract) {
    let events = 0;
    state.attract = attract;
    if (!state.over) state.elapsed += dt;
    if (!state.over && !attract) events |= updateFountain(dt);
    for (const fighter of state.fighters) {
      events |= updateFighter(fighter, dt, playerIntent, attract);
    }
    events |= updateProjectiles(dt);
    updateHearts(dt);
    updateParticles(dt);
    return events;
  }

  function player() {
    return state.fighters[0];
  }

  reset(HERO_IDS[0], mode);
  return { state, reset, step, player, lineOfSight: (x1, y1, x2, y2) => lineOfSight(state, x1, y1, x2, y2) };
}
