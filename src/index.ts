import { OfficeRoom, type Env } from "./office-room";

export { OfficeRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/office")) {
      try {
        const stub = env.OFFICE.get(env.OFFICE.idFromName("main"));
        return await stub.fetch(request);
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: "辦公室暫時沒有回應" }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
