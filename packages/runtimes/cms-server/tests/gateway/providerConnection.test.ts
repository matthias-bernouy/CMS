import { expect, test } from "bun:test";
import { fetchProviderReport } from "../../src/runtime/gateway/fetchProviderReport";

test("provider connection previews accept a pinned remote HTTPS endpoint", async () => {
    const requests: unknown[] = [];
    const report = providerReport();
    const result = await fetchProviderReport("https://api.provider.example", "provider-token-at-least-twenty", {
        exchange: async (request) => {
            requests.push(request);
            return Response.json(report);
        },
    });

    expect(result).toEqual(report);
    expect(requests).toMatchObject([
        {
            origin: "https://api.provider.example",
            pathAndQuery: "/ulvia/report",
            method: "GET",
            invocationOrigin: "control",
            actorKind: "administrator",
        },
    ]);
});

function providerReport() {
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.example",
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
