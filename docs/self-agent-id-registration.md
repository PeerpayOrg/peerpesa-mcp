# Self Agent ID registration

This server gives an AI agent a way to *act* (check balance, send transfers)
but it doesn't give that agent a verifiable *identity*. Self Agent ID is the
separate registration step that does — it's what the Celo Agent Visa program
checks for before letting an agent operate. This doc lays out what that
registration involves and how it relates (or doesn't) to this codebase.

## Why this is a separate concern

`peerpesa-mcp` is a transport layer: it turns MCP tool calls into PeerPesa
API requests. It has no notion of *who* the calling agent is beyond
whatever credentials it was launched with (`PEERPESA_API_KEY`). Self Agent
ID registration answers a different question — "is this agent backed by a
real, verified human, and is that provable on-chain?" — which PeerPesa's
API doesn't need to know about, but the Celo Agent Visa program does.

Keeping these separate means:

- This server can be deployed, tested, and used against PeerPesa without
  ever touching Self's SDK or Celo.
- Identity registration doesn't need to know PeerPesa's endpoint shapes.
- Either piece can change independently (e.g. swap PeerPesa auth, or
  re-register identity) without breaking the other.

## Background: ERC-8004 and Self

- **ERC-8004** is an on-chain registry standard for agent identities —
  think of it as a public ledger of "this address represents an
  agent, and here's the metadata/attestations backing it."
- **Self** (self.xyz) provides a proof-of-human flow (identity verification
  without exposing raw personal data) and an SDK for registering an agent
  against the ERC-8004 registry, tying the agent's on-chain identity to a
  verified human operator.
- **Celo Agent Visa** is the program that consumes this registration —
  agents need a valid Self Agent ID / ERC-8004 entry to be admitted.

## Registration steps

1. **Generate or designate a wallet.** The agent needs a key pair / wallet
   address on Celo that will represent its on-chain identity. This is
   independent of any PeerPesa credentials.
2. **Complete Self's proof-of-human flow.** The human operator behind the
   agent (you, or whoever is accountable for its actions) goes through
   Self's verification flow. This produces an attestation that can be
   linked to the agent's wallet without exposing the underlying personal
   data on-chain.
3. **Register against ERC-8004.** Using Self's SDK, submit a registration
   transaction that writes the agent's identity (wallet address + the
   proof-of-human attestation) into the ERC-8004 registry on Celo mainnet.
4. **Apply to Celo Agent Visa.** With a valid registry entry, apply to the
   program using that registration as proof of a verified agent identity.

Most of this (steps 1–2, and the Celo Agent Visa application in step 4)
happens once, outside this codebase, against Self's own tooling. Step 3 —
writing the registration into ERC-8004 — is the part this server can
expose as a tool.

## What's scaffolded in this repo

`src/selfAgentId.ts` defines a `SelfAgentIdClient` (mirroring
`peerpesaClient.ts`'s shape) with two methods, wired up as MCP tools in
`index.ts`:

- `get_agent_identity` → `SelfAgentIdClient#getStatus()` — read-only status
  check.
- `register_agent_identity` → `SelfAgentIdClient#register()` — writes the
  ERC-8004 registration transaction. Like `send_transfer`, its tool
  description says to only call it with explicit user authorization.

Config lives in `config.ts` as `SelfAgentIdConfig` / `loadSelfAgentIdConfig()`,
reading four **optional** env vars (documented in `.env.example`):

| Variable | Purpose |
|---|---|
| `SELF_API_KEY` | Self API credential |
| `CELO_RPC_URL` | RPC endpoint for Celo mainnet |
| `AGENT_WALLET_PRIVATE_KEY` | The agent's wallet key used to sign the registration tx |
| `SELF_AGENT_REGISTRY_ADDRESS` | ERC-8004 registry contract address |

They're optional at the `config.ts` level — unlike `PEERPESA_API_KEY`, the
server still boots and serves the PeerPesa tools if these are unset.
`SelfAgentIdClient` checks for completeness itself: `getStatus()` returns
`{ status: "not_configured", ... }` rather than throwing, and `register()`
throws a clear `SelfAgentIdNotConfiguredError`.

**What's still a TODO:** both methods currently throw
"scaffolded but not implemented" once configured — there is no real call
into Self's SDK or the ERC-8004 contract yet. That's intentional: the exact
package, contract ABI, and call shape depend on Self's actual SDK docs (or
an existing registration's details), which need to be supplied before
wiring in the real implementation. Search for `TODO` in `selfAgentId.ts`
for the two spots that need it.

## Wiring in the real SDK

Once you have Self's SDK package name and API surface (or details of an
already-existing Self Agent ID this should connect to instead of
registering fresh), the change is contained to `selfAgentId.ts`:

1. Add the SDK as a dependency.
2. Replace the `TODO` blocks in `getStatus()` and `register()` with real
   SDK/contract calls, using `this.config` for credentials.
3. Fill in real values for the four env vars above in `.env`.

Nothing in `index.ts` needs to change — the tool surface (`get_agent_identity`,
`register_agent_identity`) stays the same, same as the PeerPesa split
described in `docs/how-it-works.md`.

## Where to go for details

This document summarizes the *shape* of registration for onboarding
purposes. For exact SDK calls, contract addresses, and current Self/ERC-8004
docs, go to Self's and the Celo Agent Visa program's own documentation —
those are the source of truth and will move faster than this file.
