import { FONT, drawAnimal, drawFurniture, drawKiki, drawProp } from "./sprites.js";

const SESSION = "office_session";
const DEVICE = "office_device";
const TILE = 32;
const SPEED = 170;

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const ctx = canvas.getContext("2d");

const state = {
  map: null,
  me: null,
  profile: null,
  catalog: null,
  others: new Map(),
  furniture: [],
  specs: new Map(),
  bubbles: new Map(),
  connected: false,
  editing: false,
  armed: null,
  selected: null,
  focus: null,
  keys: new Set(),
  path: [],
  socket: null,
  zoneName: "",
  gate: true,
  password: "",
  avatarMode: "first",
  avatarAnimal: "cat",
  avatarAcc: { hat: "none", glasses: "none", extra: "none" },
  backoff: 700,
  sentX: 0,
  sentY: 0,
  sentAt: 0,
  dirty: false,
  drag: null,
  pan: null,
  hint: "",
  help: false,
  cam: { x: 0, y: 0 },
  anim: 0,
  loop: false,
};

let wsGen = 0;

function deviceKey() {
  let key = localStorage.getItem(DEVICE);
  if (!/^[a-f0-9]{32,128}$/i.test(key || "")) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE, key);
  }
  return key.toLowerCase();
}

function checkId(raw) {
  const id = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,15}$/.test(id)) {
    return { ok: false, error: "ID 需為 2 到 16 個字，以英數開頭，只能使用英數、底線或減號" };
  }
  if (["kiki", "admin", "system", "npc", "office"].includes(id)) return { ok: false, error: "這個 ID 不能使用" };
  return { ok: true, id };
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body) headers["content-type"] = "application/json";
  const token = options.token === undefined ? localStorage.getItem(SESSION) : options.token;
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, ...data };
  } catch {
    return { ok: false, error: "連不上辦公室" };
  }
}

function setConn(text, warn = false) {
  const node = $("conn");
  node.textContent = text;
  node.classList.toggle("warn", warn);
}

function setHint(text) {
  state.hint = text || "";
  $("hint").textContent = state.hint;
  $("hint").hidden = !state.hint;
}

function showGate(message) {
  wsGen += 1;
  state.gate = true;
  state.connected = false;
  state.editing = false;
  try { state.socket?.close(); } catch { /* ignore */ }
  state.socket = null;
  $("gate").hidden = false;
  $("avatar").hidden = true;
  $("hud").hidden = true;
  $("chatbar").hidden = true;
  $("dialogue").hidden = true;
  $("editbar").hidden = true;
  $("help").hidden = true;
  $("form-password").hidden = false;
  $("form-register").hidden = true;
  $("gate-msg").textContent = message || "輸入管理員給大家的辦公室密碼。這台裝置會記住你。";
  $("gate-error").textContent = "";
  $("office-password").value = "";
}

function showRegister() {
  $("form-password").hidden = true;
  $("form-register").hidden = false;
  $("gate-msg").textContent = "密碼正確。幫自己取一個還沒人用的 ID，再寫顯示名稱。";
  $("gate-error").textContent = "";
  $("office-id").focus();
}

function profileNow() {
  return state.me || state.profile;
}

function showAvatar(mode) {
  state.avatarMode = mode;
  state.gate = mode === "first";
  const profile = profileNow();
  state.avatarAnimal = profile?.animal || state.catalog?.animals?.[0]?.id || "cat";
  state.avatarAcc = { hat: "none", glasses: "none", extra: "none", ...(profile?.accessories || {}) };
  $("avatar-name").value = profile?.displayName || "";
  $("avatar-title").textContent = mode === "mirror" ? "廁所鏡子" : "打造你的小動物";
  $("avatar-note").textContent = mode === "mirror"
    ? "只有在男廁或女廁可以換造型。名稱也可以一起改。"
    : `大家會看到這個造型。名稱下面會標 @${profile?.id || "id"}。`;
  $("avatar-save").textContent = mode === "mirror" ? "換上這個造型" : "進入辦公室";
  $("avatar-cancel").hidden = mode !== "mirror";
  $("avatar-error").textContent = "";
  $("gate").hidden = true;
  $("avatar").hidden = false;
  buildAvatarChoices();
  paintPreview();
}

