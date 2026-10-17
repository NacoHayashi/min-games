export const TILE = 32;
export const COLS = 40;
export const ROWS = 34;

export const ANIMALS = [
  { id: "cat", label: "貓" },
  { id: "dog", label: "狗" },
  { id: "rabbit", label: "兔" },
  { id: "bear", label: "熊" },
  { id: "fox", label: "狐" },
  { id: "panda", label: "貓熊" },
  { id: "penguin", label: "企鵝" },
  { id: "frog", label: "青蛙" },
] as const;

export const ACCESSORY_GROUPS = {
  hat: [
    { id: "none", label: "無" },
    { id: "beanie", label: "毛帽" },
    { id: "ribbon", label: "蝴蝶結" },
    { id: "flower", label: "小花" },
    { id: "crown", label: "皇冠" },
  ],
  glasses: [
    { id: "none", label: "無" },
    { id: "round", label: "圓框眼鏡" },
    { id: "sun", label: "墨鏡" },
  ],
  extra: [
    { id: "none", label: "無" },
    { id: "scarf", label: "圍巾" },
    { id: "bowtie", label: "領結" },
    { id: "headphones", label: "耳機" },
  ],
} as const;

export type AccessorySlot = keyof typeof ACCESSORY_GROUPS;
export type Accessories = Record<AccessorySlot, string>;

export const FURNITURE: Record<string, { w: number; h: number; solid: boolean; label: string }> = {
  monitor: { w: 40, h: 26, solid: false, label: "螢幕" },
  keyboard: { w: 36, h: 12, solid: false, label: "鍵盤" },
  mouse: { w: 12, h: 16, solid: false, label: "滑鼠" },
  chair: { w: 32, h: 26, solid: true, label: "辦公椅" },
  plant: { w: 26, h: 32, solid: true, label: "植栽" },
  lamp: { w: 18, h: 32, solid: true, label: "檯燈" },
  coffee: { w: 28, h: 30, solid: true, label: "咖啡機" },
  water: { w: 26, h: 36, solid: true, label: "飲水機" },
  console: { w: 36, h: 18, solid: false, label: "遊戲機" },
  speaker: { w: 20, h: 28, solid: true, label: "音響" },
  sofa: { w: 72, h: 36, solid: true, label: "沙發" },
  bin: { w: 16, h: 20, solid: false, label: "垃圾桶" },
  shelf: { w: 48, h: 28, solid: true, label: "書架" },
  board: { w: 56, h: 32, solid: true, label: "白板" },
  cactus: { w: 20, h: 28, solid: true, label: "仙人掌" },
};

const RESERVED = new Set(["kiki", "admin", "system", "npc", "office"]);

export type Zone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
};

export type Prop = {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  label?: string;
  tint?: string;
  /** "play" opens the game lobby. "scores" opens the leaderboard. */
  use?: "play" | "scores";
};

export type Furn = {
  id: string;
  kind: string;
  x: number;
  y: number;
  rot: number;
};

export type OfficeMap = {
  tile: number;
  cols: number;
  rows: number;
  walls: string[];
  zones: Zone[];
  props: Prop[];
  kiki: { x: number; y: number; name: string; title: string };
  spawn: { x: number; y: number };
  talk: { x: number; y: number };
  furniture: Furn[];
};

export const BODY_IDS = ["mochi", "bean", "pear", "wide"] as const;
export const EAR_IDS = ["none", "round", "point", "fox", "long", "flop", "nub"] as const;
export const TAIL_IDS = ["none", "puff", "bush", "thin", "curl", "nub"] as const;
export const EYE_IDS = ["dot", "highlight", "happy", "sleepy", "sparkle", "line"] as const;
export const MOUTH_IDS = ["omega", "smile", "o", "cat", "none", "beak", "wide"] as const;
export const BLUSH_IDS = ["none", "oval", "round", "lines"] as const;
export const MARK_IDS = ["none", "freckles", "spot", "panda"] as const;
export const HEAD_IDS = ["none", "beanie", "ribbon", "flower", "crown", "headphones"] as const;
export const FACE_IDS = ["none", "round", "sun"] as const;
export const NECK_IDS = ["none", "scarf", "bowtie"] as const;
export const HELD_IDS = ["none", "mug", "balloon"] as const;
export const COLOR_KEYS = ["body", "ear", "inner", "tip", "belly", "tail", "blush"] as const;

