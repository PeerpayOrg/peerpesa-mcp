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

None of these steps run inside `peerpesa-mcp` — they're a call against
Self's SDK/contracts, done once (or whenever credentials rotate) as part of
standing up the agent, not on every tool call.

## If you want this server to expose registration status

Today nothing in `src/` talks to Self or Celo. If it becomes useful for the
calling agent to check its own registration status at runtime (rather than
this being a one-time setup step done outside the server), the natural
shape would be:

- A `selfAgentId.ts` adapter (mirroring `peerpesaClient.ts`) that wraps
  Self's SDK/contract calls — reads for status, and if needed writes for
  registration.
- New env vars in `config.ts` for whatever Self's SDK requires (wallet
  key/RPC endpoint/Self API credentials).
- A `get_agent_identity` tool in `index.ts` that surfaces registration
  status (registered / not / pending) to the calling agent, following the
  same `toolResult`/`toolError` pattern as the PeerPesa tools.

That's a genuinely separate integration (different SDK, different auth,
on-chain transactions instead of a REST API) — worth scoping as its own
piece of work rather than bolting onto the PeerPesa client.

## Where to go for details

This document summarizes the *shape* of registration for onboarding
purposes. For exact SDK calls, contract addresses, and current Self/ERC-8004
docs, go to Self's and the Celo Agent Visa program's own documentation —
those are the source of truth and will move faster than this file.
