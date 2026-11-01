import { PeerPesaConfig } from "../config.js";

export interface Balance {
  currency: string;
  available: number;
  pending: number;
}

export interface Quote {
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  feeAmount: number;
  expiresAt: string;
}

export interface TransferRequest {
  quoteId?: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  recipient: {
    name: string;
    destination: string;
    method: "mobile_money" | "bank" | "wallet";
  };
  reference?: string;
}

export interface Transfer {
  transferId: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  recipient: string;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
}

export interface TransferListParams {
  status?: Transfer["status"];
  limit?: number;
  cursor?: string;
}

export interface TransferList {
  items: Transfer[];
  nextCursor?: string;
}

export class PeerPesaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "PeerPesaApiError";
  }
}

export class PeerPesaClient {
  constructor(private readonly config: PeerPesaConfig) {}

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | undefined> } = {}
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    if (init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(this.config.clientId ? { "X-Client-Id": this.config.clientId } : {}),
          ...init.headers,
        },
      });

      const text = await res.text();
      const body = text ? JSON.parse(text) : undefined;

      if (!res.ok) {
        throw new PeerPesaApiError(`PeerPesa API error ${res.status} on ${path}`, res.status, body);
      }
      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  getBalance(currency?: string): Promise<Balance[]> {
    return this.request<Balance[]>("/balance", { query: { currency } });
  }

  createQuote(params: { fromCurrency: string; toCurrency: string; amount: number }): Promise<Quote> {
    return this.request<Quote>("/quotes", { method: "POST", body: JSON.stringify(params) });
  }

  createTransfer(params: TransferRequest): Promise<Transfer> {
    return this.request<Transfer>("/transfers", { method: "POST", body: JSON.stringify(params) });
  }

  getTransfer(transferId: string): Promise<Transfer> {
    return this.request<Transfer>(`/transfers/${encodeURIComponent(transferId)}`);
  }

  listTransfers(params: TransferListParams = {}): Promise<TransferList> {
    return this.request<TransferList>("/transfers", {
      query: { status: params.status, limit: params.limit, cursor: params.cursor },
    });
  }

  cancelTransfer(transferId: string): Promise<Transfer> {
    return this.request<Transfer>(`/transfers/${encodeURIComponent(transferId)}/cancel`, {
      method: "POST",
    });
  }
}