export type LookColors = Record<(typeof COLOR_KEYS)[number], string>;

export type Look = {
  v: 2;
  body: string;
  ears: string;
  tail: string;
  belly: boolean;
  eyes: string;
  mouth: string;
  blush: string;
  marking: string;
  head: string;
  face: string;
  neck: string;
  held: string;
  colors: LookColors;
};

const PARTS = {
  body: [
    { id: "mochi", label: "圓麻糬" },
    { id: "bean", label: "豆豆" },
    { id: "pear", label: "梨形" },
    { id: "wide", label: "扁軟" },
  ],
  ears: [
    { id: "none", label: "無" },
    { id: "round", label: "圓耳" },
    { id: "point", label: "尖耳" },
    { id: "fox", label: "高尖耳" },
    { id: "long", label: "長耳" },
    { id: "flop", label: "垂耳" },
    { id: "nub", label: "小突" },
  ],
  tail: [
    { id: "none", label: "無" },
    { id: "puff", label: "圓球" },
    { id: "bush", label: "大蓬尾" },
    { id: "thin", label: "細尾" },
    { id: "curl", label: "捲尾" },
    { id: "nub", label: "短尾" },
  ],
  eyes: [
    { id: "dot", label: "圓點" },
    { id: "highlight", label: "亮點" },
    { id: "happy", label: "開心 ^^" },
    { id: "sleepy", label: "瞇瞇眼" },
    { id: "sparkle", label: "星星眼" },
    { id: "line", label: "橫線" },
  ],
  mouth: [
    { id: "omega", label: "ω" },
    { id: "smile", label: "微笑" },
    { id: "o", label: "小圓" },
    { id: "cat", label: "貓嘴" },
    { id: "none", label: "無" },
    { id: "beak", label: "喙" },
    { id: "wide", label: "大嘴" },
  ],
  blush: [
    { id: "none", label: "無" },
    { id: "oval", label: "橢圓" },
    { id: "round", label: "圓形" },
    { id: "lines", label: "線條" },
  ],
  marking: [
    { id: "none", label: "無" },
    { id: "freckles", label: "雀斑" },
    { id: "spot", label: "額心" },
    { id: "panda", label: "眼圈" },
  ],
  head: [
    { id: "none", label: "無" },
    { id: "beanie", label: "毛帽" },
    { id: "ribbon", label: "蝴蝶結" },
    { id: "flower", label: "小花" },
    { id: "crown", label: "皇冠" },
    { id: "headphones", label: "耳機" },
  ],
  face: [
    { id: "none", label: "無" },
    { id: "round", label: "圓框眼鏡" },
    { id: "sun", label: "墨鏡" },
  ],
  neck: [
    { id: "none", label: "無" },
    { id: "scarf", label: "圍巾" },
    { id: "bowtie", label: "領結" },
  ],
  held: [
    { id: "none", label: "無" },
    { id: "mug", label: "杯子" },
    { id: "balloon", label: "氣球" },
  ],
} as const;

export const SWATCHES = [
  "#f06292", "#ff8fb8", "#d81b60", "#fff8fc", "#f7c2d8", "#d45388",
  "#e0a045", "#b56a32", "#f6d7b0", "#c47a3a", "#8d5524", "#f8e0c0",
  "#f06a28", "#ff7a62", "#4a1c0c", "#fff1e4", "#fffdfb", "#1a1a22",
  "#243356", "#f0a050", "#3cb85c", "#dff5b0", "#7aa6ee", "#f26d9a",
  "#ffd76a", "#6ec8be", "#c9b6ff", "#ff709c",
];

const COLOR_LABELS = [
  { id: "body", label: "身體" },
  { id: "ear", label: "耳朵" },
  { id: "inner", label: "耳內" },
  { id: "tip", label: "耳尖" },
  { id: "belly", label: "肚子" },
  { id: "tail", label: "尾巴" },
  { id: "blush", label: "腮紅" },
];

function colors(partial: LookColors): LookColors {
  return partial;
}