function buildAvatarChoices() {
  const animals = $("animal-grid");
  const accessories = $("acc-grid");
  animals.replaceChildren();
  accessories.replaceChildren();
  const catalog = state.catalog || { animals: [], accessories: {} };
  for (const animal of catalog.animals || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.animal = animal.id;
    button.textContent = animal.label;
    button.setAttribute("aria-pressed", String(state.avatarAnimal === animal.id));
    button.addEventListener("click", () => {
      state.avatarAnimal = animal.id;
      buildAvatarChoices();
      paintPreview();
    });
    animals.appendChild(button);
  }
  const groups = [
    ["hat", "帽子"],
    ["glasses", "眼鏡"],
    ["extra", "配飾"],
  ];
  for (const [slot, label] of groups) {
    const title = document.createElement("p");
    title.className = "slot-label";
    title.textContent = label;
    accessories.appendChild(title);
    const row = document.createElement("div");
    row.className = "choice-grid";
    for (const option of catalog.accessories?.[slot] || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(state.avatarAcc[slot] === option.id));
      button.addEventListener("click", () => {
        state.avatarAcc = { ...state.avatarAcc, [slot]: option.id };
        buildAvatarChoices();
        paintPreview();
      });
      row.appendChild(button);
    }
    accessories.appendChild(row);
  }
}

function paintPreview() {
  const preview = $("preview");
  const context = preview.getContext("2d");
  context.clearRect(0, 0, preview.width, preview.height);
  drawAnimal(context, state.avatarAnimal, state.avatarAcc, preview.width / 2, preview.height - 28, {
    frame: performance.now() / 280,
    dir: 1,
  });
}

function drawGateArt() {
  const art = $("gate-art");
  const context = art.getContext("2d");
  context.clearRect(0, 0, art.width, art.height);
  ["cat", "rabbit", "fox", "panda", "bear", "frog"].forEach((animal, index) => {
    drawAnimal(context, animal, { hat: index % 2 ? "flower" : "none", glasses: "none", extra: "none" }, 36 + index * 56, 86, { dir: 1 });
  });
}

function applySession(data) {
  state.profile = data.profile;
  state.catalog = data.catalog;
  if (!data.profile.animal) showAvatar("first");
  else startGame();
}

function startGame() {
  state.gate = false;
  state.password = "";
  $("gate").hidden = true;
  $("avatar").hidden = true;
  $("hud").hidden = false;
  $("chatbar").hidden = false;
  ensureLoop();
  connect();
}

function connect() {
  const token = localStorage.getItem(SESSION);
  if (!token || state.gate) return;
  const gen = ++wsGen;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${proto}//${location.host}/api/office/ws?token=${encodeURIComponent(token)}`);
  state.socket = socket;
  setConn("連線中…", true);
  let settled = false;
  const recover = async () => {
    if (settled || gen !== wsGen || state.gate) return;
    settled = true;
    state.connected = false;
    const me = await api("/api/office/me");
    if (gen !== wsGen || state.gate) return;
    if (!me.ok) {
      localStorage.removeItem(SESSION);
      showGate("登入已失效，請重新輸入辦公室密碼。");
      return;
    }
    setConn("重新連線中…", true);
    const wait = state.backoff;
    state.backoff = Math.min(8000, state.backoff * 2);
    setTimeout(() => {
      if (gen !== wsGen || state.gate) return;
      connect();
    }, wait);
  };
  socket.onmessage = (event) => {
    if (gen !== wsGen || typeof event.data !== "string" || event.data === "pong") return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    onNet(message);
  };
  socket.onclose = () => { void recover(); };
  const nativeClose = socket.close.bind(socket);
  socket.close = (...args) => {
    try { nativeClose(...args); } catch { /* already closing */ }
    setTimeout(() => {
      if (socket.readyState === WebSocket.CLOSING) void recover();
    }, 600);
  };
}

