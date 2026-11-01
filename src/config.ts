/**
 * Central place for everything environment-specific.
 * Swap PEERPESA_BASE_URL / auth scheme here once real credentials exist —
 * nothing else in the server should need to change.
 */
export interface PeerPesaConfig {
  baseUrl: string;
  apiKey: string;
  /** Some fintech APIs also want a client/partner id alongside the key. */
  clientId?: string;
  /** Default timeout for outbound calls, ms. */
  timeoutMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in your MCP client config (e.g. claude_desktop_config.json "env" block) or a .env file.`
    );
  }
  return value;
}

export function loadConfig(): PeerPesaConfig {
  return {
    baseUrl: process.env.PEERPESA_BASE_URL ?? "https://api.peerpesa.com/v1",
    apiKey: requireEnv("PEERPESA_API_KEY"),
    clientId: process.env.PEERPESA_CLIENT_ID,
    timeoutMs: Number(process.env.PEERPESA_TIMEOUT_MS ?? 15000),
  };
}

/**
 * Self Agent ID (ERC-8004 registry on Celo) credentials — see
 * docs/self-agent-id-registration.md. Unlike PeerPesa config, these are
 * all optional: the server must still boot and serve PeerPesa tools when
 * identity registration hasn't been set up yet. SelfAgentIdClient checks
 * for completeness itself before making any call.
 */
export interface SelfAgentIdConfig {
  apiKey?: string;
  celoRpcUrl?: string;
  agentWalletPrivateKey?: string;
  registryAddress?: string;
}

export function loadSelfAgentIdConfig(): SelfAgentIdConfig {
  return {
    apiKey: process.env.SELF_API_KEY,
    celoRpcUrl: process.env.CELO_RPC_URL,
    agentWalletPrivateKey: process.env.AGENT_WALLET_PRIVATE_KEY,
    registryAddress: process.env.SELF_AGENT_REGISTRY_ADDRESS,
  };
}

/**
 * Celo DeFi (Uniswap V3) config. Shares CELO_RPC_URL and AGENT_WALLET_PRIVATE_KEY
 * with the Self Agent ID setup. rpcUrl defaults to Celo's public endpoint so
 * read-only quote operations work without any extra config.
 */
export interface CeloDefiConfig {
  rpcUrl: string;
  /** Required only for execute_defi_swap — omit for quote-only use. */
  privateKey?: string;
}

export function loadCeloDefiConfig(): CeloDefiConfig {
  return {
    rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
    privateKey: process.env.AGENT_WALLET_PRIVATE_KEY,
  };
}