const PRESET_LOOKS: Record<string, Omit<Look, "v">> = {
  cat: {
    body: "bean", ears: "point", tail: "thin", belly: true,
    eyes: "highlight", mouth: "omega", blush: "oval", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#f06292", ear: "#f06292", inner: "#d81b60", tip: "#ad1457", belly: "#ffe4ef", tail: "#f06292", blush: "#ff709c" }),
  },
  dog: {
    body: "bean", ears: "flop", tail: "curl", belly: true,
    eyes: "highlight", mouth: "smile", blush: "oval", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#e0a045", ear: "#b56a32", inner: "#f6d7b0", tip: "#8d5524", belly: "#fff0d0", tail: "#b56a32", blush: "#ff709c" }),
  },
  rabbit: {
    body: "bean", ears: "long", tail: "puff", belly: true,
    eyes: "highlight", mouth: "omega", blush: "oval", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#fff8fc", ear: "#f7c2d8", inner: "#d45388", tip: "#f7c2d8", belly: "#ffffff", tail: "#fffdfb", blush: "#ff709c" }),
  },
  bear: {
    body: "bean", ears: "round", tail: "nub", belly: true,
    eyes: "highlight", mouth: "smile", blush: "round", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#c47a3a", ear: "#8d5524", inner: "#e0a070", tip: "#8d5524", belly: "#f8e0c0", tail: "#fffdfb", blush: "#ff709c" }),
  },
  fox: {
    body: "bean", ears: "fox", tail: "bush", belly: true,
    eyes: "highlight", mouth: "omega", blush: "oval", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#f06a28", ear: "#f06a28", inner: "#ff7a62", tip: "#4a1c0c", belly: "#fff1e4", tail: "#f06a28", blush: "#ff709c" }),
  },
  panda: {
    body: "bean", ears: "round", tail: "nub", belly: false,
    eyes: "highlight", mouth: "smile", blush: "none", marking: "panda",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#fffdfb", ear: "#1a1a22", inner: "#3a3544", tip: "#1a1a22", belly: "#ffffff", tail: "#fffdfb", blush: "#ff709c" }),
  },
  penguin: {
    body: "bean", ears: "none", tail: "none", belly: true,
    eyes: "highlight", mouth: "beak", blush: "none", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#243356", ear: "#243356", inner: "#f0a050", tip: "#243356", belly: "#fffdfb", tail: "#243356", blush: "#ff709c" }),
  },
  frog: {
    body: "wide", ears: "none", tail: "none", belly: true,
    eyes: "dot", mouth: "wide", blush: "none", marking: "none",
    head: "none", face: "none", neck: "none", held: "none",
    colors: colors({ body: "#3cb85c", ear: "#3cb85c", inner: "#ffffff", tip: "#2e8b46", belly: "#dff5b0", tail: "#3cb85c", blush: "#ff709c" }),
  },
};

export const BODY_RADIUS: Record<string, number> = {
  mochi: 33,
  bean: 31,
  pear: 31,
  wide: 43,
};

export function bodyRadiusOf(look: { body?: string } | null | undefined): number {
  const id = look && typeof look.body === "string" ? look.body : "bean";
  return BODY_RADIUS[id] ?? BODY_RADIUS.bean;
}

export function catalog() {
  return {
    animals: ANIMALS.map((animal) => ({ ...animal, look: presetLook(animal.id) })),
    parts: PARTS,
    colors: COLOR_LABELS,
    swatches: SWATCHES,
    radii: BODY_RADIUS,
  };
}

export function presetLook(animal: string): Look | null {
  const found = PRESET_LOOKS[animal];
  if (!found) return null;
  return { v: 2, ...found, colors: { ...found.colors } };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function pickId(value: unknown, allowed: readonly string[], fallback: string): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) return null;
  return value;
}

export function normalizeLook(input: unknown): Look | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const base = presetLook("cat");
  if (!base) return null;
  const body = pickId(src.body, BODY_IDS, base.body);
  const ears = pickId(src.ears, EAR_IDS, base.ears);
  const tail = pickId(src.tail, TAIL_IDS, base.tail);
  const eyes = pickId(src.eyes, EYE_IDS, base.eyes);
  const mouth = pickId(src.mouth, MOUTH_IDS, base.mouth);
  const blush = pickId(src.blush, BLUSH_IDS, base.blush);
  const marking = pickId(src.marking, MARK_IDS, base.marking);
  const head = pickId(src.head, HEAD_IDS, base.head);
  const face = pickId(src.face, FACE_IDS, base.face);
  const neck = pickId(src.neck, NECK_IDS, base.neck);
  const held = pickId(src.held, HELD_IDS, base.held);
  if (!body || !ears || !tail || !eyes || !mouth || !blush || !marking || !head || !face || !neck || !held) return null;
  const belly = src.belly === undefined ? base.belly : src.belly;
  if (typeof belly !== "boolean") return null;
  const colorsOut = { ...base.colors };
  if (src.colors !== undefined) {
    if (!src.colors || typeof src.colors !== "object" || Array.isArray(src.colors)) return null;
    const bag = src.colors as Record<string, unknown>;
    for (const key of COLOR_KEYS) {
      if (!(key in bag)) continue;
      const value = bag[key];
      if (typeof value !== "string" || !HEX.test(value)) return null;
      colorsOut[key] = value.toLowerCase();
    }
  }
  return { v: 2, body, ears, tail, belly, eyes, mouth, blush, marking, head, face, neck, held, colors: colorsOut };
}

