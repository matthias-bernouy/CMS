import { expect, test } from "bun:test";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { delegationFixture } from "../../../../../features/cms-gateway/tests/providers/delegation/fixtures";
import { createDispatchPreparer } from "../../../src/runtime/gateway/providers/authority/prepareDispatch";
import { createInvocationIssuer } from "../../../src/runtime/gateway/providers/authority/issueInvocation";

async function fixture() {
    const f = await delegationFixture({ sourceBinary: true, sourceResource: true, sourceAccess: "admin" });
    f.source.installation.observation!.observedAt = new Date().toISOString();
    f.state.actor = { kind: "administrator", subjectId: "cms-user", authorizationRevision: 7 };
    let beforeSecret = () => {};
    let alias = "cms-user";
    let fallbackInspections = 0;
    const secret = "prepared-secret-" + "s".repeat(32);
    const identities = {
        getOrCreate: async () => "provider-alias",
        resolve: async () => alias,
    };
    const issuer = createInvocationIssuer(
        "site-a",
        f.routes,
        f.selections,
        { authorize: async () => true, consumeBudget: async () => true },
        async () => {
            beforeSecret();
            return secret;
        },
        f.authority,
        identities,
        async () => {
            fallbackInspections++;
            return "administrator";
        },
    );
    const prepare = createDispatchPreparer({
        siteId: "site-a",
        routes: f.routes,
        identities,
        delegations: f.authority,
        issue: issuer,
    });
    const input = {
        invocation: {
            requestId: crypto.randomUUID(),
            installationId: "origin-install",
            contractId: "origin",
            contractVersion: "1.0.0",
            capabilityId: "item.list",
        },
        actor: structuredClone(f.state.actor),
        deadline: Date.now() + 15_000,
    };
    return {
        ...f,
        prepare,
        input,
        secret,
        fallbackInspections: () => fallbackInspections,
        beforeSecret: (callback: () => void) => {
            beforeSecret = callback;
        },
        setAlias: (value: string) => {
            alias = value;
        },
    };
}

test("resource preparation shares one final Access inspection after secret loading and preserves receiver checks", async () => {
    const f = await fixture();
    let routeChecks = 0;
    f.routes.isCurrent = async () => {
        routeChecks++;
        return true;
    };
    f.beforeSecret(() => {
        expect(f.state.inspections).toBe(0);
    });
    const result = await f.prepare(f.input);
    expect(f.state.inspections).toBe(1);
    expect(f.fallbackInspections()).toBe(0);
    expect(routeChecks).toBe(1);
    const claims = verifyProviderInvocationToken(result.token, f.secret);
    expect(claims).toMatchObject({
        actorKind: "administrator",
        subjectId: "provider-alias",
        delegationTicket: result.delegation!.ticket,
    });
    expect(JSON.stringify(claims)).not.toContain("cms-user");
    expect((await f.authority.check(f.child(result.delegation!.ticket))).actor).toEqual(f.input.actor);
    expect(f.state.inspections).toBe(2);
    f.state.actorActive = false;
    await expect(f.authority.check(f.child(result.delegation!.ticket))).rejects.toMatchObject({
        code: "not_authorized",
    });
});

test("actor changes during secret loading cannot mint a resource token or leak a root", async () => {
    for (const change of ["role", "revision", "inactive"] as const) {
        const f = await fixture();
        let closed = 0;
        const close = f.store.close.bind(f.store);
        f.store.close = async (...args) => {
            closed++;
            await close(...args);
        };
        f.beforeSecret(() => {
            if (change === "role") {
                f.state.actor = { ...f.state.actor, kind: "user" };
            }
            if (change === "revision") {
                f.state.actor = { ...f.state.actor, authorizationRevision: 8 };
            }
            if (change === "inactive") {
                f.state.actorActive = false;
            }
        });
        await expect(f.prepare(f.input)).rejects.toMatchObject({ code: "not_authorized" });
        expect(f.state.inspections).toBe(1);
        expect(f.fallbackInspections()).toBe(0);
        expect(closed).toBeGreaterThanOrEqual(1);
    }
});

test("the shared proof cannot authorize a resource alias belonging to another CMS user", async () => {
    const f = await fixture();
    f.setAlias("another-cms-user");
    await expect(f.prepare(f.input)).rejects.toMatchObject({ status: 403 });
    expect(f.state.inspections).toBe(1);
    expect(f.fallbackInspections()).toBe(0);
});

test("a grant revoked during secret loading fails the shared final fence", async () => {
    const f = await fixture();
    f.beforeSecret(() => {
        f.state.current.grants.denied.push({ contractId: "origin", capabilityId: "item.list" });
    });
    await expect(f.prepare(f.input)).rejects.toMatchObject({ code: "not_authorized" });
    expect(f.state.inspections).toBe(1);
    expect(f.fallbackInspections()).toBe(0);
});
