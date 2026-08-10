---
name: webflow-cli-designer-access
description: Mandatory Webflow MCP access preflight and recovery workflow. Use automatically before any Webflow skill, Webflow MCP tool, Webflow Designer link, site/page/style/element/component/CMS operation, live-canvas inspection, Bridge App action, or Webflow connection troubleshooting. Verifies tool loading, official server configuration, OAuth health, Workspace authorization, page resolution, and Designer Bridge state before Webflow work begins.
---

# Webflow MCP Access Preflight

Run this preflight before every Webflow workflow, including workflows started through another Webflow skill. Pass quickly when the connection is healthy; do not force repeated authentication.

Read `references/access-workflow.md` when tools are missing, authentication fails, live Designer context is required, or CLI recovery is needed.

## Required Preflight

1. Discover the Webflow MCP tool registry.
2. If `webflow_guide_tool` is available, call it before every other Webflow MCP tool.
3. Call `data_sites_tool` with `list_sites` to confirm authorization and resolve the site.
4. Resolve the requested page with `data_pages_tool`; never treat a Designer URL page ID as verified.
5. Continue with the task-specific Webflow skill only after these checks pass.

Every Webflow MCP call must include a 15–25 word `context` value written in third person.

## Missing Tools Or Authentication Failure

If Webflow tools are absent:

1. Confirm the official server configuration:

   ```toml
   [mcp_servers.webflow]
   url = "https://mcp.webflow.com/mcp"
   oauth_resource = "https://mcp.webflow.com/mcp"
   ```

2. Inspect recent Codex logs without printing credentials. Distinguish missing configuration from OAuth failures.
3. Treat `invalid_grant`, `Invalid refresh token`, or `reauthorization required` as expired OAuth. Restarting alone cannot repair it.
4. Reauthorize only the `webflow` server:

   ```powershell
   npx --yes @openai/codex@latest mcp logout webflow
   npx --yes @openai/codex@latest mcp login webflow
   npx --yes @openai/codex@latest mcp list
   ```

5. Keep OAuth, Workspace selection, bot checks, 2FA, and access grants under user control.
6. After authorization, completely restart Codex and open a new task so the Webflow tool registry is initialized.

Do not delete the shared Codex credential store unless the user explicitly approves losing other MCP sessions.

## Designer Bridge

Require the Bridge only for live Designer state such as snapshots, current selection/page, canvas navigation, breakpoints, mode, or branch state.

1. Ask the user to open the authorized site in Webflow Designer.
2. Press `E` and launch **Webflow MCP Bridge App**.
3. Wait for **Connected to the MCP server**.
4. Keep the Bridge open or minimized.
5. Retry the live-session tool and verify its result.

Ordinary data operations on sites, pages, styles, elements, components, variables, CMS, assets, fonts, and custom code do not require the Designer or Bridge.

## Safety And Completion

- Inspect exact sites, pages, and objects before writes.
- Follow the task-specific Webflow skill after preflight.
- Request the confirmations required by that skill before mutation.
- Never print OAuth tokens, cookies, secrets, or API keys.
- Authentication never authorizes publishing.
- Verify changes through Webflow read/query tools.
- Report MCP health, resolved site/page, Bridge requirement/state, actions taken, remaining user-controlled steps, and whether anything was published.
