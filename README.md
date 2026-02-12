<p align="center">
  <img src="GhostRelayLogo.png" alt="GhostRelay" width="180">
</p>

<h1 align="center">GhostRelay</h1>

<p align="center">
  <strong>Point at what needs fixing. Tell your AI what to change. That's it.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/chrome-extension-blue?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/MCP-compatible-green?style=flat-square" alt="MCP Compatible">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 18">
</p>

---

## Quick Start

### 1. Install the MCP Server

Ask your AI assistant:

> Install the MCP server & skills at https://github.com/DanPatten/GhostRelay

### 2. Install the Chrome Extension

1. Go to `chrome://extensions`
2. Toggle on **Developer mode** (top right)
3. Click **Load unpacked** and select the `chrome-extension/` folder from this repo

---

## Manual Setup

If your tool doesn't support automatic MCP installation:

```bash
git clone https://github.com/DanPatten/GhostRelay.git
cd GhostRelay/mcp-server
npm install
npm run build
```

Then add this to your tool's MCP config:

```json
{
  "mcpServers": {
    "ghostrelay": {
      "command": "node",
      "args": ["<full-path-to-repo>/mcp-server/dist/index.js"],
      "env": {
        "GHOSTRELAY_PORT": "7391"
      }
    }
  }
}
```

> Replace `<full-path-to-repo>` with the absolute path to where you cloned the repo.

| Tool | Config location |
|------|----------------|
| **Claude Code** | Auto-detected from `.mcp.json` in this repo |
| **Cursor** | `.cursor/mcp.json` in your project or global settings |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** | `cline_mcp_settings.json` (VS Code settings) |
| **Antigravity** | `~/.gemini/antigravity/mcp_config.json` |
| **OpenCode** | `opencode.json` in project root or `~/.config/opencode/opencode.json` |

---

## Usage

Once installed, tag elements in Chrome using the GhostRelay extension, then tell your AI assistant to apply changes.

### Claude Code

Use the `/gr` slash command:

```
/gr make the header background dark blue
```

```
/gr
```

When called without instructions, GhostRelay infers intent from the tagged elements and any annotations you added in the browser.

For continuous monitoring, use endless polling mode — Claude watches for new tags and processes them automatically:

```
/gr endless
```

To set up the `/gr` command, ask Claude Code:

> Install the `/gr` skill from the GhostRelay repo

### Other AI Tools

Most MCP-compatible tools (Cursor, Cline, Windsurf, etc.) can use GhostRelay in two ways:

- **MCP Prompt** — Invoke the `ghostrelay` prompt template, optionally passing a `context` argument describing what to change. The prompt guides the assistant through the full workflow automatically.
- **MCP Tools** — Call the tools directly: `get_status` to check for tags, `get_tagged_elements` to retrieve element data, and `clear_tags` to clean up afterward.

Refer to your tool's documentation for how to invoke MCP prompts and tools.

---

## Features

- **Point-and-click tagging** — hover to highlight, click to tag any element on any webpage
- **Screen snipping** — drag to select any region of the page, draw or add text annotations, and send the screenshot to your AI assistant
- **Inline annotations** — describe what should change right from the browser
- **MCP integration** — your AI assistant picks up tags, snips, selectors, HTML, and context automatically
- **Multi-page support** — tag and snip across different pages, everything stays in sync
- **Zero config** — enable per-site from the extension popup, no API keys needed

---

<p align="center">
  <a href="https://buymeacoffee.com/danpatten0">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=danpatten0&button_colour=5F7FFF&font_colour=ffffff&font_family=Poppins&outline_colour=000000&coffee_colour=FFDD00" alt="Buy Me A Coffee">
  </a>
</p>
