import {
  buildOffice,
  catalog,
  checkId,
  checkPassword,
  avatarAnimal,
  bodyRadiusOf,
  furnitureFits,
  furnitureSize,
  isRestroom,
  normalizeChat,
  normalizeLook,
  normalizeName,
  palette,
  presetLook,
  publicMap,
  readStoredLook,
  TILE,
  type Furn,
  type Look,
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
  look: Look;
  x: number;
  y: number;
  dir: number;
  editing: boolean;
  seat: string | null;
  whisper: string | null;
  lastMove: number;
  lastChat: number;
  lastPersist: number;
};

type ChairLive = {
  id: string;
  x: number;
  y: number;
  rot: number;
  vx: number;
  vy: number;
  occupant: string | null;
  lastNet: number;
  lastSave: number;
};

type ByeReason = "removed" | "kicked" | "password" | "replaced";

const OFFICE = buildOffice();
const MAX_MEMBERS = 40;
const WHISPER_NEAR = 112;
const WHISPER_FAR = 176;
const WHISPER_CAP = 6;
const WHISPER_ASK_MS = 12000;

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

function incomingLook(body: Record<string, unknown>, animal: string | null): Look | null {
  if (body.look !== undefined) return normalizeLook(body.look);
  if (typeof body.animal === "string") {
    const preset = presetLook(body.animal);
    if (!preset) return null;
    return preset;
  }
  if (animal) return readStoredLook(animal, null);
  return null;
}

const SCORE_GAMES: Record<string, { title: string; unit: string; mode: "max" | "inc"; max: number }> = {
  cat2048: { title: "2048 貓咪進化", unit: "分", mode: "max", max: 2_000_000 },
  match3: { title: "皇家消消樂", unit: "關", mode: "max", max: 10 },
  zip: { title: "Zip", unit: "題", mode: "inc", max: 100_000 },
  queens: { title: "Queens 貓掌版", unit: "題", mode: "inc", max: 100_000 },
  sudoku: { title: "Mini Sudoku", unit: "題", mode: "inc", max: 100_000 },
  patches: { title: "Patches 拼布", unit: "題", mode: "inc", max: 100_000 },
  bbq: { title: "燒肉屋", unit: "元", mode: "max", max: 100_000_000 },
};

