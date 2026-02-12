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

> **Install the MCP server at https://github.com/DanPatten/GhostRelay**

Most MCP-compatible tools (Claude Code, Cursor, Antigravity, OpenCode, etc.) will handle cloning, building, and registering the server automatically.

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

## Features

- **Point-and-click tagging** — hover to highlight, click to tag any element on any webpage
- **Screen snipping** — drag to select any region of the page, draw or add text annotations, and send the screenshot to your AI assistant
- **Inline annotations** — describe what should change right from the browser
- **MCP integration** — your AI assistant picks up tags, snips, selectors, HTML, and context automatically
- **Multi-page support** — tag and snip across different pages, everything stays in sync
- **Zero config** — enable per-site from the extension popup, no API keys needed
