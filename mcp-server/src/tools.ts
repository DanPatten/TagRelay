import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { store } from "./store.js";

export function registerTools(server: McpServer) {
  server.tool(
    "tagrelay_get_tagged_elements",
    "Get all tagged elements from the Chrome extension. Returns array of elements with CSS selectors, text content, HTML, bounding boxes, and page URLs.",
    {},
    async () => {
      const tags = store.getAllTags();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(tags, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "tagrelay_clear_tags",
    "Clear all tagged elements and notify the Chrome extension to remove badges.",
    {},
    async () => {
      store.clear();
      return {
        content: [
          {
            type: "text" as const,
            text: "All tags cleared. Chrome extension has been notified.",
          },
        ],
      };
    }
  );

  server.tool(
    "tagrelay_get_status",
    "Get the current tagging status: count of tagged elements and which page URLs have tags.",
    {},
    async () => {
      const count = store.getTagCount();
      const urls = store.getPageURLs();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count, urls }, null, 2),
          },
        ],
      };
    }
  );
}
