# peerpesa-mcp

An MCP (Model Context Protocol) server that exposes PeerPesa's payment API as
tools an AI agent can call directly: check balance, quote an FX rate, send a
transfer, check status, list history, cancel.

See [docs/how-it-works.md](docs/how-it-works.md) for a deeper walkthrough of
the request lifecycle, the MCP tool-call flow, and where to make changes.

## Structure

```
src/
  config.ts          env var loading (base URL, API key, client id, timeout)
  peerpesaClient.ts   the ONLY file that knows PeerPesa's actual REST shape
  index.ts            MCP server: registers each PeerPesa op as a tool
```

The split matters: `peerpesaClient.ts` is a thin adapter. When you have the
real PeerPesa OpenAPI/Postman spec, you edit endpoint paths, field names, and
auth header format in that one file. The MCP tool surface in `index.ts`
(tool names, input schemas, descriptions) stays stable for any agent already
calling it.

**The endpoint paths and response fields in `peerpesaClient.ts` right now are
placeholders** based on a typical mobile-money/remittance API (`/balance`,
`/quotes`, `/transfers`) — swap them for PeerPesa's actual routes before
this talks to anything real.

## Tools exposed

| Tool | Purpose |
|---|---|
| `get_balance` | Current available/pending balance, optionally by currency |
| `create_quote` | Lock an FX rate before sending |
| `send_transfer` | Initiate a payment (mobile money / bank / wallet) |
| `get_transfer_status` | Look up one transfer by id |
| `list_transfers` | Paginated transfer history, filterable by status |
| `cancel_transfer` | Cancel a still-pending transfer |

## Setup

```bash
npm install
npm run build
```

Set credentials as environment variables (never hardcode them). Copy
`.env.example` to `.env` and fill in real values — it's loaded automatically
and gitignored:

```bash
cp .env.example .env
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PEERPESA_API_KEY` | yes | — | Bearer token on every request |
| `PEERPESA_BASE_URL` | no | `https://api.peerpesa.com/v1` | API base URL |
| `PEERPESA_CLIENT_ID` | no | — | Sent as `X-Client-Id` header if set |
| `PEERPESA_TIMEOUT_MS` | no | `15000` | Per-request timeout in ms |

Run directly for local testing:

```bash
npm run dev
```

## Wiring into an MCP client (Claude Desktop, etc.)

Add to the client's MCP config, e.g. `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "peerpesa": {
      "command": "node",
      "args": ["/absolute/path/to/peerpesa-mcp/dist/index.js"],
      "env": {
        "PEERPESA_API_KEY": "sk_live_...",
        "PEERPESA_BASE_URL": "https://api.peerpesa.com/v1"
      }
    }
  }
}
```

## Before this goes anywhere near production

1. **Replace placeholder endpoints.** Everything in `peerpesaClient.ts` —
   paths, request bodies, response field names, error shape — is a guess at
   a typical payments API. Map it to PeerPesa's actual spec.
2. **Auth scheme.** Currently assumes `Authorization: Bearer <key>`. Check
   whether PeerPesa uses HMAC signing, OAuth, or a different header instead.
3. **Idempotency.** `send_transfer` moves real funds. Add an idempotency
   key (most payment APIs support one) so a retried MCP call can't double-send.
4. **Authorization boundary.** The tool description on `send_transfer` says
   to only call it with explicit user authorization — but that's a prompt
   instruction, not an enforced control. Decide whether transfers above a
   threshold need a human-in-the-loop confirmation step enforced server-side
   (e.g. a pending/confirm two-step flow) rather than relying on agent
   behavior alone.
5. **Rate limits & retries.** Add backoff/retry on 429s if PeerPesa enforces
   rate limits.
6. **Self Agent ID.** This wrapper is the transport layer only. Registering
   the agent's identity (proof-of-human, ERC-8004 registry entry) is a
   separate step on top of this server, needed before applying to the Celo
   Agent Visa program.

## Next step: Self Agent ID registration

This wrapper alone doesn't give the calling agent a verifiable identity — it
just exposes PeerPesa. To register with Self Agent ID (which sits on the
existing ERC-8004 registry on Celo mainnet):

1. Generate or designate the agent's key pair / wallet address.
2. Complete Self's proof-of-human flow for the human operator behind the agent.
3. Register the agent against the ERC-8004 registry via Self's SDK, associating
   it with this MCP server's identity.
4. Once verified, apply to the Celo Agent Visa program using that registration.

That registration step is independent of this codebase — it's a call against
Self's SDK/contracts, not something this MCP server needs to implement itself
unless you want the MCP server to also expose an `get_agent_identity` tool
that surfaces the registration status to callers.
# peerpesa-mcp
