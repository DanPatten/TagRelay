import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { store, TaggedElement } from "./store.js";

const screenshotsDir = path.resolve("screenshots");

function ensureScreenshotsDir() {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

function cleanupScreenshots() {
  if (fs.existsSync(screenshotsDir)) {
    for (const file of fs.readdirSync(screenshotsDir)) {
      fs.unlinkSync(path.join(screenshotsDir, file));
    }
  }
}

function saveScreenshot(element: TaggedElement, index: number): void {
  if (!element.screenshot || !element.screenshot.startsWith("data:image/")) return;

  ensureScreenshotsDir();

  const base64Data = element.screenshot.replace(/^data:image\/\w+;base64,/, "");
  const type = element.type ?? "tag";
  const timestamp = Date.now();
  const filename = `${type}-${index}-${timestamp}.png`;
  const filepath = path.join(screenshotsDir, filename);

  fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));
  element.screenshot = path.resolve(filepath);
}

export function createHttpServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  const sseClients = new Set<Response>();

  function broadcast(event: string, data?: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  }

  // Receive updated tag list from extension
  app.post("/tags", (req: Request, res: Response) => {
    const { pageURL, elements } = req.body as {
      pageURL: string;
      elements: TaggedElement[];
    };
    if (!pageURL || !Array.isArray(elements)) {
      res.status(400).json({ error: "pageURL and elements[] required" });
      return;
    }
    elements.forEach((el, i) => saveScreenshot(el, i));
    store.setTags(pageURL, elements);
    broadcast("update", { count: store.getTagCount() });
    res.json({ ok: true, count: store.getTagCount() });
  });

  // Get current tags
  app.get("/tags", (_req: Request, res: Response) => {
    res.json({ tags: store.getAllTags() });
  });

  // Clear all tags
  app.delete("/tags", (_req: Request, res: Response) => {
    store.clear();
    res.json({ ok: true });
  });

  // SSE stream
  app.get("/events", (_req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");
    sseClients.add(res);

    res.on("close", () => {
      sseClients.delete(res);
    });
  });

  // Wire up store clear events to SSE broadcast and screenshot cleanup
  store.onClear(() => {
    cleanupScreenshots();
    broadcast("clear");
  });

  const server = app.listen(port, () => {
    console.error(`[GhostRelay] HTTP server listening on port ${port}`);
  });

  return server;
}