export class OfficeRoom implements DurableObject {
  private readonly map: OfficeMap = OFFICE;
  private readonly scoreHits = new Map<string, number[]>();
  private readonly chairs = new Map<string, ChairLive>();
  private readonly bumpAt = new Map<string, number>();
  private readonly whisperAsks = new Map<string, { group: string; until: number }>();
  private whisperSeq = 1;
  private chairsReady = false;

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
      if (path === "/api/office/score" && request.method === "POST") return await this.submitScore(request);
      if (path === "/api/office/leaderboard" && request.method === "GET") return this.leaderboard(request);
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
    else if (kind === "hush") this.onHush(ws, att, body);
    else if (kind === "profile") this.onProfile(ws, att, body);
    else if (kind === "edit") this.onEdit(ws, att, body);
    else if (kind === "furn") this.onFurniture(ws, att, body);
    else if (kind === "bump") this.onBump(ws, att, body);
    else if (kind === "sit") this.onSit(ws, att, body);
    else if (kind === "rise") this.onRise(ws, att);
    else if (kind === "glide") this.onGlide(ws, att, body);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Att | null;
    if (!att) return;
    const still = this.ctx.getWebSockets(att.id).some((other) => other !== ws);
    if (still) return;
    this.releaseSeat(att.id);
    this.dropWhisper(att, ws);
    this.persist(att);
    this.broadcast({ t: "leave", id: att.id });
    if (this.ctx.getWebSockets().every((socket) => socket === ws)) this.resetChairs(true);
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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      member_id TEXT NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (member_id, game)
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
    if (body.animal !== undefined || body.look !== undefined) {
      if (member.animal) return json({ error: "請到男廁或女廁更換造型" }, 403);
      const look = incomingLook(body, null);
      if (!look) return json({ error: "造型不正確" }, 400);
      const animal = avatarAnimal(body.animal, look);
      this.sql.exec(
        `UPDATE members SET animal = ?, accessories = ? WHERE id = ?`,
        animal,
        JSON.stringify(look),
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
    if (!member.animal) return json({ error: "請先選擇造型" }, 403);
    for (const old of this.ctx.getWebSockets(member.id)) this.goodbye(old, "replaced");
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const look = readStoredLook(member.animal, member.accessories);
    if (!look) return json({ error: "請先選擇造型" }, 403);
    const spot = this.separateFrom(member.id, member.pos_x, member.pos_y, look);
    if (spot.x !== member.pos_x || spot.y !== member.pos_y) {
      this.sql.exec(`UPDATE members SET pos_x = ?, pos_y = ? WHERE id = ?`, spot.x, spot.y, member.id);
    }
    const att: Att = {
      id: member.id,
      name: member.display_name,
      animal: member.animal,
      look,
      x: spot.x,
      y: spot.y,
      dir: member.pos_dir === -1 ? -1 : 1,
      editing: false,
      seat: null,
      whisper: null,
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
      hush: this.activeHush(),
    });
    this.broadcast({ t: "join", player: this.player(att) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private scoreOf(memberId: string, game: string): number {
    const rows = this.sql
      .exec<{ score: number }>(`SELECT score FROM scores WHERE member_id = ? AND game = ?`, memberId, game)
      .toArray();
    return rows[0] ? Number(rows[0].score) : 0;
  }

  private allowScore(memberId: string, game: string, limit: number, windowMs: number): boolean {
    const key = `${memberId}:${game}`;
    const now = Date.now();
    const hits = (this.scoreHits.get(key) || []).filter((at) => now - at < windowMs);
    if (hits.length >= limit) {
      this.scoreHits.set(key, hits);
      return false;
    }
    hits.push(now);
    this.scoreHits.set(key, hits);
    return true;
  }

  private writeScore(memberId: string, game: string, score: number) {
    this.sql.exec(`DELETE FROM scores WHERE member_id = ? AND game = ?`, memberId, game);
    this.sql.exec(
      `INSERT INTO scores (member_id, game, score, updated_at) VALUES (?, ?, ?, ?)`,
      memberId,
      game,
      score,
      Date.now(),
    );
  }

  private async submitScore(request: Request): Promise<Response> {
    const body = await readJson(request);
    const member = this.memberByToken(bearer(request));
    if (!member) return json({ error: "請先進入辦公室" }, 401);
    if (!body) return json({ error: "格式不對" }, 400);
    const game = typeof body.game === "string" ? body.game : "";
    const spec = SCORE_GAMES[game];
    if (!spec) return json({ error: "沒有這個遊戲" }, 400);
    const current = this.scoreOf(member.id, game);
    if (spec.mode === "inc") {
      if (body.op !== "solve") return json({ error: "分數不對" }, 400);
      if (current >= spec.max) return json({ error: "分數不對" }, 400);
      if (!this.allowScore(member.id, game, 1, 800)) return json({ error: "太快了，稍等一下" }, 429);
      const next = current + 1;
      this.writeScore(member.id, game, next);
      this.broadcast({ t: "score", game });
      return json({ ok: true, game, score: next });
    }
    const raw = body.score;
    const score = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : NaN;
    if (!Number.isInteger(score) || Math.abs((raw as number) - score) > 1e-6 || score < 0 || score > spec.max) {
      return json({ error: "分數不對" }, 400);
    }
    if (score <= current) return json({ ok: true, game, score: current });
    if (!this.allowScore(member.id, game, 8, 5000)) return json({ error: "太快了，稍等一下" }, 429);
    this.writeScore(member.id, game, score);
    this.broadcast({ t: "score", game });
    return json({ ok: true, game, score });
  }

  private leaderboard(request: Request): Response {
    const member = this.memberByToken(bearer(request));
    if (!member) return json({ error: "請先進入辦公室" }, 401);
    const games = Object.entries(SCORE_GAMES).map(([id, spec]) => {
      const rows = this.sql
        .exec<{ member_id: string; display_name: string; score: number }>(
          `SELECT s.member_id, m.display_name, s.score
           FROM scores s JOIN members m ON m.id = s.member_id
           WHERE s.game = ?
           ORDER BY s.score DESC, s.updated_at ASC, s.member_id ASC`,
          id,
        )
        .toArray();
      const ranked = rows.map((row, index) => ({
        rank: index + 1,
        id: row.member_id,
        displayName: row.display_name,
        score: Number(row.score),
      }));
      const mine = ranked.find((row) => row.id === member.id) || null;
      return {
        id,
        title: spec.title,
        unit: spec.unit,
        top: ranked.slice(0, 10),
        me: mine ? { rank: mine.rank, score: mine.score } : null,
      };
    });
    return json({ games });
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
    this.sql.exec(`DELETE FROM scores WHERE member_id = ?`, checked.id);
    for (const ws of this.ctx.getWebSockets(checked.id)) this.goodbye(ws, "removed");
    return json({ ok: true });
  }

  private onMove(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    if (att.seat) return;
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
    this.keepWhisper(ws, att);
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
    if (att.whisper || body.whisper === true) {
      const members = att.whisper ? this.membersOf(att.whisper).filter((member) => member.att.id !== att.id) : [];
      const close = members.some((member) => Math.hypot(att.x - member.att.x, att.y - member.att.y) <= WHISPER_FAR);
      if (!att.whisper || !members.length || !close) {
        if (att.whisper) this.leaveWhisper(att, ws);
        this.send(ws, { t: "error", message: "悄悄話已經結束了" });
        return;
      }
      const payload = { t: "chat", id: att.id, text, whisper: true, at: now };
      this.send(ws, payload);
      for (const member of members) this.send(member.ws, payload);
      return;
    }
    this.broadcast({ t: "chat", id: att.id, text, at: now });
  }

  private onHush(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    if (body.off) {
      this.leaveWhisper(att, ws);
      return;
    }
    if (typeof body.ask === "string") {
      this.acceptWhisper(ws, att, body.ask);
      return;
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || id === att.id) return;
    if (att.whisper) {
      this.send(ws, { t: "error", message: "先離開現在的悄悄話" });
      return;
    }
    const other = this.socketOf(id);
    if (!other) {
      this.send(ws, { t: "error", message: "對方不在辦公室" });
      return;
    }
    if (Math.hypot(att.x - other.att.x, att.y - other.att.y) > WHISPER_NEAR) {
      this.send(ws, { t: "error", message: "再靠近一點才能說悄悄話" });
      return;
    }
    if (other.att.whisper) {
      this.requestWhisper(ws, att, other.att.whisper);
      return;
    }
    const group = `g${this.whisperSeq++}`;
    att.whisper = group;
    other.att.whisper = group;
    ws.serializeAttachment(att);
    other.ws.serializeAttachment(other.att);
    this.broadcast({ t: "hush", group, members: [att.id, other.att.id], by: att.id });
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
    let look = att.look;
    if (body.animal !== undefined || body.look !== undefined) {
      if (!isRestroom(att.x, att.y, this.map.zones)) {
        this.send(ws, { t: "error", message: "請到男廁或女廁更換造型" });
        return;
      }
      const next = incomingLook(body, att.animal);
      if (!next) {
        this.send(ws, { t: "error", message: "造型不正確" });
        return;
      }
      look = next;
      animal = avatarAnimal(body.animal, look);
    }
    this.sql.exec(
      `UPDATE members SET display_name = ?, animal = ?, accessories = ? WHERE id = ?`,
      name,
      animal,
      JSON.stringify(look),
      att.id,
    );
    att.name = name;
    att.animal = animal;
    att.look = look;
    ws.serializeAttachment(att);
    this.broadcast({
      t: "profile",
      id: att.id,
      displayName: name,
      animal,
      look,
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
      const seated = this.chairLive(id);
      if (seated?.occupant) {
        this.send(ws, { t: "error", message: "有人坐在這張椅子上", furniture: this.furniture() });
        return;
      }
      this.sql.exec(`UPDATE furniture SET x = ?, y = ?, rot = ? WHERE id = ?`, x, y, rot, id);
      if (seated) {
        seated.x = x;
        seated.y = y;
        seated.rot = rot;
        seated.vx = 0;
        seated.vy = 0;
      }
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
      if (kind === "chair") this.rememberChair({ id, x, y, rot: 0 });
    } else if (op === "remove") {
      const id = typeof body.id === "string" ? body.id : "";
      const seated = this.chairLive(id);
      if (seated?.occupant) {
        this.send(ws, { t: "error", message: "有人坐在這張椅子上", furniture: this.furniture() });
        return;
      }
      this.sql.exec(`DELETE FROM furniture WHERE id = ?`, id);
      this.chairs.delete(id);
    } else if (op === "home") {
      this.resetChairs(false);
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

  private onBump(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    const otherId = typeof body.other === "string" ? body.other : "";
    const nx = typeof body.nx === "number" ? body.nx : 0;
    const ny = typeof body.ny === "number" ? body.ny : 0;
    if (!otherId || !Number.isFinite(nx) || !Number.isFinite(ny)) return;
    let ox = this.map.kiki.x;
    let oy = this.map.kiki.y;
    let otherRadius = bodyRadiusOf({ body: "bean" });
    if (otherId !== "kiki") {
      const other = this.attachment(otherId);
      if (!other) return;
      ox = other.x;
      oy = other.y;
      otherRadius = bodyRadiusOf(other.look);
    }
    const reach = bodyRadiusOf(att.look) + otherRadius + 28;
    if (Math.hypot(att.x - ox, att.y - oy) > reach) return;
    const key = [att.id, otherId].sort().join(":");
    const now = Date.now();
    if (now - (this.bumpAt.get(key) || 0) < 420) return;
    this.bumpAt.set(key, now);
    this.broadcast({ t: "bump", id: att.id, other: otherId, nx, ny }, ws);
  }

  private onSit(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    if (att.seat || att.editing) return;
    const id = typeof body.id === "string" ? body.id : "";
    const chair = this.chairLive(id);
    if (!chair || chair.occupant) {
      this.send(ws, { t: "error", message: "這張椅子有人坐了" });
      return;
    }
    const center = this.chairCenter(chair);
    if (Math.hypot(att.x - center.x, att.y - center.y) > 78) {
      this.send(ws, { t: "error", message: "再靠近一點才能坐下" });
      return;
    }
    chair.occupant = att.id;
    chair.vx = 0;
    chair.vy = 0;
    att.seat = chair.id;
    att.x = center.x;
    att.y = center.y;
    ws.serializeAttachment(att);
    this.keepWhisper(ws, att);
    this.broadcast({
      t: "sit",
      id: att.id,
      chair: chair.id,
      x: chair.x,
      y: chair.y,
      rot: chair.rot,
      cx: center.x,
      cy: center.y,
    });
  }

  private onRise(ws: WebSocket, att: Att) {
    if (!att.seat) return;
    const chair = this.chairLive(att.seat);
    if (chair && chair.occupant === att.id) {
      chair.occupant = null;
      chair.vx = 0;
      chair.vy = 0;
      this.sql.exec(`UPDATE furniture SET x = ?, y = ?, rot = ? WHERE id = ?`, chair.x, chair.y, chair.rot, chair.id);
      chair.lastSave = Date.now();
      const spot = this.freeBeside(chair, att);
      att.x = spot.x;
      att.y = spot.y;
    }
    const chairId = att.seat;
    att.seat = null;
    ws.serializeAttachment(att);
    this.keepWhisper(ws, att);
    this.persist(att);
    this.broadcast({ t: "rise", id: att.id, chair: chairId, x: att.x, y: att.y });
  }

  private onGlide(ws: WebSocket, att: Att, body: Record<string, unknown>) {
    const id = typeof body.id === "string" ? body.id : att.seat || "";
    const chair = this.chairLive(id);
    if (!chair || chair.occupant !== att.id) return;
    const x = body.x;
    const y = body.y;
    const rot = body.rot;
    const vx = body.vx;
    const vy = body.vy;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const size = furnitureSize("chair", typeof rot === "number" ? rot : chair.rot);
    if (!size) return;
    const cx = x + size.w / 2;
    const cy = y + size.h / 2;
    if (this.inWall(cx, cy) || !furnitureFits(this.map.walls, "chair", x, y, 0)) {
      this.send(ws, this.glideState(att.id, chair, true));
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.45, Math.max(0.03, chair.lastNet ? (now - chair.lastNet) / 1000 : 0.08));
    if (Math.hypot(x - chair.x, y - chair.y) > 280 * dt + 36) {
      this.send(ws, this.glideState(att.id, chair, true));
      return;
    }
    chair.x = x;
    chair.y = y;
    if (typeof rot === "number" && Number.isFinite(rot)) chair.rot = rot;
    chair.vx = typeof vx === "number" && Number.isFinite(vx) ? vx : 0;
    chair.vy = typeof vy === "number" && Number.isFinite(vy) ? vy : 0;
    chair.lastNet = now;
    att.x = cx;
    att.y = cy;
    ws.serializeAttachment(att);
    this.keepWhisper(ws, att);
    if (now - chair.lastSave > 450) {
      this.sql.exec(`UPDATE furniture SET x = ?, y = ?, rot = ? WHERE id = ?`, chair.x, chair.y, chair.rot, chair.id);
      chair.lastSave = now;
      this.persist(att);
    }
    this.broadcast(this.glideState(att.id, chair, false), ws);
  }

  private glideState(id: string, chair: ChairLive, snap: boolean) {
    const center = this.chairCenter(chair);
    return {
      t: "glide",
      id,
      chair: chair.id,
      x: chair.x,
      y: chair.y,
      rot: chair.rot,
      vx: snap ? 0 : chair.vx,
      vy: snap ? 0 : chair.vy,
      cx: center.x,
      cy: center.y,
      snap,
    };
  }

  private ensureChairs() {
    if (this.chairsReady) return;
    this.chairsReady = true;
    for (const row of this.sql.exec<Furn>(`SELECT id, kind, x, y, rot FROM furniture`).toArray()) {
      if (row.kind !== "chair") continue;
      this.rememberChair({ id: String(row.id), x: Number(row.x), y: Number(row.y), rot: Number(row.rot) || 0 });
    }
  }

  private rememberChair(row: { id: string; x: number; y: number; rot: number }) {
    const prev = this.chairs.get(row.id);
    this.chairs.set(row.id, {
      id: row.id,
      x: row.x,
      y: row.y,
      rot: row.rot,
      vx: 0,
      vy: 0,
      occupant: prev?.occupant ?? null,
      lastNet: prev?.lastNet ?? 0,
      lastSave: prev?.lastSave ?? 0,
    });
  }

  private chairLive(id: string): ChairLive | null {
    this.ensureChairs();
    return this.chairs.get(id) ?? null;
  }

  private chairCenter(chair: ChairLive): { x: number; y: number } {
    return { x: chair.x + 16, y: chair.y + 13 };
  }

  private attachment(id: string): Att | null {
    for (const ws of this.ctx.getWebSockets(id)) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att) return att;
    }
    return null;
  }

  private releaseSeat(id: string) {
    this.ensureChairs();
    for (const chair of this.chairs.values()) {
      if (chair.occupant === id) {
        chair.occupant = null;
        chair.vx = 0;
        chair.vy = 0;
      }
    }
  }

  private resetChairs(force: boolean) {
    this.ensureChairs();
    for (const item of this.map.furniture) {
      if (item.kind !== "chair") continue;
      const live = this.chairs.get(item.id);
      if (live?.occupant && !force) continue;
      this.sql.exec(`UPDATE furniture SET x = ?, y = ?, rot = ? WHERE id = ?`, item.x, item.y, item.rot, item.id);
      this.chairs.set(item.id, {
        id: item.id,
        x: item.x,
        y: item.y,
        rot: item.rot,
        vx: 0,
        vy: 0,
        occupant: force ? null : (live?.occupant ?? null),
        lastNet: 0,
        lastSave: Date.now(),
      });
    }
  }

  private freeBeside(chair: ChairLive, att: Att): { x: number; y: number } {
    const center = this.chairCenter(chair);
    const radius = bodyRadiusOf(att.look);
    for (let ring = 1; ring <= 6; ring++) {
      const step = 22 + ring * 16;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = center.x + Math.cos(angle) * step;
        const y = center.y + Math.sin(angle) * step;
        if (this.separateFrom(att.id, x, y, att.look).x === x && this.separateFrom(att.id, x, y, att.look).y === y && !this.inWall(x, y)) {
          if (Math.hypot(x - center.x, y - center.y) >= radius * 0.45) return { x, y };
        }
      }
    }
    return { x: center.x + 48, y: center.y + 36 };
  }

  private spawnFor(id: string): { x: number; y: number } {
    let hash = 0;
    for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    const col = (hash % 7) - 3;
    const x = this.map.spawn.x + col * 72;
    const y = this.map.spawn.y;
    if (this.inWall(x, y)) return { x: this.map.spawn.x, y: this.map.spawn.y };
    return { x, y };
  }

  private separateFrom(id: string, x: number, y: number, look: Look | null): { x: number; y: number } {
    const mine = bodyRadiusOf(look);
    const occupied: Array<{ x: number; y: number; r: number }> = [
      { x: this.map.kiki.x, y: this.map.kiki.y, r: bodyRadiusOf({ body: "bean" }) },
    ];
    for (const ws of this.ctx.getWebSockets()) {
      const other = ws.deserializeAttachment() as Att | null;
      if (!other || other.id === id) continue;
      occupied.push({ x: other.x, y: other.y, r: bodyRadiusOf(other.look) });
    }
    this.ensureChairs();
    for (const chair of this.chairs.values()) {
      if (chair.occupant === id) continue;
      const center = this.chairCenter(chair);
      occupied.push({ x: center.x, y: center.y, r: 18 });
    }
    const clear = (px: number, py: number) =>
      !this.inWall(px, py) && occupied.every((person) => Math.hypot(person.x - px, person.y - py) >= mine + person.r - 1);
    if (clear(x, y)) return { x, y };
    const base = this.spawnFor(id);
    for (let ring = 0; ring <= 5; ring++) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + ring;
        const px = base.x + Math.cos(angle) * (36 + ring * 28);
        const py = base.y + Math.sin(angle) * (28 + ring * 22);
        if (clear(px, py)) return { x: px, y: py };
      }
    }
    return { x: base.x, y: base.y };
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
      look: readStoredLook(member.animal, member.accessories),
    };
  }

