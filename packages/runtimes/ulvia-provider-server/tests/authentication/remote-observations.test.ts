import { expect, test } from "bun:test";
import { gatewayRoute } from "../../../../features/cms-gateway/tests/fixtures";
import { RefreshingProviderRoutes } from "../../src/runtime/gateway/providers/RefreshingProviderRoutes";

async function fixture() {
    let now = Date.now();
    const route = structuredClone(await gatewayRoute());
    route.installation.observation!.observedAt = new Date(now - 31_000).toISOString();
    let lookups = 0;
    let probes = 0,
        failures = 0;
    let read = async () => route.installation.observation!.report;
    const routes = new RefreshingProviderRoutes(
        {
            resolve: async () => {
                lookups++;
                return structuredClone(route);
            },
            isCurrent: async () => true,
        },
        {
            installations: {
                recordObservation: async (_scope, revision, report) => {
                    if (route.installation.revision !== revision) {
                        throw new Error("revision changed");
                    }
                    route.installation.observation = {
                        observedAt: new Date(now).toISOString(),
                        report: report as never,
                    };
                    route.installation.revision++;
                    return route.installation;
                },
            } as never,
            resolveSecret: async () => "stored-report-credential",
            readReport: async () => {
                probes++;
                return read();
            },
            reportFailure: () => {
                failures++;
            },
            now: () => now,
        },
    );
    return {
        routes,
        route,
        fail: () => {
            read = async () => {
                throw new Error("offline");
            };
        },
        setRead: (value: typeof read) => {
            read = value;
        },
        tick: () => {
            now += 31_000;
        },
        lookups: () => lookups,
        probes: () => probes,
        failures: () => failures,
    };
}

test("remote selected Providers renew their own observation with one coalesced probe", async () => {
    const f = await fixture();
    const routes = await Promise.all(Array.from({ length: 8 }, () => f.routes.resolve("site-a", "catalog")));
    expect(f.probes()).toBe(1);
    expect(routes.every((route) => route!.installation.revision === 3)).toBe(true);
    await f.routes.resolve("site-a", "catalog");
    expect(f.probes()).toBe(1);
    f.tick();
    await f.routes.resolve("site-a", "catalog");
    expect(f.probes()).toBe(2);
});

test("failed remote probes back off, and disablement during a probe cannot be overwritten", async () => {
    const f = await fixture();
    f.fail();
    await f.routes.resolve("site-a", "catalog");
    await f.routes.resolve("site-a", "catalog");
    expect(f.probes()).toBe(1);
    expect(f.failures()).toBe(1);
    f.tick();
    f.setRead(async () => {
        f.route.installation.installation.status = "disabled";
        f.route.installation.revision++;
        return f.route.installation.observation!.report;
    });
    expect((await f.routes.resolve("site-a", "catalog"))!.installation.installation.status).toBe("disabled");
    expect(f.failures()).toBe(2);
});

test("official warm-up and calls to other contracts share one installation renewal", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    f.setRead(async () => {
        await gate;
        return f.route.installation.observation!.report;
    });
    const warming = f.routes.warm("site-a", "ulvia.cms.installations");
    const invoking = Promise.all(Array.from({ length: 8 }, () => f.routes.resolve("site-a", "catalog")));
    await Bun.sleep(0);
    expect(f.probes()).toBe(1);
    release();
    const [official, calls] = await Promise.all([warming, invoking]);
    expect(official).toBeUndefined();
    expect(calls.every((route) => route!.installation.revision === 3)).toBe(true);
    expect(f.failures()).toBe(0);
});

test("disabled installations are never probed during official warm-up", async () => {
    const f = await fixture();
    f.route.installation.installation.status = "disabled";
    await f.routes.resolve("site-a", "ulvia.cms.installations");
    expect(f.probes()).toBe(0);
    expect(f.failures()).toBe(0);
});

test("bursts of official warm-up coalesce route reads without caching live authorization", async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 96 }, () => f.routes.warm("site-a", "ulvia.cms.installations")));
    const warmedReads = f.lookups();
    expect(warmedReads).toBe(2);
    expect(f.probes()).toBe(1);
    await Promise.all(Array.from({ length: 96 }, () => f.routes.warm("site-a", "ulvia.cms.installations")));
    expect(f.lookups()).toBe(warmedReads);
    f.route.installation.installation.status = "disabled";
    expect((await f.routes.resolve("site-a", "catalog"))!.installation.installation.status).toBe("disabled");
    expect(f.lookups()).toBe(warmedReads + 1);
});

test("cold invocation bursts share route resolution and reread state after completion", async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 96 }, () => f.routes.resolve("site-a", "catalog")));
    expect(f.lookups()).toBe(2);
    expect(f.probes()).toBe(1);
    f.route.installation.installation.status = "disabled";
    const burst = await Promise.all(Array.from({ length: 96 }, () => f.routes.resolve("site-a", "catalog")));
    expect(burst.every((route) => route!.installation.installation.status === "disabled")).toBeTrue();
    expect(f.lookups()).toBe(3);
});
