import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SelfAgentIdClient } from "../clients/selfAgentId.js";
import { toolResult, toolError } from "./helpers.js";

export function registerIdentityTools(server: McpServer, client: SelfAgentIdClient) {
  server.registerTool(
    "get_agent_identity",
    {
      title: "Get Self Agent ID status",
      description:
        "Check whether this agent has a verifiable Self Agent ID (ERC-8004 registry entry " +
        "on Celo). Returns status 'not_configured' if the server hasn't been set up with " +
        "Self credentials yet.",
      inputSchema: {},
    },
    async () => {
      try {
        return toolResult(await client.getStatus());
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "register_agent_identity",
    {
      title: "Register Self Agent ID",
      description:
        "Register this agent's wallet against the ERC-8004 registry via Self, creating the " +
        "verifiable on-chain identity required for the Celo Agent Visa program. This writes " +
        "an on-chain transaction — only call it when the calling agent has explicit user authorization.",
      inputSchema: {},
    },
    async () => {
      try {
        return toolResult(await client.register());
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
