import { expect } from "bun:test";
import { mongoProfile, internalRequests } from "./profiler";
import type { mcpContainers } from "../containers";
import type { connectBrowser } from "../oauth";
type Stack = Awaited<ReturnType<typeof mcpContainers>>;
type Connection = Awaited<ReturnType<typeof connectBrowser>>;

export async function measureResource(stack: Stack, path: string, requestCount = 10) {
    for (let i = 0; i < 2; i++) {
        const warm = await fetch(new URL(path, stack.cmsUrl));
        await warm.arrayBuffer();
        expect(warm.status).toBe(200);
    }
    await internalRequests(stack.providerName, stack.edgeName, true);
    expect((await mongoProfile(stack.id, "start")).databases).toBeGreaterThan(0);
    const latencies: number[] = [];
    let bytes = 0;
    for (let i = 0; i < requestCount; i++) {
        const began = performance.now();
        const response = await fetch(new URL(path, stack.cmsUrl), { signal: AbortSignal.timeout(10_000) });
        bytes += (await response.arrayBuffer()).byteLength;
        latencies.push(performance.now() - began);
        expect(response.status, `${path}, request ${i}`).toBe(200);
    }
    const mongo = await mongoProfile(stack.id, "read");
    const calls = await internalRequests(stack.providerName, stack.edgeName);
    return {
        path,
        requests: requestCount,
        mongoPerRequest: (mongo.operations ?? 0) / requestCount,
        mongoByCollection: mongo.byCollection,
        internalCallsPerRequest: calls / requestCount,
        bytesPerRequest: bytes / requestCount,
        p50Ms: latencies.toSorted((a, b) => a - b)[Math.floor(requestCount / 2)]!,
    };
}
export async function publishPerformancePages(connection: Connection) {
    for (const [path, content] of [
        ["/performance-literal", '<h1 cms-bloc="ulvia-official-heading" size="lg" text-align="start">Performance</h1>'],
        ["/performance-image", '<div cms-bloc="ulvia-official-navigation"><span slot="brand">Performance</span></div>'],
    ]) {
        const page = await connection.call("ulvia.cms.content", "pages.create", {
            path,
            title: "Performance",
            content,
        });
        await connection.call("ulvia.cms.content", "pages.publish", {
            id: page.id,
            expectedRevision: page.revision,
            visible: true,
        });
    }
}
export async function exerciseLoad(stack: Stack) {
    let success = 0;
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
        const due = started + i * 300; // 200 views/minute; no browser subresource requests.
        if (due > performance.now()) {
            await Bun.sleep(due - performance.now());
        }
        const response = await fetch(`${stack.cmsUrl}/performance-image`, { signal: AbortSignal.timeout(10_000) });
        await response.arrayBuffer();
        expect(response.status, `200 views/minute, request ${i}`).toBe(200);
        success++;
    }
    return { requests: success, elapsedMs: performance.now() - started };
}
