import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpServer } from "./http-server.js";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";

const PORT = parseInt(process.env.TAGRELAY_PORT ?? "7890", 10);

async function main() {
  const server = new McpServer({
    name: "tagrelay",
    version: "1.0.0",
  });

  registerTools(server);
  registerPrompts(server);

  // Start HTTP server for Chrome extension communication
  createHttpServer(PORT);

  // Connect MCP over stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[TagRelay] MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
