import { expect } from "bun:test";
import { invoke, type InstanceConnection } from "./invoke";

export async function verifyPublicTrace(
    primary: InstanceConnection,
    secondary: InstanceConnection,
    cmsUrl: string,
    requireDescriptionMiss = false,
): Promise<void> {
    const traceId = crypto.randomUUID();
    const response = await fetch(`${cmsUrl}/login`, { headers: { "x-request-id": traceId } });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    const warmTraceId = crypto.randomUUID();
    const warm = await fetch(`${cmsUrl}/login`, { headers: { "x-request-id": warmTraceId } });
    expect(warm.status).toBe(200);
    await warm.arrayBuffer();
    let last: unknown[] = [];
    let lastWarm: unknown[] = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await (
            await invoke(primary, "logs.query", { traceId, timeField: "receivedAt", limit: 200 })
        ).json();
        last = result.items.map((entry: any) => ({
            service: entry.service,
            event: entry.event,
            capabilityId: entry.capabilityId,
            invocationId: entry.invocationId,
            parentInvocationId: entry.parentInvocationId,
        }));
        const root = result.items.find(
            (entry: { event: string; capabilityId?: string; service: string }) =>
                entry.service === "cms-edge" &&
                entry.event === "gateway.invocation.completed" &&
                entry.capabilityId === "delivery.resolve-path",
        );
        const content = result.items.find(
            (entry: { event: string; parentInvocationId?: string }) =>
                entry.event === "content.delivery.phase" && entry.parentInvocationId === root?.invocationId,
        );
        const downstream = result.items.find(
            (entry: { event: string; capabilityId?: string; service: string; parentInvocationId?: string }) =>
                entry.service === "cms-edge" &&
                entry.event === "gateway.invocation.completed" &&
                entry.capabilityId === "capabilities.describe" &&
                entry.parentInvocationId === content?.invocationId,
        );
        const warmResult = await (
            await invoke(primary, "logs.query", { traceId: warmTraceId, timeField: "receivedAt", limit: 200 })
        ).json();
        lastWarm = warmResult.items.map((entry: any) => ({
            service: entry.service,
            event: entry.event,
            capabilityId: entry.capabilityId,
            invocationId: entry.invocationId,
            parentInvocationId: entry.parentInvocationId,
        }));
        const warmRoot = warmResult.items.find(
            (entry: { event: string; capabilityId?: string; service: string }) =>
                entry.service === "cms-edge" &&
                entry.event === "gateway.invocation.completed" &&
                entry.capabilityId === "delivery.resolve-path",
        );
        const warmContent = warmResult.items.find(
            (entry: { event: string; parentInvocationId?: string }) =>
                entry.event === "content.delivery.phase" && entry.parentInvocationId === warmRoot?.invocationId,
        );
        const hasDescription = result.items.some(
            (entry: { capabilityId?: string }) => entry.capabilityId === "capabilities.describe",
        );
        if (
            root &&
            content &&
            (requireDescriptionMiss || hasDescription ? downstream : true) &&
            warmRoot &&
            warmContent
        ) {
            expect(warmRoot.traceId).toBe(warmTraceId);
            expect(warmContent.traceId).toBe(warmTraceId);
            expect(
                warmResult.items.some(
                    (entry: { capabilityId?: string }) => entry.capabilityId === "capabilities.describe",
                ),
            ).toBe(false);
            expect(
                (
                    await (
                        await invoke(secondary, "logs.query", { traceId: warmTraceId, timeField: "receivedAt" })
                    ).json()
                ).items,
            ).toEqual([]);
            if (downstream) {
                expect(downstream.traceId).toBe(traceId);
            }
            expect(root.traceId).toBe(traceId);
            expect(content.traceId).toBe(traceId);
            expect(
                (await (await invoke(secondary, "logs.query", { traceId, timeField: "receivedAt" })).json()).items,
            ).toEqual([]);
            return;
        }
        await Bun.sleep(500);
    }
    throw new Error(
        `The public request did not produce correlated Edge, Content and downstream capability observations: ${JSON.stringify({ cold: last, warm: lastWarm })}`,
    );
}
