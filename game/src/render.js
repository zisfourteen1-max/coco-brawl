// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 arena is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Chibi snack heroes, a dessert-cafe arena, juice on
// every action, and a HUD that reads at a glance. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.

import { FIELD, FONT, PALETTE, WIN_KILLS } from './config.js';
import { HEROES, HERO_IDS } from './heroes.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 620, line: 32 };
const HERO_CARD = { width: 148, height: 190, gap: 16, top: 268 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, cssScale: 1, cssX: 0, cssY: 0 };
  const scoreLabel = cachedLabel('');
  const timerLabel = cachedLabel('');
  const ammoLabel = cachedLabel('');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    view.cssScale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
    view.cssX = (window.innerWidth - FIELD.width * view.cssScale) / 2;
    view.cssY = (window.innerHeight - FIELD.height * view.cssScale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function toField(cssX, cssY) {
    return { x: (cssX - view.cssX) / view.cssScale, y: (cssY - view.cssY) / view.cssScale };
  }

  function heroCardRect(index) {
    const total = HERO_IDS.length * HERO_CARD.width + (HERO_IDS.length - 1) * HERO_CARD.gap;
    const x0 = (FIELD.width - total) / 2;
    return { x: x0 + index * (HERO_CARD.width + HERO_CARD.gap), y: HERO_CARD.top, w: HERO_CARD.width, h: HERO_CARD.height };
  }

  function heroCardAt(fx, fy) {
    for (let i = 0; i < HERO_IDS.length; i += 1) {
      const r = heroCardRect(i);
      if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) return i;
    }
    return -1;
  }

  function drawFloor(state) {
    const tile = 80;
    for (let ty = 0; ty < FIELD.height / tile; ty += 1) {
      for (let tx = 0; tx < FIELD.width / tile; tx += 1) {
        context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
    // Sugar sprinkles baked into the floor: a fixed dotted pattern.
    context.fillStyle = 'rgba(229, 83, 107, 0.35)';
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 173) % FIELD.width;
      const y = (i * 311) % FIELD.height;
      context.fillRect(x, y, 5, 3);
    }
    context.fillStyle = 'rgba(127, 216, 164, 0.35)';
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 271 + 60) % FIELD.width;
      const y = (i * 157 + 40) % FIELD.height;
      context.fillRect(x, y, 3, 5);
    }
    context.strokeStyle = PALETTE.border;
    context.lineWidth = 10;
    context.strokeRect(5, 5, FIELD.width - 10, FIELD.height - 10);
  }

  function drawFountain(state, time) {
    const f = state.fountain;
    const swirl = time * 0.9;
    context.save();
    context.beginPath();
    context.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    context.fillStyle = '#f9d7e0';
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = PALETTE.fountainRing;
    context.stroke();
    context.beginPath();
    context.arc(f.x, f.y, f.radius - 16, 0, Math.PI * 2);
    context.fillStyle = PALETTE.fountain;
    context.fill();
    context.strokeStyle = '#fff6e5';
    context.lineWidth = 6;
    for (let i = 0; i < 3; i += 1) {
      const a0 = swirl + (i * Math.PI * 2) / 3;
      context.beginPath();
      context.arc(f.x, f.y, 26 + i * 9, a0, a0 + 1.5);
      context.stroke();
    }
    context.fillStyle = PALETTE.cream;
    context.beginPath();
    context.arc(f.x, f.y, 13, 0, Math.PI * 2);
    context.fill();
    if (state.mode === 'fountain') {
      const lead = state.progress.coco >= state.progress.berry ? 'coco' : 'berry';
      const top = Math.max(state.progress.coco, state.progress.berry);
      if (top > 0) {
        context.beginPath();
        context.arc(f.x, f.y, f.radius + 9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * top) / 100);
        context.strokeStyle = lead === 'coco' ? PALETTE.coco : PALETTE.berry;
        context.lineWidth = 8;
        context.stroke();
      }
      if (state.fountainHolder) {
        text('FILLING', f.x, f.y + f.radius + 26, 15, state.fountainHolder === 'coco' ? PALETTE.coco : PALETTE.berry, 'center', '700');
      }
    }
    context.restore();
  }

  function drawObstacles(state) {
    for (const rect of state.obstacles) {
      context.save();
      context.shadowColor = PALETTE.shadow;
      context.shadowBlur = 0;
      context.shadowOffsetY = 4;
      if (rect.kind === 'table') {
        roundRect(context, rect.x, rect.y, rect.w, rect.h, 12);
        context.fillStyle = PALETTE.wallTop;
        context.fill();
        context.strokeStyle = PALETTE.wall;
        context.lineWidth = 3;
        context.stroke();
        context.fillStyle = '#fff6e5';
        roundRect(context, rect.x + 8, rect.y + 8, rect.w - 16, 14, 6);
        context.fill();
        context.fillStyle = PALETTE.wall;
        context.beginPath();
        context.arc(rect.x + 16, rect.y + rect.h - 10, 4, 0, Math.PI * 2);
        context.arc(rect.x + rect.w - 16, rect.y + rect.h - 10, 4, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
        context.fillStyle = PALETTE.pillar;
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = PALETTE.pillarStripe;
        context.stroke();
        context.beginPath();
        context.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 4, 0, Math.PI * 2);
        context.fillStyle = PALETTE.pillarStripe;
        context.fill();
      }
      context.restore();
    }
    for (const wall of state.walls) {
      context.save();
      context.globalAlpha = wall.life < 1 ? 0.4 + 0.6 * (wall.life % 0.5) * 2 : 1;
      roundRect(context, wall.x, wall.y, wall.w, wall.h, 8);
      context.fillStyle = '#e8a33d';
      context.fill();
      context.strokeStyle = '#a86f1e';
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = 'rgba(168, 111, 30, 0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(wall.x + wall.w / 3, wall.y + 3);
      context.lineTo(wall.x + wall.w / 3, wall.y + wall.h - 3);
      context.moveTo(wall.x + (2 * wall.w) / 3, wall.y + 3);
      context.lineTo(wall.x + (2 * wall.w) / 3, wall.y + wall.h - 3);
      context.moveTo(wall.x + 3, wall.y + wall.h / 2);
      context.lineTo(wall.x + wall.w - 3, wall.y + wall.h / 2);
      context.stroke();
      context.restore();
    }
  }

  function drawHearts(state, time) {
    for (const heart of state.hearts) {
      if (!heart.active) continue;
      const pulse = 1 + 0.12 * Math.sin(time * 5);
      const s = HEART_RADIUS * pulse;
      context.save();
      context.translate(heart.x, heart.y);
      context.fillStyle = '#ff5c8a';
      context.beginPath();
      context.moveTo(0, s * 0.7);
      context.bezierCurveTo(-s, -s * 0.4, -s * 0.6, -s, 0, -s * 0.3);
      context.bezierCurveTo(s * 0.6, -s, s, -s * 0.4, 0, s * 0.7);
      context.fill();
      context.fillStyle = 'rgba(255, 255, 255, 0.7)';
      context.beginPath();
      context.arc(-s * 0.3, -s * 0.25, s * 0.18, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawPuddles(state) {
    for (const puddle of state.puddles) {
      context.save();
      context.globalAlpha = 0.45 * (puddle.life / puddle.maxLife) + 0.15;
      context.fillStyle = '#f2a7c3';
      context.beginPath();
      context.ellipse(puddle.x, puddle.y, puddle.radius, puddle.radius * 0.7, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.8;
      context.fillStyle = '#fff6e5';
      context.beginPath();
      context.arc(puddle.x - 18, puddle.y - 6, 5, 0, Math.PI * 2);
      context.arc(puddle.x + 14, puddle.y + 8, 4, 0, Math.PI * 2);
      context.arc(puddle.x + 4, puddle.y - 14, 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawHeroFace(hero, angle) {
    const ex = Math.cos(angle) * 5;
    const ey = Math.sin(angle) * 4;
    context.fillStyle = '#3a2418';
    context.beginPath();
    context.arc(-4 + ex, -2 + ey, 2.6, 0, Math.PI * 2);
    context.arc(5 + ex, -2 + ey, 2.6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(229, 83, 107, 0.55)';
    context.beginPath();
    context.arc(-8, 3, 2.4, 0, Math.PI * 2);
    context.arc(9, 3, 2.4, 0, Math.PI * 2);
    context.fill();
    // A tiny hat per hero, so each reads differently at a glance.
    context.fillStyle = hero.dark;
    if (hero.id === 'boba') {
      context.fillRect(-7, -19, 14, 7);
      context.strokeStyle = hero.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(4, -19);
      context.lineTo(9, -26);
      context.stroke();
    } else if (hero.id === 'mochi') {
      context.beginPath();
      context.moveTo(-6, -14);
      context.lineTo(-13, -20);
      context.lineTo(-13, -10);
      context.closePath();
      context.moveTo(6, -14);
      context.lineTo(13, -20);
      context.lineTo(13, -10);
      context.closePath();
      context.fill();
    } else if (hero.id === 'waffle') {
      context.strokeStyle = hero.dark;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-8, -14);
      context.lineTo(8, -14);
      context.moveTo(-4, -18);
      context.lineTo(-4, -11);
      context.moveTo(4, -18);
      context.lineTo(4, -11);
      context.stroke();
    } else {
      context.fillRect(-6, -20, 12, 6);
      context.fillStyle = hero.accent;
      context.fillRect(-6, -17, 12, 2);
    }
  }

  function drawFighter(f, time) {
    const hero = HEROES[f.heroId];
    const teamColor = f.team === 'coco' ? '#7b4b2a' : '#e5536b';
    context.save();
    context.translate(f.x, f.y);
    // Shadow.
    context.fillStyle = PALETTE.shadow;
    context.beginPath();
    context.ellipse(0, 12, 15, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Spawn shield blink.
    if (f.spawnShield > 0 && Math.floor(f.spawnShield * 8) % 2 === 0) {
      context.globalAlpha = 0.45;
      context.fillStyle = '#fff6e5';
      context.beginPath();
      context.arc(0, 0, f.radius + 6, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    // Gun barrel toward the aim.
    context.save();
    context.rotate(f.angle);
    context.fillStyle = '#3a2418';
    roundRect(context, 8, -4, 20, 8, 3);
    context.fill();
    context.fillStyle = hero.color;
    context.fillRect(24, -3, 5, 6);
    if (f.muzzleTimer > 0) {
      context.fillStyle = '#ffe27a';
      context.beginPath();
      context.arc(32, 0, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff6e5';
      context.beginPath();
      context.arc(32, 0, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Chibi body.
    context.beginPath();
    context.arc(0, 0, f.radius, 0, Math.PI * 2);
    context.fillStyle = hero.color;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = hero.dark;
    context.stroke();
    context.beginPath();
    context.arc(0, 5, 9, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 246, 229, 0.75)';
    context.fill();
    drawHeroFace(hero, f.angle);
    // Team ring; the player gets a white outer ring so they never lose themselves.
    context.beginPath();
    context.arc(0, 0, f.radius + 3, 0, Math.PI * 2);
    context.strokeStyle = teamColor;
    context.lineWidth = 2.5;
    context.stroke();
    if (f.isPlayer) {
      context.beginPath();
      context.arc(0, 0, f.radius + 7, 0, Math.PI * 2);
      context.strokeStyle = '#fff6e5';
      context.lineWidth = 2;
      context.stroke();
    }
    // Choco shield bubble.
    if (f.shield > 0) {
      context.beginPath();
      context.arc(0, 0, f.radius + 9, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(242, 201, 76, 0.9)';
      context.lineWidth = 3;
      context.stroke();
    }
    context.restore();
    // Name and health bar.
    const barW = 38;
    const bx = f.x - barW / 2;
    const by = f.y - f.radius - 16;
    text(f.name, f.x, by - 4, 11, f.isPlayer ? '#3a2418' : teamColor, 'center', '700');
    context.fillStyle = 'rgba(43, 26, 18, 0.55)';
    context.fillRect(bx, by, barW, 5);
    context.fillStyle = f.hp > 50 ? '#7fd8a4' : f.hp > 25 ? '#f2c94c' : '#e5484d';
    context.fillRect(bx, by, barW * Math.max(0, f.hp / 100), 5);
    if (f.shield > 0) {
      context.fillStyle = '#f2c94c';
      context.fillRect(bx, by + 6, barW * Math.min(1, f.shield / 60), 3);
    }
  }

  function drawProjectiles(state) {
    for (const p of state.projectiles) {
      if (!p.active) continue;
      context.globalAlpha = 0.35;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = '#fff6e5';
      context.beginPath();
      context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      if (p.shape === 'rect') {
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.life * 9);
        context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        context.restore();
      } else {
        context.beginPath();
        context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    for (const t of state.texts) {
      if (!t.active) continue;
      context.globalAlpha = Math.max(0, t.life / t.maxLife);
      context.font = `700 ${t.size}px ${FONT}`;
      context.textAlign = 'center';
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(43, 26, 18, 0.8)';
      context.strokeText(t.text, t.x, t.y);
      context.fillStyle = t.color;
      context.fillText(t.text, t.x, t.y);
    }
    context.globalAlpha = 1;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawHud(state, ui) {
    const player = state.fighters[0];
    const hero = HEROES[player.heroId];
    context.textBaseline = 'top';
    // Top score board.
    const boardW = 340;
    const bx = (FIELD.width - boardW) / 2;
    roundRect(context, bx, 12, boardW, 58, 12);
    context.fillStyle = 'rgba(255, 246, 229, 0.92)';
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    text('COCO', bx + 18, 26, 22, PALETTE.coco, 'left', '800');
    text(scoreLabel(state.score.coco), bx + 92, 24, 26, PALETTE.coco, 'left', '800');
    text('—', FIELD.width / 2, 24, 26, PALETTE.muted, 'center', '800');
    text(scoreLabel(state.score.berry), bx + boardW - 92, 24, 26, PALETTE.berry, 'right', '800');
    text('BERRY', bx + boardW - 18, 26, 22, PALETTE.berry, 'right', '800');
    if (state.mode === 'fountain') {
      text(timerLabel(formatTime(state.remaining)), FIELD.width / 2, 52, 14, PALETTE.text, 'center', '700');
      context.fillStyle = 'rgba(43, 26, 18, 0.25)';
      context.fillRect(bx + 60, 74, boardW - 120, 7);
      context.fillStyle = PALETTE.coco;
      context.fillRect(bx + 60, 74, ((boardW - 120) * state.progress.coco) / 100, 7);
      context.fillStyle = PALETTE.berry;
      context.fillRect(bx + boardW - 60 - ((boardW - 120) * state.progress.berry) / 100, 74, ((boardW - 120) * state.progress.berry) / 100, 7);
      text('Hold the Candy Fountain!', FIELD.width / 2, 86, 14, PALETTE.muted, 'center', '700');
    } else {
      text(timerLabel(formatTime(state.elapsed)), FIELD.width / 2, 52, 14, PALETTE.text, 'center', '700');
      text(`First to ${WIN_KILLS} pops wins`, FIELD.width / 2, 86, 14, PALETTE.muted, 'center', '700');
    }
    // Kill feed.
    let feedY = 20;
    for (const entry of state.feed) {
      context.globalAlpha = Math.min(1, entry.life);
      text(entry.text, FIELD.width - 20, feedY, 15, entry.team === 'coco' ? PALETTE.coco : PALETTE.berry, 'right', '600');
      feedY += 22;
    }
    context.globalAlpha = 1;
    // Bottom-left: hero chip, health, ability.
    const chipX = 20;
    const chipY = FIELD.height - 86;
    roundRect(context, chipX, chipY, 300, 70, 12);
    context.fillStyle = 'rgba(255, 246, 229, 0.92)';
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = hero.color;
    context.beginPath();
    context.arc(chipX + 30, chipY + 35, 20, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = hero.dark;
    context.beginPath();
    context.arc(chipX + 24, chipY + 30, 2.5, 0, Math.PI * 2);
    context.arc(chipX + 35, chipY + 30, 2.5, 0, Math.PI * 2);
    context.fill();
    text(hero.name, chipX + 58, chipY + 12, 17, PALETTE.text, 'left', '800');
    text(`K ${player.kills}  D ${player.deaths}`, chipX + 58, chipY + 34, 13, PALETTE.muted, 'left', '600');
    context.fillStyle = 'rgba(43, 26, 18, 0.25)';
    context.fillRect(chipX + 58, chipY + 52, 150, 8);
    context.fillStyle = player.hp > 50 ? '#7fd8a4' : player.hp > 25 ? '#f2c94c' : '#e5484d';
    context.fillRect(chipX + 58, chipY + 52, 150 * Math.max(0, player.hp / 100), 8);
    const abilityReady = player.abilityCd <= 0;
    context.fillStyle = 'rgba(43, 26, 18, 0.25)';
    context.fillRect(chipX + 216, chipY + 52, 66, 8);
    context.fillStyle = abilityReady ? '#f2c94c' : '#c9a98f';
    context.fillRect(chipX + 216, chipY + 52, 66 * (abilityReady ? 1 : 1 - player.abilityCd / hero.ability.cooldown), 8);
    text(abilityReady ? `${hero.ability.name} [Q]` : 'recharging…', chipX + 216, chipY + 32, 12, abilityReady ? PALETTE.text : PALETTE.muted, 'left', '700');
    // Bottom-right: ammo.
    const ax = FIELD.width - 20;
    text(ammoLabel(player.reloading ? 'RELOADING' : `${player.mag}`), ax, FIELD.height - 62, 34, player.mag <= 4 && !player.reloading ? PALETTE.danger : PALETTE.text, 'right', '800');
    text(hero.weapon.name, ax, FIELD.height - 26, 14, PALETTE.muted, 'right', '600');
    if (player.mag <= 4 && !player.reloading) text('Press R to reload', ax, FIELD.height - 96, 13, PALETTE.danger, 'right', '700');
    if (!player.alive) {
      text(`Popped! Back in ${Math.max(0, player.respawnTimer).toFixed(1)}s`, FIELD.width / 2, FIELD.height / 2 - 60, 26, '#fff6e5', 'center', '800');
    }
    // Crosshair and hitmarker at the mouse.
    if (ui.mouse) {
      const mx = ui.mouse.x;
      const my = ui.mouse.y;
      context.strokeStyle = '#3a2418';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(mx, my, 11, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(mx - 17, my);
      context.lineTo(mx - 8, my);
      context.moveTo(mx + 8, my);
      context.lineTo(mx + 17, my);
      context.moveTo(mx, my - 17);
      context.lineTo(mx, my - 8);
      context.moveTo(mx, my + 8);
      context.lineTo(mx, my + 17);
      context.stroke();
      if (ui.hitTimer > 0) {
        context.strokeStyle = ui.killTimer > 0 ? '#e5484d' : '#fff6e5';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(mx - 8, my - 8);
        context.lineTo(mx + 8, my + 8);
        context.moveTo(mx + 8, my - 8);
        context.lineTo(mx - 8, my + 8);
        context.stroke();
      }
    }
    // Hurt vignette: red at the edges when the player is low or just hit.
    const hurt = ui.hurtTimer > 0 ? 0.35 : player.hp <= 30 && player.alive ? 0.22 + 0.1 * Math.sin(ui.time * 6) : 0;
    if (hurt > 0) {
      const grad = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 260, FIELD.width / 2, FIELD.height / 2, 720);
      grad.addColorStop(0, 'rgba(229, 72, 77, 0)');
      grad.addColorStop(1, `rgba(229, 72, 77, ${hurt})`);
      context.fillStyle = grad;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (ui.muted) text('Muted [M]', 20, 20, 14, PALETTE.muted, 'left', '600');
  }

  function drawBanner(ui) {
    if (!ui.banner) return;
    const w = 560;
    const h = 118;
    const x = (FIELD.width - w) / 2;
    const y = 250;
    context.save();
    context.globalAlpha = 0.94;
    roundRect(context, x, y, w, h, 16);
    context.fillStyle = PALETTE.panel;
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.stroke();
    context.globalAlpha = 1;
    text(ui.banner.title, FIELD.width / 2, y + 30, 40, ui.banner.color || PALETTE.text, 'center', '800');
    if (ui.banner.sub) text(ui.banner.sub, FIELD.width / 2, y + 78, 18, PALETTE.muted, 'center', '600');
    context.restore();
  }

  function drawPanel(title, lines, prompt, color) {
    const height = 192 + lines.length * PANEL.line;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(context, x, y, PANEL.width, height, 18);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 46, color || PALETTE.text, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 130 + index * PANEL.line, 20, PALETTE.muted, 'center', '600');
    }
    text(prompt, FIELD.width / 2, y + 130 + lines.length * PANEL.line + 18, 22, PALETTE.berry, 'center', '700');
  }

  function drawTitle(state, ui) {
    context.textBaseline = 'alphabetic';
    text('COCO BRAWL', FIELD.width / 2, 108, 72, '#fff6e5', 'center', '800');
    text('a cute 5v5 snack shootout in the Sugar Rush Cafe', FIELD.width / 2, 148, 20, '#ffd9de', 'center', '600');
    text('Pick your hero — click a card or press 1-4', FIELD.width / 2, 236, 18, '#fff6e5', 'center', '700');
    for (let i = 0; i < HERO_IDS.length; i += 1) {
      const hero = HEROES[HERO_IDS[i]];
      const r = heroCardRect(i);
      const selected = ui.heroId === hero.id;
      roundRect(context, r.x, r.y, r.w, r.h, 14);
      context.fillStyle = selected ? '#fff6e5' : 'rgba(255, 246, 229, 0.85)';
      context.fill();
      context.strokeStyle = selected ? PALETTE.berry : PALETTE.panelEdge;
      context.lineWidth = selected ? 4 : 2;
      context.stroke();
      context.fillStyle = hero.color;
      context.beginPath();
      context.arc(r.x + r.w / 2, r.y + 44, 26, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = hero.dark;
      context.beginPath();
      context.arc(r.x + r.w / 2 - 8, r.y + 40, 3, 0, Math.PI * 2);
      context.arc(r.x + r.w / 2 + 8, r.y + 40, 3, 0, Math.PI * 2);
      context.fill();
      text(hero.name, r.x + r.w / 2, r.y + 96, 22, PALETTE.text, 'center', '800');
      text(hero.title, r.x + r.w / 2, r.y + 120, 13, PALETTE.muted, 'center', '600');
      text(hero.weapon.name, r.x + r.w / 2, r.y + 142, 13, PALETTE.text, 'center', '700');
      text(hero.ability.name, r.x + r.w / 2, r.y + 162, 13, PALETTE.berry, 'center', '700');
      if (selected) text('SELECTED', r.x + r.w / 2, r.y + 182, 12, PALETTE.berry, 'center', '800');
    }
    text('WASD move  ·  Mouse aim  ·  Click shoot  ·  Q ability  ·  R reload  ·  P pause', FIELD.width / 2, 512, 17, '#fff6e5', 'center', '600');
    text(
      ui.mode === 'fountain'
        ? 'Mode: Fountain Control — fill your bottle to 100  ·  press F to switch'
        : 'Mode: Team Deathmatch — first to 20 pops  ·  press F to switch',
      FIELD.width / 2,
      540,
      17,
      '#ffd9de',
      'center',
      '600',
    );
    if (ui.best > 0) text(`Your best: ${ui.best} wins`, FIELD.width / 2, 578, 17, PALETTE.gold, 'center', '700');
    text('Click or press Space to start', FIELD.width / 2, 640, 24, '#f2c94c', 'center', '800');
  }

  function drawOver(state, ui) {
    const player = state.fighters[0];
    const winner = state.winner;
    const title = winner === 'draw' ? 'DRAW!' : winner === 'coco' ? 'COCO WINS!' : 'BERRY WINS!';
    const color = winner === 'coco' ? PALETTE.coco : winner === 'berry' ? PALETTE.berry : PALETTE.text;
    const accuracy = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    const lines = [
      `COCO ${state.score.coco}  —  ${state.score.berry} BERRY`,
      `You popped ${player.kills} and got popped ${player.deaths} times · accuracy ${accuracy}%`,
      ui.best > 0 ? `Match wins on this browser: ${ui.best}` : 'Your first match is in the books!',
    ];
    drawPanel(title, lines, 'Press Space or click to play again', color);
  }

  /** Paint one frame: the arena, then the HUD or a panel for the screen. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake * 7 : 0;
    const shakeY = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake * 7 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawFloor(state);
    drawFountain(state, ui.time);
    drawPuddles(state);
    drawObstacles(state);
    drawHearts(state, ui.time);
    const sorted = state.fighters.slice().sort((a, b) => a.y - b.y);
    for (const fighter of sorted) {
      if (fighter.alive) drawFighter(fighter, ui.time);
    }
    drawProjectiles(state);
    drawParticles(state);
    if (screen === SCREEN_TITLE) {
      context.save();
      context.fillStyle = 'rgba(43, 26, 18, 0.45)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.restore();
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    drawBanner(ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The snack fight waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawOver(state, ui);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField, heroCardAt };
}

// The heart's drawn size, shared with the pickup radius in the world.
const HEART_RADIUS = 13;
