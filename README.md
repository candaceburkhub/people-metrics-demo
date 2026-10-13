# People Metrics Demo

One people-data layer, two reports, one MCP server. **All data is synthetic** and comes from mock APIs shaped like Rippling's and Ashby's. No real credentials are used anywhere.

## What it shows

- **Mock vendor APIs** at `/api/mock/rippling/*`, `/api/mock/ashby/*`, `/api/mock/ops/*` (bearer or basic auth, pagination, rate limits, a read-only token that gets a 403 on compensation).
- **Pipeline** (`lib/pipeline`, `lib/clients`): retries with backoff, per-source sync report, partial-failure tolerance. Only `lib/clients/adapters.ts` knows vendor field names.
- **One metrics layer** (`lib/metrics`): a single definition per metric; the HR report, leadership report, MCP tools and Slack digest all read it.
- **HR report** `/hr`: 16 metrics with numerator, denominator, n, breakdowns, "why it moved", data quality audit, sync status.
- **Leadership one-pager** `/leadership`: headcount vs plan, 8 headline metrics, trends, drafted commentary (always a draft pending review). Groups under 5 are hidden.
- **MCP server** `/api/mcp`: 5 tools (`list_metrics`, `get_metric`, `explain_change`, `data_quality_report`, `leadership_summary`). No token = leadership scope. Bearer `MCP_HR_TOKEN` = HR scope. A wrong token gets 401.
- **Slack digest** `/api/digest`: dry run by default; posts only with `?post=1`, the cron secret and a review-channel webhook.

Rippling now has its own official MCP server that acts on Rippling. This demo is the layer on top: governed, defined metrics across Rippling, Ashby and finance.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # 40 automated checks
```

## Deploy (GitHub + Vercel)

1. Push this folder to a new GitHub repo.
2. In Vercel: Add New Project, import the repo, keep defaults.
3. Set environment variables: `MCP_HR_TOKEN` (a long random string). Optional: `CRON_SECRET`, `SLACK_REVIEW_WEBHOOK_URL`.
4. Add to Claude as a custom connector: `https://<your-app>.vercel.app/api/mcp` (leadership scope). For HR scope, send `Authorization: Bearer <MCP_HR_TOKEN>` from a client that supports headers, such as Claude Code.

## Going live

1. Confirm API access is enabled on the Rippling plan and which scopes the token gets.
2. Verify field names against developer.rippling.com and Ashby's API docs, then adjust `lib/clients/adapters.ts`. Field shapes here are approximations.
3. Set `DATA_MODE=live` and the base URL and token variables from `.env.example`.
4. Check whether termination reason is available through the API. This is unverified.
5. Replace illustrative targets in `lib/metrics/definitions.ts` with real ones, and in production put OAuth in front of the MCP route.
