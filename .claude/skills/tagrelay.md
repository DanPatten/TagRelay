---
name: tagrelay
description: Pull tagged browser elements into the conversation via TagRelay
user_invocable: true
---

# /tagrelay — Pull tagged elements into context

You are helping the user work with elements they've tagged in their browser using the TagRelay Chrome extension.

## Steps

1. **Check for tags** — Call the `tagrelay_get_status` MCP tool.

2. **If no tags exist**, reply with:
   > No tagged elements found. Open a page in Chrome, click the TagRelay floating button to enter tagging mode, then click the elements you want to work with. Run `/tagrelay` again when ready.

   Then stop.

3. **If tags exist**, call `tagrelay_get_tagged_elements` to retrieve the full data.

4. **Apply changes immediately.** Use the tagged element data (CSS selectors, text content, HTML snippets, page URL) to locate the corresponding code in the project and make all changes the user described in their message. Do NOT ask the user what they want — they already told you when they invoked `/tagrelay`. If the user's message only contains `/tagrelay` with no additional instructions, infer the intent from the tagged elements and their context (e.g. fix obvious issues, match surrounding patterns, apply reasonable improvements).

5. **After applying all changes**, call `tagrelay_clear_tags` to clean up the tags from the browser and server.
