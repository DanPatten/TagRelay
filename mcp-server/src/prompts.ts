import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "tagrelay",
    {
      title: "TagRelay Workflow",
      description:
        "Pull tagged browser elements into context and apply changes. Use after tagging elements with the TagRelay Chrome extension.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You have access to TagRelay MCP tools that let you work with elements the user has tagged in their browser.",
              "",
              "## Tools",
              "- `tagrelay_get_status` — Check how many elements are tagged and on which pages.",
              "- `tagrelay_get_tagged_elements` — Get full data for each tagged element: CSS selector, text content, HTML snippet, bounding box, and page URL.",
              "- `tagrelay_clear_tags` — Clear all tags from the browser and server.",
              "",
              "## Workflow",
              "1. Call `tagrelay_get_status` to check for tags.",
              "2. If no tags exist, tell the user to open a page in Chrome, click the TagRelay floating button to enter tagging mode, and click the elements they want to work with.",
              "3. If tags exist, call `tagrelay_get_tagged_elements` to retrieve the full data.",
              "4. Apply changes immediately. Use the tagged element data (CSS selectors, text content, HTML snippets, page URL) to locate the corresponding code in the project and make all changes the user described. If no specific instructions were given, infer the intent from the tagged elements and their context.",
              "5. After applying all changes, call `tagrelay_clear_tags` to clean up.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
