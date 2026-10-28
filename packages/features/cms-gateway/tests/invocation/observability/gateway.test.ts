import { expect, test } from "bun:test";
import { CapabilityGateway, type GatewayInvocation, type GatewayTransportRequest } from "@bernouy/cms-gateway";
import type { InvocationObservation } from "@bernouy/cms-gateway/observability";
import { currentTraceContext, runWithTraceContext } from "@bernouy/logging/tracing";
import { gatewayRoute, NOW } from "../../fixtures";
const invocation: GatewayInvocation = {
    siteId: "site-a",
    contractId: "catalog",
    capabilityId: "item.list",
    input: {},
    actor: { kind: "anonymous" },
};
test("observes failures before route resolution without including authored payloads", async () => {
    const events: InvocationObservation[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => null, isCurrent: async () => true },
        authorize: async () => true,
        transport: {
            send: async () => {
                throw new Error("not reached");
            },
        },
        observer: (event) => {
            events.push(event);
        },
    });
    await expect(gateway.invoke({ ...invocation, input: { token: "secret" } })).rejects.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "failed", code: "not_selected", actorKind: "anonymous" });
    expect(JSON.stringify(events)).not.toContain("secret");
});
test("correlates nested invocations while observer rejection cannot fail delivery", async () => {
    const route = await gatewayRoute();
    const events: InvocationObservation[] = [];
    const sent: GatewayTransportRequest[] = [];
    const parent = { traceId: crypto.randomUUID(), spanId: crypto.randomUUID() };
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        tracing: { current: currentTraceContext, run: runWithTraceContext },
        observer: async (event) => {
            events.push(event);
            throw new Error("collector unavailable");
        },
        transport: {
            send: async (request) => {
                sent.push(request);
                return { output: { items: ["one"] } };
            },
        },
    });
    const result = await runWithTraceContext(parent, () => gateway.invoke(invocation));
    expect(result.kind).toBe("success");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
        traceId: parent.traceId,
        parentSpanId: parent.spanId,
        spanId: result.requestId,
        outcome: "completed",
        phase: "validation",
    });
    expect(sent[0]?.trace?.spanId).toBe(result.requestId);
    expect(currentTraceContext()).toBeUndefined();
});
test("native binary resources finish observation at EOF, not at response creation", async () => {
    const route = await gatewayRoute({ binary: true, resource: true });
    const events: InvocationObservation[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        observer: (event) => {
            events.push(event);
        },
        transport: {
            send: async () => ({
                contentType: "application/octet-stream",
                resource: { status: 404, headers: { "content-type": "text/plain" } },
                stream: new Response("missing").body!,
            }),
        },
    });
    const result = await gateway.invoke({ ...invocation, input: { fileId: "x" } });
    expect(events).toHaveLength(0);
    if (result.kind !== "binary") {
        throw new Error("Expected stream");
    }
    expect(await new Response(result.stream).text()).toBe("missing");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "completed", responseBytes: 7 });
});

test("a public native resource receives a Provider alias while ordinary public queries do not", async () => {
    const route = await gatewayRoute({ binary: true, resource: true });
    const sent: GatewayTransportRequest[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        now: () => NOW,
        authorize: async () => true,
        identities: { getOrCreate: async () => "provider-alias", resolve: async () => null },
        transport: {
            send: async (value) => {
                sent.push(value);
                return {
                    contentType: "application/octet-stream",
                    resource: { status: 200, headers: { "content-type": "text/plain" } },
                    bytes: new Uint8Array(),
                };
            },
        },
    });
    const result = await gateway.invoke({
        ...invocation,
        input: { fileId: "x" },
        actor: { kind: "user", subjectId: "cms-global-subject" },
    });
    expect(sent[0]).toMatchObject({ subjectId: "provider-alias", actorKind: "user" });
    expect(JSON.stringify(sent[0])).not.toContain("cms-global-subject");
    if (result.kind === "binary") {
        await new Response(result.stream).arrayBuffer();
    }
});
