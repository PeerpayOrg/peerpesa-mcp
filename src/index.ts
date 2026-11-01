#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, loadSelfAgentIdConfig, loadCeloDefiConfig } from "./config.js";
import { PeerPesaClient } from "./clients/peerpesa.js";
import { SelfAgentIdClient } from "./clients/selfAgentId.js";
import { CeloDefiClient } from "./clients/celoDefi.js";
import { registerBalanceTools } from "./tools/balance.js";
import { registerTransferTools } from "./tools/transfers.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerDefiTools } from "./tools/defi.js";

const server = new McpServer({ name: "peerpesa-mcp", version: "0.1.0" });

const peerpesa = new PeerPesaClient(loadConfig());
const selfAgentId = new SelfAgentIdClient(loadSelfAgentIdConfig());
const celoDefi = new CeloDefiClient(loadCeloDefiConfig());

registerBalanceTools(server, peerpesa);
registerTransferTools(server, peerpesa);
registerIdentityTools(server, selfAgentId);
registerDefiTools(server, celoDefi);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("peerpesa-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting peerpesa-mcp:", err);
  process.exit(1);
});
