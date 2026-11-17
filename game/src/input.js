// Keyboard and pointer input for a top-down shooter. Held keys and the mouse
// give a movement vector and an aim point every frame; one-shot presses (start,
// pause, ability, reload, mute, hero pick) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ABILITY = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;
export const ACTION_MODE = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ABILITY = new Set(['KeyQ']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const MODE = new Set(['KeyF']);
const HERO_KEYS = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let heroPick = -1;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ABILITY.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ABILITY;
    } else if (RELOAD.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RELOAD;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (MODE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MODE;
    } else if (HERO_KEYS.has(event.code)) {
      heroPick = Number(event.code.slice(-1)) - 1;
    } else return;
    if (CONFIRM.has(event.code) || PAUSE.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    if (event.button === 0) mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    /** Normalised movement vector from the held keys, {x, y}. */
    moveVector() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** Mouse position in canvas CSS pixels (the renderer converts to field space). */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Index 0-3 of a hero picked with keys 1-4 since the last call, else -1. */
    takeHeroPick() {
      const picked = heroPick;
      heroPick = -1;
      return picked;
    },
  };
}
