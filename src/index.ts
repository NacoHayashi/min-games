import { bearer, OfficeRoom, tokenEqual, type Env } from "./office-room";

export { OfficeRoom };

const ADMIN_MARKER = "x-office-admin";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function configuredAdminToken(env: Env): string {
  return (env.ADMIN_TOKEN ?? "").trim();
}

function forward(request: Request, trustedAdmin: boolean): Request {
  if (!trustedAdmin && !request.headers.has(ADMIN_MARKER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(ADMIN_MARKER);
  if (trustedAdmin) headers.set(ADMIN_MARKER, "1");
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/office")) {
      try {
        if (url.pathname === "/api/office/admin/health" && request.method === "GET") {
          return json({ hasAdminToken: configuredAdminToken(env).length > 0 });
        }
        let trustedAdmin = false;
        if (url.pathname.startsWith("/api/office/admin/")) {
          const expected = configuredAdminToken(env);
          if (!expected) {
            return json({ error: "伺服器尚未設定 ADMIN_TOKEN。請先在 Cloudflare 設定密鑰。" }, 503);
          }
          const presented = bearer(request).trim();
          if (!(await tokenEqual(presented, expected))) {
            return json({ error: "管理員權杖不正確" }, 401);
          }
          trustedAdmin = true;
        }
        const stub = env.OFFICE.get(env.OFFICE.idFromName("main"));
        return await stub.fetch(forward(request, trustedAdmin));
      } catch (error) {
        console.error(error);
        return json({ error: "辦公室暫時沒有回應" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
