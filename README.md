# 小遊戲大廳

七款可離線遊玩的瀏覽器小遊戲，集中在大廳 `/games`。網站首頁 `/` 是多人虛擬辦公室。靜態檔在 `public/`。辦公室的登入、在線、擺設與遊戲分數走 Worker 裡的一個 SQLite Durable Object。

大廳（`public/games/index.html`）是單一自含檔。每款小遊戲以 `<iframe srcdoc>` 嵌在裡面，網址 hash（例如 `/games#zip`）決定正在玩哪一款。`/office` 會轉到 `/`。管理頁仍在 `/office/admin`。

## 遊戲

| 檔案 | 大廳卡片 | 玩法 |
| --- | --- | --- |
| `games/zip.html` | Zip | 一筆畫連起所有數字並填滿格子 |
| `games/queens.html` | Queens 貓掌版 | 每列、每欄、每色塊各放一個貓掌 |
| `games/sudoku.html` | Mini Sudoku 迷你數獨 | 6×6 數獨，填入 1～6 |
| `games/patches.html` | Patches 拼布 | 依提示把網格切成長方形 |
| `games/match3.html` | 皇家消消樂 | 三消闖關：火箭、炸彈、彩虹球，共 10 關 |
| `games/bbq.html` | 燒肉屋｜炭火小老闆 | 炭火烤肉經營，掌握火候服務客人達成每日目標 |
| `games/cat2048.html` | 2048 貓咪進化 | 合併相同貓咪，從小奶貓一路養到貓王 |

`games/bbq.html` 是燒肉屋的原始檔，請保持原樣，不要改寫遊戲邏輯。各遊戲都能單獨用瀏覽器打開；大廳只負責選單、返回，以及下面說的存檔橋接。

## 虛擬辦公室

進入 `/` 要一把**全辦公室共用的密碼**。管理員在 `/office/admin` 設定或更換這把密碼。訪客輸入密碼後，自己取一個還沒人用的 ID 和顯示名稱。畫面上的名字旁邊會有小字 `@id`。

遊戲室裡的街機（按 E）會在辦公室上面打開 `/games?from=office`，連線不會斷。這時破關或最高分會記到這個人的 ID。直接打開 `/games` 不會記分，也不用登入。排行榜在遊戲室另一塊板子上，每款遊戲前 10 名。燒肉屋的 `games/bbq.html` 不修改；大廳只在從辦公室打開時，讀它原本就會寫的最高營收。

同一台瀏覽器會記住登入。管理員更換密碼後，所有人要重輸入新密碼，但這台裝置仍回到原來的 ID、名字與造型。別的裝置不能佔用已經登記的 ID。踢出只清掉這次登入；移除會刪掉這個 ID，之後別人才能再用。

## 目錄

- `games/`：各遊戲的獨立 HTML。改玩法或畫面時只改這裡，然後執行 `npm run build`。
- `scripts/build.mjs`：讀取 `games/*.html`，重生 `public/games/index.html`，並在大廳加上回到辦公室的入口。有安裝 TypeScript 時會順便做型別檢查。
- `public/games/index.html`：實際部署的大廳。不要手動編輯，用建置指令產生。
- `public/index.html`：辦公室入口。
- `public/office/`：辦公室的程式、樣式與管理頁。`/office` 會轉回 `/`。
- `src/index.ts`：把 `/api/office` 轉給 Durable Object，其餘交給靜態檔。
- `src/office-room.ts`：辦公室 Durable Object。
- `src/content.ts`：地圖、動物、設備。
- `wrangler.toml`：Worker 名稱 `min-games`，靜態資源目錄 `./public`，SQLite Durable Object `OfficeRoom`。

## 新增一款遊戲

1. 把完整、可單獨開啟的 HTML 放到 `games/<id>.html`。`<id>` 會變成網址 hash，只能用大廳裡還沒用過的名稱。
2. 打開 `scripts/build.mjs`，在 `GAMES` 陣列加上一筆（順序即卡片順序）：
   - `id`：檔名（不含 `.html`）
   - `title`：卡片標題
   - `desc`：卡片說明
   - `iconStyle`：卡片底色，例如 `background:linear-gradient(135deg,#ff9a3c,#ff5f6d)`
   - `icon`：卡片上的 `<svg>...</svg>`
   - `name`（可省略）：進入遊戲後頂列與分頁標題。省略時沿用 `title`。燒肉屋的卡片是「燒肉屋｜炭火小老闆」，頂列則是較短的「燒肉屋」。
3. 執行 `npm run build`。腳本會檢查 `games/*.html` 與 `GAMES` 是否一一對應，多檔或少檔都會失敗。
4. 把 `games/<id>.html` 和重新產生的 `public/index.html` 一起提交。

### srcdoc 跳脫

遊戲 HTML 會放進大廳 `<script>` 裡的 JavaScript 字串。建置時先做 `JSON.stringify`（處理引號、反斜線與換行），再把每個 `</` 寫成 `<\/`。這樣遊戲自己的 `</script>` 就不會把大廳的 script 提前結束。iframe 讀到的 `srcdoc` 仍是原本的遊戲檔。

### 存檔橋接（postMessage）

`srcdoc` iframe 理論上與大廳同源，但部分環境裡 iframe 的 `localStorage` 會失敗。大廳因此聽 `message`，代為寫入自己的 `localStorage`：

