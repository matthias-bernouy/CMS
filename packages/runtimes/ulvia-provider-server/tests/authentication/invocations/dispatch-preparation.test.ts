import { expect, test } from "bun:test";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { createDispatchPreparer } from "../../../src/runtime/gateway/providers/authority/prepareDispatch";
import { createInvocationIssuer } from "../../../src/runtime/gateway/providers/authority/issueInvocation";

async function fixture() {
    const route = structuredClone(
        await gatewayRoute({
            access: "admin",
            delegation: {
                sources: ["item.list"],
                allow: [{ contractId: "*", capabilityId: "*", effect: "query", sensitive: false }],
            },
        }),
    );
    route.installation.observation!.observedAt = new Date().toISOString();
    const secret = "dispatch-signing-" + "a".repeat(40);
    let live = true;
    let identityFails = false;
    let revokeOnSecret = false;
    let reads = 0;
    const closed: string[] = [];
    const events: string[] = [];
    const selections = {
        get: async () => {
            reads++;
            return { grants: { default: "allow-selected", denied: [] } };
        },
    } as never;
    const routes = { resolve: async () => route, isCurrent: async () => live };
    const identities = {
        getOrCreate: async () => {
            events.push("identity");
            if (identityFails) {
                throw new Error("identity unavailable");
            }
            return "provider-user";
        },
        resolve: async () => "cms-user",
    };
    const delegations = {
        issue: async (_source: unknown, context?: Parameters<ReturnType<typeof createInvocationIssuer>>[1]) => {
            events.push("delegation");
            await context!.selection(selections, "site-a");
            return { ticket: "t".repeat(43), expiresAt: Date.now() + 10_000 };
        },
        close: async (context: { ticket: string }) => {
            closed.push(context.ticket);
        },
    };
    const issue = createInvocationIssuer(
        "site-a",
        routes,
        selections,
        { authorize: async () => true, consumeBudget: async () => true },
        async () => {
            if (revokeOnSecret) {
                live = false;
            }
            return secret;
        },
    );
    const prepare = createDispatchPreparer({
        siteId: "site-a",
        routes,
        identities,
        delegations,
        issue,
        inspectActor: async () => ({ kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 }),
    });
    const input = {
        invocation: {
            requestId: crypto.randomUUID(),
            installationId: "install-a",
            contractId: "catalog",
            contractVersion: "1.0.0",
            capabilityId: "item.list",
        },
        actor: { kind: "administrator" as const, subjectId: "cms-user", authorizationRevision: 1 },
        deadline: Date.now() + 15_000,
    };
    return {
        prepare,
        input,
        closed,
        events,
        secret,
        reads: () => reads,
        failIdentity: () => {
            identityFails = true;
        },
        revoke: () => {
            revokeOnSecret = true;
        },
    };
}

test("one preparation shares initial reads, signs the alias and root ticket, and retains a fresh final fence", async () => {
    const f = await fixture();
    const result = await f.prepare(f.input);
    expect(verifyProviderInvocationToken(result.token, f.secret)).toMatchObject({
        subjectId: "provider-user",
        delegationTicket: "t".repeat(43),
        connectionId: "install-a",
    });
    expect(f.events.sort()).toEqual(["delegation", "identity"]);
    expect(f.reads()).toBe(2);
    expect(f.closed).toEqual([]);
    f.revoke();
    await expect(
        f.prepare({ ...f.input, invocation: { ...f.input.invocation, requestId: crypto.randomUUID() } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.closed).toEqual(["t".repeat(43)]);
});

test("partial preparation and mismatched command aliases close their issued root ticket", async () => {
    const f = await fixture();
    f.failIdentity();
    await expect(f.prepare(f.input)).rejects.toThrow("identity unavailable");
    expect(f.closed).toEqual(["t".repeat(43)]);
    const other = await fixture();
    await expect(other.prepare({ ...other.input, expectedSubjectId: "another-alias" })).rejects.toMatchObject({
        status: 403,
    });
    expect(other.closed).toEqual(["t".repeat(43)]);
});

test("preparation rejects machine impersonation and expired work before reading or issuing authority", async () => {
    const f = await fixture();
    for (const input of [
        { ...f.input, deadline: Date.now() - 1 },
        { ...f.input, invocation: { ...f.input.invocation, sourceInstallationId: "source" } },
        {
            ...f.input,
            actor: { kind: "provider" as const, installationId: "source", credentialFingerprint: "f".repeat(64) },
        },
    ]) {
        await expect(f.prepare(input)).rejects.toMatchObject({ status: 403 });
    }
    expect(f.events).toEqual([]);
    expect(f.reads()).toBe(0);
});

test("a missing actor revision is obtained from Access before strict preparation validation", async () => {
    const f = await fixture();
    const prepared = await f.prepare({ ...f.input, actor: { kind: "administrator", subjectId: "cms-user" } });
    expect(verifyProviderInvocationToken(prepared.token, f.secret)).toMatchObject({ subjectId: "provider-user" });
    await expect(f.prepare({ ...f.input, actor: { kind: "user", subjectId: "cms-user" } })).rejects.toMatchObject({
        status: 403,
    });
    await expect(
        f.prepare({ ...f.input, actor: { kind: "administrator", subjectId: "another-user" } }),
    ).rejects.toMatchObject({ status: 403 });
});