export function applyLegacyAccessories(look: Look, accessories: Accessories): Look {
  const next: Look = { ...look, colors: { ...look.colors } };
  if (accessories.hat && accessories.hat !== "none" && (HEAD_IDS as readonly string[]).includes(accessories.hat)) {
    next.head = accessories.hat;
  }
  if (accessories.glasses && accessories.glasses !== "none" && (FACE_IDS as readonly string[]).includes(accessories.glasses)) {
    next.face = accessories.glasses;
  }
  if (accessories.extra === "scarf" || accessories.extra === "bowtie") next.neck = accessories.extra;
  if (accessories.extra === "headphones" && next.head === "none") next.head = "headphones";
  return next;
}

export function readStoredLook(animal: string | null, raw: string | null): Look | null {
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (parsed && typeof parsed === "object" && (parsed as { v?: unknown }).v === 2) {
    const look = normalizeLook(parsed);
    if (look) return look;
  }
  if (!animal || animal === "custom" || !isAnimal(animal)) return null;
  const look = presetLook(animal);
  if (!look) return null;
  return applyLegacyAccessories(look, normalizeAccessories(parsed) ?? defaultAccessories());
}

export function avatarAnimal(raw: unknown, look: Look): string {
  if (raw === "custom") return "custom";
  if (typeof raw === "string" && isAnimal(raw)) return raw;
  for (const animal of ANIMALS) {
    const preset = presetLook(animal.id);
    if (!preset) continue;
    if (JSON.stringify({ ...preset, v: 0 }) === JSON.stringify({ ...look, v: 0 })) return animal.id;
  }
  return "custom";
}

export function palette() {
  return Object.entries(FURNITURE).map(([kind, spec]) => ({
    kind,
    label: spec.label,
    w: spec.w,
    h: spec.h,
    solid: spec.solid,
  }));
}

export function checkId(raw: unknown): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "請輸入 ID" };
  const id = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,15}$/.test(id)) {
    return {
      ok: false,
      error: "ID 需為 2 到 16 個字，以英數開頭，只能使用英數、底線或減號",
    };
  }
  if (RESERVED.has(id)) return { ok: false, error: "這個 ID 不能使用" };
  return { ok: true, id };
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = [...raw.replace(/[\u0000-\u001F]/g, "").trim()].slice(0, 16).join("");
  return name.length ? name : null;
}

export function normalizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = [...raw.replace(/[\u0000-\u001F]/g, "").trim()].slice(0, 80).join("");
  return text.length ? text : null;
}

export function checkPassword(raw: unknown): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "請輸入密碼" };
  const password = raw.trim();
  const len = [...password].length;
  if (len < 4) return { ok: false, error: "密碼至少 4 個字" };
  if (len > 64) return { ok: false, error: "密碼最多 64 個字" };
  return { ok: true, password };
}

export function isAnimal(id: unknown): id is string {
  return typeof id === "string" && ANIMALS.some((animal) => animal.id === id);
}

const SLOTS: AccessorySlot[] = ["hat", "glasses", "extra"];

export function defaultAccessories(): Accessories {
  return { hat: "none", glasses: "none", extra: "none" };
}

