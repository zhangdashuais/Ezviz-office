# Codex Skills Migration

Generated on 2026-08-09 from:

```text
C:\Users\张天乐\.codex\skills
```

## Package

Migration archive:

```text
outputs/skills-migration/codex-skills-20260809-202431.zip
```

Contents:

```text
Top-level directories: 47
SKILL.md files: 52
Total files: 301
Approx size before zip: 4.6 MB
```

`hatch-pet` is included in the archive but has no `SKILL.md`; treat it as a non-standard local folder, not a registered skill.

## Install On Another Computer

1. Close Codex on the target computer.

2. Back up existing skills:

```powershell
$stamp = Get-Date -Format yyyyMMdd-HHmmss
if (Test-Path "$env:USERPROFILE\.codex\skills") {
  Compress-Archive -Path "$env:USERPROFILE\.codex\skills\*" -DestinationPath "$env:USERPROFILE\Desktop\codex-skills-backup-$stamp.zip"
}
```

3. Extract the archive into:

```text
%USERPROFILE%\.codex\skills
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills"
Expand-Archive -Path "D:\path\to\codex-skills-20260809-202431.zip" -DestinationPath "$env:USERPROFILE\.codex\skills" -Force
```

4. Reopen Codex and verify the skills list.

## Verify

Check that these files exist:

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\skills" -Recurse -Filter SKILL.md | Measure-Object
```

Expected:

```text
52 SKILL.md files
```

Spot checks:

```powershell
Test-Path "$env:USERPROFILE\.codex\skills\ponytail\SKILL.md"
Test-Path "$env:USERPROFILE\.codex\skills\playwright-cli\SKILL.md"
Test-Path "$env:USERPROFILE\.codex\skills\ecommerce-page-patterns\SKILL.md"
```

## Local Skill Summary

### Core / System

| Folder | Skill | Purpose |
|---|---|---|
| `.system/imagegen` | `imagegen` | Generate or edit bitmap images. |
| `.system/openai-docs` | `openai-docs` | OpenAI, Codex, API, model, settings, and troubleshooting docs. |
| `.system/plugin-creator` | `plugin-creator` | Scaffold local Codex plugins. |
| `.system/review-agent` | `review-agent` | Read-only code review for delegated changes. |
| `.system/skill-creator` | `skill-creator` | Create or update Codex skills. |
| `.system/skill-installer` | `skill-installer` | Install skills from curated sources or GitHub repos. |

### Daily Engineering

| Folder | Skill | Purpose |
|---|---|---|
| `playwright-cli` | `playwright-cli` | Browser automation and web testing. |
| `ponytail` | `ponytail` | Minimal-code/YAGNI engineering mode. |
| `similarweb` | `similarweb` | Similarweb traffic and market intelligence. |

### EZVIZ / Page Design

| Folder | Skill | Purpose |
|---|---|---|
| `ecommerce-page-patterns` | `ecommerce-page-patterns` | Ecommerce product/detail/promo/topic page design, especially EZVIZ-style pages. |
| `promotion-page-design` | `promotion-page-design` | Promotion, seasonal sale, offer, and campaign landing pages. |
| `topic-page-design` | `topic-page-design` | Topic, solution, product family, and multi-product pages. |
| `frontend-slides` | `frontend-slides` | HTML presentations and PowerPoint-to-web slides. |
| `frontend-slides/plugins/frontend-slides/skills/frontend-slides` | `frontend-slides` | Nested copy of the same frontend slides skill. |

### AI Media / RunComfy / Inference

| Folder | Skill | Purpose |
|---|---|---|
| `hot-01-ai-avatar-video` | `ai-avatar-video` | AI avatar, talking head, lipsync, and presenter videos. |
| `hot-02-ai-image-generation-belt` | `ai-image-generation` | Image generation via inference.sh model belt. |
| `hot-03-twitter-automation` | `twitter-automation` | Twitter/X posting and engagement automation. |
| `hot-04-remotion-render` | `remotion-render` | Render TSX/Remotion videos. |
| `hot-05-ai-video-generation-belt` | `ai-video-generation` | Video generation via inference.sh model belt. |
| `hot-06-video-edit` | `video-edit` | Edit existing videos via RunComfy. |
| `hot-07-ai-music` | `ai-music` | Generate, extend, or repair AI music via RunComfy. |
| `hot-08-image-to-video` | `image-to-video` | Animate still images into videos. |
| `hot-09-ai-video-generation-runcomfy` | `ai-video-generation` | Video generation via RunComfy. |
| `hot-10-ai-image-generation-runcomfy` | `ai-image-generation` | Image generation/editing via RunComfy. |

### Webflow MCP

| Folder | Skill | Purpose |
|---|---|---|
| `accessibility-audit` | `webflow-mcp:accessibility-audit` | WCAG/accessibility audit for Webflow pages. |
| `asset-audit` | `webflow-mcp:asset-audit` | Audit asset alt text and SEO-friendly names. |
| `bulk-cms-update` | `webflow-mcp:bulk-cms-update` | Create/update CMS items in bulk. |
| `cms-best-practices` | `webflow-mcp:cms-best-practices` | Webflow CMS architecture guidance. |
| `cms-collection-setup` | `webflow-mcp:cms-collection-setup` | Create CMS collections. |
| `custom-code-management` | `webflow-mcp:custom-code-management` | Add/review/remove Webflow custom scripts. |
| `designer-tools` | `webflow-mcp:designer-tools` | Build and manage Webflow pages/elements/styles. |
| `flowkit-naming` | `webflow-mcp:flowkit-naming` | Apply Flowkit class naming. |
| `link-checker` | `webflow-mcp:link-checker` | Find and fix broken/insecure links. |
| `review-comments` | `webflow-mcp:review-comments` | Review Webflow comment threads. |
| `safe-publish` | `webflow-mcp:safe-publish` | Plan-confirm-publish workflow. |
| `site-activity` | `webflow-mcp:site-activity` | Webflow enterprise activity logs. |
| `site-audit` | `webflow-mcp:site-audit` | Webflow site structure and health audit. |
| `webflow-compress-cms-image` | `webflow-mcp:compress-cms-image` | Compress/convert CMS images. |

### Webflow CLI / Code Components

| Folder | Skill | Purpose |
|---|---|---|
| `webflow-cli-designer-access` | `webflow-cli-designer-access` | Mandatory Webflow access preflight/recovery. |
| `webflow-cli-troubleshooter` | `webflow-cli:troubleshooter` | Diagnose Webflow CLI issues. |
| `webflow-cloud-command` | `webflow-cli:cloud` | Build/deploy Webflow Cloud projects. |
| `code-component-command` | `webflow-cli:code-component` | Create/deploy Webflow code components. |
| `designer-extension-command` | `webflow-cli:designer-extension` | Build Webflow Designer Extensions. |
| `devlink-command` | `webflow-cli:devlink` | Export Webflow components to React/Next.js. |
| `component-audit` | `webflow-code-component:component-audit` | Audit Webflow code component architecture. |
| `component-scaffold` | `webflow-code-component:component-scaffold` | Scaffold Webflow code components. |
| `convert-component` | `webflow-code-component:convert-component` | Convert React components to Webflow code components. |
| `deploy-guide` | `webflow-code-component:deploy-guide` | Deployment guide for code components. |
| `local-dev-setup` | `webflow-code-component:local-dev-setup` | Initialize local Webflow code component projects. |
| `pre-deploy-check` | `webflow-code-component:pre-deploy-check` | Pre-deploy validation. |
| `troubleshoot-deploy` | `webflow-code-component:troubleshoot-deploy` | Debug deployment failures. |
| `wfu-mcp-getting-started` | `webflow-university:mcp-getting-started` | Guided Webflow MCP onboarding. |

## Notes

- This archive only migrates local skill files.
- It does not migrate plugin installations, app connections, OAuth tokens, API keys, browser profiles, or Codex account settings.
- Skills that call external CLIs still require those CLIs on the target computer, such as `playwright-cli`, `runcomfy`, `inference.sh`, `webflow`, or `gcloud`.
- Keep the zip private if any custom local skill contains internal instructions.
