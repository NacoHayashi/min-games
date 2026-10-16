const TOKEN_KEY = "office_admin_token";
const $ = (id) => document.getElementById(id);

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

async function api(path, options = {}) {
  const headers = { authorization: `Bearer ${token()}` };
  if (options.body) headers["content-type"] = "application/json";
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 503) {
    const error = new Error(data.error || "未授權");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) throw new Error(data.error || "沒有成功");
  return data;
}

function showLogin(message) {
  $("panel").hidden = true;
  $("login").hidden = false;
  $("login-error").textContent = message || "";
}

function render(data) {
  $("login").hidden = true;
  $("panel").hidden = false;
  $("pw-state").textContent = data.hasPassword
    ? "已設定辦公室密碼（不會顯示內容）。"
    : "尚未設定密碼，訪客還不能進入。";
  const body = $("members");
  body.replaceChildren();
  $("empty").hidden = data.members.length > 0;
  for (const member of data.members) {
    const row = document.createElement("tr");
    row.dataset.id = member.id;
    const id = document.createElement("td");
    id.textContent = `@${member.id}`;
    const name = document.createElement("td");
    name.textContent = member.displayName;
    const status = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = member.online ? "dot on" : "dot";
    status.append(dot, document.createTextNode(member.online ? "在線" : "離線"));
    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "row";
    const kick = document.createElement("button");
    kick.type = "button";
    kick.className = "ghost";
    kick.textContent = "踢出";
    kick.disabled = !member.online;
    kick.addEventListener("click", async () => {
      if (!confirm(`要把 @${member.id} 踢下線嗎？`)) return;
      await api("/api/office/admin/kick", { method: "POST", body: { id: member.id } });
      await refresh();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = "移除";
    remove.addEventListener("click", async () => {
      if (!confirm(`要移除 @${member.id} 嗎？這個 ID 會空出來。`)) return;
      await api(`/api/office/admin/members/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      await refresh();
    });
    wrap.append(kick, remove);
    actions.append(wrap);
    row.append(id, name, status, actions);
    body.appendChild(row);
  }
}

async function refresh() {
  const data = await api("/api/office/admin/overview");
  render(data);
}

$("form-token").addEventListener("submit", async (event) => {
  event.preventDefault();
  sessionStorage.setItem(TOKEN_KEY, $("admin-token").value.trim());
  try {
    await refresh();
  } catch (error) {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin(error.message);
  }
});

$("form-password").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("new-password").value.trim();
  if (password !== $("new-password2").value.trim()) {
    $("pw-error").textContent = "兩次密碼不一樣";
    return;
  }
  $("pw-error").textContent = "";
  try {
    await api("/api/office/admin/password", { method: "POST", body: { password } });
    $("new-password").value = "";
    $("new-password2").value = "";
    $("pw-error").textContent = "已更新密碼，所有人需要重新輸入。";
    await refresh();
  } catch (error) {
    if (error.status === 401 || error.status === 503) showLogin(error.message);
    else $("pw-error").textContent = error.message;
  }
});

$("refresh").addEventListener("click", () => refresh().catch((error) => showLogin(error.message)));

if (token()) {
  refresh().catch((error) => showLogin(error.message));
}
setInterval(() => {
  if (!token() || $("panel").hidden) return;
  refresh().catch(() => {});
}, 3000);