function onNet(message) {
  if (message.t === "welcome") {
    state.map = message.map;
    state.furniture = message.furniture || [];
    state.specs = new Map((message.palette || []).map((item) => [item.kind, item]));
    state.me = { ...message.you };
    state.profile = {
      id: message.you.id,
      displayName: message.you.displayName,
      animal: message.you.animal,
      accessories: message.you.accessories,
    };
    state.sentX = state.me.x;
    state.sentY = state.me.y;
    state.others.clear();
    for (const player of message.others || []) {
      state.others.set(player.id, { ...player, tx: player.x, ty: player.y });
    }
    state.connected = true;
    state.backoff = 700;
    state.editing = false;
    $("editbar").hidden = true;
    $("dialogue").hidden = true;
    setConn("已連線");
    buildPalette();
    renderOnline();
    resize();
    return;
  }
  if (message.t === "join") {
    const player = message.player;
    if (player.id === state.me?.id) return;
    state.others.set(player.id, { ...player, tx: player.x, ty: player.y });
    renderOnline();
  } else if (message.t === "leave") {
    state.others.delete(message.id);
    state.bubbles.delete(message.id);
    renderOnline();
  } else if (message.t === "move") {
    const other = state.others.get(message.id);
    if (!other) return;
    other.tx = message.x;
    other.ty = message.y;
    other.dir = message.dir;
    if (Math.hypot(other.tx - other.x, other.ty - other.y) > 180) {
      other.x = other.tx;
      other.y = other.ty;
    }
  } else if (message.t === "chat") {
    state.bubbles.set(message.id, { text: message.text, until: performance.now() + 4500 });
  } else if (message.t === "profile") {
    const apply = (person) => {
      if (!person) return;
      person.displayName = message.displayName;
      person.animal = message.animal;
      person.accessories = message.accessories;
    };
    if (state.me?.id === message.id) {
      apply(state.me);
      apply(state.profile);
      if (state.avatarMode === "mirror" && !$("avatar").hidden) {
        $("avatar").hidden = true;
        state.gate = false;
      }
    } else apply(state.others.get(message.id));
    renderOnline();
  } else if (message.t === "furniture") {
    const dragged = state.drag?.id;
    state.furniture = message.furniture || [];
    if (dragged) state.drag.item = state.furniture.find((item) => item.id === dragged) || null;
  } else if (message.t === "edit") {
    setEditing(Boolean(message.on));
  } else if (message.t === "error") {
    setHint(message.message || "沒有成功");
    if (message.furniture) state.furniture = message.furniture;
    $("avatar-error").textContent = message.message || "";
    setTimeout(() => { if (state.hint === message.message) setHint(""); }, 2400);
  } else if (message.t === "bye") {
    const text = {
      removed: "這個 ID 已被管理員移除。請重新輸入密碼後再登記。",
      kicked: "你已被請出辦公室。請重新輸入密碼。",
      password: "辦公室密碼已更新，請重新輸入。",
      replaced: "這個帳號已在別的分頁開啟。",
    }[message.reason] || "連線已結束。";
    if (message.reason === "removed" || message.reason === "password" || message.reason === "kicked") {
      localStorage.removeItem(SESSION);
    }
    showGate(text);
  }
}

function send(payload) {
  if (state.socket?.readyState === 1) state.socket.send(JSON.stringify(payload));
}

function sendMove(force = false) {
  if (!state.me) return;
  const now = performance.now();
  if (!force && now - state.sentAt < 90) return;
  if (Math.hypot(state.me.x - state.sentX, state.me.y - state.sentY) < 0.4) {
    state.dirty = false;
    return;
  }
  state.sentX = state.me.x;
  state.sentY = state.me.y;
  state.sentAt = now;
  state.dirty = false;
  send({ t: "move", x: state.me.x, y: state.me.y, dir: state.me.dir || 1 });
}

function renderOnline() {
  const list = $("online-list");
  list.replaceChildren();
  const people = [];
  if (state.me) people.push(state.me);
  for (const other of state.others.values()) people.push(other);
  $("online-count").textContent = String(people.length);
  for (const person of people) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = person.displayName + (person.id === state.me?.id ? "（你）" : "");
    const id = document.createElement("small");
    id.textContent = `@${person.id}`;
    item.append(name, id);
    list.appendChild(item);
  }
}

function buildPalette() {
  const chips = $("room-chips");
  const palette = $("palette");
  chips.replaceChildren();
  palette.replaceChildren();
  for (const zone of state.map?.zones || []) {
    if (zone.id === "hall") continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = zone.name;
    button.addEventListener("click", () => {
      state.focus = {
        x: (zone.x + zone.w / 2) * TILE,
        y: (zone.y + zone.h / 2) * TILE,
      };
    });
    chips.appendChild(button);
  }
  for (const spec of state.specs.values()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = spec.label;
    button.dataset.kind = spec.kind;
    button.addEventListener("click", () => {
      state.armed = state.armed === spec.kind ? null : spec.kind;
      for (const node of palette.querySelectorAll("button")) node.classList.toggle("armed", node.dataset.kind === state.armed);
      setHint(state.armed ? `點地板放置：${spec.label}` : "");
    });
    palette.appendChild(button);
  }
}

function setEditing(on) {
  state.editing = on;
  $("editbar").hidden = !on;
  $("dialogue").hidden = true;
  state.path = [];
  state.armed = null;
  state.selected = null;
  if (on && state.me) state.focus = { x: state.me.x, y: state.me.y };
  if (!on) setHint("");
}

function zoneAt(x, y) {
  if (!state.map) return null;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return (state.map.zones || []).find((zone) => tx >= zone.x && ty >= zone.y && tx < zone.x + zone.w && ty < zone.y + zone.h) || null;
}

function inRestroom() {
  const zone = zoneAt(state.me.x, state.me.y);
  return zone?.id === "men" || zone?.id === "women";
}

