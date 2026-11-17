// Every tuning number and colour in one place. The arena is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below depends
// on the screen size. COCO BRAWL's palette is a dessert cafe: warm cream,
// strawberry pink, chocolate brown and mint, on a soft cocoa backdrop.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Kills a team needs to win a Deathmatch round. */
export const WIN_KILLS = 20;

/** Fountain mode: seconds on the clock, and progress (0-100) a team needs to win early. */
export const FOUNTAIN = { seconds: 180, winProgress: 100, radius: 86, fillPerSecond: 7 };

/** How many fighters per team (player + bots on COCO, bots on BERRY). */
export const TEAM_SIZE = 5;

export const FIGHTER = {
  radius: 16,
  speed: 255,
  maxHp: 100,
  /** Seconds after last damage before health starts coming back. */
  regenDelay: 4,
  regenPerSecond: 22,
  /** Seconds a fighter waits before respawning at its team's spawn. */
  respawnSeconds: 2.5,
  /** Seconds of spawn protection after respawning. */
  spawnShield: 1.5,
};

export const PROJECTILE = {
  radius: 5,
  speed: 780,
  /** Seconds a pellet lives before it fizzles out (sets its range). */
  life: 0.75,
};

/** Candy hearts: heal on pickup, respawn on a timer at fixed spots. */
export const HEART = { radius: 13, heal: 30, respawnSeconds: 12, maxHearts: 2 };

/** How many particles and floating texts can exist at once; pools are allocated once. */
export const POOL = { projectiles: 96, particles: 320, texts: 24, feed: 5 };

export const PALETTE = {
  backdrop: '#2b1a12',
  floorA: '#f7e8d0',
  floorB: '#f3ddba',
  border: '#e8b4b8',
  wall: '#8a5a3b',
  wallTop: '#a9714b',
  pillar: '#f2c94c',
  pillarStripe: '#e5536b',
  fountain: '#f78fb3',
  fountainRing: '#e5536b',
  coco: '#7b4b2a',
  cocoDark: '#5d3418',
  cocoLight: '#a9714b',
  berry: '#e5536b',
  berryDark: '#b0304a',
  berryLight: '#ff8fa3',
  cream: '#fff6e5',
  mint: '#7fd8a4',
  gold: '#f2c94c',
  text: '#3a2418',
  textLight: '#fff6e5',
  muted: '#8b6f5c',
  panel: '#fff6e5',
  panelEdge: '#e8b4b8',
  danger: '#e5484d',
  shadow: 'rgba(43, 26, 18, 0.25)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the match record is kept between visits (this browser only). */
export const BEST_KEY = 'coco-brawl.best';
