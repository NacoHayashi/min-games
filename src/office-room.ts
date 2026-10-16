import {
  buildOffice,
  catalog,
  checkId,
  checkPassword,
  defaultAccessories,
  furnitureFits,
  furnitureSize,
  isAnimal,
  isRestroom,
  normalizeAccessories,
  normalizeChat,
  normalizeName,
  palette,
  publicMap,
  TILE,
  type Accessories,
  type Furn,
  type OfficeMap,
} from "./content";

export interface Env {
  OFFICE: DurableObjectNamespace;
  ASSETS: Fetcher;
  ADMIN_TOKEN?: string;
}

type MemberRow = {
  id: string;
  device_key: string;
  display_name: string;
  animal: string | null;
  accessories: string;
  session_token: string | null;
  session_epoch: number;
  pos_x: number;
  pos_y: number;
  pos_dir: number;
  created_at: number;
};

type Att = {
  id: string;
  name: string;
  animal: string;
  accessories: Accessories;
  x: number;
  y: number;
  dir: number;
  editing: boolean;
  lastMove: number;
  lastChat: number;
  lastPersist: number;
};

type ByeReason = "removed" | "kicked" | "password" | "replaced";

const OFFICE = buildOffice();
const MAX_MEMBERS = 40;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return hex(buffer);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function tokenEqual(input: string, expected: string): Promise<boolean> {
  if (!input || !expected) return false;
  const [left, right] = await Promise.all([sha256(input), sha256(expected)]);
  return safeEqual(left, right);
}

export function bearer(request: Request): string {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 8000) return null;
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAccessories(raw: string | null): Accessories {
  if (!raw) return defaultAccessories();
  try {
    return normalizeAccessories(JSON.parse(raw)) ?? defaultAccessories();
  } catch {
    return defaultAccessories();
  }
}

export class OfficeRoom implements DurableObject {
  private readonly map: OfficeMap = OFFICE;

