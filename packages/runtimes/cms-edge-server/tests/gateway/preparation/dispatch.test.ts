import { expect, test } from "bun:test";
import { preparedFixture } from "./fixture";
import { responseTimeout } from "../../../src/runtime/gateway/dispatch/responseTimeout";
import { gatewayRoute } from "../../../../../../tests/integration/gateway/fixtures";
import type { GatewayActor } from "@bernouy/cms-gateway";

test("Edge queries prepare identity, delegation and signing in one control request before real HTTP dispatch", async () => {
    const f = await preparedFixture();
    try {
        expect(await f.invoke()).toMatchObject({ kind: "success", output: { items: ["authorized"] } });
        expect(f.events).toEqual(["prepare", "business"]);
        expect(f.preparations[0]).toMatchObject({
            actor: { kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 },
        });
        await f.invoke();
        expect(f.preparations[1]!.closedDelegations).toEqual([
            { ticket: "t".repeat(43), requestId: f.preparations[0]!.invocation.requestId },
        ]);
        expect(f.preparations[0]!.invocation).not.toHaveProperty("subjectId");
        expect(f.preparations[0]!.invocation).not.toHaveProperty("delegation");
        expect(f.preparations[0]!.invocation).toMatchObject({
            contractId: "ulvia/catalog",
            capabilityId: "item.list",
            installationId: "install-a",
            bodyBytes: 0,
        });
    } finally {
        f.close();
    }
});

test("only a direct administrator's full-site collection review receives the longer response budget", async () => {
    const route = await gatewayRoute();
    const request = {
        release: { ...route.requestedRelease.admission.release, contractId: "ulvia/cms.installations" },
        capability: { ...route.requestedRelease.admission.release.capabilities[0]!, id: "plan-collection-upgrade" },
    };
    const administrator = { kind: "administrator", subjectId: "admin" } as const;
    expect(responseTimeout(request, administrator)).toBe(60_000);
    const actors: GatewayActor[] = [
        { kind: "anonymous" },
        { kind: "user", subjectId: "user" },
        { kind: "system", serviceId: "internal" },
        { kind: "provider", installationId: "other", credentialFingerprint: "fingerprint" },
    ];
    for (const actor of actors) {
        expect(responseTimeout(request, actor)).toBe(15_000);
    }
    expect(responseTimeout({ ...request, delegated: true }, administrator)).toBe(15_000);
    expect(
        responseTimeout(
            { ...request, release: { ...request.release, contractId: "other/installations" } },
            administrator,
        ),
    ).toBe(15_000);
    expect(
        responseTimeout(
            { ...request, capability: { ...request.capability, id: "apply-collection-upgrade" } },
            administrator,
        ),
    ).toBe(15_000);
    expect(
        responseTimeout(
            {
                ...request,
                capability: {
                    ...request.capability,
                    behavior: { sensitive: false, effect: "command", execution: "sync", idempotency: "natural" },
                },
            },
            administrator,
        ),
    ).toBe(15_000);
});

test("combined command dispatch preserves identity-before-audit and audit-before-business ordering", async () => {
    const f = await preparedFixture(true);
    try {
        await f.invoke();
        expect(f.events).toEqual(["identity", "started", "prepare", "business", "completed"]);
        expect(f.preparations[0]!.expectedSubjectId).toBe("alias");
        expect(f.preparations[0]!.invocation.bodyBytes).toBeGreaterThan(0);
    } finally {
        f.close();
    }
});

test("an audience mismatch closes preparation without dispatch and refusals never reach the business Provider", async () => {
    const f = await preparedFixture();
    try {
        f.wrongAudience();
        await expect(f.invoke()).rejects.toMatchObject({ code: "transport_failure" });
        expect(f.events).toEqual(["prepare"]);
        f.deny();
        await expect(f.invoke()).rejects.toMatchObject({ code: "not_authorized" });
        expect(f.events).toEqual(["prepare", "prepare"]);
    } finally {
        f.close();
    }
});

test("host invalidation runs after dispatched commands, including unknown outcomes, and never on preparation refusal", async () => {
    let purges = 0;
    const f = await preparedFixture(true, () => {
        purges++;
    });
    try {
        await f.invoke();
        expect(purges).toBe(1);
        f.failBusiness();
        await expect(f.invoke()).rejects.toMatchObject({ code: "outcome_unknown" });
        expect(purges).toBe(2);
        f.deny();
        await expect(f.invoke()).rejects.toMatchObject({ code: "not_authorized" });
        expect(purges).toBe(2);
    } finally {
        f.close();
    }
});
