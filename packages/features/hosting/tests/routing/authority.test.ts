import { expect, test } from "bun:test";
import { RoutingAuthority } from "@bernouy/hosting/routing";
import type { HostedRoute } from "@bernouy/hosting/routing";

function fixture() {
    let now = 1_700_000_000_000;
    let reads = 0;
    let resourceReads = 0;
    let resourceRevision = "11111111-1111-4111-8111-111111111111";
    let route: HostedRoute | null = {
        origin: "https://a.example",
        canonicalOrigin: "https://a.example",
        instanceId: "instance:a",
        domainRevision: 1,
        instanceRevision: 2,
    };
    const authority = new RoutingAuthority(
        {
            resolve: async () => {
                reads++;
                return route;
            },
        },
        "provider-private-signing-key".repeat(2),
        async (instanceId) => {
            expect(instanceId).toBe(route!.instanceId);
            resourceReads++;
            return resourceRevision;
        },
        () => now,
    );
    return {
        authority,
        reads: () => reads,
        setRoute(value: HostedRoute | null) {
            route = value;
        },
        time(value: number) {
            now = value;
        },
        current: () => route!,
        resourceReads: () => resourceReads,
        setResourceRevision(value: string) {
            resourceRevision = value;
        },
    };
}

test("an Edge lease is scoped, expires and rechecks current domain and instance state at use", async () => {
    const f = fixture();
    const issued = (await f.authority.resolve("A.EXAMPLE"))!;
    expect(issued.hostname).toBe("a.example");
    expect(issued.controlLease.length).toBeLessThanOrEqual(512);
    expect(await f.authority.authorizeControlToken(issued.controlLease)).toEqual(f.current());
    const original = f.current();
    for (const route of [
        null,
        { ...original, domainRevision: 2 },
        { ...original, instanceRevision: 3 },
        { ...original, instanceId: "instance:b" },
        { ...original, origin: "https://b.example" },
        { ...original, canonicalOrigin: "https://b.example" },
    ]) {
        f.setRoute(route);
        expect(await f.authority.authorizeControlToken(issued.controlLease)).toBeNull();
    }
    f.setRoute(original);
    const before = f.reads();
    f.time(issued.expiresAt);
    expect(await f.authority.authorizeControlToken(issued.controlLease)).toBeNull();
    expect(f.reads()).toBe(before);
});

test("resource revisions change cache metadata without changing lease authority or adding reads at lease use", async () => {
    const f = fixture();
    const first = (await f.authority.resolve("a.example"))!;
    f.setResourceRevision("22222222-2222-4222-8222-222222222222");
    const second = (await f.authority.resolve("a.example"))!;
    expect(second.resourceRevision).not.toBe(first.resourceRevision);
    expect(await f.authority.authorizeControlToken(first.controlLease)).toEqual(f.current());
    expect(f.resourceReads()).toBe(2);
    f.setRoute(null);
    expect(await f.authority.resolve("unknown.example")).toBeNull();
    expect(f.resourceReads()).toBe(2);
});

test("tampered, oversized and unrelated credentials refuse before any persistence read", async () => {
    const f = fixture();
    const { controlLease } = (await f.authority.resolve("a.example"))!;
    const before = f.reads();
    for (const token of [
        "operator-token",
        controlLease.replace("edg1.", "edg2."),
        `${controlLease}x`,
        "edg1." + "x".repeat(513),
        "edg1.e30." + "a".repeat(43),
    ]) {
        expect(await f.authority.authorizeControlToken(token)).toBeNull();
    }
    expect(f.reads()).toBe(before);
});

test("maximum canonical hostname and revisions fit the existing control credential bound", async () => {
    const f = fixture();
    const hostname = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(61)].join(".");
    f.setRoute({
        ...f.current(),
        origin: `https://${hostname}`,
        canonicalOrigin: `https://${hostname}`,
        domainRevision: Number.MAX_SAFE_INTEGER,
        instanceRevision: Number.MAX_SAFE_INTEGER,
        instanceId: "x".repeat(128),
    });
    const route = (await f.authority.resolve(hostname))!;
    expect(route.controlLease.length).toBeLessThanOrEqual(512);
    expect(await f.authority.authorizeControlToken(route.controlLease)).toEqual(f.current());
});
