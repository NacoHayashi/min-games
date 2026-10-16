/**
 * Rebuild public/index.html from games/*.html.
 *
 * The lobby is one self-contained page. Each game is embedded as an iframe
 * srcdoc string inside a <script> block. Strings are JSON-encoded, then every
 * "</" is written as "<\/" so a game's </script> cannot close the lobby script.
 *
 * Card copy, icons, and the parent postMessage storage bridge are reproduced
 * from the original lobby. srcdoc documents share this page's origin, but
 * 皇家消消樂 and 2048 貓咪進化 still mirror progress to the parent because
 * localStorage inside the frame can fail. The bridge stores:
 *   {lobbySave:{key,val}} / {lobbyLoad:key}  ->  localStorage "lobby_"+key
 *       reply: {lobbyData:{key,val}}
 *   {m3save} / {m3load}                      ->  localStorage "lobby_m3"
 *       reply: {m3data}
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gamesDir = join(root, "games");
const outFile = join(root, "public", "index.html");

/** Lobby order. `name` is the in-game header; it defaults to `title`. */
const GAMES = [
  {
    id: "zip",
    title: "Zip",
    desc: "一筆畫連起所有數字並填滿格子",
    iconStyle: "background:linear-gradient(135deg,#ff9a3c,#ff5f6d)",
    icon: '<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M22 25H78V50H22V75H78"/></svg>',
  },
  {
    id: "queens",
    title: "Queens 貓掌版",
    desc: "每列、每欄、每色塊各放一個貓掌",
    iconStyle: "background:linear-gradient(135deg,#b07cff,#7b5cff)",
    icon: '<svg viewBox="0 0 100 100" fill="#fff"><ellipse cx="50" cy="66" rx="22" ry="18"/><ellipse cx="22" cy="40" rx="9" ry="12" transform="rotate(-25 22 40)"/><ellipse cx="40" cy="25" rx="9" ry="12" transform="rotate(-8 40 25)"/><ellipse cx="60" cy="25" rx="9" ry="12" transform="rotate(8 60 25)"/><ellipse cx="78" cy="40" rx="9" ry="12" transform="rotate(25 78 40)"/></svg>',
  },
  {
    id: "sudoku",
    title: "Mini Sudoku 迷你數獨",
    desc: "6×6 數獨，填入 1～6",
    iconStyle: "background:linear-gradient(135deg,#4fc3f7,#0a66c2)",
    icon: '<svg viewBox="0 0 100 100"><text x="50" y="58" text-anchor="middle" dominant-baseline="middle" font-size="52" font-weight="800" fill="#fff" font-family="sans-serif">6</text><rect x="12" y="12" width="76" height="76" rx="10" fill="none" stroke="#fff" stroke-width="7"/></svg>',
  },
  {
    id: "patches",
    title: "Patches 拼布",
    desc: "依提示把網格切成長方形",
    iconStyle: "background:linear-gradient(135deg,#5fd39a,#1f9e6e)",
    icon: '<svg viewBox="0 0 100 100" fill="#fff"><rect x="12" y="12" width="44" height="30" rx="6"/><rect x="62" y="12" width="26" height="76" rx="6"/><rect x="12" y="48" width="44" height="40" rx="6" opacity=".7"/></svg>',
  },
  {
    id: "match3",
    title: "皇家消消樂",
    desc: "三消闖關：火箭、炸彈、彩虹球，共 10 關",
    iconStyle: "background:linear-gradient(135deg,#ffb36b,#ff6fa5)",
    icon: '<svg viewBox="0 0 100 100"><path d="M14 72L20 30L38 50L50 22L62 50L80 30L86 72Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="60" r="8" fill="#ff7aa8"/></svg>',
  },
  {
    id: "bbq",
    title: "燒肉屋｜炭火小老闆",
    name: "燒肉屋",
    desc: "炭火烤肉經營，掌握火候服務客人達成每日目標",
    iconStyle: "background:linear-gradient(135deg,#ff8a4c,#c0392b)",
    icon: '<svg viewBox="0 0 100 100"><path d="M18 46H82A32 30 0 0 1 18 46Z" fill="#fff"/><g stroke="#fff" stroke-width="4"><path d="M14 46H86"/><path d="M34 74L26 92M66 74L74 92"/></g><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M34 34Q28 26 34 18"/><path d="M50 34Q44 24 50 14"/><path d="M66 34Q60 26 66 18"/></g></svg>',
  },
  {
    id: "cat2048",
    title: "2048 貓咪進化",
    desc: "合併相同貓咪，從小奶貓一路養到貓王",
    iconStyle: "background:linear-gradient(135deg,#ffc58a,#e8935a)",
    icon: '<svg viewBox="0 0 100 100"><path d="M16 48L22 12L44 32Z M84 48L78 12L56 32Z" fill="#fff"/><ellipse cx="50" cy="58" rx="36" ry="30" fill="#fff"/><circle cx="38" cy="56" r="5" fill="#e8935a"/><circle cx="62" cy="56" r="5" fill="#e8935a"/><path d="M46 65H54L50 69Z" fill="#ff8fa3"/></svg>',
  },
];

function htmlText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** JSON string literal safe to place inside the lobby <script>. */
function srcdocLiteral(html) {
  return JSON.stringify(html).replaceAll("</", "<\\/");
}

function card(game) {
  return (
    `<a class="card" href="#${game.id}">` +
    `<div class="ic" style="${game.iconStyle}">${game.icon}</div>` +
    `<div class="tx"><b>${htmlText(game.title)}</b><span>${htmlText(game.desc)}</span></div>` +
    `<span class="go">開始</span></a>`
  );
}