  constructor(
    private readonly ctx: DurableObjectState,
    env: Env,
  ) {
    void env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/office/status" && request.method === "GET") return this.status();
      if (path === "/api/office/login" && request.method === "POST") return await this.login(request);
      if (path === "/api/office/register" && request.method === "POST") return await this.register(request);
      if (path === "/api/office/me" && request.method === "GET") return this.me(request);
      if (path === "/api/office/me" && request.method === "PUT") return await this.updateMe(request);
      if (path === "/api/office/ws" && request.method === "GET") return this.upgrade(request, url);
      if (path.startsWith("/api/office/admin/")) return await this.admin(request, path);
      return json({ error: "找不到" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "辦公室暫時沒有回應" }, 500);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message === "ping") return;
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(message) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      body = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Att | null;
    if (!att) {
      try {
        ws.close(4001, "missing");
      } catch {
        /* ignore */
      }
      return;
    }
    const kind = body.t;
    if (kind === "move") this.onMove(ws, att, body);
    else if (kind === "chat") this.onChat(ws, att, body);
    else if (kind === "profile") this.onProfile(ws, att, body);
    else if (kind === "edit") this.onEdit(ws, att, body);
    else if (kind === "furn") this.onFurniture(ws, att, body);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Att | null;
    if (!att) return;
    const still = this.ctx.getWebSockets(att.id).some((other) => other !== ws);
    if (still) return;
    this.persist(att);
    this.broadcast({ t: "leave", id: att.id });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      /* ignore */
    }
  }

  private ensureSchema() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      device_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      animal TEXT,
      accessories TEXT NOT NULL DEFAULT '{}',
      session_token TEXT,
      session_epoch INTEGER NOT NULL DEFAULT 0,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_dir INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_token)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS furniture (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      rot INTEGER NOT NULL DEFAULT 0
    )`);
    const seeded = this.meta("seeded");
    if (seeded === "1") return;
    this.ctx.storage.transactionSync(() => {
      for (const item of this.map.furniture) {
        this.sql.exec(
          `INSERT INTO furniture (id, kind, x, y, rot) VALUES (?, ?, ?, ?, ?)`,
          item.id,
          item.kind,
          item.x,
          item.y,
          item.rot,
        );
      }
      this.setMeta("seeded", "1");
      if (!this.meta("epoch")) this.setMeta("epoch", "1");
    });
  }

  private meta(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows[0]?.value ?? null;
  }

  private setMeta(key: string, value: string) {
    this.sql.exec(`DELETE FROM meta WHERE key = ?`, key);
    this.sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?)`, key, value);
  }

  private epoch(): number {
    return Number(this.meta("epoch") || "1");
  }

  private hasPassword(): boolean {
    return Boolean(this.meta("pw_hash") && this.meta("pw_salt"));
  }

  private async passwordOk(password: string): Promise<boolean> {
    const salt = this.meta("pw_salt");
    const hash = this.meta("pw_hash");
    if (!salt || !hash) return false;
    const digest = await sha256(`${salt}:${password}`);
    return safeEqual(digest, hash);
  }

  private status(): Response {
    return json({ hasPassword: this.hasPassword() });
  }

  private async login(request: Request): Promise<Response> {
    if (!this.hasPassword()) return json({ error: "管理員還沒設定辦公室密碼" }, 503);
    const body = await readJson(request);
    if (!body) return json({ error: "格式不對" }, 400);
    const password = checkPassword(body.password);
    if (!password.ok) return json({ error: "密碼不正確" }, 401);
    if (!(await this.passwordOk(password.password))) return json({ error: "密碼不正確" }, 401);
    const deviceKey = typeof body.deviceKey === "string" ? body.deviceKey : "";
    if (deviceKey.length < 16 || deviceKey.length > 128) {
      return json({ ok: true, needsRegistration: true, catalog: catalog() });
    }
    const found = this.memberByDevice(deviceKey);
    if (!found) return json({ ok: true, needsRegistration: true, catalog: catalog() });
    const token = this.issueSession(found.id);
    const fresh = this.memberById(found.id);
    return json({ token, profile: fresh ? this.profile(fresh) : this.profile(found), catalog: catalog() });
  }

  private async register(request: Request): Promise<Response> {
    if (!this.hasPassword()) return json({ error: "管理員還沒設定辦公室密碼" }, 503);
    const body = await readJson(request);
    if (!body) return json({ error: "格式不對" }, 400);
    const password = checkPassword(body.password);
    if (!password.ok) return json({ error: "密碼不正確" }, 401);
    if (!(await this.passwordOk(password.password))) return json({ error: "密碼不正確" }, 401);
    const deviceKey = typeof body.deviceKey === "string" ? body.deviceKey.trim() : "";
    if (!/^[a-f0-9]{32,128}$/i.test(deviceKey)) return json({ error: "裝置驗證失敗，請重新整理" }, 400);
    if (this.memberByDevice(deviceKey)) return json({ error: "這台裝置已經登記過了" }, 409);
    const id = checkId(body.id);
    if (!id.ok) return json({ error: id.error }, 400);
    const displayName = normalizeName(body.displayName);
    if (!displayName) return json({ error: "請輸入顯示名稱" }, 400);
    if (this.memberById(id.id)) return json({ error: "這個 ID 已經有人使用" }, 409);
    const count = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM members`).one();
    if (Number(count?.n ?? 0) >= MAX_MEMBERS) return json({ error: "辦公室人數已滿" }, 400);
    const spot = this.spawnFor(id.id);
    const now = Date.now();
    const token = randomToken(32);
    const epoch = this.epoch();
    this.sql.exec(
      `INSERT INTO members
        (id, device_key, display_name, animal, accessories, session_token, session_epoch, pos_x, pos_y, pos_dir, created_at)
       VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, 1, ?)`,
      id.id,
      deviceKey.toLowerCase(),
      displayName,
      token,
      epoch,
      spot.x,
      spot.y,
      now,
    );
    const member = this.memberById(id.id);
    if (!member) return json({ error: "登記失敗" }, 500);
    return json({ token, profile: this.profile(member), catalog: catalog() });
  }

  private me(request: Request): Response {
    const member = this.memberByToken(bearer(request));
    if (!member) return json({ error: "登入已失效" }, 401);
    return json({ profile: this.profile(member), catalog: catalog() });
  }

  private async updateMe(request: Request): Promise<Response> {
    const member = this.memberByToken(bearer(request));
    if (!member) return json({ error: "登入已失效" }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "格式不對" }, 400);
    if (body.displayName !== undefined) {
      const name = normalizeName(body.displayName);
      if (!name) return json({ error: "顯示名稱不可空白" }, 400);
      this.sql.exec(`UPDATE members SET display_name = ? WHERE id = ?`, name, member.id);
    }
    if (body.animal !== undefined || body.accessories !== undefined) {
      if (member.animal) return json({ error: "請到男廁或女廁更換造型" }, 403);
      const animal = body.animal;
      if (!isAnimal(animal)) return json({ error: "請選擇一種動物" }, 400);
      const accessories = normalizeAccessories(body.accessories, defaultAccessories());
      if (!accessories) return json({ error: "配件不正確" }, 400);
      this.sql.exec(
        `UPDATE members SET animal = ?, accessories = ? WHERE id = ?`,
        animal,
        JSON.stringify(accessories),
        member.id,
      );
    }
    const fresh = this.memberById(member.id);
    return json({ profile: fresh ? this.profile(fresh) : this.profile(member), catalog: catalog() });
  }

  private upgrade(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "需要 WebSocket" }, 426);
    }
    const member = this.memberByToken(url.searchParams.get("token") || "");
    if (!member) return json({ error: "登入已失效" }, 401);
    if (!member.animal) return json({ error: "請先選擇動物造型" }, 403);
    for (const old of this.ctx.getWebSockets(member.id)) this.goodbye(old, "replaced");
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const accessories = readAccessories(member.accessories);
    const att: Att = {
      id: member.id,
      name: member.display_name,
      animal: member.animal,
      accessories,
      x: member.pos_x,
      y: member.pos_y,
      dir: member.pos_dir === -1 ? -1 : 1,
      editing: false,
      lastMove: 0,
      lastChat: 0,
      lastPersist: Date.now(),
    };
    this.ctx.acceptWebSocket(server, [member.id]);
    server.serializeAttachment(att);
    const others = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === server) continue;
      const other = ws.deserializeAttachment() as Att | null;
      if (!other || other.id === member.id) continue;
      others.push(this.player(other));
    }
    this.send(server, {
      t: "welcome",
      you: this.player(att),
      others,
      furniture: this.furniture(),
      map: publicMap(this.map),
      palette: palette(),
      catalog: catalog(),
    });
    this.broadcast({ t: "join", player: this.player(att) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async admin(request: Request, path: string): Promise<Response> {
    // Worker secrets are not visible on this Durable Object. The top-level
    // Worker checks ADMIN_TOKEN and only then sets this header.
    if (request.headers.get("x-office-admin") !== "1") {
      return json({ error: "未授權" }, 401);
    }
    if (path === "/api/office/admin/overview" && request.method === "GET") return json(this.overview());
    if (path === "/api/office/admin/password" && request.method === "POST") return await this.setPassword(request);
    if (path === "/api/office/admin/kick" && request.method === "POST") return await this.kick(request);
    const remove = path.match(/^\/api\/office\/admin\/members\/([a-z0-9_-]+)$/);
    if (remove && request.method === "DELETE") return this.remove(remove[1]);
    return json({ error: "找不到" }, 404);
  }

  private overview() {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att?.id) online.add(att.id);
    }
    const rows = this.sql
      .exec<MemberRow>(`SELECT id, display_name, animal FROM members ORDER BY id`)
      .toArray();
    const members = rows
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        animal: row.animal,
        online: online.has(row.id),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.id.localeCompare(b.id));
    return { hasPassword: this.hasPassword(), members };
  }

  private async setPassword(request: Request): Promise<Response> {
    const body = await readJson(request);
    if (!body) return json({ error: "格式不對" }, 400);
    const password = checkPassword(body.password);
    if (!password.ok) return json({ error: password.error }, 400);
    const salt = randomToken(16);
    const hash = await sha256(`${salt}:${password.password}`);
    const next = this.epoch() + 1;
    this.ctx.storage.transactionSync(() => {
      this.setMeta("pw_salt", salt);
      this.setMeta("pw_hash", hash);
      this.setMeta("epoch", String(next));
      this.sql.exec(`UPDATE members SET session_token = NULL, session_epoch = 0`);
    });
    for (const ws of this.ctx.getWebSockets()) this.goodbye(ws, "password");
    return json({ ok: true, hasPassword: true });
  }

  private async kick(request: Request): Promise<Response> {
    const body = await readJson(request);
    if (!body) return json({ error: "格式不對" }, 400);
    const id = checkId(body.id);
    if (!id.ok) return json({ error: "找不到這個 ID" }, 404);
    if (!this.memberById(id.id)) return json({ error: "找不到這個 ID" }, 404);
    this.sql.exec(`UPDATE members SET session_token = NULL WHERE id = ?`, id.id);
    for (const ws of this.ctx.getWebSockets(id.id)) this.goodbye(ws, "kicked");
    return json({ ok: true });
  }

  private remove(id: string): Response {
    const checked = checkId(id);
    if (!checked.ok || !this.memberById(checked.id)) return json({ error: "找不到這個 ID" }, 404);
    this.sql.exec(`DELETE FROM members WHERE id = ?`, checked.id);
    for (const ws of this.ctx.getWebSockets(checked.id)) this.goodbye(ws, "removed");
    return json({ ok: true });
  }

  private onMove(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    const x = body.x;
    const y = body.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now();
    if (att.lastMove && now - att.lastMove < 30) return;
    const dir = body.dir === -1 ? -1 : 1;
    const dt = Math.min(2, Math.max(0.04, att.lastMove ? (now - att.lastMove) / 1000 : 0.04));
    if (Math.hypot(x - att.x, y - att.y) > 340 * dt + 28) return;
    if (this.inWall(x, y)) return;
    att.x = x;
    att.y = y;
    att.dir = dir;
    att.lastMove = now;
    if (att.editing && Math.hypot(att.x - this.map.kiki.x, att.y - this.map.kiki.y) > 220) {
      att.editing = false;
      this.send(ws, { t: "edit", on: false });
    }
    ws.serializeAttachment(att);
    this.broadcast({ t: "move", id: att.id, x, y, dir }, ws);
    if (now - att.lastPersist > 4000) {
      this.persist(att);
      att.lastPersist = now;
      ws.serializeAttachment(att);
    }
  }

  private onChat(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    const text = normalizeChat(body.text);
    if (!text) return;
    const now = Date.now();
    if (now - att.lastChat < 350) {
      this.send(ws, { t: "error", message: "說得太快了，稍等一下" });
      return;
    }
    att.lastChat = now;
    ws.serializeAttachment(att);
    this.broadcast({ t: "chat", id: att.id, text, at: now });
  }

  private onProfile(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    let name = att.name;
    if (body.displayName !== undefined) {
      const next = normalizeName(body.displayName);
      if (!next) {
        this.send(ws, { t: "error", message: "顯示名稱不可空白" });
        return;
      }
      name = next;
    }
    let animal = att.animal;
    let accessories = att.accessories;
    if (body.animal !== undefined || body.accessories !== undefined) {
      if (!isRestroom(att.x, att.y, this.map.zones)) {
        this.send(ws, { t: "error", message: "請到男廁或女廁更換造型" });
        return;
      }
      if (body.animal !== undefined) {
        if (!isAnimal(body.animal)) {
          this.send(ws, { t: "error", message: "請選擇一種動物" });
          return;
        }
        animal = body.animal;
      }
      if (body.accessories !== undefined) {
        const next = normalizeAccessories(body.accessories, accessories);
        if (!next) {
          this.send(ws, { t: "error", message: "配件不正確" });
          return;
        }
        accessories = next;
      }
    }
    this.sql.exec(
      `UPDATE members SET display_name = ?, animal = ?, accessories = ? WHERE id = ?`,
      name,
      animal,
      JSON.stringify(accessories),
      att.id,
    );
    att.name = name;
    att.animal = animal;
    att.accessories = accessories;
    ws.serializeAttachment(att);
    this.broadcast({
      t: "profile",
      id: att.id,
      displayName: name,
      animal,
      accessories,
    });
  }

  private onEdit(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    const on = Boolean(body.on);
    if (on) {
      const dist = Math.hypot(att.x - this.map.kiki.x, att.y - this.map.kiki.y);
      if (dist > 120) {
        this.send(ws, { t: "error", message: "要先靠近 Kiki 小姐才能調整設備" });
        return;
      }
    }
    att.editing = on;
    ws.serializeAttachment(att);
    this.send(ws, { t: "edit", on });
  }

  private onFurniture(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    if (!att.editing) {
      this.send(ws, { t: "error", message: "請先跟 Kiki 小姐說話", furniture: this.furniture() });
      return;
    }
    const op = body.op;
    if (op === "move" || op === "rot") {
      const id = typeof body.id === "string" ? body.id : "";
      const rows = this.sql.exec<Furn>(`SELECT id, kind, x, y, rot FROM furniture WHERE id = ?`, id).toArray();
      const item = rows[0];
      if (!item) {
        this.send(ws, { t: "error", message: "找不到這個設備", furniture: this.furniture() });
        return;
      }
      let x = Number(item.x);
      let y = Number(item.y);
      let rot = Number(item.rot) || 0;
      if (op === "move") {
        if (typeof body.x !== "number" || typeof body.y !== "number") return;
        x = Math.round(body.x / 4) * 4;
        y = Math.round(body.y / 4) * 4;
      } else {
        const size = furnitureSize(String(item.kind), rot);
        const next = (rot + 90) % 360;
        const swapped = furnitureSize(String(item.kind), next);
        if (!size || !swapped) return;
        const cx = x + size.w / 2;
        const cy = y + size.h / 2;
        x = Math.round((cx - swapped.w / 2) / 4) * 4;
        y = Math.round((cy - swapped.h / 2) / 4) * 4;
        rot = next;
      }
      if (!furnitureFits(this.map.walls, String(item.kind), x, y, rot)) {
        this.send(ws, { t: "error", message: "那裡是牆壁，放不進去", furniture: this.furniture() });
        return;
      }
      this.sql.exec(`UPDATE furniture SET x = ?, y = ?, rot = ? WHERE id = ?`, x, y, rot, id);
    } else if (op === "add") {
      const kind = typeof body.kind === "string" ? body.kind : "";
      if (!furnitureSize(kind, 0)) {
        this.send(ws, { t: "error", message: "沒有這個設備", furniture: this.furniture() });
        return;
      }
      if (typeof body.x !== "number" || typeof body.y !== "number") return;
      const x = Math.round(body.x / 4) * 4;
      const y = Math.round(body.y / 4) * 4;
      if (!furnitureFits(this.map.walls, kind, x, y, 0)) {
        this.send(ws, { t: "error", message: "那裡是牆壁，放不進去", furniture: this.furniture() });
        return;
      }
      const count = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM furniture`).one();
      if (Number(count?.n ?? 0) >= 120) {
        this.send(ws, { t: "error", message: "設備太多了", furniture: this.furniture() });
        return;
      }
      const id = `item-${randomToken(6)}`;
      this.sql.exec(`INSERT INTO furniture (id, kind, x, y, rot) VALUES (?, ?, ?, ?, 0)`, id, kind, x, y);
    } else if (op === "remove") {
      const id = typeof body.id === "string" ? body.id : "";
      this.sql.exec(`DELETE FROM furniture WHERE id = ?`, id);
    } else {
      return;
    }
    this.broadcast({ t: "furniture", furniture: this.furniture() });
  }

  private persist(att: Att) {
    this.sql.exec(`UPDATE members SET pos_x = ?, pos_y = ?, pos_dir = ? WHERE id = ?`, att.x, att.y, att.dir, att.id);
  }

  private inWall(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.cols || ty >= this.map.rows) return true;
    return this.map.walls[ty][tx] === "1";
  }

  private spawnFor(id: string): { x: number; y: number } {
    let hash = 0;
    for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    return {
      x: this.map.spawn.x + (hash % 5) * 16 - 32,
      y: this.map.spawn.y + ((hash >> 3) % 3) * 12 - 12,
    };
  }

  private issueSession(id: string): string {
    const token = randomToken(32);
    this.sql.exec(
      `UPDATE members SET session_token = ?, session_epoch = ? WHERE id = ?`,
      token,
      this.epoch(),
      id,
    );
    return token;
  }

  private memberByToken(token: string): MemberRow | null {
    if (!token) return null;
    const rows = this.sql
      .exec<MemberRow>(
        `SELECT * FROM members WHERE session_token = ? AND session_epoch = ?`,
        token,
        this.epoch(),
      )
      .toArray();
    return rows[0] ?? null;
  }

  private memberByDevice(deviceKey: string): MemberRow | null {
    const rows = this.sql
      .exec<MemberRow>(`SELECT * FROM members WHERE device_key = ?`, deviceKey.toLowerCase())
      .toArray();
    return rows[0] ?? null;
  }

  private memberById(id: string): MemberRow | null {
    const rows = this.sql.exec<MemberRow>(`SELECT * FROM members WHERE id = ?`, id).toArray();
    return rows[0] ?? null;
  }

  private profile(member: MemberRow) {
    return {
      id: member.id,
      displayName: member.display_name,
      animal: member.animal,
      accessories: readAccessories(member.accessories),
    };
  }

  private player(att: Att) {
    return {
      id: att.id,
      displayName: att.name,
      animal: att.animal,
      accessories: att.accessories,
      x: att.x,
      y: att.y,
      dir: att.dir,
    };
  }

  private furniture(): Furn[] {
    return this.sql.exec<Furn>(`SELECT id, kind, x, y, rot FROM furniture`).toArray().map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      x: Number(row.x),
      y: Number(row.y),
      rot: Number(row.rot) || 0,
    }));
  }

  private goodbye(ws: WebSocket, reason: ByeReason) {
    const code = { removed: 4001, kicked: 4002, password: 4003, replaced: 4000 }[reason];
    try {
      ws.send(JSON.stringify({ t: "bye", reason }));
    } catch {
      /* ignore */
    }
    try {
      ws.close(code, reason);
    } catch {
      /* ignore */
    }
  }

  private broadcast(data: unknown, except?: WebSocket) {
    const text = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        /* ignore */
      }
    }
  }

  private send(ws: WebSocket, data: unknown) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}
