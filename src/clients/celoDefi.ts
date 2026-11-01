import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import type { CeloDefiConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Token registry — all Celo mainnet ERC-20 tokens (18 decimals each)
// ---------------------------------------------------------------------------
export type TokenSymbol = "CELO" | "CUSD" | "CEUR" | "USDC" | "USDT";

interface TokenMeta {
  address: Address;
  decimals: number;
  name: string;
}

export const TOKENS: Record<TokenSymbol, TokenMeta> = {
  // 18-decimal Celo-native tokens
  CELO: {
    address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
    decimals: 18,
    name: "Celo Native Asset",
  },
  CUSD: {
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    name: "Celo Dollar",
  },
  CEUR: {
    address: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",
    decimals: 18,
    name: "Celo Euro",
  },
  // 6-decimal USD stablecoins (USDC/USDT use 6 decimals — NOT 18)
  USDC: {
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    name: "USD Coin",
  },
  USDT: {
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    name: "Tether USD",
  },
};

// ---------------------------------------------------------------------------
// Uniswap V3 contract addresses (Celo mainnet)
// ---------------------------------------------------------------------------
const FACTORY_ADDRESS: Address = "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc";
const QUOTER_V2_ADDRESS: Address = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8";
const SWAP_ROUTER_ADDRESS: Address = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";

// Fee tiers searched in ascending order (cheapest first)
const FEE_TIERS = [100, 500, 3000, 10000] as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// ABIs (minimal, inline — no SDK dependency)
// ---------------------------------------------------------------------------
const FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

// QuoterV2.quoteExactInputSingle is technically nonpayable but safe to call
// via eth_call (no state change occurs); marking as view lets readContract work.
const QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// SwapRouter02 — no deadline field (removed vs SwapRouter01)
const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------
export interface QuoteResult {
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
  /** Human-readable input amount (e.g. "1.5") */
  amountIn: string;
  /** Human-readable quoted output amount */
  amountOut: string;
  /** tokenOut per 1 tokenIn */
  rate: string;
  /** Uniswap V3 fee tier in basis points (100 = 0.01%) */
  feeTierBps: number;
}

export interface SwapResult {
  status: "success" | "failed";
  txHash: string;
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
  amountIn: string;
  /** Quoted output at time of swap (actual may differ by slippage) */
  quotedAmountOut: string;
}

export class CeloDefiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CeloDefiError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export class CeloDefiClient {
  private readonly publicClient;

  constructor(private readonly config: CeloDefiConfig) {
    this.publicClient = createPublicClient({
      chain: celo,
      transport: http(config.rpcUrl),
    });
  }

  private resolveToken(symbol: string): TokenMeta & { symbol: TokenSymbol } {
    const key = symbol.toUpperCase() as TokenSymbol;
    const meta = TOKENS[key];
    if (!meta) {
      throw new CeloDefiError(
        `Unsupported token "${symbol}". Supported: ${Object.keys(TOKENS).join(", ")}.`
      );
    }
    return { ...meta, symbol: key };
  }

  /** Find the lowest-fee pool that exists for a pair. */
  private async findPool(
    tokenA: Address,
    tokenB: Address
  ): Promise<{ fee: number }> {
    for (const fee of FEE_TIERS) {
      const pool = await this.publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
      });
      if (pool !== ZERO_ADDRESS) return { fee };
    }
    throw new CeloDefiError(
      "No Uniswap V3 pool found for this token pair on Celo mainnet."
    );
  }

  /**
   * Quote a swap without executing it.
   * @param tokenInSymbol  "CELO" | "CUSD" | "CEUR"
   * @param tokenOutSymbol "CELO" | "CUSD" | "CEUR"
   * @param amountHuman    Input amount in human-readable units (e.g. 1.5 for 1.5 CELO)
   */
  async getQuote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountHuman: number
  ): Promise<QuoteResult> {
    const tokenIn = this.resolveToken(tokenInSymbol);
    const tokenOut = this.resolveToken(tokenOutSymbol);

    // Convert to raw units using each token's actual decimals
    const amountInRaw = parseUnits(amountHuman.toString(), tokenIn.decimals);

    const { fee } = await this.findPool(tokenIn.address, tokenOut.address);

    const [amountOutRaw] = await this.publicClient.readContract({
      address: QUOTER_V2_ADDRESS,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amountInRaw,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const amountOutHuman = formatUnits(amountOutRaw, tokenOut.decimals);
    const rate = (Number(amountOutHuman) / amountHuman).toFixed(6);

    return {
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: amountHuman.toString(),
      amountOut: amountOutHuman,
      rate,
      feeTierBps: fee,
    };
  }

  /**
   * Execute an exact-input swap on Uniswap V3.
   * Requires AGENT_WALLET_PRIVATE_KEY in config.
   * @param slippagePct  Slippage tolerance in percent (default 1 = 1%)
   */
  async executeSwap(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountHuman: number,
    slippagePct = 1
  ): Promise<SwapResult> {
    if (!this.config.privateKey) {
      throw new CeloDefiError(
        "AGENT_WALLET_PRIVATE_KEY is required to execute swaps."
      );
    }

    const tokenIn = this.resolveToken(tokenInSymbol);
    const tokenOut = this.resolveToken(tokenOutSymbol);

    const rawKey = this.config.privateKey.startsWith("0x")
      ? (this.config.privateKey as Hex)
      : (`0x${this.config.privateKey}` as Hex);
    const account = privateKeyToAccount(rawKey);

    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(this.config.rpcUrl),
    });

    const amountInRaw = parseUnits(amountHuman.toString(), tokenIn.decimals);
    const { fee } = await this.findPool(tokenIn.address, tokenOut.address);

    const [amountOutRaw] = await this.publicClient.readContract({
      address: QUOTER_V2_ADDRESS,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amountInRaw,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    if (amountOutRaw === 0n) {
      throw new CeloDefiError(
        "Quote returned zero output — pool may have insufficient liquidity."
      );
    }

    // Slippage: floor(slippagePct * 100) basis points out of 10000
    const slippageBps = BigInt(Math.floor(slippagePct * 100));
    const amountOutMinimum = (amountOutRaw * (10000n - slippageBps)) / 10000n;

    // Approve router to spend tokenIn if current allowance is insufficient
    const allowance = await this.publicClient.readContract({
      address: tokenIn.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, SWAP_ROUTER_ADDRESS],
    });

    if (allowance < amountInRaw) {
      const approveTx = await walletClient.writeContract({
        address: tokenIn.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_ROUTER_ADDRESS, amountInRaw],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    const swapTx = await walletClient.writeContract({
      address: SWAP_ROUTER_ADDRESS,
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee,
          recipient: account.address,
          amountIn: amountInRaw,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: swapTx });

    return {
      status: receipt.status === "success" ? "success" : "failed",
      txHash: swapTx,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: amountHuman.toString(),
      quotedAmountOut: formatUnits(amountOutRaw, tokenOut.decimals),
    };
  }
}
