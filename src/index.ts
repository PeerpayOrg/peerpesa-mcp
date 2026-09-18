#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { PeerPesaApiError, PeerPesaClient } from "./peerpesaClient.js";

const config = loadConfig();
const peerpesa = new PeerPesaClient(config);

const server = new McpServer({
  name: "peerpesa-mcp",
  version: "0.1.0",
});

/**
 * Wrap a tool handler so PeerPesa API errors come back to the calling agent
 * as a structured, readable failure instead of an uncaught exception.
 */
function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(err: unknown) {
  if (err instanceof PeerPesaApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `PeerPesa API error (HTTP ${err.status}): ${JSON.stringify(err.body)}`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: `Unexpected error: ${message}` }] };
}

// ---------------------------------------------------------------------------
// Tool: get_balance
// ---------------------------------------------------------------------------
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
      const balances = await peerpesa.getBalance(currency);
      return toolResult(balances);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: create_quote
// ---------------------------------------------------------------------------
server.registerTool(
  "create_quote",
  {
    title: "Create an FX quote",
    description:
      "Lock in an exchange rate for converting an amount from one currency to another " +
      "before sending a transfer. Returns a quoteId that can be passed to send_transfer.",
    inputSchema: {
      fromCurrency: z.string().describe("ISO currency code to convert from, e.g. USD"),
      toCurrency: z.string().describe("ISO currency code to convert to, e.g. KES"),
      amount: z.number().positive().describe("Amount in fromCurrency"),
    },
  },
  async ({ fromCurrency, toCurrency, amount }) => {
    try {
      const quote = await peerpesa.createQuote({ fromCurrency, toCurrency, amount });
      return toolResult(quote);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: send_transfer
// ---------------------------------------------------------------------------
server.registerTool(
  "send_transfer",
  {
    title: "Send a transfer",
    description:
      "Initiate a payment to a recipient via mobile money, bank, or wallet. " +
      "Pass a quoteId from create_quote to guarantee the rate, or omit it to use the live rate. " +
      "This moves real funds — only call it when the calling agent has explicit user authorization.",
    inputSchema: {
      quoteId: z.string().optional().describe("Optional quoteId from create_quote"),
      fromCurrency: z.string(),
      toCurrency: z.string(),
      amount: z.number().positive(),
      recipientName: z.string(),
      recipientDestination: z
        .string()
        .describe("Phone number, mobile money handle, or account number"),
      recipientMethod: z.enum(["mobile_money", "bank", "wallet"]),
      reference: z.string().optional().describe("Optional client-side reference/memo"),
    },
  },
  async ({
    quoteId,
    fromCurrency,
    toCurrency,
    amount,
    recipientName,
    recipientDestination,
    recipientMethod,
    reference,
  }) => {
    try {
      const transfer = await peerpesa.createTransfer({
        quoteId,
        fromCurrency,
        toCurrency,
        amount,
        recipient: {
          name: recipientName,
          destination: recipientDestination,
          method: recipientMethod,
        },
        reference,
      });
      return toolResult(transfer);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: get_transfer_status
// ---------------------------------------------------------------------------
server.registerTool(
  "get_transfer_status",
  {
    title: "Get transfer status",
    description: "Look up the current status of a single transfer by its transferId.",
    inputSchema: {
      transferId: z.string(),
    },
  },
  async ({ transferId }) => {
    try {
      const transfer = await peerpesa.getTransfer(transferId);
      return toolResult(transfer);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: list_transfers
// ---------------------------------------------------------------------------
server.registerTool(
  "list_transfers",
  {
    title: "List transfers",
    description:
      "List recent transfers, optionally filtered by status, with cursor-based pagination.",
    inputSchema: {
      status: z
        .enum(["pending", "processing", "completed", "failed", "cancelled"])
        .optional(),
      limit: z.number().int().positive().max(100).optional(),
      cursor: z.string().optional(),
    },
  },
  async ({ status, limit, cursor }) => {
    try {
      const list = await peerpesa.listTransfers({ status, limit, cursor });
      return toolResult(list);
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: cancel_transfer
// ---------------------------------------------------------------------------
server.registerTool(
  "cancel_transfer",
  {
    title: "Cancel a transfer",
    description:
      "Cancel a pending transfer by transferId. Only works while the transfer has not yet processed.",
    inputSchema: {
      transferId: z.string(),
    },
  },
  async ({ transferId }) => {
    try {
      const transfer = await peerpesa.cancelTransfer(transferId);
      return toolResult(transfer);
    } catch (err) {
      return toolError(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("peerpesa-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting peerpesa-mcp:", err);
  process.exit(1);
});