function nearKiki() {
  if (!state.map || !state.me) return false;
  return Math.hypot(state.me.x - state.map.kiki.x, state.me.y - state.map.kiki.y) < 112;
}

function isWall(tx, ty) {
  const row = state.map?.walls?.[ty];
  if (!row || tx < 0 || tx >= row.length) return true;
  return row[tx] === "1";
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function sizeOf(item) {
  const spec = state.specs.get(item.kind);
  if (!spec) return { w: 32, h: 24, solid: false };
  const rot = ((item.rot || 0) % 360 + 360) % 360;
  if (rot % 180 !== 0) return { w: spec.h, h: spec.w, solid: spec.solid };
  return { w: spec.w, h: spec.h, solid: spec.solid };
}

function collides(x, y, ignoreId) {
  const radius = 11;
  const minX = Math.floor((x - radius) / TILE);
  const maxX = Math.floor((x + radius) / TILE);
  const minY = Math.floor((y - radius) / TILE);
  const maxY = Math.floor((y + radius) / TILE);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWall(tx, ty) && circleRect(x, y, radius, tx * TILE, ty * TILE, TILE, TILE)) return true;
    }
  }
  for (const prop of state.map?.props || []) {
    if (prop.solid && circleRect(x, y, radius, prop.x, prop.y, prop.w, prop.h)) return true;
  }
  for (const item of state.furniture) {
    if (item.id === ignoreId) continue;
    const size = sizeOf(item);
    if (size.solid && circleRect(x, y, radius, item.x, item.y, size.w, size.h)) return true;
  }
  const kiki = state.map?.kiki;
  if (kiki && Math.hypot(x - kiki.x, y - kiki.y) < radius + 14) return true;
  return false;
}

function tryMove(dx, dy) {
  const beforeX = state.me.x;
  const beforeY = state.me.y;
  state.me.x += dx;
  if (collides(state.me.x, state.me.y)) state.me.x = beforeX;
  state.me.y += dy;
  if (collides(state.me.x, state.me.y)) state.me.y = beforeY;
  if (state.me.x !== beforeX) state.me.dir = state.me.x > beforeX ? 1 : -1;
  const moved = state.me.x !== beforeX || state.me.y !== beforeY;
  if (moved) state.dirty = true;
  return moved;
}

function tileBlocked(tx, ty) {
  if (isWall(tx, ty)) return true;
  const cx = tx * TILE + TILE / 2;
  const cy = ty * TILE + TILE / 2;
  for (const prop of state.map.props) {
    if (prop.solid && cx >= prop.x && cx <= prop.x + prop.w && cy >= prop.y && cy <= prop.y + prop.h) return true;
  }
  for (const item of state.furniture) {
    const size = sizeOf(item);
    if (size.solid && cx >= item.x && cx <= item.x + size.w && cy >= item.y && cy <= item.y + size.h) return true;
  }
  const kiki = state.map.kiki;
  if (Math.hypot(cx - kiki.x, cy - kiki.y) < 20) return true;
  return false;
}

function nearestOpen(tx, ty) {
  if (!tileBlocked(tx, ty)) return [tx, ty];
  for (let ring = 1; ring <= 4; ring++) {
    for (let y = ty - ring; y <= ty + ring; y++) {
      for (let x = tx - ring; x <= tx + ring; x++) {
        if (!tileBlocked(x, y)) return [x, y];
      }
    }
  }
  return null;
}

function findPath(x, y) {
  const start = nearestOpen(Math.floor(state.me.x / TILE), Math.floor(state.me.y / TILE));
  const goal = nearestOpen(Math.floor(x / TILE), Math.floor(y / TILE));
  if (!start || !goal) return [];
  const key = (tx, ty) => `${tx},${ty}`;
  const open = [start];
  const came = new Map();
  const score = new Map([[key(start[0], start[1]), 0]]);
  while (open.length) {
    open.sort((a, b) => (score.get(key(a[0], a[1])) || 0) - (score.get(key(b[0], b[1])) || 0));
    const [tx, ty] = open.shift();
    if (tx === goal[0] && ty === goal[1]) {
      const path = [[tx, ty]];
      let cursor = key(tx, ty);
      while (came.has(cursor)) {
        const prev = came.get(cursor);
        path.push(prev.split(",").map(Number));
        cursor = prev;
      }
      path.reverse();
      return path.slice(1).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (tileBlocked(nx, ny)) continue;
      const next = (score.get(key(tx, ty)) || 0) + 1;
      const id = key(nx, ny);
      if (next < (score.get(id) ?? Infinity)) {
        score.set(id, next);
        came.set(id, key(tx, ty));
        if (!open.some((item) => item[0] === nx && item[1] === ny)) open.push([nx, ny]);
      }
    }
  }
  return [];
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left + state.cam.x, y: clientY - rect.top + state.cam.y };
}

