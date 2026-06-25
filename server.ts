import "./server.env.ts";
import express from "express";
import path from "path";

// Process error handlers so we never crash
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Fatal error occurred:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] Unhandled promise rejection at:', promise, 'reason:', reason);
});

// Polyfill DOMMatrix for Node.js PDFJS environment safety
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: string | number[]) {
      if (Array.isArray(init)) {
        if (init.length >= 6) {
          this.a = init[0];
          this.b = init[1];
          this.c = init[2];
          this.d = init[3];
          this.e = init[4];
          this.f = init[5];
        }
      }
    }
    toString() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  }
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

import apiApp from "./src/api/index.ts";
import { startScheduledCleanupJob } from "./src/api/cleanup.ts";

import { WebSocketServer } from "ws";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.use(apiApp);

  // API error handler - Catches any API exceptions and forces a JSON response instead of letting Vite/SPA fallback to HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api/")) {
      console.error("[API Global Error]", err);
      if (!res.headersSent) {
        return res.status(err.status || 500).json({
          error: err.message || "An unexpected API error occurred",
        });
      }
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start the background history database retention cleanup job (default interval 12 hours)
    try {
      startScheduledCleanupJob(12);
    } catch (err) {
      console.error("Failed to start scheduled cleanup job:", err);
    }
  });

  // Attach WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url === "/api/chat/stream-ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws, req) => {
    import("./src/api/chat-ws.js").then((module) => {
      module.handleChatWebSocket(ws, req);
    }).catch(err => {
      console.error("Failed to load chat-ws:", err);
      import("./src/api/chat-ws.ts").then((module) => {
        module.handleChatWebSocket(ws, req);
      }).catch(err2 => console.error(err2));
    });
  });

  server.timeout = 5 * 60 * 1000; // 5 minutes timeout
}

startServer();
