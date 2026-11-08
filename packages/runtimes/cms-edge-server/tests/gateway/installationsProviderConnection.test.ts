import { expect, test } from "bun:test";
import { fetchInstallationsProviderReport } from "../../src/runtime/gateway/controlReport";
import { InstallationsProviderTransport } from "../../src/runtime/gateway/InstallationsProviderTransport";

test("the public Provider report accepts the exact installations control contract", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const report = await providerReport();
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

test("the public Provider report rejects unavailable or substituted installations control contracts", async () => {
    const report = await providerReport();
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new InstallationsProviderTransport(endpoint, token, (async () =>
        Response.json(report)) as typeof fetch);

    report.implementations[0]!.status = "unavailable";
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
    report.implementations[0]!.status = "ready";
    report.implementations[0]!.digest = `sha256:${"b".repeat(64)}`;
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
});

async function providerReport() {
    const manifest = await Bun.file(
        new URL("../../../ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json", import.meta.url),
    ).json();
    const current = manifest.implementations.find(
        (item: { contractId: string }) => item.contractId === "ulvia/cms.installations",
    );
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia/ulvia.example",
        instanceId: "instance:account-a",
        account: { id: "account-a", label: "Account A" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
        implementations: [
            {
                contractId: "ulvia/cms.installations",
                version: current.version,
                digest: current.digest,
                status: "ready",
            },
        ],
    };
}

test("the control contract refuses a substituted digest and an unselected version", async () => {
    const report = await providerReport();
    report.implementations[0] = {
        contractId: "ulvia/cms.installations",
        version: "1.0.0",
        digest: `sha256:${"b".repeat(64)}`,
        status: "ready",
    };
    const transport = new InstallationsProviderTransport(
        "https://provider.test",
        "provider-token-at-least-twenty",
        (async () => Response.json(report)) as typeof fetch,
    );
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
    report.implementations[0]!.version = "1.0.1";
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
});