function worldToScreen(x, y) {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + (x - state.cam.x), y: rect.top + (y - state.cam.y) };
}

function interact() {
  if (!state.me || state.editing || state.help || !$("avatar").hidden) return;
  sendMove(true);
  if (nearKiki()) {
    $("dialogue-text").textContent = "你好呀，我是櫃檯 Kiki 小姐。想移動螢幕、鍵盤、椅子或其他設備就跟我說。房間的牆不能改喔。";
    $("dialogue").hidden = false;
    state.path = [];
    return;
  }
  if (inRestroom()) showAvatar("mirror");
}

function hitFurniture(x, y) {
  const items = [...state.furniture].sort((a, b) => a.y + sizeOf(a).h - (b.y + sizeOf(b).h));
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    const size = sizeOf(item);
    if (x >= item.x - 6 && y >= item.y - 6 && x <= item.x + size.w + 6 && y <= item.y + size.h + 6) return item;
  }
  return null;
}

function placeArmed(x, y) {
  const spec = state.specs.get(state.armed);
  if (!spec) return;
  send({ t: "furn", op: "add", kind: state.armed, x: x - spec.w / 2, y: y - spec.h / 2 });
  state.armed = null;
  for (const node of $("palette").querySelectorAll("button")) node.classList.remove("armed");
  setHint("");
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  if (event.target !== canvas) return;
  $("chat-input").blur();
  const world = screenToWorld(event.clientX, event.clientY);
  if (state.editing) {
    const hit = hitFurniture(world.x, world.y);
    if (hit) {
      state.selected = hit.id;
      state.drag = { id: hit.id, item: hit, dx: world.x - hit.x, dy: world.y - hit.y, ox: hit.x, oy: hit.y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (state.armed) {
      placeArmed(world.x, world.y);
      return;
    }
    state.selected = null;
    state.pan = { x: event.clientX, y: event.clientY, fx: state.focus.x, fy: state.focus.y };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const kiki = state.map?.kiki;
  if (kiki && Math.hypot(world.x - kiki.x, world.y - kiki.y) < 34) {
    if (nearKiki()) interact();
    else {
      state.path = findPath(state.map.talk.x, state.map.talk.y);
    }
    return;
  }
  state.path = findPath(world.x, world.y);
}

function onPointerMove(event) {
  if (state.drag?.item) {
    const world = screenToWorld(event.clientX, event.clientY);
    state.drag.item.x = Math.round((world.x - state.drag.dx) / 4) * 4;
    state.drag.item.y = Math.round((world.y - state.drag.dy) / 4) * 4;
  } else if (state.pan && state.focus) {
    state.focus.x = state.pan.fx - (event.clientX - state.pan.x);
    state.focus.y = state.pan.fy - (event.clientY - state.pan.y);
  }
}

function onPointerUp() {
  if (state.drag?.item) {
    const item = state.drag.item;
    if (Math.hypot(item.x - state.drag.ox, item.y - state.drag.oy) > 2) {
      send({ t: "furn", op: "move", id: item.id, x: item.x, y: item.y });
    }
  }
  state.drag = null;
  state.pan = null;
}

function typingTarget(event) {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

let composing = false;
let justEnded = false;
const chat = $("chat-input");
chat.addEventListener("compositionstart", () => {
  composing = true;
  justEnded = false;
});
chat.addEventListener("compositionend", () => {
  composing = false;
  justEnded = true;
  setTimeout(() => { justEnded = false; }, 0);
});
chat.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const keyCode = event.keyCode || event.which || 0;
  if (composing || event.isComposing || keyCode === 229 || justEnded) {
    event.preventDefault();
    event.stopPropagation();
  }
});
$("chatbar").addEventListener("submit", (event) => {
  event.preventDefault();
  if (composing || justEnded) return;
  const text = chat.value.trim();
  if (!text) return;
  send({ t: "chat", text });
  chat.value = "";
});

window.addEventListener("keydown", (event) => {
  if (typingTarget(event)) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  state.keys.add(event.key.toLowerCase());
  if (event.key === "e" || event.key === "E") interact();
  if (!state.editing || !state.selected) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    send({ t: "furn", op: "remove", id: state.selected });
    state.selected = null;
  } else if (event.key === "r" || event.key === "R") {
    send({ t: "furn", op: "rot", id: state.selected });
  }
});
window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);

