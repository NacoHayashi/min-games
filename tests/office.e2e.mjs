import { spawn } from "node:child_process";
import { mkdirSync, cpSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 8787;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ADMIN = "test-admin-token";
const PASS = "peach-1234";
const PASS2 = "peach-9999";
const SHOTS = "/tmp/office-shots";
const ARTIFACTS = "/opt/cursor/artifacts";
const saved = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitHttp() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("wrangler dev 沒有起來");
}

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: file });
  saved.push({ file, name });
  console.log("shot", name);
}

async function ready(page) {
  await page.waitForFunction(() => window.office && window.office.ready, null, { timeout: 30000 });
}

async function settleView(page) {
  await page.evaluate(() => { window.__viewSettle = null; });
  await page.waitForFunction(() => {
    const me = window.office.me;
    if (!me) return false;
    const point = window.office.worldToScreen(me.x, me.y);
    const prev = window.__viewSettle;
    window.__viewSettle = { x: point.x, y: point.y, mode: window.office.cameraMode, dist: window.office.cameraDist };
    if (!prev || prev.mode !== window.office.cameraMode) return false;
    return Math.hypot(point.x - prev.x, point.y - prev.y) < 0.4 && Math.abs(prev.dist - window.office.cameraDist) < 1;
  });
}

async function march(page, x, y) {
  const start = await page.evaluate(() => ({ x: window.office.me.x, y: window.office.me.y }));
  const points = [
    [x, start.y],
    [x, y - 48],
    [x, y],
  ];
  for (const [tx, ty] of points) {
    const from = await page.evaluate(() => ({ x: window.office.me.x, y: window.office.me.y }));
    const dist = Math.hypot(tx - from.x, ty - from.y);
    const steps = Math.max(1, Math.ceil(dist / 20));
    for (let i = 1; i <= steps; i++) {
      const px = from.x + ((tx - from.x) * i) / steps;
      const py = from.y + ((ty - from.y) * i) / steps;
      await page.evaluate(({ px, py }) => window.office.place(px, py), { px, py });
      await page.waitForTimeout(45);
    }
  }
}

async function walkTo(page, x, y) {
  await page.evaluate(({ x, y }) => window.office.walkTo(x, y), { x, y });
  await page.waitForFunction(({ x, y }) => {
    const me = window.office.me;
    return Math.hypot(me.x - x, me.y - y) < 36;
  }, { x, y }, { timeout: 30000 }).catch(async (error) => {
    const where = await page.evaluate(() => {
      const me = window.office.me;
      return me ? `${me.id} @ ${Math.round(me.x)},${Math.round(me.y)}` : "no me";
    });
    throw new Error(`走不到 ${Math.round(x)},${Math.round(y)}（${where}）`, { cause: error });
  });
}

async function clickWalk(page, x, y) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 30000) {
    const step = await page.evaluate(({ x, y }) => {
      const me = window.office.me;
      const dx = x - me.x;
      const dy = y - me.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 28) return null;
      const reach = Math.min(220, dist);
      const point = window.office.worldToScreen(me.x + (dx / dist) * reach, me.y + (dy / dist) * reach);
      const rect = document.getElementById("view").getBoundingClientRect();
      return {
        x: Math.min(rect.right - 24, Math.max(rect.left + 24, point.x)),
        y: Math.min(rect.bottom - 96, Math.max(rect.top + 78, point.y)),
        dist,
        me,
      };
    }, { x, y });
    if (!step) return;
    last = step;
    await page.mouse.click(step.x, step.y);
    await page.waitForTimeout(550);
  }
  throw new Error(`走不到 ${x},${y}，最後在 ${JSON.stringify(last)}`);
}

async function register(page, id, name, animal) {
  await page.goto(`${ORIGIN}/`);
  await page.getByLabel("辦公室密碼").fill(PASS);
  await page.getByRole("button", { name: "進入", exact: true }).click();
  await page.getByLabel("你的 ID").waitFor();
  await page.getByLabel("你的 ID").fill(id);
  await page.locator("#office-name").fill(name);
  if (id === "naco") await shot(page, "register-id");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: animal, exact: true }).click();
  if (id === "naco") {
    const rejected = await page.evaluate(async () => {
      const response = await fetch("/api/office/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${localStorage.getItem("office_session")}`,
        },
        body: JSON.stringify({ animal: "custom", look: { v: 2, body: "nope", colors: { body: "red" } } }),
      });
      return response.status;
    });
    assert(rejected === 400, `不合法造型應為 400，實際 ${rejected}`);
    await page.getByRole("button", { name: "顏色", exact: true }).click();
    await page.getByRole("button", { name: "身體", exact: true }).waitFor();
    const preview3d = await page.evaluate(() => window.office.preview3d === true);
    assert(preview3d, "造型預覽應該用 WebGL 畫出 3D 角色");
    await shot(page, "customizer");
    await page.getByRole("button", { name: "配件", exact: true }).click();
    await page.getByRole("button", { name: "毛帽" }).click();
    await shot(page, "avatar-chooser");
  }
  await page.getByRole("button", { name: "進入辦公室" }).click();
  await ready(page);
}