/** Real page, not an embedded game: the office needs its own WebSocket. */
function officeCard() {
  return (
    `<a class="card" href="/office/">` +
    `<div class="ic" style="background:linear-gradient(135deg,#f7b4d4,#7aa2ff)">` +
    `<svg viewBox="0 0 100 100" fill="#fff"><rect x="18" y="28" width="64" height="52" rx="8"/>` +
    `<rect x="30" y="40" width="16" height="12" rx="2" fill="#7aa2ff"/>` +
    `<rect x="54" y="40" width="16" height="12" rx="2" fill="#7aa2ff"/>` +
    `<rect x="42" y="60" width="16" height="20" rx="2" fill="#f7b4d4"/></svg></div>` +
    `<div class="tx"><b>虛擬辦公室</b><span>輸入共用密碼，和同事一起走動、聊天、擺設備</span></div>` +
    `<span class="go">進入</span></a>`
  );
}

const known = new Set(GAMES.map((g) => `${g.id}.html`));
const present = readdirSync(gamesDir).filter((name) => name.endsWith(".html"));
const missing = [...known].filter((name) => !present.includes(name));
const extra = present.filter((name) => !known.has(name));
if (missing.length || extra.length) {
  const lines = [];
  if (missing.length) lines.push(`missing games: ${missing.join(", ")}`);
  if (extra.length) lines.push(`not listed in scripts/build.mjs: ${extra.join(", ")}`);
  throw new Error(lines.join("\n"));
}

const embedded = GAMES.map((game) => {
  const html = readFileSync(join(gamesDir, `${game.id}.html`), "utf8");
  return `${JSON.stringify(game.id)}: ${srcdocLiteral(html)}`;
}).join(", ");

const names = GAMES.map((game) => {
  return `${JSON.stringify(game.id)}: ${JSON.stringify(game.name ?? game.title)}`;
}).join(", ");

const html = `<!DOCTYPE html><html lang="zh-Hant-TW"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>小遊戲大廳</title>
<style>*{box-sizing:border-box}html,body{margin:0;height:100%}body{font-family:-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;background:#f4f2ee;color:#1d1d1d}
#lobby{max-width:560px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px;font-size:28px}.sub{margin:0 0 20px;color:#666}
.card{display:flex;align-items:center;gap:14px;background:#fff;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);text-decoration:none;color:inherit;transition:transform .15s}
.card:active{transform:scale(.98)}.ic{flex:none;width:58px;height:58px;border-radius:14px;padding:11px}.ic svg{width:100%;height:100%;display:block}
.tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.tx b{font-size:17px}.tx span{font-size:13px;color:#666}
.go{flex:none;background:#0a66c2;color:#fff;border-radius:999px;padding:8px 18px;font-weight:600;font-size:15px}
#game{display:none;position:fixed;inset:0;flex-direction:column;background:#f4f2ee}#game.show{display:flex}
.top{flex:none;height:48px;display:flex;align-items:center;gap:10px;padding:0 10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.top button{font:inherit;font-size:15px;padding:6px 14px;border-radius:999px;border:1.5px solid #0a66c2;background:#fff;color:#0a66c2;cursor:pointer}
.top b{font-size:16px}#frames{flex:1;position:relative}iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none}iframe.on{display:block}
</style></head><body>
<div id="lobby"><h1>🎮 小遊戲大廳</h1><p class="sub">今天想玩哪一款？</p>${GAMES.map(card).join("")}${officeCard()}</div>
<div id="game"><div class="top"><button id="back">← 大廳</button><b id="gname"></b></div><div id="frames"></div></div>
<script>
const GAMES={${embedded}};const NAMES={${names}};const frames={};
function route(){const k=location.hash.slice(1);const g=document.getElementById('game');
  if(!GAMES[k]){g.classList.remove('show');document.getElementById('lobby').style.display='';document.title='小遊戲大廳';return}
  document.getElementById('lobby').style.display='none';g.classList.add('show');document.getElementById('gname').textContent=NAMES[k];document.title=NAMES[k];
  for(const f of Object.values(frames))f.classList.remove('on');
  if(!frames[k]){const f=document.createElement('iframe');f.title=NAMES[k];f.id='f-'+k;f.className='on';f.srcdoc=GAMES[k];document.getElementById('frames').appendChild(f);frames[k]=f}
  else frames[k].classList.add('on')}
let nav=0;document.getElementById('back').onclick=()=>{if(nav>0){nav--;history.back()}else location.hash=''};
addEventListener('message',e=>{const d=e.data||{};try{if(d.lobbySave)localStorage.setItem('lobby_'+d.lobbySave.key,JSON.stringify(d.lobbySave.val));if(d.lobbyLoad){const v=JSON.parse(localStorage.getItem('lobby_'+d.lobbyLoad)||'null');if(v)e.source.postMessage({lobbyData:{key:d.lobbyLoad,val:v}},'*')}if(d.m3save)localStorage.setItem('lobby_m3',JSON.stringify(d.m3save));
  if(d.m3load){const v=JSON.parse(localStorage.getItem('lobby_m3')||'null');if(v)e.source.postMessage({m3data:v},'*')}}catch(_){}});
addEventListener('hashchange',()=>{if(GAMES[location.hash.slice(1)])nav++;else nav=0;route()});route();
</script></body></html>`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${Buffer.byteLength(html)} bytes)`);

const tsc = join(root, "node_modules/typescript/bin/tsc");
if (!existsSync(tsc)) {
  console.log("typescript not installed; skip typecheck");
} else {
  const result = spawnSync(process.execPath, [tsc, "--noEmit"], { stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
