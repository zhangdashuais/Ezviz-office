# Webflow MCP Access And Recovery

## Healthy Connection

Use the official remote server:

```text
https://mcp.webflow.com/mcp
```

Required order:

1. Discover Webflow tools.
2. Call `webflow_guide_tool`.
3. Call `data_sites_tool` with `list_sites`.
4. Resolve the exact site and page.
5. Run the task-specific read or write workflow.
6. Verify through read/query tools.

## Tool Routing

| Need | Tool family |
| --- | --- |
| Sites and pages | `data_sites_tool`, `data_pages_tool` |
| Styles and classes | `data_style_tool` |
| Elements and structure | `data_element_tool`, `data_element_builder` |
| Components and variants | component tools |
| Variables and tokens | `data_variable_tool` |
| CMS, assets, fonts, custom code | corresponding `data_*` tools |
| Live canvas, selection, snapshot, mode | Designer session tools plus Bridge |
| Local DevLink, Cloud, extensions | Webflow CLI |

## Windows Configuration Check

Inspect only the relevant configuration lines:

```powershell
Select-String -LiteralPath "$env:USERPROFILE\.codex\config.toml" `
  -Pattern '^\[mcp_servers\.webflow\]|^url\s*=|^oauth_resource\s*='
```

Expected configuration:

```toml
[mcp_servers.webflow]
url = "https://mcp.webflow.com/mcp"
oauth_resource = "https://mcp.webflow.com/mcp"
```

Do not store a Webflow token manually.

## Diagnose OAuth Without Exposing Secrets

When the tools are missing after configuration, query only recent Webflow/MCP errors:

```powershell
sqlite3.exe "$env:USERPROFILE\.codex\logs_2.sqlite" `
  "SELECT level,target,substr(feedback_log_body,1,500)
   FROM logs
   WHERE lower(coalesce(feedback_log_body,'') || ' ' || coalesce(target,'')) LIKE '%webflow%'
   ORDER BY ts DESC LIMIT 30;"
```

Interpretation:

- `invalid_grant` or `Invalid refresh token`: OAuth refresh credential is invalid.
- `reauthorization required`: logout/login is required; restart alone is insufficient.
- no Webflow server/tool entry: configuration or task tool-registry initialization failed.
- repeated Bridge reconnects: live Designer session instability, not necessarily MCP data-tool failure.

Never output credential files, OAuth tokens, cookies, or complete secret-store contents.

## Targeted Reauthorization

Prefer a targeted Webflow reset:

```powershell
npx --yes @openai/codex@latest mcp logout webflow
npx --yes @openai/codex@latest mcp login webflow
npx --yes @openai/codex@latest mcp list
```

The login step is user-controlled. The user must select the intended Webflow Workspace.

After success:

1. Completely quit Codex.
2. Reopen Codex.
3. Start a new task.
4. Discover Webflow tools again.
5. Call `webflow_guide_tool`, then `data_sites_tool`.

If `codex` is absent from `PATH`, use the `npx` commands above. Confirm prerequisites with:

```powershell
node --version
npm --version
npx --version
```

Do not remove the Windows credential named like `secrets|…codex` as a normal repair step. It is a shared Codex MCP secret store and may sign out unrelated MCP servers. Use that fallback only after explicit user approval and after targeted reauthorization has failed.

## Designer Bridge

Bridge is required only for:

- visual snapshots;
- current selection or current page;
- Designer mode and branch state;
- canvas navigation and breakpoints.

Connection steps:

1. Open the authorized site in Webflow Designer.
2. Press `E`.
3. Launch **Webflow MCP Bridge App**.
4. Wait for **Connected to the MCP server**.
5. Keep it open or minimized.

If it reconnects repeatedly, keep the Designer tab active or pinned and add `webflow.com` to Chrome's always-active sites list.

## Completion Report

Report:

- server configuration and OAuth state without credentials;
- resolved Workspace/site/page;
- whether Bridge was required and connected;
- tools/actions used;
- verification result;
- whether anything was published;
- remaining user-controlled steps.