export function normalizeAccessories(input: unknown, base?: Accessories): Accessories | null {
  const out: Accessories = { ...(base ?? defaultAccessories()) };
  if (input === undefined || input === null) return out;
  if (typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  for (const slot of SLOTS) {
    if (!(slot in src)) continue;
    const value = src[slot];
    const allowed = ACCESSORY_GROUPS[slot].map((item) => item.id as string);
    if (typeof value !== "string" || !allowed.includes(value)) return null;
    out[slot] = value;
  }
  return out;
}

export function furnitureSize(kind: string, rot: number): { w: number; h: number } | null {
  const spec = FURNITURE[kind];
  if (!spec) return null;
  const quarter = ((rot % 360) + 360) % 360;
  if (quarter % 180 !== 0) return { w: spec.h, h: spec.w };
  return { w: spec.w, h: spec.h };
}

export function furnitureFits(walls: string[], kind: string, x: number, y: number, rot: number): boolean {
  const size = furnitureSize(kind, rot);
  if (!size) return false;
  const maxX = COLS * TILE;
  const maxY = ROWS * TILE;
  if (x < 0 || y < 0 || x + size.w > maxX || y + size.h > maxY) return false;
  const points = [
    [x + 2, y + 2],
    [x + size.w - 2, y + 2],
    [x + 2, y + size.h - 2],
    [x + size.w - 2, y + size.h - 2],
    [x + size.w / 2, y + size.h / 2],
  ];
  return points.every(([px, py]) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return walls[ty]?.[tx] === "0";
  });
}

export function zoneAt(x: number, y: number, zones: Zone[]): Zone | null {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  for (const zone of zones) {
    if (tx >= zone.x && ty >= zone.y && tx < zone.x + zone.w && ty < zone.y + zone.h) return zone;
  }
  return null;
}

export function isRestroom(x: number, y: number, zones: Zone[]): boolean {
  const zone = zoneAt(x, y, zones);
  return zone?.id === "men" || zone?.id === "women";
}

export function publicMap(map: OfficeMap) {
  return {
    tile: map.tile,
    cols: map.cols,
    rows: map.rows,
    walls: map.walls,
    zones: map.zones,
    props: map.props,
    kiki: map.kiki,
    spawn: map.spawn,
    talk: map.talk,
  };
}

function tileBox(tx: number, ty: number, tw: number, th: number) {
  return { x: tx * TILE, y: ty * TILE, w: tw * TILE, h: th * TILE };
}

function makeWalls(): string[] {
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const set = (x: number, y: number, value = 1) => {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) grid[y][x] = value;
  };
  const hline = (y: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) set(x, y, 1);
  };
  const vline = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) set(x, y, 1);
  };
  const carve = (x: number, y: number) => set(x, y, 0);

  hline(0, 0, COLS - 1);
  hline(ROWS - 1, 0, COLS - 1);
  vline(0, 0, ROWS - 1);
  vline(COLS - 1, 0, ROWS - 1);

  hline(9, 0, COLS - 1);
  vline(15, 0, 9);
  vline(27, 0, 9);
  carve(6, 9);
  carve(7, 9);
  carve(20, 9);
  carve(21, 9);
  carve(32, 9);
  carve(33, 9);

  hline(24, 0, COLS - 1);
  vline(10, 24, ROWS - 1);
  vline(20, 24, ROWS - 1);
  vline(29, 24, ROWS - 1);
  carve(4, 24);
  carve(5, 24);
  carve(14, 24);
  carve(15, 24);
  carve(23, 24);
  carve(24, 24);
  carve(33, 24);
  carve(34, 24);

  return grid.map((row) => row.join(""));
}

function sign(centerX: number, tileY: number, label: string): Prop {
  const w = 76;
  return {
    kind: "sign",
    x: centerX - w / 2,
    y: tileY * TILE + 6,
    w,
    h: 20,
    solid: false,
    label,
  };
}

function tileBlocked(walls: string[], props: Prop[], tx: number, ty: number): boolean {
  if (ty < 0 || tx < 0 || ty >= walls.length || tx >= (walls[0]?.length ?? 0)) return true;
  if (walls[ty][tx] === "1") return true;
  const cx = tx * TILE + TILE / 2;
  const cy = ty * TILE + TILE / 2;
  return props.some((prop) => prop.solid && cx >= prop.x && cx <= prop.x + prop.w && cy >= prop.y && cy <= prop.y + prop.h);
}

