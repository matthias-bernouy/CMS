import { expect, test } from "bun:test";
import { gatewayRoute } from "../../../../features/cms-gateway/tests/fixtures";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { createInvocationIssuer } from "../../src/runtime/gateway/providers/authority/issueInvocation";

async function fixture(options: Parameters<typeof gatewayRoute>[0] = {}) {
    const route = structuredClone(await gatewayRoute(options));
    route.installation.observation!.observedAt = new Date().toISOString();
    const secret = "upstream-secret-" + "a".repeat(32);
    const targets: unknown[] = [];
    const issue = createInvocationIssuer(
        "site-a",
        { resolve: async () => route, isCurrent: async () => true },
        { get: async () => ({ grants: { default: "allow-selected", denied: [] } }) } as never,
        {
            consumeBudget: async () => true,
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
        contractId: route.requestedRelease.admission.release.contractId,
        contractVersion: route.requestedRelease.admission.release.version,
        capabilityId: route.requestedRelease.admission.release.capabilities[0]!.id,
        sourceInstallationId: "source-a",
        sourceCredentialFingerprint: "f".repeat(64),
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
    expect(f.targets).toHaveLength(2);
    for (const target of f.targets) {
        expect(target).toEqual({
            sourceInstallationId: "source-a",
            sourceCredentialFingerprint: "f".repeat(64),
            targetInstallationId: "install-a",
            contractId: "catalog",
            capabilityId: "item.list",
            version: "1.0.0",
        });
    }
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

test("the final broker fence rejects authority revoked while resolving the destination secret", async () => {
    const f = await fixture();
    let current = true;
    const issue = createInvocationIssuer(
        "site-a",
        { resolve: async () => f.route, isCurrent: async () => true },
        { get: async () => ({ grants: { default: "allow-selected", denied: [] } }) } as never,
        { authorize: async () => current, consumeBudget: async () => true },
        async () => {
            current = false;
            return f.secret;
        },
    );
    await expect(issue(f.input)).rejects.toMatchObject({ status: 403 });
});

test("delegated signing derives the alias from the live actor and never falls back to machine authority", async () => {
    const f = await fixture();
    const rootRequestId = crypto.randomUUID();
    const checks: boolean[] = [];
    const issue = createInvocationIssuer(
        "site-a",
        { resolve: async () => f.route, isCurrent: async () => true },
        { get: async () => ({ grants: { default: "allow-selected", denied: [] } }) } as never,
        {
            authorize: async () => {
                throw new Error("Machine fallback must never run");
            },
            consumeBudget: async () => true,
        },
        async () => f.secret,
        {
            issue: async () => null,
            close: async () => {},
            check: async (_target, consume = false) => {
                checks.push(consume);
                return { actor: { kind: "user", subjectId: "global-user", authorizationRevision: 3 }, rootRequestId };
            },
        },
        { getOrCreate: async () => "opaque-target-alias", resolve: async () => null },
    );
    const input = { ...f.input, delegatedTicket: "t".repeat(43) };
    const issued = await issue(input);
    const claims = verifyProviderInvocationToken(issued.token, f.secret);
    expect(claims).toMatchObject({ subjectId: "opaque-target-alias", sourceInstallationId: "source-a", rootRequestId });
    expect(claims.delegationTicket).toBeUndefined();
    expect(JSON.stringify(claims)).not.toContain("global-user");
    expect(checks).toEqual([true, false]);
    await expect(issue({ ...input, subjectId: "forged-alias" })).rejects.toMatchObject({ status: 403 });
    await expect(issue({ ...input, sourceCredentialFingerprint: undefined })).rejects.toMatchObject({ status: 403 });
});

test("Kernel system delivery remains limited to its existing public Content projection operations", async () => {
    const f = await fixture({ contractId: "ulvia.cms.content", capabilityId: "delivery.read" });
    const { sourceInstallationId: _, sourceCredentialFingerprint: _proof, ...root } = f.input;
    const issued = await f.issue({ ...root, systemServiceId: "cms-kernel" });
    expect(verifyProviderInvocationToken(issued.token, f.secret)).toMatchObject({
        contractId: "ulvia.cms.content",
        capabilityId: "delivery.read",
        systemServiceId: "cms-kernel",
    });
    await expect(
        f.issue({ ...root, capabilityId: "delete-page", systemServiceId: "cms-kernel" }),
    ).rejects.toMatchObject({ status: 403 });
});
