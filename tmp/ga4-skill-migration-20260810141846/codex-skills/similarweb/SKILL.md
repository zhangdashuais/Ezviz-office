---
name: similarweb
description: Query Similarweb data through the official Similarweb MCP server for website traffic, engagement, channels, geography, referrals, similar sites, demographics, technologies, search metrics, app metrics, shopper/Amazon intelligence, and market research. Use when the user asks to use Similarweb, Similar Web, similarweb.com, web traffic intelligence, competitor traffic, website analytics, app intelligence, keyword/SERP intelligence, or Similarweb MCP/API data.
---

# Similarweb

Use the official Similarweb MCP server at `https://mcp.similarweb.com`.

## Requirements

- The user must have a Similarweb subscription with API access.
- Read the API key from the local environment variable `SIMILARWEB_API_KEY`.
- Never ask the user to paste the API key into chat.
- If the key is missing, tell the user to set it locally:

```powershell
[Environment]::SetEnvironmentVariable("SIMILARWEB_API_KEY", "YOUR_KEY", "User")
```

## Workflow

1. For the first Similarweb task in a session, list tools or read available resources with `scripts/similarweb_mcp.ps1`.
2. Do not make exploratory data calls unless they are needed for the user's request.
3. Before historical queries, prefer checking available date resources or using `latest`/relative dates when suitable.
4. For broad tasks, start with narrow calls such as traffic, channels, geography, or similar sites, then expand only if needed.
5. Summarize results in the user's language, with date range, country, source, and metric units clear.

## Credit Safety

Actual Similarweb data calls consume the user's Similarweb API credits. Listing tools and basic MCP initialization do not retrieve business data and are safe for setup checks.

- If the user asks "can you connect?" or "what tools are available?", only list tools.
- If the user asks for specific website/app/keyword data, call the needed tools.
- Do not mention credit cost unless the user asks. If they ask, sum `data_credits_charged` from successful tool responses.

## Helper Script

Use the bundled script from this skill directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/similarweb_mcp.ps1 -ListTools
```

Call a tool:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/similarweb_mcp.ps1 -Tool get-websites-traffic-and-engagement -ArgumentsJson '{"domain":"nike.com","country":"ww","granularity":"monthly","start_date":"6_months_ago","end_date":"latest","web_source":"total","metrics":["visits","pages_per_visit","bounce_rate"]}'
```

Read an MCP resource:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/similarweb_mcp.ps1 -ReadResource "resource://similarweb/guide/handbook"
```

## Common Tools

- `get-websites-traffic-and-engagement`: visits, duration, pages per visit, bounce rate, page views, unique visitors.
- `get-websites-traffic-channels`: marketing channel mix.
- `get-websites-geography-agg`: country distribution.
- `get-websites-similar-sites-agg`: similar domains and affinity.
- `get-websites-referrals-agg`: incoming/outgoing referrals.
- `get-websites-demographics`: age and gender.
- `get-website-content-technologies-agg`: technologies used by a domain.
- `get-websites-website-rank`: global/category/country rank.

## Notes

- Domains should be passed without `www.`.
- Country supports `ww` for worldwide and two-letter country codes such as `us`, `gb`, `cn`.
- Date parameters often accept `latest`, `X_months_ago`, and `X_days_ago`.
- Web source is usually `desktop`, `mobile_web`, or `total`; some endpoints restrict this.
