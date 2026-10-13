import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";
import { assertKernelProviderHandshake } from "@bernouy/ulvia-provider/kernel";
import type { GatewayHttpNetwork } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { randomUUID } from "node:crypto";

/** A bounded, credential-safe report probe using the gateway's pinned public-or-loopback network policy. */
export async function fetchProviderHandshake(endpoint: string, token: string, network?: GatewayHttpNetwork) {
    assertProviderConnectionToken(token);
    const signal = AbortSignal.timeout(5_000);
    const transport = network ?? new NodeGatewayHttpNetwork({ resolveToken: async () => token });
    const response = await transport.exchange({
        origin: endpoint,
        pathAndQuery: "/ulvia/kernel/v1/handshake",
        method: "GET",
        headers: {},
        requestId: randomUUID(),
        providerTokenRef: "${PENDING_PROVIDER_TOKEN}",
        authentication: { kind: "provider-control" },
        accept: "application/json",
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`Provider handshake request failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > 256 * 1024) {
                await reader.cancel();
                throw new Error("Provider handshake is too large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    assertKernelProviderHandshake(value);
    return value;
}