- 通用：遊戲送 `{lobbySave:{key, val}}` 寫入，送 `{lobbyLoad:key}` 讀取。父頁把資料存在 `lobby_<key>`，並回 `{lobbyData:{key, val}}`。2048 貓咪進化使用這組。
- 皇家消消樂沿用自己的訊息：送 `{m3save:進度}` 與 `{m3load:1}`。父頁存在 `lobby_m3`，並回 `{m3data:進度}`。

新遊戲若需要跨重新載入的進度，請沿用 `lobbySave` / `lobbyLoad`，並在寫入失敗時忽略錯誤。燒肉屋目前直接使用 `localStorage` 鍵 `yakiniku_best_v1`（失敗就略過），沒有走這座橋。

## 架構（辦公室）

即時狀態放在**一個 SQLite Durable Object** 裡。

- 房間裡的人、位置、聊天、設備擺設都走這個 Durable Object 的 WebSocket。
- WebSocket 使用可休眠的 Hibernation API。沒人傳訊息時不會一直醒著計費。
- 成員、密碼雜湊、造型、設備座標存在同一個 Durable Object 的 SQLite。
- 走路座標放在連線附件裡，大約每 4 秒才寫回資料庫，避免把免費方案的寫入額度用完。
- 不使用 KV、D1，也不使用舊的 key-value Durable Object。免費方案只允許 SQLite 後端。

以目前的免費額度，一間給同事用的小辦公室放得下：Durable Object 請求大約每天 10 萬次（WebSocket 進來的訊息以 20 則折 1 次請求）、SQLite 寫入大約每天 10 萬列、儲存總量約 5 GB。位置同步有做節流。若人數或停留時間大很多，再考慮 Workers 付費方案即可，程式不用改架構。

## 本地執行

```bash
npm install
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars 裡的 ADMIN_TOKEN
npm run dev
```

打開 <http://127.0.0.1:8787/office/admin> 輸入 `ADMIN_TOKEN`，設定辦公室密碼，再到 `/` 用那把密碼登記 ID。大廳在 <http://127.0.0.1:8787/games>。

端對端測試（會自己開 `wrangler dev`）：

```bash
npx playwright install chromium
npm run test:e2e
```

## 建置

```bash
npm run build
```

等同 `node scripts/build.mjs`。它會覆寫 `public/games/index.html`。沒有安裝開發依賴時，仍會產生大廳，並略過型別檢查。

## 部署

Cloudflare Git 建置維持：

- 建置指令：`npm run build`
- 部署指令：`npx wrangler deploy`

`wrangler.toml` 有 Worker 進入點 `src/index.ts`。靜態大廳與小遊戲仍從 `public/` 送出；只有 `/api/*` 先進 Worker。第一次部署會套用 `[[migrations]]`（tag `v1`），建立 SQLite Durable Object `OfficeRoom`。之後不要刪掉這段 migration，也不要把這個 class 改成 key-value 後端。

### 一定要設定的密鑰

只有 **`ADMIN_TOKEN`**。辦公室密碼不是 Wrangler secret，要在管理頁設定。

```bash
npx wrangler secret put ADMIN_TOKEN
```

或是到 Cloudflare 控制台：Workers → `min-games` → Settings → Variables and Secrets，新增 Secret `ADMIN_TOKEN`。

沒有這個密鑰時，`/office/admin` 無法登入。密鑰是在最外層 Worker 讀的，不要寫進 `wrangler.toml` 的 `[vars]`（同名變數會在部署時蓋掉 Secret）。`keep_vars = true` 讓控制台上的純文字變數不會被下次 `wrangler deploy` 清掉；Secret 本身部署時會保留。

確認這次部署看得到密鑰（只回布林，沒有內容）：

```bash
curl https://你的網域/api/office/admin/health
# {"hasAdminToken":true}
```

### 上線後

1. 打開 `https://你的網域/office/admin`，輸入 `ADMIN_TOKEN`。
2. 設定辦公室密碼，把密碼給要進來的人。
3. 對方打開 `/`，輸入密碼，再取一個沒人用過的 ID 與顯示名稱。
4. 第一次會選小動物。這台瀏覽器會記住登入，下次不用重填。
5. 更換辦公室密碼會讓所有人重新輸入密碼。同一台裝置仍回到原來的 ID 與造型。
6. 管理頁可以看誰在線、踢下線，或移除 ID。移除之後，別人才能再用那個 ID。

## 怎麼玩辦公室

- WASD 或方向鍵移動，也可以點地板走過去。
- 名字下面會顯示小字 `@id`。
- 靠近櫃檯的 Kiki 小姐，按 E 或點她，可以拖曳、旋轉、新增或收回螢幕、鍵盤、滑鼠和其他設備。牆壁與房間不能改。擺設會存到伺服器，大家看得到。
- 走進男廁或女廁，按 E 才能換動物與配件。
- 視窗下方輸入訊息，Enter 送出，會出現在頭頂幾秒。中文輸入法選字時的 Enter 不會送出。
- 右上角是在線名單。斷線會自動重連。
- 遊戲室粉紅色街機按 E 玩小遊戲，旁邊的排行榜按 E 看成績。直接開 `/games` 只在自己的瀏覽器玩，不會上榜。
