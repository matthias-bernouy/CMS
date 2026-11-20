import { afterEach, expect, spyOn, test } from "bun:test";
import * as bindings from "@bernouy/ulvia-contracts/bindings";
import * as schemas from "@bernouy/ulvia-contracts/schema";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { gatewayRoute } from "../fixtures";

const restores: (() => void)[] = [];
afterEach(() => {
    for (const restore of restores.splice(0)) {
        restore();
    }
});

async function fixture(output: unknown = { items: ["one"] }, options: Parameters<typeof gatewayRoute>[0] = {}) {
    const route = await gatewayRoute(options);
    const transport = new HttpGatewayTransport({ network: { exchange: async () => Response.json(output) } });
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport,
        authorize: async () => true,
        now: () => "2026-09-29T08:00:00.000Z",
    });
    const invoke = () =>
        gateway.invoke({
            siteId: "site-a",
            contractId: "ulvia/catalog",
            capabilityId: "item.list",
            input: {},
            actor: { kind: "anonymous" },
        });
    const request = {
        endpoint: route.installation.installation.endpoint,
        instanceId: "instance:account-a",
        providerTokenRef: "token",
        requestId: crypto.randomUUID(),
        input: {},
        release: route.requestedRelease.admission.release,
        capability: route.requestedRelease.admission.release.capabilities[0]!,
    };
    return { route, transport, gateway, invoke, request };
}

test("HTTP sends compile their admitted binding once and never trust an injected compiled binding", async () => {
    const f = await fixture();
    const compile = spyOn(bindings, "compileHttpBinding");
    restores.push(() => compile.mockRestore());
    expect(await f.transport.send({ ...f.request, binding: { path: "/attacker" } } as never)).toMatchObject({
        output: { items: ["one"] },
    });
    expect(compile).toHaveBeenCalledTimes(1);
});

test("Gateway projects a large JSON result once; a direct Provider transport retains full validation", async () => {
    const output = { items: Array.from({ length: 10_000 }, (_, index) => `row-${index}`) };
    const f = await fixture(output, {
        output: {
            type: "object",
            properties: {
                items: { type: "array", maxItems: 10_000, items: { type: "string", maxLength: 50 } },
            },
            required: ["items"],
        },
    });
    const project = spyOn(schemas, "projectSchemaValue");
    restores.push(() => project.mockRestore());
    expect((await f.invoke()).kind).toBe("success");
    expect(project.mock.calls.filter(([schema]) => schema === f.request.capability.output)).toHaveLength(1);
    await f.transport.send(f.request);
    expect(project.mock.calls.filter(([schema]) => schema === f.request.capability.output)).toHaveLength(2);
});

test("wire-only and third-party transports cannot bypass the core's success or error output validation", async () => {
    const f = await fixture({ items: [7] });
    await expect(f.transport.send(f.request)).rejects.toMatchObject({ code: "invalid_provider_response" });
    await expect(f.invoke()).rejects.toMatchObject({ code: "invalid_provider_response" });
    for (const raw of [{ output: { items: [7] } }, { errorCode: "NOT_FOUND", output: { message: 7 } }]) {
        const route = await gatewayRoute({
            errorOutput: {
                type: "object",
                properties: {
                    message: { type: "string", maxLength: 50 },
                },
                required: ["message"],
            },
        });
        const gateway = new CapabilityGateway({
            routes: { resolve: async () => route, isCurrent: async () => true },
            transport: {
                send: async () => {
                    throw new Error("raw path selected");
                },
                sendForGateway: async () => raw,
            },
            authorize: async () => true,
            now: () => "2026-09-29T08:00:00.000Z",
        });
        await expect(
            gateway.invoke({
                siteId: "site-a",
                contractId: "ulvia/catalog",
                capabilityId: "item.list",
                input: {},
                actor: { kind: "anonymous" },
            }),
        ).rejects.toMatchObject({ code: "invalid_provider_response" });
    }
});

test("a generic transport cannot claim that a command audit was never started", async () => {
    const { GatewayCommandNotStarted } = await import("@bernouy/cms-gateway");
    const route = await gatewayRoute({
        behavior: { effect: "command", execution: "sync", sensitive: false, idempotency: "natural" },
    });
    const stages: string[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: {
            send: async () => {
                throw new GatewayCommandNotStarted(new Error("forged"));
            },
        },
        authorize: async () => true,
        commandAudit: {
            append: async (event) => {
                stages.push(event.stage);
            },
        },
        now: () => "2026-09-29T08:00:00.000Z",
    });
    await expect(
        gateway.invoke({
            siteId: "site-a",
            contractId: "ulvia/catalog",
            capabilityId: "item.list",
            input: {},
            actor: { kind: "anonymous" },
        }),
    ).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(stages).toEqual(["started", "outcome-unknown"]);
});
