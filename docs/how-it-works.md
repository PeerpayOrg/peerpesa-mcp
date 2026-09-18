# How peerpesa-mcp works

This doc explains the internals: how a tool call from an AI agent turns into
a PeerPesa API request and back, and where to make changes when something
needs to move.

## What MCP is, briefly

The [Model Context Protocol](https://modelcontextprotocol.io) is a standard
way for an AI agent (Claude, or any MCP-compatible client) to discover and
call tools exposed by a server. The agent doesn't know PeerPesa's REST API
exists — it only sees the tool names, descriptions, and input schemas this
server registers. This server's job is to translate between "agent calls a
tool" and "HTTP request to PeerPesa."

```
AI agent  <--MCP (stdio/JSON-RPC)-->  peerpesa-mcp  <--HTTPS-->  PeerPesa API
```

## Process lifecycle

1. An MCP client (Claude Desktop, Claude Code, etc.) launches this server as
   a child process: `node dist/index.js`.
2. [`src/config.ts`](../src/config.ts) loads environment variables (via
   `dotenv/config`, so a local `.env` file works too) into a typed
   `PeerPesaConfig`. If `PEERPESA_API_KEY` is missing, the process throws and
   exits immediately — fail fast rather than start in a broken state.
3. [`src/index.ts`](../src/index.ts) constructs one `PeerPesaClient` (see
   below), creates an `McpServer`, registers each tool, and connects a
   `StdioServerTransport`. From here the process just sits on stdin/stdout
   speaking MCP's JSON-RPC framing — there is no HTTP server, no open port.
4. The MCP client sends JSON-RPC requests over stdin; responses go back over
   stdout. `console.error` is used for the startup log line specifically
   because stdout is reserved for protocol traffic — anything written there
   that isn't a valid MCP message breaks the connection.

## Anatomy of one tool call

Take `create_quote` as an example, since it shows validation, the client
call, and both success/error paths.

1. **Registration** ([`index.ts`](../src/index.ts)): `server.registerTool`
   is called with a name, a human-readable title/description (this is what
   the agent reads to decide *when* to call the tool), and a `zod`
   `inputSchema`. MCP uses the zod schema to generate the JSON Schema the
   client validates arguments against before your handler ever runs.
2. **Handler runs**: once the agent calls the tool with arguments, the
   registered async function executes with already-validated,
   already-typed arguments (`fromCurrency`, `toCurrency`, `amount`).
3. **Delegation to the client**: the handler doesn't touch `fetch` itself —
   it calls `peerpesa.createQuote({ fromCurrency, toCurrency, amount })` on
   the shared `PeerPesaClient` instance.
4. **HTTP request** ([`peerpesaClient.ts`](../src/peerpesaClient.ts)):
   `PeerPesaClient#request` builds the URL against `config.baseUrl`,
   attaches `Authorization: Bearer <apiKey>` (and `X-Client-Id` if set),
   applies a timeout via `AbortController`, and does `fetch`.
5. **Response shaping**: on a non-2xx response, `request` throws a
   `PeerPesaApiError` carrying the HTTP status and parsed body. On success
   it returns the parsed JSON, typed as `Quote`.
6. **Back in the tool handler**: success is wrapped as
   `{ content: [{ type: "text", text: JSON.stringify(data) }] }` via the
   `toolResult` helper — this is the shape MCP expects a tool result to
   take. Failure goes through `toolError`, which turns a `PeerPesaApiError`
   into a readable `isError: true` message (HTTP status + body) instead of
   crashing the server process, so one bad call doesn't take down the
   connection for the rest of the session.

Every other tool (`get_balance`, `send_transfer`, `get_transfer_status`,
`list_transfers`, `cancel_transfer`) follows this exact same shape: zod
schema in, client method call, `toolResult`/`toolError` out.

## Why the code is split the way it is

| File | Responsibility |
|---|---|
| [`config.ts`](../src/config.ts) | Reads and validates env vars. The only file that knows *where* config comes from. |
| [`peerpesaClient.ts`](../src/peerpesaClient.ts) | The only file that knows PeerPesa's actual REST shape — paths, request/response fields, auth header, error format. |
| [`index.ts`](../src/index.ts) | The MCP surface: tool names, descriptions, input schemas. Talks only to `PeerPesaClient`, never to `fetch` directly. |

The point of this split: **when PeerPesa's real API spec differs from the
current placeholder endpoints** (`/balance`, `/quotes`, `/transfers`), you
only edit `peerpesaClient.ts`. The tool names/schemas any agent has already
learned to call stay stable.

## Auth model today

Every outbound request sends `Authorization: Bearer <PEERPESA_API_KEY>`,
plus `X-Client-Id: <PEERPESA_CLIENT_ID>` if that env var is set. This is a
guess at a typical scheme — confirm against PeerPesa's actual docs before
relying on it (see README "Before this goes anywhere near production").

## Error handling philosophy

Two failure modes are handled differently on purpose:

- **PeerPesa API errors** (4xx/5xx responses) become `PeerPesaApiError` and
  are surfaced to the agent as a structured, readable tool error — the
  agent can see the HTTP status and response body and potentially retry or
  explain the failure to the user.
- **Unexpected errors** (network failure, timeout abort, JSON parse error)
  are caught by the same `toolError` fallback and reported generically, so
  they never crash the whole MCP process — a broken call only fails that
  one tool invocation.

## Extending this server

To add a new PeerPesa operation as a tool:

1. Add the request/response types and a method to `PeerPesaClient` in
   `peerpesaClient.ts`.
2. Register a new tool in `index.ts` with a `zod` input schema and a
   handler that calls the new client method, wrapped in the same
   `toolResult`/`toolError` pattern.
3. Add a row to the "Tools exposed" table in the top-level `README.md`.

No other files should need to change.
