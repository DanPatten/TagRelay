import express, { Request, Response } from "express";
import cors from "cors";
import { store, TaggedElement } from "./store.js";

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

  // Wire up store clear events to SSE broadcast
  store.onClear(() => {
    broadcast("clear");
  });

  const server = app.listen(port, () => {
    console.error(`[TagRelay] HTTP server listening on port ${port}`);
  });

  return server;
}
