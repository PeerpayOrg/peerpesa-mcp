import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PeerPesaClient } from "../clients/peerpesa.js";
import { toolResult, toolError } from "./helpers.js";

export function registerBalanceTools(server: McpServer, client: PeerPesaClient) {
  server.registerTool(
    "get_balance",
    {
      title: "Get PeerPesa balance",
      description:
        "Return the current available and pending balance on the PeerPesa account, " +
        "optionally filtered to a single currency (e.g. 'KES', 'UGX', 'USD').",
      inputSchema: {
        currency: z.string().optional().describe("ISO currency code to filter by, e.g. KES"),
      },
    },
    async ({ currency }) => {
      try {
        return toolResult(await client.getBalance(currency));
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
