import { expect, test } from "bun:test";
import { gatewayRoute } from "../../../../features/cms-gateway/tests/fixtures";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { createInvocationIssuer } from "../../src/runtime/gateway/providers/issueInvocation";

async function fixture() {
    const route = structuredClone(await gatewayRoute());
    route.installation.observation!.observedAt = new Date().toISOString();
    const secret = "upstream-secret-" + "a".repeat(32);
    const targets: unknown[] = [];
    const issue = createInvocationIssuer(
        "site-a",
        { resolve: async () => route, isCurrent: async () => true },
        { get: async () => ({ grants: { default: "allow-selected", denied: [] } }) } as never,
        {
            authorize: async (target) => {
                targets.push(target);
                return true;
            },
        },
        async () => secret,
    );
    const input = {
        requestId: crypto.randomUUID(),
        installationId: "install-a",
        contractId: "catalog",
        contractVersion: "1.0.0",
        capabilityId: "item.list",
        sourceInstallationId: "source-a",
    };
    return { issue, input, route, secret, targets };
}

test("the broker signs only the current ready destination and verified Provider provenance", async () => {
    const f = await fixture();
    const result = await f.issue(f.input);
    expect(verifyProviderInvocationToken(result.token, f.secret)).toMatchObject({
        sourceInstallationId: "source-a",
        connectionId: "install-a",
    });
    expect(f.targets).toEqual([
        {
            sourceInstallationId: "source-a",
            targetInstallationId: "install-a",
            contractId: "catalog",
            capabilityId: "item.list",
            version: "1.0.0",
        },
    ]);
    await expect(f.issue({ ...f.input, subjectId: "user" })).rejects.toThrow("impersonate");
    await expect(f.issue({ ...f.input, systemServiceId: "cms-kernel" })).rejects.toThrow("impersonate");
});

test("a cached Kernel route cannot get a new token after destination disablement, unreadiness or expiry", async () => {
    for (const change of ["disabled", "not-ready", "stale"] as const) {
        const f = await fixture();
        if (change === "disabled") {
            f.route.installation.installation.status = "disabled";
        }
        if (change === "not-ready") {
            f.route.installation.observation!.report.implementations[0]!.status = "unavailable" as never;
        }
        if (change === "stale") {
            f.route.installation.observation!.observedAt = new Date(Date.now() - 301_000).toISOString();
        }
        await expect(f.issue(f.input)).rejects.toMatchObject({ status: 404 });
        expect(f.targets).toEqual([]);
    }
});
