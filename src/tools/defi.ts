import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CeloDefiClient, TOKENS } from "../clients/celoDefi.js";
import { toolResult, toolError } from "./helpers.js";

const TOKEN_SYMBOLS = Object.keys(TOKENS) as [string, ...string[]];

export function registerDefiTools(server: McpServer, client: CeloDefiClient) {
  server.registerTool(
    "get_defi_quote",
    {
      title: "Get Uniswap V3 swap quote (Celo)",
      description:
        "Get a price quote for swapping between CELO, cUSD, or cEUR on Uniswap V3 (Celo mainnet). " +
        "Input amounts are in human-readable units (e.g. 1.5 for 1.5 CELO). " +
        "All three tokens have 18 decimals — conversion is handled automatically. " +
        "Does NOT execute a transaction.",
      inputSchema: {
        tokenIn: z
          .enum(TOKEN_SYMBOLS as [string, ...string[]])
          .describe("Token to sell: CELO, CUSD, or CEUR"),
        tokenOut: z
          .enum(TOKEN_SYMBOLS as [string, ...string[]])
          .describe("Token to buy: CELO, CUSD, or CEUR"),
        amount: z
          .number()
          .positive()
          .describe("Amount of tokenIn in human-readable units (e.g. 1.5)"),
      },
    },
    async ({ tokenIn, tokenOut, amount }) => {
      try {
        return toolResult(await client.getQuote(tokenIn, tokenOut, amount));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "execute_defi_swap",
    {
      title: "Execute Uniswap V3 swap (Celo)",
      description:
        "Execute an exact-input token swap on Uniswap V3 (Celo mainnet). " +
        "Supported pairs: CELO ↔ cUSD ↔ cEUR. " +
        "Input amounts are in human-readable units — decimals (18) are applied automatically. " +
        "Approves the router if needed, then calls exactInputSingle on SwapRouter02. " +
        "This is an on-chain transaction that moves real funds — " +
        "only call it when the user has given explicit authorization. " +
        "Requires AGENT_WALLET_PRIVATE_KEY to be configured.",
      inputSchema: {
        tokenIn: z
          .enum(TOKEN_SYMBOLS as [string, ...string[]])
          .describe("Token to sell: CELO, CUSD, or CEUR"),
        tokenOut: z
          .enum(TOKEN_SYMBOLS as [string, ...string[]])
          .describe("Token to buy: CELO, CUSD, or CEUR"),
        amount: z
          .number()
          .positive()
          .describe("Amount of tokenIn in human-readable units (e.g. 1.5)"),
        slippagePct: z
          .number()
          .positive()
          .max(50)
          .optional()
          .describe("Slippage tolerance in percent (default 1 = 1%)"),
      },
    },
    async ({ tokenIn, tokenOut, amount, slippagePct }) => {
      try {
        return toolResult(await client.executeSwap(tokenIn, tokenOut, amount, slippagePct));
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