$("form-password").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("office-password").value.trim();
  const button = event.submitter;
  if (button) button.disabled = true;
  const result = await api("/api/office/login", {
    method: "POST",
    token: "",
    body: { password, deviceKey: deviceKey() },
  });
  if (button) button.disabled = false;
  if (!result.ok && !result.needsRegistration) {
    $("gate-error").textContent = result.error || "密碼不正確";
    return;
  }
  state.password = password;
  if (result.token) {
    localStorage.setItem(SESSION, result.token);
    state.password = "";
    applySession(result);
    return;
  }
  showRegister();
});

$("form-register").addEventListener("submit", async (event) => {
  event.preventDefault();
  const idCheck = checkId($("office-id").value);
  const displayName = $("office-name").value.trim();
  if (!idCheck.ok) { $("gate-error").textContent = idCheck.error; return; }
  if (!displayName) { $("gate-error").textContent = "請輸入顯示名稱"; return; }
  const button = event.submitter;
  if (button) button.disabled = true;
  const result = await api("/api/office/register", {
    method: "POST",
    token: "",
    body: { password: state.password, deviceKey: deviceKey(), id: idCheck.id, displayName },
  });
  if (button) button.disabled = false;
  if (!result.ok) { $("gate-error").textContent = result.error || "沒有登記成功"; return; }
  localStorage.setItem(SESSION, result.token);
  state.password = "";
  applySession(result);
});

$("back-password").addEventListener("click", () => showGate("再輸入一次辦公室密碼。"));
$("btn-later").addEventListener("click", () => { $("dialogue").hidden = true; });
$("btn-edit").addEventListener("click", () => {
  sendMove(true);
  send({ t: "edit", on: true });
});
$("edit-done").addEventListener("click", () => send({ t: "edit", on: false }));
$("help-btn").addEventListener("click", () => { state.help = true; $("help").hidden = false; });
$("help-close").addEventListener("click", () => { state.help = false; $("help").hidden = true; });
$("rename").addEventListener("click", () => {
  $("rename-form").hidden = !$("rename-form").hidden;
  $("rename-input").value = state.me?.displayName || "";
  $("rename-input").focus();
});
$("rename-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const displayName = $("rename-input").value.trim();
  if (!displayName) return;
  send({ t: "profile", displayName });
  $("rename-form").hidden = true;
});
$("avatar-cancel").addEventListener("click", () => { $("avatar").hidden = true; });
$("avatar-save").addEventListener("click", async () => {
  const displayName = $("avatar-name").value.trim() || profileNow()?.displayName;
  const body = { displayName, animal: state.avatarAnimal, accessories: state.avatarAcc };
  if (!displayName) { $("avatar-error").textContent = "請輸入顯示名稱"; return; }
  if (state.avatarMode === "first") {
    const result = await api("/api/office/me", { method: "PUT", body });
    if (!result.ok) { $("avatar-error").textContent = result.error || "沒有儲存"; return; }
    state.profile = result.profile;
    $("avatar").hidden = true;
    startGame();
    return;
  }
  sendMove(true);
  send({ t: "profile", ...body });
});

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

function insets() {
  const edit = $("editbar");
  const top = edit && !edit.hidden ? edit.getBoundingClientRect().height + 8 : 64;
  return { top, bottom: 78 };
}

function update(dt) {
  if (!state.me || state.gate || !$("avatar").hidden || state.help) return;
  const left = state.keys.has("arrowleft") || state.keys.has("a");
  const right = state.keys.has("arrowright") || state.keys.has("d");
  const up = state.keys.has("arrowup") || state.keys.has("w");
  const down = state.keys.has("arrowdown") || state.keys.has("s");
  let vx = (right ? 1 : 0) - (left ? 1 : 0);
  let vy = (down ? 1 : 0) - (up ? 1 : 0);
  if (state.editing && state.focus) {
    if (vx || vy) {
      const length = Math.hypot(vx, vy);
      state.focus.x += (vx / length) * 520 * dt;
      state.focus.y += (vy / length) * 520 * dt;
    }
  } else if (vx || vy) {
    state.path = [];
    const length = Math.hypot(vx, vy);
    tryMove((vx / length) * SPEED * dt, (vy / length) * SPEED * dt);
  } else if (state.path.length) {
    const target = state.path[0];
    const dx = target.x - state.me.x;
    const dy = target.y - state.me.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) state.path.shift();
    else {
      const step = Math.min(dist, SPEED * dt);
      const moved = tryMove((dx / dist) * step, (dy / dist) * step);
      if (!moved) state.path = [];
    }
  }
  if (state.dirty) sendMove(false);
  else if (performance.now() - state.sentAt > 120 && (state.me.x !== state.sentX || state.me.y !== state.sentY)) sendMove(true);
  for (const other of state.others.values()) {
    other.x += ((other.tx ?? other.x) - other.x) * Math.min(1, dt * 8);
    other.y += ((other.ty ?? other.y) - other.y) * Math.min(1, dt * 8);
  }
  const now = performance.now();
  for (const [id, bubble] of state.bubbles) if (bubble.until <= now) state.bubbles.delete(id);
  const zone = zoneAt(state.me.x, state.me.y);
  const name = zone?.name || "辦公室";
  if (name !== state.zoneName) {
    state.zoneName = name;
    $("room-label").textContent = name;
  }
  if (!state.editing && $("dialogue").hidden && $("avatar").hidden) {
    if (nearKiki()) setHint("按 E 跟 Kiki 小姐說話");
    else if (inRestroom()) setHint("按 E 更換動物造型");
    else if (state.hint.startsWith("按 E")) setHint("");
  }
}

