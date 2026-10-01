import { parseProviderRuntimeReportJson } from "@bernouy/cms-repository/providers/installations";
import type { GatewayHttpNetwork } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { randomUUID } from "node:crypto";

/** A bounded, credential-safe report probe using the gateway's pinned public-or-loopback network policy. */
export async function fetchProviderReport(endpoint: string, token: string, network?: GatewayHttpNetwork) {
    const signal = AbortSignal.timeout(5_000);
    const transport = network ?? new NodeGatewayHttpNetwork({ resolveToken: async () => token });
    const response = await transport.exchange({
        origin: endpoint,
        pathAndQuery: "/ulvia/report",
        method: "GET",
        headers: {},
        requestId: randomUUID(),
        installationId: "provider-connection-preview",
        providerTokenRef: "${PENDING_PROVIDER_TOKEN}",
        invocationOrigin: "control",
        actorKind: "administrator",
        accept: "application/json",
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`Provider report request failed (${response.status})`);
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
                throw new Error("Provider report is too large");
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
    return parseProviderRuntimeReportJson(bytes);
}
