/**
 * Central place for everything environment-specific.
 * Swap PEERPESA_BASE_URL / auth scheme here once real credentials exist —
 * nothing else in the server should need to change.
 */
import "dotenv/config";

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