function cameraTarget() {
  const focus = state.editing && state.focus ? state.focus : state.me;
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  const pad = insets();
  const worldW = state.map.cols * TILE;
  const worldH = state.map.rows * TILE;
  let x = focus.x - viewW / 2;
  let y = focus.y - (pad.top + (viewH - pad.top - pad.bottom) / 2);
  if (worldW <= viewW) x = (worldW - viewW) / 2;
  else x = Math.max(0, Math.min(worldW - viewW, x));
  if (worldH <= viewH) y = (worldH - viewH) / 2;
  else y = Math.max(0, Math.min(worldH - viewH, y));
  return { x, y };
}

function drawFloor() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  const x0 = Math.max(0, Math.floor(state.cam.x / TILE));
  const y0 = Math.max(0, Math.floor(state.cam.y / TILE));
  const x1 = Math.min(state.map.cols, Math.ceil((state.cam.x + viewW) / TILE));
  const y1 = Math.min(state.map.rows, Math.ceil((state.cam.y + viewH) / TILE));
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const zone = (state.map.zones || []).find((item) => tx >= item.x && ty >= item.y && tx < item.x + item.w && ty < item.y + item.h);
      ctx.fillStyle = zone?.floor || "#f4ecdf";
      const px = tx * TILE - state.cam.x;
      const py = ty * TILE - state.cam.y;
      ctx.fillRect(px, py, TILE, TILE);
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }
}

function drawWalls() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  const x0 = Math.max(0, Math.floor(state.cam.x / TILE) - 1);
  const y0 = Math.max(0, Math.floor(state.cam.y / TILE) - 1);
  const x1 = Math.min(state.map.cols, Math.ceil((state.cam.x + viewW) / TILE) + 1);
  const y1 = Math.min(state.map.rows, Math.ceil((state.cam.y + viewH) / TILE) + 1);
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      if (!isWall(tx, ty)) continue;
      const px = tx * TILE - state.cam.x;
      const py = ty * TILE - state.cam.y;
      ctx.fillStyle = "#b79ad4";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#e6d8f7";
      ctx.fillRect(px, py, TILE, 6);
      ctx.fillStyle = "#967fbf";
      ctx.fillRect(px, py + TILE - 4, TILE, 4);
    }
  }
}

