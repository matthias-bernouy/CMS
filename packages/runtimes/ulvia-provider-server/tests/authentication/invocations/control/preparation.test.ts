import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { installationsFeature } from "@bernouy/repository/features/installations";
import type { InstallationServices } from "@bernouy/repository/features/installations";
import type { CapabilityGateway } from "@bernouy/cms-gateway";
import { createCommandPreparer } from "../../../../src/runtime/gateway/providers/authority/prepareCommand";
import { authorizeCatalogue } from "../../../../src/runtime/gateway/providers/authority/authorizeCatalogue";

function fixture(fail?: "identity" | "audit" | "preparation") {
    const events: string[] = [];
    const prepared = { token: "p".repeat(32), instanceId: "instance-a", delegation: null };
    const prepare = createCommandPreparer(
        {
            getOrCreate: async () => {
                events.push("identity");
                if (fail === "identity") {
                    throw new Error("identity down");
                }
                return "alias";
            },
            resolve: async () => "user-a",
        },
        {
            append: async () => {
                events.push("started");
                if (fail === "audit") {
                    throw new Error("audit down");
                }
            },
        },
        async (input) => {
            events.push("prepare");
            expect(input.expectedSubjectId).toBe("alias");
            if (fail === "preparation") {
                throw Object.assign(new Error("grant revoked"), { status: 403 });
            }
            return prepared;
        },
    );
    const invocation = {
        requestId: crypto.randomUUID(),
        installationId: "installation-a",
        contractId: "ulvia/content",
        contractVersion: "1.0.0",
        capabilityId: "save",
    };
    const event = {
        id: crypto.randomUUID(),
        requestId: invocation.requestId,
        occurredAt: new Date().toISOString(),
        siteId: "site-a",
        installationId: invocation.installationId,
        contractId: invocation.contractId,
        capabilityId: invocation.capabilityId,
        actorKind: "administrator",
        actorSubjectId: "user-a",
        stage: "started",
    };
    const input = {
        invocation,
        actor: { kind: "administrator", subjectId: "user-a", authorizationRevision: 1 },
        deadline: Date.now() + 10_000,
        commandStart: { providerId: "ulvia/provider", identityRequired: true, event: JSON.stringify(event) },
    };
    const services = {
        gateway: { siteId: "site-a", invocations: { prepareCommand: prepare } },
    } as unknown as InstallationServices;
    const call = (value = input, controlAuthority = true) =>
        executeCapability(installationsFeature, "gateway.command.prepare", {
            input: value,
            services,
            context: {
                requestId: crypto.randomUUID(),
                siteId: "site-a",
                contractVersion: "1.5.0",
                providerId: "ulvia/provider",
                controlAuthority,
            },
        });
    return { call, input, events, event, prepared };
}

test("real feature execution preserves identity/start/preparation order and closed stage evidence", async () => {
    const f = fixture();
    expect(await f.call()).toEqual({ prepared: f.prepared, failure: null });
    expect(f.events).toEqual(["identity", "started", "prepare"]);
    for (const stage of ["identity", "audit", "preparation"] as const) {
        const denied = fixture(stage);
        expect(await denied.call()).toEqual({
            prepared: null,
            failure: { stage, status: stage === "preparation" ? 403 : 503 },
        });
        expect(denied.events).toEqual(
            stage === "identity"
                ? ["identity"]
                : stage === "audit"
                  ? ["identity", "started"]
                  : ["identity", "started", "prepare"],
        );
    }
});

test("unsigned control and substituted site/request/installation/capability cannot create an audit or identity", async () => {
    const f = fixture();
    await expect(f.call(f.input, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const changed of [
        { siteId: "site-b" },
        { requestId: crypto.randomUUID() },
        { installationId: "other" },
        { contractId: "other/content" },
        { capabilityId: "other" },
        { actorSubjectId: "other" },
        { stage: "completed" },
    ]) {
        await expect(
            f.call({
                ...f.input,
                commandStart: { ...f.input.commandStart, event: JSON.stringify({ ...f.event, ...changed }) },
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
        f.call({
            ...f.input,
            commandStart: {
                ...f.input.commandStart,
                event: JSON.stringify(f.event).replace('"siteId":"site-a"', '"siteId":"site-b","siteId":"site-a"'),
            },
        }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.events).toEqual([]);
});

test("MCP catalogue authorization crosses Access through Gateway and checks current user revision and admin grant", async () => {
    const calls: string[] = [];
    let revision = 7;
    let admin = true;
    let allowed = true;
    const invoker = {
        invoke: async (input: Record<string, unknown>) => {
            expect(input).toMatchObject({
                siteId: "site-a",
                contractId: "ulvia/cms.access",
                capabilityId: "inspect-actor",
                actor: { kind: "system", serviceId: "cms-gateway" },
            });
            calls.push("inspect");
            return {
                kind: "success",
                output: {
                    state: "authenticated",
                    subjectId: "admin",
                    administrator: admin,
                    authorizationRevision: revision,
                },
            };
        },
        assertAuthorized: async (input: Record<string, unknown>) => {
            expect(input).toMatchObject({
                contractId: "ulvia/cms.installations",
                capabilityId: "list-provider-installations",
            });
            calls.push("grant");
            if (!allowed) {
                throw Object.assign(new Error("revoked"), { status: 403 });
            }
        },
    } as unknown as CapabilityGateway;
    const actor = { kind: "administrator", subjectId: "admin", authorizationRevision: 7 } as const;
    await authorizeCatalogue(invoker, "site-a", actor);
    expect(calls).toEqual(["inspect", "grant"]);
    revision++;
    await expect(authorizeCatalogue(invoker, "site-a", actor)).rejects.toMatchObject({ status: 403 });
    revision = 7;
    admin = false;
    await expect(authorizeCatalogue(invoker, "site-a", actor)).rejects.toMatchObject({ status: 403 });
    admin = true;
    allowed = false;
    await expect(authorizeCatalogue(invoker, "site-a", actor)).rejects.toMatchObject({ status: 403 });
    expect(calls.filter((call) => call === "grant")).toHaveLength(2);
});
