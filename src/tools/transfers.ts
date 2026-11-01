import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PeerPesaClient } from "../clients/peerpesa.js";
import { toolResult, toolError } from "./helpers.js";

export function registerTransferTools(server: McpServer, client: PeerPesaClient) {
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
        return toolResult(await client.createQuote({ fromCurrency, toCurrency, amount }));
      } catch (err) {
        return toolError(err);
      }
    }
  );

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
    async ({ quoteId, fromCurrency, toCurrency, amount, recipientName, recipientDestination, recipientMethod, reference }) => {
      try {
        return toolResult(
          await client.createTransfer({
            quoteId,
            fromCurrency,
            toCurrency,
            amount,
            recipient: { name: recipientName, destination: recipientDestination, method: recipientMethod },
            reference,
          })
        );
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_transfer_status",
    {
      title: "Get transfer status",
      description: "Look up the current status of a single transfer by its transferId.",
      inputSchema: { transferId: z.string() },
    },
    async ({ transferId }) => {
      try {
        return toolResult(await client.getTransfer(transferId));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "list_transfers",
    {
      title: "List transfers",
      description:
        "List recent transfers, optionally filtered by status, with cursor-based pagination.",
      inputSchema: {
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().optional(),
      },
    },
    async ({ status, limit, cursor }) => {
      try {
        return toolResult(await client.listTransfers({ status, limit, cursor }));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "cancel_transfer",
    {
      title: "Cancel a transfer",
      description:
        "Cancel a pending transfer by transferId. Only works while the transfer has not yet processed.",
      inputSchema: { transferId: z.string() },
    },
    async ({ transferId }) => {
      try {
        return toolResult(await client.cancelTransfer(transferId));
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
