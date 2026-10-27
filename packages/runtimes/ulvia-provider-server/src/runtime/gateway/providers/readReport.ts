import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { parseProviderRuntimeReportJson } from "@bernouy/cms-repository/providers/installations";

export async function readRemoteProviderReport(endpoint: string, token: string) {
    const network = new NodeGatewayHttpNetwork({ resolveToken: async () => token, allowPrivateAddresses: true });
    const response = await network.exchange({
        origin: endpoint,
        pathAndQuery: "/ulvia/report",
        method: "GET",
        headers: {},
        providerTokenRef: "probe",
        requestId: crypto.randomUUID(),
        authentication: { kind: "provider-control" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.body) {
        throw new TypeError("Provider report unavailable");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const item = await reader.read();
            if (item.done) {
                break;
            }
            length += item.value.byteLength;
            if (length > 256 * 1024) {
                await reader.cancel();
                throw new TypeError("Provider report too large");
            }
            chunks.push(item.value);
        }
    } finally {
        reader.releaseLock();
    }
    return parseProviderRuntimeReportJson(Buffer.concat(chunks));
}
