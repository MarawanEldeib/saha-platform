# Saha — Model Context Protocol (MCP) Server (SAH-37)

Hosted MCP server that exposes Saha tools to Claude Desktop, Cursor, Cline, and any MCP-compatible client.

- **Endpoint**: `https://sahasports.vercel.app/api/mcp`
- **Auth**: none today (read-only public data; same posture as the REST API and the Custom GPT)
- **Source**: [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts)
- **Underlying API**: the MCP route forwards to the public REST API ([docs/API.md](API.md)) so behaviour stays identical across the GPT, MCP, and direct API consumers.

## Tools exposed

| Tool | Purpose |
| --- | --- |
| `search_facilities` | Filter active facilities by sport, city, or geo radius |
| `get_facility` | Look up one facility by UUID or slug; returns hours, sports, photos, ratings |
| `get_availability` | List open court slots at a facility on a given date |

Write tools (`create_booking`, `get_booking`) are deferred to **SAH-118** along with Bearer-JWT auth.

## Connect from Claude Desktop

Edit `claude_desktop_config.json` (location varies by OS — open Claude → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "saha": {
      "url": "https://sahasports.vercel.app/api/mcp"
    }
  }
}
```

Restart Claude Desktop. Saha tools should appear in the tool picker; ask something like *"Find a padel court in Dubai"*.

If your Claude Desktop version is too old to support remote MCP URLs, fall back to `mcp-remote`:

```json
{
  "mcpServers": {
    "saha": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://sahasports.vercel.app/api/mcp"]
    }
  }
}
```

## Connect from Cursor

Edit `~/.cursor/mcp.json` (or use Cursor → Settings → MCP → Add Server):

```json
{
  "mcpServers": {
    "saha": {
      "url": "https://sahasports.vercel.app/api/mcp"
    }
  }
}
```

## Connect from Cline (VS Code extension)

Cline supports remote MCP servers from the **MCP Servers** panel — click **Add Server**, paste the URL.

## Verify it's working

After connecting, run a quick query in your MCP client:

> Find me a padel court in Dubai

You should see the client invoke `search_facilities` with `{ sport: "padel", city: "Dubai" }`. Today the response is `{ "data": [], "pagination": { "total": 0, ... } }` because no padel facilities are seeded — that's a data thing, not an MCP thing. Try `Find me a tennis court in Dubai` to hit CyberSport.

## Why hosted instead of an npm package

We picked a hosted MCP server first because:
- One URL, zero install friction
- Same Vercel deployment as the rest of the app — no separate release pipeline
- Can be switched on/off via Vercel without users updating anything

A standalone `saha-mcp` npm package (with stdio transport, ideal for fully-local AI tooling) is tracked separately. It would wrap the same REST API.

## Operations

- **Logs**: Vercel function logs — filter by `/api/mcp`.
- **Rate limits**: not applied to the MCP route directly (Anthropic/Cursor connections are long-lived). The underlying REST calls are still bound by the `public_api` policy (60 req/min/IP).
- **Updating tools**: edit `src/app/api/mcp/route.ts`, ensure the Zod schemas match the REST endpoints, push. Clients pick up the new tool list on next reconnect.

## Internal architecture

```
Claude Desktop / Cursor / Cline
        │
        ▼ MCP Streamable HTTP (JSON-RPC over POST + SSE)
┌──────────────────────────────────┐
│  /api/mcp (mcp-handler 1.1.0)    │
│  ├─ search_facilities            │ ──► fetch /api/v1/facilities
│  ├─ get_facility                 │ ──► fetch /api/v1/facilities/{id}
│  └─ get_availability             │ ──► fetch /api/v1/facilities/{id}/availability
└──────────────────────────────────┘
                        │
                        ▼
                 Public REST API (SAH-35)
                        │
                        ▼
                 Supabase + RLS
```

Single source of truth: the REST API. The MCP layer is intentionally thin — re-implementing query logic here would drift over time.