async function main() {
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    let cmd = "";
    try {
      cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
    } catch {
      continue;
    }
    if (
      (cmd.includes("wrangler") && cmd.includes(`--port ${PORT}`)) ||
      (cmd.includes("workerd") && cmd.includes(`127.0.0.1:${PORT}`))
    ) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  rmSync("/tmp/min-games-do", { recursive: true, force: true });
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const proc = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--persist-to",
      "/tmp/min-games-do",
      "--var",
      `ADMIN_TOKEN:${ADMIN}`,
    ],
    {
      cwd: "/workspace",
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    },
  );
  proc.stdout.on("data", (chunk) => process.stdout.write(chunk));
  proc.stderr.on("data", (chunk) => process.stderr.write(chunk));
  let browser;
  try {
    await waitHttp();
    for (let i = 0; i < 40; i++) {
      const status = await fetch(`${ORIGIN}/api/office/status`);
      if (status.ok) break;
      if (i === 39) throw new Error(`狀態 API ${status.status}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const healthResponse = await fetch(`${ORIGIN}/api/office/admin/health`);
    const health = await healthResponse.json();
    assert(healthResponse.ok && health.hasAdminToken === true, `health 應看到密鑰，實際 ${JSON.stringify(health)}`);
    assert(Object.keys(health).length === 1, "health 不該帶出密鑰內容");
    const spoof = await fetch(`${ORIGIN}/api/office/admin/overview`, { headers: { "x-office-admin": "1" } });
    assert(spoof.status === 401, `偽造管理標頭應為 401，實際 ${spoof.status}`);

    browser = await chromium.launch({
      args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
    });
    const lobby = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const officeRedirect = await fetch(`${ORIGIN}/office/`, { redirect: "manual" });
    assert(officeRedirect.status === 302, `/office 應轉到首頁，實際 ${officeRedirect.status}`);
    assert(new URL(officeRedirect.headers.get("location"), ORIGIN).pathname === "/", "轉址目標應為 /");

    await lobby.goto(`${ORIGIN}/`);
    await lobby.getByRole("heading", { name: "迷你辦公室" }).waitFor();
    await lobby.goto(`${ORIGIN}/games`);
    await lobby.getByRole("heading", { name: "小遊戲大廳" }).waitFor();
    await lobby.getByRole("link", { name: /燒肉屋/ }).waitFor();
    assert(await lobby.getByRole("link", { name: /辦公室/ }).count() === 0, "獨立大廳不該有辦公室連結");
    assert(await lobby.getByRole("button", { name: /辦公室/ }).count() === 0, "獨立大廳不該有辦公室按鈕");
    assert(!(await lobby.locator("#lobby").innerText()).includes("辦公室"), "獨立大廳不該提到辦公室");
    await shot(lobby, "lobby");
    await lobby.goto(`${ORIGIN}/games#zip`);
    await lobby.locator("#gname", { hasText: "Zip" }).waitFor();
    await lobby.getByRole("button", { name: "← 大廳" }).click();
    await lobby.getByRole("heading", { name: "小遊戲大廳" }).waitFor();
    const scorePosts = [];
    lobby.on("request", (request) => {
      if (request.url().includes("/api/office/score")) scorePosts.push(request.url());
    });
    await lobby.evaluate(() => window.postMessage({ officeSolve: "zip" }, location.origin));
    await lobby.waitForTimeout(200);
    assert(scorePosts.length === 0, "獨立大廳不該送出分數");

    async function readCatTile(page) {
      await page.locator("#gname", { hasText: "2048 貓咪進化" }).waitFor();
      const frame = page.frameLocator("#f-cat2048");
      const img = frame.locator(".tile img").first();
      await img.waitFor();
      await page.waitForTimeout(300);
      return img.evaluate(async (el) => {
        if (!el.complete || el.naturalWidth === 0) {
          await new Promise((resolve) => {
            el.addEventListener("load", resolve, { once: true });
            el.addEventListener("error", resolve, { once: true });
          });
        }
        const tile = el.closest(".tile");
        const face = el.parentElement;
        const tileBox = tile.getBoundingClientRect();
        const imgBox = el.getBoundingClientRect();
        return {
          src: el.getAttribute("src"),
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          fit: getComputedStyle(el).objectFit,
          tileW: Math.round(tileBox.width),
          tileH: Math.round(tileBox.height),
          imgW: Math.round(imgBox.width),
          imgH: Math.round(imgBox.height),
          badge: face.querySelector(".num")?.textContent || "",
          radius: Number.parseFloat(getComputedStyle(face).borderRadius),
        };
      });
    }
    await lobby.goto(`${ORIGIN}/games#cat2048`);
    const catTile = await readCatTile(lobby);
    assert(
      catTile.src === "/games/cat2048/01_orange_cat.webp" || catTile.src === "/games/cat2048/02_white_cat.webp",
      `起始貓咪圖應為橘貓或白貓，實際 ${JSON.stringify(catTile)}`,
    );
    assert(catTile.naturalWidth === 256 && catTile.naturalHeight === 256, `貓咪圖應為 256 正方形，實際 ${JSON.stringify(catTile)}`);
    assert(catTile.fit === "cover", `貓咪圖應 cover，實際 ${JSON.stringify(catTile)}`);
    assert(catTile.tileW === catTile.tileH && catTile.tileW > 40, `格子應維持正方形，實際 ${JSON.stringify(catTile)}`);
    assert(Math.abs(catTile.imgW - catTile.tileW) <= 2 && Math.abs(catTile.imgH - catTile.tileH) <= 2, `圖片應填滿格子，實際 ${JSON.stringify(catTile)}`);
    assert(catTile.badge === "2" || catTile.badge === "4", `數字徽章應可讀，實際 ${JSON.stringify(catTile)}`);
    assert(catTile.radius >= 8, `格子應有圓角，實際 ${JSON.stringify(catTile)}`);
    await shot(lobby, "cat2048");
    const catSrcdoc = await lobby.locator("#f-cat2048").getAttribute("srcdoc");
    assert(catSrcdoc.includes("10_star_cat.webp") && catSrcdoc.includes("glow:1"), "2048 以上應沿用星星貓並加上金光");
    await lobby.evaluate(() => {
      window.__catSave = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 2500);
        addEventListener("message", function onMsg(event) {
          const data = event.data && event.data.lobbySave;
          if (!data || data.key !== "cat2048") return;
          removeEventListener("message", onMsg);
          clearTimeout(timer);
          resolve(data.val);
        });
      });
    });
    await lobby.frameLocator("#f-cat2048").locator("body").evaluate(() => {
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      }
    });
    const catSaved = await lobby.evaluate(() => window.__catSave);
    assert(catSaved && Number.isFinite(catSaved.best), `移動後應回報分數，實際 ${JSON.stringify(catSaved)}`);
    await lobby.frameLocator("#f-cat2048").getByRole("button", { name: "📖 貓咪圖鑑" }).click();
    await lobby.frameLocator("#f-cat2048").locator("#dex img").nth(10).waitFor();
    assert(await lobby.frameLocator("#f-cat2048").locator("#dex img").count() === 11, "圖鑑應列出 2 到 2048");
    await shot(lobby, "cat2048-dex");

    const arcadeLobby = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await arcadeLobby.goto(`${ORIGIN}/games/?from=office`);
    await arcadeLobby.getByRole("button", { name: "回到辦公室" }).click();
    await arcadeLobby.waitForURL((url) => url.pathname === "/");
    await arcadeLobby.goto(`${ORIGIN}/games/?from=office#cat2048`);
    await arcadeLobby.getByRole("button", { name: "回到辦公室" }).waitFor();
    const arcadeTile = await readCatTile(arcadeLobby);
    assert(arcadeTile.src.startsWith("/games/cat2048/") && arcadeTile.naturalWidth === 256, `街機覆蓋層也應載入同一批圖，實際 ${JSON.stringify(arcadeTile)}`);
    await arcadeLobby.close();
    await lobby.close();

    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const nacoContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const momoContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminContext.newPage();
    const naco = await nacoContext.newPage();
    const momo = await momoContext.newPage();
    for (const page of [admin, naco, momo]) {
      page.on("pageerror", (error) => console.log("PAGE", error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.log("CONSOLE", msg.text());
      });
    }
    admin.on("dialog", (dialog) => dialog.accept());

    await admin.goto(`${ORIGIN}/office/admin`);
    await admin.getByLabel("管理員權杖").fill(ADMIN);
    await admin.getByRole("button", { name: "進入", exact: true }).click();
    await admin.getByText("尚未設定密碼").waitFor();
    await admin.getByLabel("新的辦公室密碼").fill(PASS);
    await admin.getByLabel("再輸入一次").fill(PASS);
    await admin.getByRole("button", { name: "儲存新密碼" }).click();
    await admin.getByText("已更新密碼").waitFor();

    await naco.goto(`${ORIGIN}/`);
    await naco.getByLabel("辦公室密碼").waitFor();
    await shot(naco, "entry-password");

    const bad = await nacoContext.request.post(`${ORIGIN}/api/office/login`, { data: { password: "nope", deviceKey: "ab".repeat(20) } });
    assert(bad.status() === 401, `錯誤密碼應為 401，實際 ${bad.status()}`);

    await register(naco, "naco", "納可", "貓");
    assert((await naco.evaluate(() => window.office.me.look.head)) === "beanie", "毛帽沒有存下來");

    await momo.goto(`${ORIGIN}/`);
    await momo.getByLabel("辦公室密碼").fill(PASS);
    await momo.getByRole("button", { name: "進入", exact: true }).click();
    await momo.getByLabel("你的 ID").fill("x");
    await momo.locator("#office-name").fill("測試");
    await momo.getByRole("button", { name: "下一步" }).click();
    await momo.getByText("2 到 16").waitFor();
    await momo.getByLabel("你的 ID").fill("naco");
    await momo.getByRole("button", { name: "下一步" }).click();
    await momo.getByText("已經有人使用").waitFor();
    await momo.getByLabel("你的 ID").fill("momo");
    await momo.locator("#office-name").fill("茉茉");
    await momo.getByRole("button", { name: "下一步" }).click();
    await momo.getByRole("button", { name: "兔", exact: true }).click();
    await momo.getByRole("button", { name: "進入辦公室" }).click();
    await ready(momo);
    await naco.waitForFunction(() => window.office.others.some((person) => person.id === "momo"));
    await momo.waitForFunction(() => window.office.others.some((person) => person.id === "naco"));
    const spawnGap = await naco.evaluate(() => {
      const other = window.office.others.find((person) => person.id === "momo");
      return Math.hypot(window.office.me.x - other.x, window.office.me.y - other.y);
    });
    assert(spawnGap >= 64, `兩位玩家不該出生在同一個點，距離 ${spawnGap}`);
    await shot(naco, "office-two-players");
    assert((await naco.evaluate(() => window.office.view3d)) === true, "辦公室應該用 WebGL 畫出來");
    assert((await naco.evaluate(() => window.office.cameraMode)) === "iso", "預設應該是俯瞰鏡頭");
    await settleView(naco);
    await naco.waitForTimeout(1200);
    await shot(naco, "office-iso");
    const isoDist = await naco.evaluate(() => window.office.cameraDist);
    const isoYaw = await naco.evaluate(() => window.office.cameraYaw);

    await march(momo, 614, 560);
    await march(naco, 860, 560);
    const cast = [
      { id: "foxie", name: "小狐", animal: "fox", x: 696, y: 560 },
      { id: "doggo", name: "小狗", animal: "dog", x: 778, y: 560 },
      { id: "beary", name: "小熊", animal: "bear", x: 942, y: 560 },
      { id: "pandy", name: "圓圓", animal: "panda", x: 1024, y: 560 },
      { id: "penny", name: "企企", animal: "penguin", x: 1106, y: 560 },
      { id: "froggy", name: "青青", animal: "frog", x: 1188, y: 560 },
    ];
    await naco.evaluate((people) => window.office.poseCast(people), cast);
    await naco.evaluate(() => window.office.setView({ dist: 800 }));
    await settleView(naco);
    await naco.waitForTimeout(1200);
    await shot(naco, "office-animals");
    await naco.evaluate((ids) => window.office.clearCast(ids), cast.map((person) => person.id));

    const customHome = await naco.evaluate(() => ({
      x: window.office.me.x,
      y: window.office.me.y,
      look: window.office.me.look,
      animal: window.office.me.animal,
    }));
    const momoHome = await momo.evaluate(() => ({ x: window.office.me.x, y: window.office.me.y }));
    const colors = (body, extra = {}) => ({
      body,
      ear: extra.ear || body,
      inner: extra.inner || "#ffffff",
      tip: extra.tip || "#4a1c0c",
      belly: extra.belly || "#fffdfb",
      tail: extra.tail || body,
      blush: extra.blush || "#ff709c",
    });
    const custom = (partial) => ({
      v: 2,
      body: "bean",
      ears: "none",
      tail: "none",
      belly: true,
      eyes: "highlight",
      mouth: "omega",
      blush: "oval",
      marking: "none",
      head: "none",
      face: "none",
      neck: "none",
      held: "none",
      ...partial,
      colors: colors(partial.colors?.body || "#f06292", partial.colors || {}),
    });
    const lineup = [
      custom({ body: "pear", ears: "fox", tail: "bush", head: "flower", mouth: "omega", colors: colors("#f06a28", { inner: "#ff7a62", tip: "#4a1c0c", tail: "#f06a28", belly: "#fff1e4" }) }),
      custom({ body: "wide", ears: "long", tail: "puff", head: "ribbon", eyes: "sparkle", colors: colors("#fff8fc", { ear: "#f7c2d8", inner: "#d45388", tail: "#fffdfb" }) }),
      custom({ body: "mochi", ears: "flop", tail: "curl", eyes: "sleepy", mouth: "smile", neck: "scarf", colors: colors("#e0a045", { ear: "#b56a32", inner: "#f6d7b0", tail: "#b56a32", belly: "#fff0d0" }) }),
      custom({ body: "bean", ears: "round", tail: "nub", belly: false, marking: "panda", blush: "none", mouth: "smile", colors: colors("#fffdfb", { ear: "#1a1a22", inner: "#3a3544", tip: "#1a1a22" }) }),
      custom({ body: "bean", ears: "none", tail: "none", mouth: "beak", blush: "none", face: "sun", head: "crown", colors: colors("#243356", { belly: "#fffdfb", inner: "#f0a050" }) }),
      custom({ body: "wide", ears: "nub", tail: "thin", eyes: "happy", mouth: "wide", blush: "lines", marking: "freckles", held: "balloon", colors: colors("#3cb85c", { belly: "#dff5b0", tail: "#2e8b46", blush: "#ff709c" }) }),
    ];
    const spots = [600, 720, 840, 960, 1080, 1200];
    await momo.evaluate(() => window.office.place(48, 48));
    await naco.evaluate((x) => window.office.place(x, 560), spots[2]);
    await naco.evaluate((look) => window.office.applyLook(look, "custom"), lineup[2]);
    await naco.evaluate((people) => window.office.poseCast(people), lineup.map((look, index) => ({
      id: `custom-${index}`,
      name: `造型${index + 1}`,
      animal: "custom",
      look,
      x: spots[index],
      y: 560,
    })).filter((_, index) => index !== 2));
    await naco.evaluate(() => window.office.setView({ dist: 980 }));
    await settleView(naco);
    await naco.waitForTimeout(1200);
    await shot(naco, "office-custom");
    await naco.evaluate(() => window.office.clearCast(["custom-0", "custom-1", "custom-3", "custom-4", "custom-5"]));
    await naco.evaluate((savedLook) => window.office.applyLook(savedLook.look, savedLook.animal), customHome);
    await naco.evaluate(({ x, y }) => window.office.place(x, y), customHome);
    await momo.evaluate(({ x, y }) => window.office.place(x, y), momoHome);
    await naco.evaluate(({ yaw, dist }) => window.office.setView({ yaw, dist }), { yaw: isoYaw, dist: isoDist });
    await settleView(naco);
    await naco.getByRole("button", { name: "俯瞰" }).click();
    await naco.getByRole("button", { name: "跟隨" }).waitFor();
    assert((await naco.evaluate(() => window.office.cameraMode)) === "follow", "按鈕應該切到跟隨鏡頭");
    await settleView(naco);
    await shot(naco, "office-follow");
    await naco.keyboard.press("v");
    await naco.getByRole("button", { name: "俯瞰" }).waitFor();
    await settleView(naco);

    await naco.evaluate(() => window.office.place(620, 560));
    await momo.evaluate(() => window.office.place(900, 560));
    await naco.waitForFunction(() => {
      const other = window.office.others.find((person) => person.id === "momo");
      return other && Math.hypot(other.x - 900, other.y - 560) < 48;
    });
    await naco.evaluate(() => {
      const other = window.office.others.find((person) => person.id === "momo");
      window.office.walkTo(other.x, other.y);
    });
    await momo.evaluate(() => {
      const other = window.office.others.find((person) => person.id === "naco");
      window.office.walkTo(other.x, other.y);
    });
    const push = await naco.evaluate(async () => {
      let min = Infinity;
      let minGap = Infinity;
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const other = window.office.others.find((person) => person.id === "momo");
        min = Math.min(min, Math.hypot(window.office.me.x - other.x, window.office.me.y - other.y));
        const gap = window.office.gap("momo");
        if (typeof gap === "number") minGap = Math.min(minGap, gap);
      }
      const other = window.office.others.find((person) => person.id === "momo");
      return {
        min,
        minGap,
        sum: window.office.radius(window.office.me.look) + window.office.radius(other.look),
      };
    });
    assert(push.min >= push.sum - 14, `兩人擠在一起時重疊了，距離 ${push.min.toFixed(1)}，半徑和 ${push.sum}`);
    assert(push.minGap >= push.sum - 8, `畫面上還是疊在一起，距離 ${push.minGap.toFixed(1)}，半徑和 ${push.sum}`);

    await momo.evaluate(() => window.office.place(180, 200));
    await naco.evaluate(() => window.office.place(720, 560));
    const bunch = ["fox", "rabbit", "panda", "frog", "dog"].map((animal, index) => ({
      id: `bunch-${index}`,
      name: `擠${index + 1}`,
      animal,
      x: 720 + (index - 2) * 6,
      y: 560,
    }));
    await naco.evaluate((people) => window.office.poseCast(people), bunch);
    await naco.evaluate(() => window.office.setView({ dist: 760 }));
    await settleView(naco);
    await naco.waitForTimeout(900);
    await shot(naco, "office-bunch");
    await naco.evaluate((ids) => window.office.clearCast(ids), bunch.map((person) => person.id));
    await naco.evaluate(({ yaw, dist }) => window.office.setView({ yaw, dist }), { yaw: isoYaw, dist: isoDist });
    await settleView(naco);

    const chairs = await naco.evaluate(() => window.office.furniture
      .filter((item) => item.kind === "chair" && item.id.startsWith("desk-"))
      .slice(0, 2)
      .map((item) => ({ id: item.id, x: item.x + 16, y: item.y + 13 })));
    await naco.evaluate((spot) => window.office.place(spot.x, spot.y), chairs[0]);
    await naco.waitForTimeout(200);
    await naco.keyboard.press("e");
    await naco.waitForFunction((id) => window.office.seat === id, chairs[0].id);
    await momo.waitForFunction((id) => window.office.others.some((person) => person.id === "naco" && person.seat === id), chairs[0].id);
    const beforeGlide = await momo.evaluate(() => window.office.others.find((person) => person.id === "naco").x);
    await naco.evaluate(() => window.office.drive(1, 0));
    await naco.waitForTimeout(800);
    await naco.evaluate(() => window.office.drive(0, 0));
    await naco.waitForFunction((id) => {
      const item = window.office.furniture.find((entry) => entry.id === id);
      return item && (item.speed || 0) < 1;
    }, chairs[0].id);
    const afterGlide = await naco.evaluate((id) => window.office.furniture.find((item) => item.id === id).x, chairs[0].id);
    assert(afterGlide > chairs[0].x - 4, `椅子沒有滑出去，x=${afterGlide}，中心 ${chairs[0].x}`);
    await momo.waitForFunction((start) => {
      const person = window.office.others.find((item) => item.id === "naco");
      return person && person.x > start + 12;
    }, beforeGlide);
    await momo.evaluate((spot) => window.office.place(spot.x, spot.y), chairs[1]);
    await momo.waitForTimeout(200);
    await momo.keyboard.press("e");
    await momo.waitForFunction((id) => window.office.seat === id, chairs[1].id);
    await naco.evaluate(() => window.office.setView({ dist: 980 }));
    await settleView(naco);
    await naco.waitForTimeout(400);
    await shot(naco, "office-chairs");
    const parked = await naco.evaluate((id) => window.office.furniture.find((item) => item.id === id).x, chairs[0].id);
    await naco.keyboard.press("e");
    await momo.keyboard.press("e");
    await naco.waitForFunction(() => !window.office.seat);
    await momo.waitForFunction(() => !window.office.seat);
    await momo.waitForFunction(() => window.office.others.some((person) => person.id === "naco" && !person.seat));
    const stayed = await naco.evaluate((id) => window.office.furniture.find((item) => item.id === id).x, chairs[0].id);
    assert(Math.abs(stayed - parked) < 6, `起立後椅子應留在原地，${parked} -> ${stayed}`);
    await naco.evaluate(({ yaw, dist }) => window.office.setView({ yaw, dist }), { yaw: isoYaw, dist: isoDist });
    await settleView(naco);

    await admin.getByText("在線", { exact: true }).first().waitFor();
    await admin.locator('tr[data-id="naco"]').getByText("在線").waitFor();
    await admin.locator('tr[data-id="momo"]').getByText("在線").waitFor();
    await shot(admin, "admin-online");

    await naco.locator(".brand").click();
    const before = await momo.evaluate(() => window.office.others.find((person) => person.id === "naco").x);
    await naco.keyboard.down("ArrowRight");
    await naco.waitForTimeout(500);
    await naco.keyboard.up("ArrowRight");
    await momo.waitForFunction((start) => {
      const person = window.office.others.find((item) => item.id === "naco");
      return person && (person.x > start + 25 || (person.tx ?? 0) > start + 25);
    }, before);

    const clickTarget = await naco.evaluate(() => {
      const me = window.office.me;
      return { before: me.x, point: window.office.worldToScreen(me.x + 150, me.y + 40) };
    });
    await naco.mouse.click(clickTarget.point.x, clickTarget.point.y);
    await naco.waitForFunction((start) => Math.hypot(window.office.me.x - start, window.office.me.y) > 36 || window.office.me.x > start + 30, clickTarget.before);

    await naco.evaluate(() => {
      const input = document.querySelector("#chat-input");
      input.focus();
      input.value = "選字中";
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      Object.defineProperty(composing, "isComposing", { get: () => true });
      Object.defineProperty(composing, "keyCode", { get: () => 229 });
      input.dispatchEvent(composing);
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      const confirmEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      input.dispatchEvent(confirmEnter);
      document.querySelector("#chatbar").requestSubmit();
    });
    await naco.waitForTimeout(40);
    assert((await naco.locator("#chat-input").inputValue()) === "選字中", "選字時的 Enter 不該送出");
    assert(!(await naco.evaluate(() => window.office.bubbles.some((bubble) => bubble.text.includes("選字")))), "選字內容不該變成泡泡");

    await naco.locator("#chat-input").fill("午安");
    await naco.locator("#chat-input").press("Enter");
    await momo.waitForFunction(() => window.office.bubbles.some((bubble) => bubble.id === "naco" && bubble.text.includes("午安")));
    await shot(momo, "chat-bubble");

    const hanaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const hana = await hanaContext.newPage();
    hana.on("pageerror", (error) => console.log("PAGE", error.message));
    hana.on("console", (msg) => {
      if (msg.type() === "error") console.log("CONSOLE", msg.text());
    });
    await register(hana, "hana", "花", "狗");
    await naco.evaluate(() => window.office.place(640, 340));
    await momo.evaluate(() => window.office.place(730, 340));
    await march(hana, 900, 340);
    await naco.waitForFunction(() => {
      const other = window.office.others.find((person) => person.id === "momo");
      return other && Math.hypot(window.office.me.x - other.x, window.office.me.y - other.y) < 112;
    });
    await naco.waitForFunction(() => document.querySelector("#hint").textContent.includes("按 F 跟 @momo 說悄悄話"));
    await naco.locator("#chat-input").blur();
    await naco.keyboard.press("f");
    await naco.waitForFunction(() => window.office.group.includes("momo") && window.office.group.includes("naco") && window.office.group.length === 2);
    await momo.waitForFunction(() => window.office.group.includes("naco") && window.office.group.length === 2);
    await momo.waitForFunction(() => document.querySelector("#hint").textContent.includes("@naco") && document.querySelector("#hint").textContent.includes("悄悄話"));
    await naco.waitForFunction(() => {
      const label = document.querySelector("#chat-whisper-label");
      const list = document.querySelector("#chat-whisper-list");
      return label && label.textContent === "悄悄話（2 人）" && list.textContent.includes("@momo") && list.textContent.includes("@naco");
    });
    await naco.locator("#chat-input").focus();
    await naco.keyboard.press("f");
    assert((await naco.evaluate(() => window.office.group.includes("momo"))) , "打字時按 F 不該離開悄悄話");
    await naco.locator("#chat-input").fill("秘密桃子");
    await naco.locator("#chat-input").press("Enter");
    await momo.waitForFunction(() => window.office.bubbles.some((bubble) => bubble.whisper && bubble.text.includes("秘密桃子")));
    await momo.waitForFunction(() => {
      const node = document.querySelector('.floater[data-id="naco"] .bubble');
      return node && node.classList.contains("whisper") && node.textContent.includes("秘密桃子");
    });
    await hana.waitForFunction(() => {
      const mine = document.querySelector('.floater[data-id="naco"] .bubble');
      const hers = document.querySelector('.floater[data-id="momo"] .bubble');
      return mine && hers && mine.classList.contains("secret") && hers.classList.contains("secret") && mine.textContent.includes("對話中") && hers.textContent.includes("對話中");
    });
    const leaked = await hana.evaluate(() => window.office.tape.some((item) => JSON.stringify(item).includes("秘密桃子")) || window.office.bubbles.some((bubble) => bubble.text.includes("秘密桃子")));
    assert(!leaked, "旁觀者不該收到悄悄話內容");
    await momo.evaluate(() => window.office.setView({ dist: 860 }));
    await momo.waitForTimeout(350);
    await shot(momo, "whisper-participant");
    await hana.evaluate(() => window.office.setView({ dist: 1100 }));
    await hana.waitForTimeout(350);
    await shot(hana, "whisper-outsider");
    const joinSpot = await hana.evaluate(() => {
      const partner = window.office.others.find((person) => person.id === "momo") || window.office.others.find((person) => person.id === "naco");
      return { x: partner.x + 64, y: partner.y };
    });
    await march(hana, joinSpot.x, joinSpot.y);
    await hana.waitForFunction(() => document.querySelector("#hint").textContent.includes("想加入"));
    await hana.locator("#chat-input").blur();
    await hana.keyboard.press("f");
    await naco.waitForFunction(() => window.office.asks.some((ask) => ask.id === "hana"));
    await momo.waitForFunction(() => window.office.asks.some((ask) => ask.id === "hana"));
    await naco.getByRole("button", { name: "婉拒" }).click();
    await naco.waitForFunction(() => !window.office.asks.some((ask) => ask.id === "hana"));
    assert(!(await hana.evaluate(() => window.office.group.includes("hana"))), "婉拒不該把人加進悄悄話");
    await momo.getByRole("button", { name: "答應" }).click();
    await hana.waitForFunction(() => window.office.group.includes("hana") && window.office.group.length === 3);
    await naco.waitForFunction(() => window.office.group.length === 3);
    await naco.locator("#chat-input").fill("圈內第二句");
    await naco.locator("#chat-input").press("Enter");
    await hana.waitForFunction(() => window.office.bubbles.some((bubble) => bubble.whisper && bubble.text.includes("圈內第二句")));
    const away = await hana.evaluate(() => {
      const partner = window.office.others.find((person) => person.id === "momo");
      const x = partner.x + 420 > 1180 ? partner.x - 420 : partner.x + 420;
      return { x, y: partner.y };
    });
    await march(hana, away.x, away.y);
    await hana.waitForFunction(() => !window.office.whisper);
    await naco.waitForFunction(() => {
      const group = window.office.group;
      return group.includes("naco") && group.includes("momo") && !group.includes("hana") && group.length === 2;
    });
    const split = await momo.evaluate(() => {
      const partner = window.office.others.find((person) => person.id === "naco");
      const west = { x: 96, y: partner.y };
      const east = { x: 480, y: partner.y };
      const clear = (spot) => Math.hypot(spot.x - partner.x, spot.y - partner.y) > 220 && spot.x > 64 && spot.x < 520;
      if (clear(west)) return west;
      return east;
    });
    await march(momo, split.x, split.y);
    await naco.waitForFunction(() => !window.office.whisper);
    await momo.waitForFunction(() => !window.office.whisper);
    await hana.close();
    await hanaContext.close();
    await naco.evaluate(({ yaw, dist }) => window.office.setView({ yaw, dist }), { yaw: isoYaw, dist: isoDist });
    await momo.evaluate(({ yaw, dist }) => window.office.setView({ yaw, dist }), { yaw: isoYaw, dist: isoDist });

    await naco.evaluate(() => window.office.socket.close());
    await naco.waitForFunction(() => document.querySelector("#conn").textContent.includes("重新連線"));
    await naco.waitForFunction(() => document.querySelector("#conn").textContent.includes("已連線"), null, { timeout: 10000 });

    const blocked = await naco.evaluate(async () => {
      const response = await fetch("/api/office/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${localStorage.getItem("office_session")}`,
        },
        body: JSON.stringify({ animal: "fox" }),
      });
      return response.status;
    });
    assert(blocked === 403, `辦公室裡不該能直接換造型，狀態 ${blocked}`);

    await clickWalk(naco, 176, 880);
    await naco.waitForFunction(() => window.office.zone === "男廁", null, { timeout: 8000 });
    await naco.waitForTimeout(300);
    await naco.keyboard.press("e");
    await naco.getByRole("heading", { name: "廁所鏡子" }).waitFor();
    await naco.getByRole("button", { name: "貓熊", exact: true }).click();
    await shot(naco, "restroom-avatar");
    await naco.getByRole("button", { name: "換上這個造型" }).click();
    await naco.locator("#avatar").waitFor({ state: "hidden" });
    await momo.waitForFunction(() => window.office.others.some((person) => person.id === "naco" && person.animal === "panda"));

    await clickWalk(naco, 224, 208);
    await naco.waitForFunction(() => {
      const me = window.office.me;
      return Math.hypot(me.x - 224, me.y - 208) < 36;
    });
    await naco.waitForTimeout(350);
    await naco.keyboard.press("e");
    await naco.getByRole("button", { name: "調整設備擺設" }).click();
    await naco.waitForFunction(() => window.office.editing);
    await naco.getByRole("button", { name: "辦公區" }).click();
    await naco.evaluate(() => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      window.office.focusOn(item.x + 18, item.y + 12);
    });
    await naco.waitForFunction(() => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      const point = window.office.worldToScreen(item.x + 18, item.y + 12);
      const dest = window.office.worldToScreen(item.x + 18 + 36, item.y + 12);
      const bar = document.getElementById("editbar").getBoundingClientRect().bottom;
      const onScreen = (spot) => spot.x > 40 && spot.x < 1380 && spot.y > bar + 8 && spot.y < 860;
      const prev = window.__furnStable;
      window.__furnStable = { x: point.x, y: point.y, dx: dest.x, dy: dest.y };
      if (!prev) return false;
      const still = Math.hypot(point.x - prev.x, point.y - prev.y) < 0.4
        && Math.hypot(dest.x - prev.dx, dest.y - prev.dy) < 0.4;
      return still && onScreen(point) && onScreen(dest);
    });
    const origin = await naco.evaluate(() => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      return {
        x: item.x,
        y: item.y,
        point: window.office.worldToScreen(item.x + 18, item.y + 12),
        dest: window.office.worldToScreen(item.x + 18 + 36, item.y + 12),
      };
    });
    await naco.mouse.move(origin.point.x, origin.point.y);
    await naco.mouse.down();
    await naco.mouse.move(origin.dest.x, origin.dest.y, { steps: 8 });
    await naco.mouse.up();
    await momo.waitForFunction((start) => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      return item && Math.hypot(item.x - start.x, item.y - start.y) > 24;
    }, origin);
    await shot(naco, "edit-furniture");
    const movedFurn = await momo.evaluate(() => window.office.furniture.find((furn) => furn.id === "desk-1-monitor"));
    await naco.reload();
    await ready(naco);
    const afterReload = await naco.evaluate(() => window.office.furniture.find((furn) => furn.id === "desk-1-monitor"));
    assert(Math.abs(afterReload.x - movedFurn.x) < 1.5 && Math.abs(afterReload.y - movedFurn.y) < 1.5, "重新整理後螢幕位置不一樣");
    assert(afterReload.x !== origin.x || afterReload.y !== origin.y, "螢幕沒有被搬動");
    await shot(naco, "furniture-persisted");
    const deskCount = await naco.evaluate(() => window.office.furniture.filter((item) => item.kind === "monitor").length);
    assert(deskCount === 10, `螢幕應該有 10 個，實際 ${deskCount}`);

    const anonScore = await fetch(`${ORIGIN}/api/office/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: "zip", op: "solve" }),
    });
    assert(anonScore.status === 401, `未登入記分應為 401，實際 ${anonScore.status}`);
    const huge = await naco.evaluate(async () => {
      const response = await fetch("/api/office/score", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${localStorage.getItem("office_session")}`,
        },
        body: JSON.stringify({ game: "cat2048", score: 999999999 }),
      });
      return response.status;
    });
    assert(huge === 400, `過大的分數應為 400，實際 ${huge}`);

    await walkTo(naco, 962, 156);
    await naco.keyboard.press("e");
    await naco.locator("#arcade").waitFor({ state: "visible" });
    await naco.waitForFunction(() => {
      const frame = document.querySelector("#arcade-frame");
      return frame && frame.contentDocument && frame.contentDocument.querySelector("h1");
    });
    const gamesFrame = naco.frames().find((frame) => frame.url().includes("/games"));
    assert(gamesFrame, "街機沒有打開大廳");
    await gamesFrame.getByRole("heading", { name: "小遊戲大廳" }).waitFor();
    await gamesFrame.getByRole("button", { name: "回到辦公室" }).waitFor();
    assert((await naco.evaluate(() => window.office.connected)) === true, "玩遊戲時連線不該斷");
    await gamesFrame.evaluate(() => {
      const child = document.createElement("iframe");
      child.srcdoc = "<script>parent.postMessage({officeSolve:'zip'},'*')</script>";
      document.body.appendChild(child);
    });
    await naco.waitForFunction(async () => {
      const response = await fetch("/api/office/leaderboard", {
        headers: { authorization: `Bearer ${localStorage.getItem("office_session")}` },
      });
      const data = await response.json();
      const zip = (data.games || []).find((game) => game.id === "zip");
      return Boolean(zip && zip.me && zip.me.score >= 1);
    });
    await naco.locator("#arcade-close").click();
    await naco.locator("#arcade").waitFor({ state: "hidden" });
    assert((await naco.evaluate(() => window.office.connected && !window.office.arcade)) === true, "關掉街機後應該還在辦公室");
    await naco.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "e" }));
    });
    await naco.locator("#arcade").waitFor({ state: "visible" });
    await naco.waitForFunction(() => {
      const frame = document.querySelector("#arcade-frame");
      return frame && frame.contentDocument && frame.contentDocument.querySelector(".office-close");
    });
    const reopened = naco.frames().find((frame) => frame.url().includes("/games"));
    await reopened.getByRole("button", { name: "回到辦公室" }).click();
    await naco.locator("#arcade").waitFor({ state: "hidden" });
    assert((await naco.evaluate(() => window.office.connected && !window.office.arcade)) === true, "從大廳回到辦公室後應該還在線");

    await walkTo(naco, 1064, 240);
    await naco.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "e" }));
    });
    await naco.getByRole("heading", { name: "排行榜" }).waitFor();
    await naco.getByRole("button", { name: "Zip", exact: true }).click();
    await naco.locator("#board-list .me").waitFor();
    await naco.locator("#board-list").getByText("@naco").waitFor();
    await naco.locator("#board-close").click();

    await admin.locator('tr[data-id="momo"] button', { hasText: "踢出" }).click();
    await momo.getByText("請出辦公室").waitFor();
    await momo.getByLabel("辦公室密碼").fill(PASS);
    await momo.getByRole("button", { name: "進入", exact: true }).click();
    await ready(momo);
    assert((await momo.evaluate(() => window.office.me.id)) === "momo", "踢出後應該回到原來的 ID");

    await admin.getByLabel("新的辦公室密碼").fill(PASS2);
    await admin.getByLabel("再輸入一次").fill(PASS2);
    await admin.getByRole("button", { name: "儲存新密碼" }).click();
    await naco.getByText("密碼已更新").waitFor();
    await naco.getByLabel("辦公室密碼").fill(PASS);
    await naco.getByRole("button", { name: "進入", exact: true }).click();
    await naco.getByText("密碼不正確").waitFor();
    await naco.getByLabel("辦公室密碼").fill(PASS2);
    await naco.getByRole("button", { name: "進入", exact: true }).click();
    await ready(naco);
    assert((await naco.locator("#form-register").isHidden()) === true, "舊裝置不該重填 ID");
    assert((await naco.evaluate(() => window.office.me.id)) === "naco", "換密碼後 ID 不對");
    assert((await naco.evaluate(() => window.office.me.animal)) === "panda", "換密碼後造型不見了");

    const fresh = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const mika = await fresh.newPage();
    await mika.goto(`${ORIGIN}/`);
    await mika.getByLabel("辦公室密碼").fill(PASS2);
    await mika.getByRole("button", { name: "進入", exact: true }).click();
    await mika.getByLabel("你的 ID").fill("naco");
    await mika.locator("#office-name").fill("別人");
    await mika.getByRole("button", { name: "下一步" }).click();
    await mika.getByText("已經有人使用").waitFor();
    await mika.getByLabel("你的 ID").fill("mika");
    await mika.locator("#office-name").fill("米卡");
    await mika.getByRole("button", { name: "下一步" }).click();
    await mika.getByRole("button", { name: "狐", exact: true }).click();
    await mika.getByRole("button", { name: "進入辦公室" }).click();
    await ready(mika);
    await admin.locator('tr[data-id="mika"]').waitFor();
    await admin.locator('tr[data-id="mika"] button', { hasText: "移除" }).click();
    await mika.getByText("已被管理員移除").waitFor();

    mkdirSync(ARTIFACTS, { recursive: true });
    for (const item of saved) cpSync(item.file, `${ARTIFACTS}/${item.name}.png`);
    console.log("e2e ok");
  } finally {
    await browser?.close();
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