  private player(att: Att) {
    return {
      id: att.id,
      displayName: att.name,
      animal: att.animal,
      look: att.look,
      seat: att.seat,
      x: att.x,
      y: att.y,
      dir: att.dir,
    };
  }

  private furniture(): Array<Furn & { seat: string | null }> {
    this.ensureChairs();
    return this.sql.exec<Furn>(`SELECT id, kind, x, y, rot FROM furniture`).toArray().map((row) => {
      const id = String(row.id);
      const chair = row.kind === "chair" ? this.chairs.get(id) : null;
      return {
        id,
        kind: String(row.kind),
        x: chair ? chair.x : Number(row.x),
        y: chair ? chair.y : Number(row.y),
        rot: chair ? chair.rot : Number(row.rot) || 0,
        seat: chair?.occupant ?? null,
      };
    });
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

  private socketOf(id: string): { ws: WebSocket; att: Att } | null {
    for (const ws of this.ctx.getWebSockets(id)) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att) return { ws, att };
    }
    return null;
  }

  private activeHush(): Array<{ group: string; members: string[] }> {
    const groups = new Map<string, string[]>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (!att?.whisper) continue;
      const list = groups.get(att.whisper) || [];
      list.push(att.id);
      groups.set(att.whisper, list);
    }
    return [...groups.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([group, members]) => ({ group, members }));
  }

  private membersOf(group: string): Array<{ ws: WebSocket; att: Att }> {
    const list: Array<{ ws: WebSocket; att: Att }> = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Att | null;
      if (att?.whisper === group) list.push({ ws, att });
    }
    return list;
  }

  private requestWhisper(ws: WebSocket, att: Att, group: string) {
    const members = this.membersOf(group);
    if (members.length >= WHISPER_CAP) {
      this.send(ws, { t: "error", message: "這一圈悄悄話已經滿了" });
      return;
    }
    const until = Date.now() + WHISPER_ASK_MS;
    this.whisperAsks.set(att.id, { group, until });
    const ask = { t: "ask", id: att.id, group, until };
    for (const member of members) this.send(member.ws, ask);
    this.send(ws, { ...ask, pending: true });
  }

  private acceptWhisper(ws: WebSocket, att: Att, requesterId: string) {
    const ask = this.whisperAsks.get(requesterId);
    if (!ask || ask.until < Date.now()) {
      this.whisperAsks.delete(requesterId);
      this.send(ws, { t: "error", message: "加入請求已經過期" });
      return;
    }
    if (att.whisper !== ask.group) return;
    const members = this.membersOf(ask.group);
    if (members.length >= WHISPER_CAP) {
      this.send(ws, { t: "error", message: "這一圈悄悄話已經滿了" });
      return;
    }
    const requester = this.socketOf(requesterId);
    if (!requester || requester.att.whisper) {
      this.whisperAsks.delete(requesterId);
      this.send(ws, { t: "error", message: "對方現在不能加入" });
      return;
    }
    const close = members.some((member) => Math.hypot(requester.att.x - member.att.x, requester.att.y - member.att.y) <= WHISPER_NEAR);
    if (!close) {
      this.send(ws, { t: "error", message: "對方走遠了" });
      return;
    }
    requester.att.whisper = ask.group;
    requester.ws.serializeAttachment(requester.att);
    this.whisperAsks.delete(requesterId);
    const next = this.membersOf(ask.group);
    this.broadcast({ t: "hush", group: ask.group, members: next.map((member) => member.att.id), by: requesterId });
    for (const member of next) this.send(member.ws, { t: "ask", id: requesterId, off: true });
  }

  private leaveWhisper(att: Att, ws: WebSocket | null) {
    const group = att.whisper;
    if (!group) return;
    att.whisper = null;
    if (ws) ws.serializeAttachment(att);
    this.whisperAsks.delete(att.id);
    const rest = this.membersOf(group);
    if (rest.length < 2) {
      for (const member of rest) {
        member.att.whisper = null;
        member.ws.serializeAttachment(member.att);
      }
      this.broadcast({ t: "hush", group, members: [] });
      return;
    }
    this.broadcast({ t: "hush", group, members: rest.map((member) => member.att.id) });
  }

  private dropWhisper(att: Att, ws: WebSocket) {
    this.leaveWhisper(att, ws);
  }

  private keepWhisper(ws: WebSocket, att: Att) {
    if (!att.whisper) return;
    const others = this.membersOf(att.whisper).filter((member) => member.att.id !== att.id);
    const close = others.some((member) => Math.hypot(att.x - member.att.x, att.y - member.att.y) <= WHISPER_FAR);
    if (!others.length || !close) this.leaveWhisper(att, ws);
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
