import { expect } from "bun:test";
import { mongoProfile, internalRequests, internalRequestPaths } from "./profiler";
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
    const paths = await internalRequestPaths(stack.providerName, stack.edgeName);
    const calls = Object.values(paths).reduce((total, count) => total + count, 0);
    expect(paths["/gateway/delegations/close"] ?? 0).toBe(0);
    expect(paths["/delivery/resolve-path"]).toBe(requestCount);
    return {
        internalPaths: paths,
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
        ...["/performance-image", "/performance-image-two", "/performance-image-three"].map(
            (path) =>
                [
                    path,
                    '<div cms-bloc="ulvia-official-navigation"><span slot="brand">Performance</span></div>',
                ] as const,
        ),
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
export async function exerciseLoad(stack: Stack, connection: Connection) {
    let success = 0;
    let administrators = 0;
    const started = performance.now();
    const paths = ["/performance-image", "/performance-image-two", "/performance-image-three"];
    for (let i = 0; i < 420; i++) {
        const due = started + i * 300;
        if (due > performance.now()) {
            await Bun.sleep(due - performance.now());
        }
        if (i % 4 === 3) {
            const response = await connection.page.request.get(`${stack.cmsUrl}/admin/pages`, { timeout: 10_000 });
            expect(response.status(), `administrator request ${i}`).toBe(200);
            expect(response.headers()["cache-control"]).toBe("private, no-store");
            await response.dispose();
            administrators++;
        } else {
            const response = await fetch(`${stack.cmsUrl}${paths[i % 3]}`, { signal: AbortSignal.timeout(10_000) });
            await response.arrayBuffer();
            expect(response.status, `public request ${i}`).toBe(200);
        }
        success++;
    }
    expect(performance.now() - started).toBeGreaterThan(120_000);
    return { requests: success, administrators, pages: paths.length, elapsedMs: performance.now() - started };
}
export async function measureCached(stack: Stack, path: string) {
    const warm = await fetch(`${stack.cmsUrl}${path}`);
    await warm.arrayBuffer();
    expect(warm.status).toBe(200);
    // Flush observations from the miss; hits log only at debug level in this production fixture.
    await Bun.sleep(1000);
    await internalRequests(stack.providerName, stack.edgeName, true);
    await mongoProfile(stack.id, "start");
    const times = [];
    for (let i = 0; i < 20; i++) {
        const began = performance.now();
        const response = await fetch(`${stack.cmsUrl}${path}`);
        await response.arrayBuffer();
        times.push(performance.now() - began);
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(response.status).toBe(200);
    }
    const calls = await internalRequests(stack.providerName, stack.edgeName);
    expect(calls).toBe(0);
    const mongo = await mongoProfile(stack.id, "read");
    expect(mongo.operations).toBe(0);
    return {
        requests: 20,
        hitRatio: 1,
        internalCalls: calls,
        mongoOperations: mongo.operations,
        p50Ms: times.toSorted((a, b) => a - b)[10],
    };
}
