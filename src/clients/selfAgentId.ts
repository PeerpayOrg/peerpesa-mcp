import { SelfAgentIdConfig } from "../config.js";

export type AgentIdentityStatus = "not_configured" | "unregistered" | "pending" | "registered";

export interface AgentIdentity {
  status: AgentIdentityStatus;
  walletAddress?: string;
  registryAddress?: string;
  detail: string;
}

export class SelfAgentIdNotConfiguredError extends Error {
  constructor() {
    super(
      "Self Agent ID is not configured. Set SELF_API_KEY, CELO_RPC_URL, " +
        "AGENT_WALLET_PRIVATE_KEY, and SELF_AGENT_REGISTRY_ADDRESS " +
        "(see docs/self-agent-id-registration.md)."
    );
    this.name = "SelfAgentIdNotConfiguredError";
  }
}

export class SelfAgentIdClient {
  constructor(private readonly config: SelfAgentIdConfig) {}

  private isConfigured(): boolean {
    return Boolean(
      this.config.apiKey &&
        this.config.celoRpcUrl &&
        this.config.agentWalletPrivateKey &&
        this.config.registryAddress
    );
  }

  async getStatus(): Promise<AgentIdentity> {
    if (!this.isConfigured()) {
      return {
        status: "not_configured",
        detail: "Self Agent ID env vars are not set — see docs/self-agent-id-registration.md.",
      };
    }

    // TODO: replace with a real call into Self's SDK once it's wired in.
    throw new Error(
      "SelfAgentIdClient.getStatus is scaffolded but not implemented — " +
        "wire in Self's SDK call here. See docs/self-agent-id-registration.md."
    );
  }

  async register(): Promise<AgentIdentity> {
    if (!this.isConfigured()) {
      throw new SelfAgentIdNotConfiguredError();
    }

    // TODO: replace with a real call into Self's SDK once it's wired in.
    throw new Error(
      "SelfAgentIdClient.register is scaffolded but not implemented — " +
        "wire in Self's SDK call here. See docs/self-agent-id-registration.md."
    );
  }
}
