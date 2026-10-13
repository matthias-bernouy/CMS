import { expect, test } from "bun:test";
import { fetchProviderHandshake } from "../../src/runtime/gateway/fetchProviderReport";

test("provider connection previews accept a pinned remote HTTPS endpoint", async () => {
    const requests: unknown[] = [];
    const report = providerReport();
    const handshake = {
        protocol: "ulvia-kernel-provider/v1",
        instance: { id: report.instanceId, status: "ready", revision: 3 },
        activeProfile: { id: "ulvia.official", version: "1.1.0" },
        contentRevision: 12,
        runtime: report,
    };
    const result = await fetchProviderHandshake("https://api.provider.example", "provider-token-at-least-twenty", {
        exchange: async (request) => {
            requests.push(request);
            return Response.json(handshake);
        },
    });

    expect(result).toEqual(handshake);
    expect(requests).toMatchObject([
        {
            origin: "https://api.provider.example",
            pathAndQuery: "/ulvia/kernel/v1/handshake",
            method: "GET",
            authentication: { kind: "provider-control" },
        },
    ]);
    await expect(
        fetchProviderHandshake("https://api.provider.example", "invalid", {
            exchange: async () => Response.json(handshake),
        }),
    ).rejects.toThrow("Invalid provider token");
});

function providerReport() {
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.example",
        instanceId: "instance:account-a",
        account: { id: "account-a", label: "Account A" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
        implementations: [
            {
                contractId: "catalog.items",
                version: "1.0.0",
                digest: `sha256:${"b".repeat(64)}`,
                status: "ready",
            },
        ],
    };
}
