// Dev server: also accepts play logs from human playtests (POST /__playlog) and saves them to playlogs/.
import { defineConfig } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";

export default defineConfig({
  plugins: [{
    name: "playlog",
    configureServer(server) {
      server.middlewares.use("/__playlog", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 200_000) req.destroy(); });
        req.on("end", () => {
          try {
            const j = JSON.parse(body);
            const id = String(j.id ?? "x").replace(/[^a-z0-9]/gi, "").slice(0, 12) || "x";
            mkdirSync("playlogs", { recursive: true });
            writeFileSync(`playlogs/${j.started?.slice(0, 10) ?? "day"}_${id}.json`, JSON.stringify(j, null, 1));
            res.statusCode = 204;
          } catch { res.statusCode = 400; }
          res.end();
        });
      });
    },
  }],
});
