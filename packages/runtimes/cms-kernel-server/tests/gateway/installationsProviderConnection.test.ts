import { expect, test } from "bun:test";
import { fetchInstallationsProviderReport } from "../../src/runtime/gateway/fetchProviderReport";
import { InstallationsProviderTransport } from "../../src/runtime/gateway/InstallationsProviderTransport";

test("the public Provider report accepts a compatible installations control contract", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const report = providerReport();
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new InstallationsProviderTransport(endpoint, token, (async (url, init) => {
        requests.push({ url: url.toString(), init });
        return Response.json(report);
    }) as typeof fetch);
    const result = await fetchInstallationsProviderReport(transport);

    expect(result).toEqual(report);
    expect(requests[0]?.url).toBe("http://ulvia-provider:5103/ulvia/report");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(() => new InstallationsProviderTransport("https://api.provider.example", "invalid")).toThrow(
        "Invalid provider token",
    );
});

test("the public Provider report rejects incompatible installations control contracts", async () => {
    const report = providerReport();
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new InstallationsProviderTransport(endpoint, token, (async () =>
        Response.json(report)) as typeof fetch);

    report.implementations[0]!.status = "unavailable";
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("compatible control contract");
    report.implementations[0]!.status = "ready";
    report.implementations[0]!.digest = `sha256:${"b".repeat(64)}`;
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("compatible control contract");
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
                contractId: "ulvia.cms.installations",
                version: "1.0.0",
                digest: "sha256:447e0bd013efd0a1f78d9fde6c175f03429ef443cd69c285427aec95ed350e1f",
                status: "ready",
            },
        ],
    };
}
