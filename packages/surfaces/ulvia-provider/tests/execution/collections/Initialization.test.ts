import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "../../../src/dispatch/registry";
import type { ProviderCapabilityInvocationContext } from "../../../src/dispatch/registry";
import { registerInitializationCapabilities } from "../../../src/capabilities/installations/initialization";
import type { UlviaProviderGateway } from "../../../src/ports";
import type { ProviderOperationExecutor } from "../../../src/operations/ProviderOperationExecutor";
import type { SiteInitializationService } from "@bernouy/cms-repository/collections/installations";

function fixture() {
    const model = {
        enabled: true,
        calls: [] as string[],
        identities: [] as string[],
        queued: 0,
        execute: undefined as Parameters<ProviderOperationExecutor["register"]>[2] | undefined,
    };
    const service = {
        siteId: "site-a",
        entry: async () => ({ pending: true }),
        status: async () => ({ status: "pending" }),
        plan: async (actorId: string) => {
            model.calls.push(actorId);
            return { digest: `sha256:${"a".repeat(64)}` };
        },
        apply: async () => {
            model.calls.push("apply");
            return { status: "completed" };
        },
    } as unknown as SiteInitializationService;
    const gateway = {
        identities: {
            resolve: async (_scope: unknown, alias: string) => {
                model.identities.push(alias);
                return alias === "opaque-admin" ? "local:admin" : alias === "opaque-member" ? "local:member" : null;
            },
        },
        administrators: { get: async (sub: string) => ({ enabled: model.enabled && sub === "local:admin" }) },
    } as unknown as UlviaProviderGateway;
    const operations = {
        register: (_contract: string, _id: string, execute: typeof model.execute) => {
            model.execute = execute;
        },
        enqueue: async () => {
            model.queued++;
            return { operationId: "operation-a" };
        },
    } as unknown as ProviderOperationExecutor;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerInitializationCapabilities(dispatcher, service, operations, gateway);
    const context: ProviderCapabilityInvocationContext = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.1.0",
        providerId: "ulvia/primary-provider",
        siteId: "site-a",
        subjectId: "opaque-admin",
    };
    const invoke = (id: string, patch: Partial<ProviderCapabilityInvocationContext> = {}) =>
        dispatcher.invoke(
            "ulvia/cms.installations",
            id,
            { root: null, planDigest: `sha256:${"a".repeat(64)}` },
            { ...context, ...patch },
        );
    return { invoke, model, context };
}

test("initialization resolves verified subject aliases and checks the current local administrator grant", async () => {
    const f = fixture();
    // Ordinary structured calls intentionally carry no resource-only actorKind claim.
    await f.invoke("initialization.plan");
    expect(f.model.calls).toEqual(["local:admin"]);
    expect(f.model.identities).toEqual(["opaque-admin"]);
    f.model.enabled = false;
    await expect(f.invoke("initialization.plan")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(f.model.calls).toEqual(["local:admin"]);
});

test("anonymous, ordinary, foreign-site and machine callers refuse before initialization effects", async () => {
    const f = fixture();
    await expect(f.invoke("initialization.status", { subjectId: undefined })).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    await expect(f.invoke("initialization.plan", { subjectId: "opaque-member" })).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    await expect(f.invoke("initialization.plan", { siteId: "site-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(f.invoke("initialization.apply", { systemServiceId: "cms-gateway" })).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    await expect(f.invoke("initialization.apply", { sourceInstallationId: "provider-b" })).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    await expect(f.invoke("initialization.apply", { controlAuthority: true })).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    expect(f.model.calls).toEqual([]);
    expect(f.model.queued).toBe(0);
    expect(await f.invoke("initialization.entry", { subjectId: undefined })).toEqual({ pending: true });
});

test("queued initialization rechecks the administrator grant before executing", async () => {
    const f = fixture();
    expect(await f.invoke("initialization.apply")).toEqual({ operationId: "operation-a" });
    f.model.enabled = false;
    await expect(
        f.model.execute!({ root: null, planDigest: `sha256:${"a".repeat(64)}` }, f.context as never, {} as never),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(f.model.calls).toEqual([]);
});