function canReach(walls: string[], props: Prop[], ax: number, ay: number, bx: number, by: number): boolean {
  const start = [Math.floor(ax / TILE), Math.floor(ay / TILE)];
  const goal = [Math.floor(bx / TILE), Math.floor(by / TILE)];
  if (tileBlocked(walls, props, goal[0], goal[1])) return false;
  const queue = [start];
  const seen = new Set([`${start[0]},${start[1]}`]);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    if (x === goal[0] && y === goal[1]) return true;
    for (const [dx, dy] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || tileBlocked(walls, props, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

export function buildOffice(): OfficeMap {
  const walls = makeWalls();
  const zones: Zone[] = [
    { id: "reception", name: "接待處", x: 1, y: 1, w: 14, h: 8, floor: "#fde7ef" },
    { id: "meeting", name: "會議室", x: 16, y: 1, w: 11, h: 8, floor: "#e4e8ff" },
    { id: "game", name: "遊戲室", x: 28, y: 1, w: 11, h: 8, floor: "#f0e4ff" },
    { id: "hall", name: "走廊", x: 1, y: 10, w: 38, h: 2, floor: "#f7f0e4" },
    { id: "office", name: "辦公區", x: 1, y: 12, w: 38, h: 12, floor: "#fbf6ee" },
    { id: "men", name: "男廁", x: 1, y: 25, w: 9, h: 8, floor: "#d9eeff" },
    { id: "women", name: "女廁", x: 11, y: 25, w: 9, h: 8, floor: "#ffe0f0" },
    { id: "pantry", name: "茶水間", x: 21, y: 25, w: 8, h: 8, floor: "#fff1d4" },
    { id: "sofa", name: "沙發區", x: 30, y: 25, w: 9, h: 8, floor: "#e5f7ef" },
  ];

  const desks: Prop[] = [];
  let deskNo = 0;
  for (const ty of [13, 19]) {
    for (const tx of [2, 10, 18, 26, 34]) {
      deskNo += 1;
      desks.push({ kind: "desk", label: String(deskNo), solid: true, ...tileBox(tx, ty, 4, 2) });
    }
  }

  const props: Prop[] = [
    { kind: "counter", solid: true, label: "櫃檯", ...tileBox(3, 4, 8, 1) },
    { kind: "rug", solid: false, ...tileBox(4, 6, 6, 2), tint: "#f8c3d6" },
    { kind: "table", solid: true, ...tileBox(18, 3, 6, 3) },
    { kind: "arcade", solid: true, use: "play", label: "街機", x: 29 * TILE + 8, y: 2 * TILE + 4, w: 52, h: 72 },
    { kind: "arcade", solid: true, x: 34 * TILE + 4, y: 2 * TILE + 4, w: 52, h: 72 },
    { kind: "scoreboard", solid: true, use: "scores", label: "排行榜", x: 32 * TILE + 8, y: 6 * TILE + 8, w: 64, h: 24 },
    { kind: "pantry", solid: true, ...tileBox(22, 30, 5, 1) },
    { kind: "stall", solid: true, x: 2 * TILE, y: 29 * TILE, w: 64, h: 56, tint: "#d7ecff" },
    { kind: "stall", solid: true, x: 6 * TILE, y: 29 * TILE, w: 64, h: 56, tint: "#d7ecff" },
    { kind: "stall", solid: true, x: 12 * TILE, y: 29 * TILE, w: 64, h: 56, tint: "#ffd6ea" },
    { kind: "stall", solid: true, x: 16 * TILE, y: 29 * TILE, w: 64, h: 56, tint: "#ffd6ea" },
    { kind: "mirror", solid: false, x: 4 * TILE, y: 25 * TILE + 6, w: 36, h: 28 },
    { kind: "mirror", solid: false, x: 14 * TILE, y: 25 * TILE + 6, w: 36, h: 28 },
    { kind: "coffeetable", solid: true, x: 33 * TILE + 4, y: 28 * TILE, w: 88, h: 40 },
    ...[3, 9, 18, 23, 31, 36].map((tx) => ({ kind: "window", solid: false, x: tx * TILE, y: 4, w: 48, h: 24 })),
    sign(224, 10, "接待處"),
    sign(21 * TILE, 10, "會議室"),
    sign(33 * TILE, 10, "遊戲室"),
    sign(5 * TILE, 23, "男廁"),
    sign(15 * TILE, 23, "女廁"),
    sign(24 * TILE, 23, "茶水間"),
    sign(34 * TILE, 23, "沙發區"),
    ...desks,
  ];

  const furniture: Furn[] = [];
  for (const desk of desks) {
    const id = desk.label ?? "0";
    const cx = desk.x + desk.w / 2;
    furniture.push(
      { id: `desk-${id}-monitor`, kind: "monitor", x: cx - 20, y: desk.y + 6, rot: 0 },
      { id: `desk-${id}-keyboard`, kind: "keyboard", x: cx - 18, y: desk.y + 38, rot: 0 },
      { id: `desk-${id}-mouse`, kind: "mouse", x: cx + 26, y: desk.y + 40, rot: 0 },
      { id: `desk-${id}-chair`, kind: "chair", x: cx - 16, y: desk.y + desk.h + 8, rot: 0 },
    );
  }
  furniture.push(
    { id: "plant-reception", kind: "plant", x: 48, y: 48, rot: 0 },
    { id: "plant-office", kind: "plant", x: 46, y: 388, rot: 0 },
    { id: "plant-sofa", kind: "plant", x: 31 * TILE, y: 31 * TILE, rot: 0 },
    { id: "lamp-meet", kind: "lamp", x: 16 * TILE + 10, y: 46, rot: 0 },
    { id: "shelf-meet", kind: "shelf", x: 16 * TILE + 8, y: 6 * TILE + 4, rot: 0 },
    { id: "board-meet", kind: "board", x: 20 * TILE, y: 44, rot: 0 },
    { id: "console-1", kind: "console", x: 30 * TILE, y: 6 * TILE, rot: 0 },
    { id: "speaker-1", kind: "speaker", x: 36 * TILE + 4, y: 6 * TILE, rot: 0 },
    { id: "cactus-1", kind: "cactus", x: 37 * TILE + 4, y: 6 * TILE + 4, rot: 0 },
    { id: "coffee-1", kind: "coffee", x: 22 * TILE + 8, y: 29 * TILE + 4, rot: 0 },
    { id: "water-1", kind: "water", x: 26 * TILE + 4, y: 28 * TILE + 8, rot: 0 },
    { id: "sofa-left", kind: "sofa", x: 31 * TILE, y: 26 * TILE + 8, rot: 90 },
    { id: "sofa-right", kind: "sofa", x: 36 * TILE + 8, y: 26 * TILE + 8, rot: 90 },
    { id: "meet-chair-s1", kind: "chair", x: 620, y: 202, rot: 0 },
    { id: "meet-chair-s2", kind: "chair", x: 700, y: 202, rot: 0 },
    { id: "meet-chair-w", kind: "chair", x: 536, y: 120, rot: 0 },
    { id: "meet-chair-e", kind: "chair", x: 776, y: 120, rot: 0 },
    { id: "bin-1", kind: "bin", x: 37 * TILE + 6, y: 22 * TILE, rot: 0 },
  );

  const kiki = { x: 224, y: 116, name: "Kiki 小姐", title: "櫃檯" };
  const spawn = { x: 20 * TILE + 16, y: 10 * TILE + 16 };
  const talk = { x: 224, y: 208 };

  for (const item of furniture) {
    if (!furnitureFits(walls, item.kind, item.x, item.y, item.rot)) {
      throw new Error(`預設家具放不進去：${item.id} (${item.x}, ${item.y})`);
    }
  }
  if (desks.length !== 10) throw new Error("需要 10 張桌子");
  if (furniture.filter((item) => item.kind === "monitor").length !== 10) throw new Error("每張桌子都要有螢幕");
  if (furniture.filter((item) => item.kind === "keyboard").length !== 10) throw new Error("每張桌子都要有鍵盤");
  if (furniture.filter((item) => item.kind === "mouse").length !== 10) throw new Error("每張桌子都要有滑鼠");

  const visits: Array<[string, number, number]> = [
    ["接待處", talk.x, talk.y],
    ["會議室", 17 * TILE + 16, 2 * TILE + 16],
    ["遊戲室", 31 * TILE + 16, 7 * TILE + 8],
    ["街機", 29 * TILE + 34, 2 * TILE + 4 + 72 + 16],
    ["排行榜", 32 * TILE + 40, 6 * TILE + 48],
    ["辦公區", 8 * TILE + 16, 17 * TILE + 16],
    ["男廁", 5 * TILE + 16, 27 * TILE + 16],
    ["女廁", 15 * TILE + 16, 27 * TILE + 16],
    ["茶水間", 25 * TILE + 16, 27 * TILE + 16],
    ["沙發區", 34 * TILE + 8, 26 * TILE + 8],
  ];
  for (const [name, x, y] of visits) {
    if (!canReach(walls, props, spawn.x, spawn.y, x, y)) {
      throw new Error(`地圖從出生點走不到${name}`);
    }
  }

  return {
    tile: TILE,
    cols: COLS,
    rows: ROWS,
    walls,
    zones,
    props,
    kiki,
    spawn,
    talk,
    furniture,
  };
}
