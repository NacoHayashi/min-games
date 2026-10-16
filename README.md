# 小遊戲大廳

七款可離線遊玩的瀏覽器小遊戲，集中在同一個大廳頁。部署方式是 Cloudflare Worker 的靜態資源（Workers Assets）：整個網站就是 `public/` 裡的檔案，沒有 `worker.js`。

大廳（`public/index.html`）是單一自含檔。每款遊戲以 `<iframe srcdoc>` 嵌在裡面，網址 hash（例如 `#zip`）決定正在玩哪一款。

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

## 目錄

- `games/`：各遊戲的獨立 HTML。改玩法或畫面時只改這裡，然後執行 `npm run build`。
- `scripts/build.mjs`：無相依套件。讀取 `games/*.html`，重生 `public/index.html`。
- `public/index.html`：實際部署的大廳。不要手動編輯，用建置指令產生。
- `wrangler.toml`：Worker 名稱 `min-games`，靜態資源目錄 `./public`。

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

## 建置

不需要安裝套件：

```bash
npm run build
```

等同 `node scripts/build.mjs`。它會覆寫 `public/index.html`。

## 部署

### 本機

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler.toml` 只宣告靜態資源，部署時不要加 `worker.js`。上線後網站根路徑就是大廳。

### 把 Cloudflare 接到這個儲存庫

使用 Cloudflare Workers 的 Git 連線建置（Workers Builds）：

1. 打開 [Cloudflare 控制台](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**（或 Import a repository）。
2. 授權 GitHub，選取 `NacoHayashi/min-games`，生產分支設為 `main`。
3. 建置指令留空即可，因為 `public/index.html` 已經在儲存庫裡。若希望每次部署都從 `games/` 重生大廳，把建置指令設成 `npm run build`。
4. 部署指令設成 `npx wrangler deploy`（這也是 Cloudflare Git 建置的預設部署指令）。
5. 確認根目錄的 `wrangler.toml` 被採用：Worker 名稱是 `min-games`，`[assets] directory = "./public"`。帳號與 API token 由 Git 連線自動提供，不必寫進設定檔。
6. 儲存並部署。之後推上 `main` 就會自動再部署。

非生產分支若也要預覽，在同一組設定裡為其他分支加上部署指令 `npx wrangler deploy`，或依控制台的預覽分支選項處理。
