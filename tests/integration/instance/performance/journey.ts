import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { mongoProfile, internalRequests, internalRequestPaths } from "./profiler";
import { requestWork, workCount } from "./request-work";
import type { mcpContainers } from "../containers";
import type { connectBrowser } from "../oauth";
import { statistics } from "../../../performance/harness/measurements/statistics";
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
    expect(paths["/delivery/resolve-resource"]).toBe(requestCount);
    expect(paths["/hosting/routing/resolve"]).toBe(requestCount);
    expect(mongo.byCollection?.site_resource_revisions).toBe(2 * requestCount);
    expect(mongo.byCollection?.site_upgrade_maintenance).toBe(requestCount);
    expect(mongo.byCollection?.site_write_permits).toBe(requestCount);
    return {
        internalPaths: paths,
        path,
        requests: requestCount,
        mongoPerRequest: (mongo.operations ?? 0) / requestCount,
        // One domain read, two instance reads, and four revision/fence reads at every ingress.
        routingMongoPerRequest: 7,
        mongoByCollection: mongo.byCollection,
        internalCallsPerRequest: calls / requestCount,
        bytesPerRequest: bytes / requestCount,
        samplesMs: latencies,
        p50Ms: statistics(latencies).p50,
        p95Ms: statistics(latencies).p95,
    };
}
export async function publishPerformancePages(connection: Connection) {
    for (const [path, content] of [
        [
            "/performance-literal",
            '<div cms-bloc="ulvia-dtest--smoke-kit--card"><h1 slot="content">Performance</h1></div>',
        ],
        ...["/performance-image", "/performance-image-two", "/performance-image-three"].map(
            (path) =>
                [path, '<div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">Performance</p></div>'] as const,
        ),
    ]) {
        const page = await connection.call("ulvia/cms.content", "pages.create", {
            path,
            title: "Performance",
            content,
        });
        await connection.call("ulvia/cms.content", "pages.publish", {
            id: page.id,
            expectedRevision: page.revision,
            visible: true,
        });
    }
}
export async function measureCached(stack: Stack, path: string) {
    await requestWork(stack.providerName, stack.edgeName, [], true);
    const controlId = randomUUID();
    const control = await fetch(`${stack.cmsUrl}${path}`, {
        headers: { "x-request-id": controlId, "cache-control": "no-cache" },
    });
    await control.arrayBuffer();
    expect(control.status).toBe(200);
    expect(control.headers.get("x-cache")).toBe("BYPASS");
    expect(control.headers.get("x-request-id")).toBe(controlId);
    const controlWork = await requestWork(stack.providerName, stack.edgeName, [controlId]);
    expect(controlWork.requests.http["/delivery/resolve-resource"]).toBe(1);
    expect(workCount(controlWork.requests.mongo)).toBeGreaterThan(0);
    expect(workCount(controlWork.requests.log)).toBeGreaterThan(0);
    const warm = await fetch(`${stack.cmsUrl}${path}`);
    await warm.arrayBuffer();
    expect(warm.status).toBe(200);
    // Request IDs exclude delayed warm-up logs and unrelated periodic recovery without a timing heuristic.
    await requestWork(stack.providerName, stack.edgeName, [], true);
    const requestIds: string[] = [];
    const times = [];
    for (let i = 0; i < 20; i++) {
        const id = randomUUID();
        requestIds.push(id);
        const began = performance.now();
        const response = await fetch(`${stack.cmsUrl}${path}`, { headers: { "x-request-id": id } });
        await response.arrayBuffer();
        times.push(performance.now() - began);
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-id")).toBe(id);
    }
    const work = await requestWork(stack.providerName, stack.edgeName, requestIds);
    const calls = workCount(work.requests.http);
    const mongo = workCount(work.requests.mongo);
    expect(work.requests.http).toEqual({ "/hosting/routing/resolve": requestIds.length });
    expect(work.requests.mongo).toEqual({
        ulvia_hosting_domains: requestIds.length,
        ulvia_provider_instances: 2 * requestIds.length,
        site_resource_revisions: 2 * requestIds.length,
        site_upgrade_maintenance: requestIds.length,
        site_write_permits: requestIds.length,
    });
    expect(workCount(work.requests.log), "Cache hits must not enqueue deferred telemetry work").toBe(0);
    return {
        requests: 20,
        hitRatio: 1,
        internalCalls: calls,
        mongoOperations: mongo,
        contentOperations: 0,
        control: controlWork.requests,
        otherRequestsAndBackground: work.other,
        samplesMs: times,
        p50Ms: statistics(times).p50,
        p95Ms: statistics(times).p95,
    };
}
