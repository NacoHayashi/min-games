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
  await page.waitForFunction(() => window.office && window.office.ready, null, { timeout: 15000 });
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
  await page.goto(`${ORIGIN}/office/`);
  await page.getByLabel("辦公室密碼").fill(PASS);
  await page.getByRole("button", { name: "進入", exact: true }).click();
  await page.getByLabel("你的 ID").waitFor();
  await page.getByLabel("你的 ID").fill(id);
  await page.locator("#office-name").fill(name);
  if (id === "naco") await shot(page, "register-id");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: animal, exact: true }).click();
  if (id === "naco") {
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

    browser = await chromium.launch();
    const lobby = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await lobby.goto(`${ORIGIN}/`);
    await lobby.getByRole("heading", { name: "小遊戲大廳" }).waitFor();
    await lobby.getByRole("link", { name: /虛擬辦公室/ }).waitFor();
    await lobby.getByRole("link", { name: /燒肉屋/ }).waitFor();
    await shot(lobby, "lobby");
    await lobby.getByRole("link", { name: /^Zip/ }).click();
    await lobby.locator("iframe.on").waitFor();
    await lobby.getByRole("button", { name: "← 大廳" }).click();
    await lobby.getByRole("heading", { name: "小遊戲大廳" }).waitFor();
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

    await naco.goto(`${ORIGIN}/office/`);
    await naco.getByLabel("辦公室密碼").waitFor();
    await shot(naco, "entry-password");

    const bad = await nacoContext.request.post(`${ORIGIN}/api/office/login`, { data: { password: "nope", deviceKey: "ab".repeat(20) } });
    assert(bad.status() === 401, `錯誤密碼應為 401，實際 ${bad.status()}`);

    await register(naco, "naco", "納可", "貓");
    assert((await naco.evaluate(() => window.office.me.accessories.hat)) === "beanie", "毛帽沒有存下來");

    await momo.goto(`${ORIGIN}/office/`);
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
    await shot(naco, "office-two-players");

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
    await naco.waitForFunction(() => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      const point = window.office.worldToScreen(item.x + 18, item.y + 12);
      return point.x > 30 && point.x < 1360 && point.y > 150 && point.y < 800;
    });
    await naco.waitForTimeout(450);
    const origin = await naco.evaluate(() => {
      const item = window.office.furniture.find((furn) => furn.id === "desk-1-monitor");
      return { x: item.x, y: item.y, point: window.office.worldToScreen(item.x + 18, item.y + 12) };
    });
    await naco.mouse.move(origin.point.x, origin.point.y);
    await naco.mouse.down();
    await naco.mouse.move(origin.point.x + 72, origin.point.y + 36, { steps: 8 });
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
    await mika.goto(`${ORIGIN}/office/`);
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
