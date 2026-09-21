import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

function localActivityApi() {
  let cached: string | null = null;
  return {
    name: "local-activity-api",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => void): void } }) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (pathname !== "/api/activity") return next();
        if (cached) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=60");
          res.end(cached);
          return;
        }

        const originalEnd = res.end.bind(res);
        res.end = ((chunk?: string | Uint8Array) => {
          if (res.statusCode === 200 && chunk) cached = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
          return originalEnd(chunk);
        }) as typeof res.end;

        try {
          const { default: handler } = await import("../api/activity.ts");
          await handler(req, res);
        } catch (error) {
          if (res.headersSent) return;
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: (error as Error).message, collections: [], burns: [] }));
        }
      });
    },
  };
}

function localTokenDetailsApi() {
  return {
    name: "local-token-details-api",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => void): void } }) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (pathname !== "/api/token-details") return next();
        try {
          const { default: handler } = await import("../api/token-details.ts");
          await handler(req, res);
        } catch (error) {
          if (res.headersSent) return;
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: (error as Error).message, details: [] }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localActivityApi(), localTokenDetailsApi()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        selftest: fileURLToPath(new URL("selftest.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      // The protocol's own modules. The site derives addresses and builds the
      // burn with the same code the verifier was written against.
      "@protocol": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
});
