import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { store } from "./store.js";

export function registerTools(server: McpServer) {
  server.tool(
    "get_tagged_elements",
    "Get all tagged elements from the Chrome extension. Returns array of elements with CSS selectors, text content, HTML, bounding boxes, and page URLs.",
    {},
    async () => {
      const tags = store.getAllTags();
      const compact = tags.map((t) => {
        const screenshot =
          t.screenshot && !t.screenshot.startsWith("data:")
            ? t.screenshot
            : undefined;
        return {
          index: t.index,
          type: t.type ?? "tag",
          tagName: t.tagName,
          selector: t.selector,
          text: (t.innerText || "").slice(0, 200),
          annotation: t.annotation,
          screenshot,
          pageURL: t.pageURL,
          pageTitle: t.pageTitle,
          boundingBox: t.boundingBox,
        };
      });
      const hasScreenshots = compact.some((t) => t.screenshot);
      const hint = hasScreenshots
        ? "View screenshots using the Read tool with the file paths in the screenshot fields below.\n\n"
        : "";
      return {
        content: [
          {
            type: "text" as const,
            text: hint + JSON.stringify(compact),
          },
        ],
      };
    }
  );

  server.tool(
    "clear_tags",
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
    "get_status",
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
