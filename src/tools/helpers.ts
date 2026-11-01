import { PeerPesaApiError } from "../clients/peerpesa.js";

export function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function toolError(err: unknown) {
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