function wrapText(text, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of [...text]) {
    const test = line + char;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = char;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawName(x, y, name, id) {
  ctx.font = `700 13px ${FONT}`;
  const nameWidth = ctx.measureText(name).width;
  ctx.font = `600 10px ${FONT}`;
  const idWidth = ctx.measureText(`@${id}`).width;
  const width = Math.max(nameWidth, idWidth) + 16;
  const top = y - 78;
  ctx.fillStyle = "rgba(255,253,251,0.94)";
  roundBox(x - width / 2, top, width, 30, 8);
  ctx.fillStyle = "#4a3b55";
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(name, x, top + 14);
  ctx.fillStyle = "#a08eae";
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(`@${id}`, x, top + 26);
}

function drawBubble(x, y, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 13px ${FONT}`;
  const lines = wrapText(text, 168);
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16;
  const height = lines.length * 16 + 10;
  const top = y - 86 - height;
  ctx.fillStyle = "#fff";
  roundBox(x - width / 2, top, width, height, 10);
  ctx.fillStyle = "#4a3b55";
  ctx.textAlign = "center";
  lines.forEach((line, index) => ctx.fillText(line, x, top + 16 + index * 16));
  ctx.restore();
}

function roundBox(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function render() {
  const viewW = canvas.clientWidth || 1;
  const viewH = canvas.clientHeight || 1;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#d9c7ee";
  ctx.fillRect(0, 0, viewW, viewH);
  if (!state.map) return;
  drawFloor();
  drawWalls();
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  const props = [...state.map.props].sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const prop of props) if (prop.kind === "rug" || prop.kind === "window") drawProp(ctx, prop);
  for (const prop of props) if (prop.kind !== "rug" && prop.kind !== "window" && prop.kind !== "sign") drawProp(ctx, prop);
  const furniture = [...state.furniture].sort((a, b) => a.y + sizeOf(a).h - (b.y + sizeOf(b).h));
  for (const item of furniture) {
    drawFurniture(ctx, item, state.specs.get(item.kind));
    if (state.editing && item.id === state.selected) {
      const size = sizeOf(item);
      ctx.strokeStyle = "#f08aab";
      ctx.lineWidth = 2;
      ctx.strokeRect(item.x - 3, item.y - 3, size.w + 6, size.h + 6);
    }
  }
  for (const prop of props) if (prop.kind === "sign") drawProp(ctx, prop);
  const actors = [];
  if (state.me) actors.push({ kind: "me", y: state.me.y, person: state.me });
  for (const other of state.others.values()) actors.push({ kind: "other", y: other.y, person: other });
  actors.push({ kind: "kiki", y: state.map.kiki.y });
  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    if (actor.kind === "kiki") drawKiki(ctx, state.map.kiki.x, state.map.kiki.y, state.anim);
    else {
      const person = actor.person;
      const moving = actor.kind === "me"
        ? state.dirty || state.path.length > 0
        : Math.hypot((person.tx ?? person.x) - person.x, (person.ty ?? person.y) - person.y) > 1;
      drawAnimal(ctx, person.animal || "cat", person.accessories, person.x, person.y, {
        dir: person.dir || 1,
        frame: state.anim,
        moving,
      });
    }
  }
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,253,251,0.94)";
  roundBox(state.map.kiki.x - 42, state.map.kiki.y - 78, 84, 30, 8);
  ctx.fillStyle = "#4a3b55";
  ctx.fillText("Kiki 小姐", state.map.kiki.x, state.map.kiki.y - 64);
  ctx.fillStyle = "#a08eae";
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText("櫃檯", state.map.kiki.x, state.map.kiki.y - 52);
  const named = [];
  if (state.me) named.push(state.me);
  for (const other of state.others.values()) named.push(other);
  for (const person of named) {
    drawName(person.x, person.y, person.displayName, person.id);
    const bubble = state.bubbles.get(person.id);
    if (!bubble) continue;
    const life = bubble.until - performance.now();
    drawBubble(person.x, person.y, bubble.text, life < 700 ? Math.max(0, life / 700) : 1);
  }
  for (const zone of state.map.zones) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#5c4a68";
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(zone.name, (zone.x + zone.w / 2) * TILE, (zone.y + 1.2) * TILE);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;
  state.anim += dt * 6;
  if (state.map && state.me && !state.gate) {
    const target = cameraTarget();
    state.cam.x += (target.x - state.cam.x) * Math.min(1, dt * 8);
    state.cam.y += (target.y - state.cam.y) * Math.min(1, dt * 8);
    update(dt);
  }
  render();
  if (!$("avatar").hidden) paintPreview();
  requestAnimationFrame(frame);
}

function ensureLoop() {
  if (state.loop) return;
  state.loop = true;
  resize();
  requestAnimationFrame(frame);
}

window.office = {
  get ready() { return Boolean(state.connected && state.me && state.map); },
  get me() { return state.me ? { ...state.me } : null; },
  get others() {
    return [...state.others.values()].map((other) => ({ ...other }));
  },
  get furniture() { return state.furniture.map((item) => ({ ...item })); },
  get bubbles() { return [...state.bubbles.entries()].map(([id, bubble]) => ({ id, text: bubble.text })); },
  get zone() { return state.zoneName; },
  get editing() { return state.editing; },
  get connected() { return state.connected; },
  get socket() { return state.socket; },
  worldToScreen,
  screenToWorld,
};

async function boot() {
  try { await document.fonts.load(`16px ${FONT}`); } catch { /* ignore */ }
  drawGateArt();
  ensureLoop();
  const token = localStorage.getItem(SESSION);
  if (token) {
    const me = await api("/api/office/me");
    if (me.ok) { applySession(me); return; }
    localStorage.removeItem(SESSION);
    showGate("登入已失效，請重新輸入辦公室密碼。");
    return;
  }
  const status = await api("/api/office/status", { token: "" });
  if (status.ok && status.hasPassword === false) {
    showGate("管理員還沒設定辦公室密碼。請先到管理頁設定。");
    $("form-password").hidden = true;
    return;
  }
  showGate("輸入管理員給大家的辦公室密碼。這台裝置會記住你。");
}

setInterval(() => {
  if (state.socket?.readyState === 1) state.socket.send("ping");
}, 20000);

boot();
