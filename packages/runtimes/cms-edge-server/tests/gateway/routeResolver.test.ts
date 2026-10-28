import { expect, test } from "bun:test";
import { ControlGatewayRouteResolver } from "../../src/runtime/gateway/RemoteGatewayServices";
import type { ControlProviderClient } from "../../src/runtime/gateway/ControlProviderClient";

test("remote route freshness ignores observation renewal but fences selection and readiness changes", async () => {
    const route = routeSnapshot();
    let current = route;
    const resolver = new ControlGatewayRouteResolver({
        getGatewayRoute: async () => JSON.stringify(current),
    } as ControlProviderClient);
    const resolved = await resolver.resolve("default", "catalog.items");
    expect(resolved).not.toBeNull();

    current = {
        ...route,
        installation: {
            ...route.installation,
            observation: { ...route.installation.observation, observedAt: "2026-10-22T10:01:00.000Z" },
        },
    };
    expect(await resolver.isCurrent(resolved!)).toBeTrue();

    current = { ...route, selection: { ...route.selection, version: "1.1.0" } };
    expect(await resolver.isCurrent(resolved!)).toBeFalse();

    current = {
        ...route,
        installation: {
            ...route.installation,
            observation: {
                ...route.installation.observation,
                report: {
                    implementations: [
                        { ...route.installation.observation.report.implementations[0]!, status: "unavailable" },
                    ],
                },
            },
        },
    };
    expect(await resolver.isCurrent(resolved!)).toBeFalse();
});

test("reuses a transport plan briefly and supports explicit invalidation", async () => {
    const route = routeSnapshot();
    let reads = 0;
    let now = 1_000;
    const resolver = new ControlGatewayRouteResolver(
        {
            getGatewayRoute: async () => {
                reads += 1;
                return JSON.stringify(route);
            },
        } as ControlProviderClient,
        () => now,
        30_000,
    );

    expect(await resolver.resolve("default", "catalog.items")).not.toBeNull();
    expect(await resolver.resolve("default", "catalog.items")).not.toBeNull();
    expect(reads).toBe(1);

    resolver.invalidate("default", "catalog.items");
    expect(await resolver.resolve("default", "catalog.items")).not.toBeNull();
    expect(reads).toBe(2);

    now += 30_001;
    expect(await resolver.resolve("default", "catalog.items")).not.toBeNull();
    expect(reads).toBe(3);
});

test("coalesces a cold route burst without caching across invalidation or failed reads", async () => {
    const route = routeSnapshot();
    const reads: ReturnType<typeof Promise.withResolvers<string | null>>[] = [];
    const resolver = new ControlGatewayRouteResolver({
        getGatewayRoute: () => {
            const read = Promise.withResolvers<string | null>();
            reads.push(read);
            return read.promise;
        },
    } as unknown as ControlProviderClient);
    const burst = Array.from({ length: 96 }, () => resolver.resolve("default", "catalog.items"));
    expect(reads).toHaveLength(1);
    resolver.invalidate("default", "catalog.items");
    const fresh = resolver.resolve("default", "catalog.items");
    expect(reads).toHaveLength(2);
    reads[1]!.resolve(JSON.stringify({ ...route, selection: { ...route.selection, version: "1.1.0" } }));
    expect((await fresh)?.selection.version).toBe("1.1.0");
    reads[0]!.resolve(JSON.stringify(route));
    expect((await Promise.all(burst)).every((item) => item?.selection.version === "1.0.0")).toBeTrue();
    expect((await resolver.resolve("default", "catalog.items"))?.selection.version).toBe("1.1.0");
    expect(reads).toHaveLength(2);
    resolver.invalidate("default", "catalog.items");
    const failed = resolver.resolve("default", "catalog.items");
    reads[2]!.reject(new Error("control unavailable"));
    await expect(failed).rejects.toThrow("control unavailable");
    const retry = resolver.resolve("default", "catalog.items");
    reads[3]!.resolve(null);
    expect(await retry).toBeNull();
    expect(reads).toHaveLength(4);
});

function routeSnapshot() {
    return {
        selection: {
            siteId: "default",
            contractId: "catalog.items",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
            installationId: "installation-a",
        },
        release: {},
        requestedRelease: {},
        lineage: [
            {
                contractId: "catalog.items",
                version: "1.0.0",
                digest: `sha256:${"a".repeat(64)}`,
                name: "Catalog items",
                capabilityIds: ["list"],
            },
        ],
        manifest: {},
        installation: {
            installation: { id: "installation-a", endpoint: "http://provider.internal:5103", status: "enabled" },
            observation: {
                observedAt: "2026-10-22T10:00:00.000Z",
                report: {
                    implementations: [
                        {
                            contractId: "catalog.items",
                            version: "1.0.0",
                            digest: `sha256:${"a".repeat(64)}`,
                            status: "ready",
                        },
                    ],
                },
            },
        },
    };
}
