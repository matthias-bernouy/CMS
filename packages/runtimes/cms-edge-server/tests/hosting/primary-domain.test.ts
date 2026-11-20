import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import {
    ControlAuthority,
    DomainAdmissionPolicy,
    DomainRegistry,
    HostingError,
    PrimaryDomainManagement,
    reserveHostingInstallation,
} from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { RoutingAuthority } from "@bernouy/hosting/routing";
import { SharedEdge } from "../../src/runtime/hosting/SharedEdge";
import type { HostingInstanceState } from "@bernouy/hosting";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import { RouteLease } from "../../src/runtime/hosting/client/RouteLease";

test("warm shared Edges follow A to B to A while admitted callbacks retain their logical origin", async () => {
    const store = new InMemoryHostingStore();
    await reserveHostingInstallation(store, "http://control.localhost");
    await store.bindControl(1, "control");
    await store.completeInstallation(2);
    let instance: HostingInstanceState = { id: "site", cmsUrl: "http://a.localhost", revision: 1, status: "ready" };
    const instances = {
        getInstance: async (id: string) => (id === instance.id ? structuredClone(instance) : null),
        setPublicOrigin: async (id: string, revision: number, origin: string) => {
            if (id !== instance.id || instance.revision !== revision) {
                throw new HostingError("CONFLICT", "Instance revision changed");
            }
            instance = { ...instance, cmsUrl: origin, revision: revision + 1 };
            return structuredClone(instance);
        },
    };
    const authority = new ControlAuthority(store, async () => true);
    const domains = new DomainRegistry(
        store,
        instances,
        authority,
        "x".repeat(32),
        async () => true,
        new DomainAdmissionPolicy([], true),
    );
    let a = await domains.registerManaged("site", "http://a.localhost");
    let b = await domains.registerManaged("site", "http://b.localhost");
    const routing = new RoutingAuthority(domains, "s".repeat(32), async () => "resource-1");
    const primary = new PrimaryDomainManagement(store, instances, authority);
    let creates = 0;
    const edges = [0, 1].map(
        () =>
            new SharedEdge(
                routing,
                async (route) => {
                    creates++;
                    return {
                        update: () => {},
                        close: async () => {},
                        handle: async (request: Request) =>
                            Response.json({
                                canonical: route.canonicalOrigin,
                                origin: new URL(request.url).origin,
                                method: request.method,
                                body: await request.text(),
                            }),
                    };
                },
                NOOP_LOGGER,
                { maxEntries: 8, maxPending: 4, maxWaiters: 8, idleMs: 60000 },
            ),
    );
    const actor = { instanceId: "control", subjectId: "admin" };
    try {
        for (const edge of edges) {
            expect((await (await edge.handle(new Request("http://a.localhost/"))).json()).canonical).toBe(
                instance.cmsUrl,
            );
        }
        const before = await routing.resolve("a.localhost");
        const first = await primary.elect(actor, {
            instanceId: "site",
            hostname: b.hostname,
            expectedInstanceRevision: instance.revision,
            expectedDomainRevision: b.revision,
        });
        b = first.domain;
        expect(await routing.authorizeControlToken(before!.controlLease)).toBeNull();
        for (const edge of edges) {
            const alias = await edge.handle(new Request("http://a.localhost/path?q=1"));
            expect(alias.status).toBe(308);
            expect(alias.headers.get("location")).toBe("http://b.localhost/path?q=1");
            expect(alias.headers.get("cache-control")).toBe("no-store");
            expect((await (await edge.handle(new Request("http://b.localhost/"))).json()).canonical).toBe(
                instance.cmsUrl,
            );
            const callback = await edge.handle(
                new Request("http://a.localhost/.cms/call/ulvia/cms.installations/gateway/dispatch", {
                    method: "POST",
                    body: "retained-body",
                }),
            );
            expect(await callback.json()).toEqual({
                canonical: "http://b.localhost",
                origin: "http://a.localhost",
                method: "POST",
                body: "retained-body",
            });
            const discovery = await edge.handle(new Request("http://a.localhost/.cms/mcp"));
            expect(discovery.status).toBe(308);
            expect(discovery.headers.get("location")).toBe("http://b.localhost/.cms/mcp");
        }
        const second = await primary.elect(actor, {
            instanceId: "site",
            hostname: a.hostname,
            expectedInstanceRevision: instance.revision,
            expectedDomainRevision: a.revision,
        });
        a = second.domain;
        for (const edge of edges) {
            expect((await (await edge.handle(new Request("http://a.localhost/"))).json()).canonical).toBe(
                instance.cmsUrl,
            );
            const alias = await edge.handle(new Request("http://b.localhost/back"));
            expect(alias.status).toBe(308);
            expect(alias.headers.get("location")).toBe("http://a.localhost/back");
            expect((await edge.handle(new Request("http://unknown.localhost/.cms/call/test/resource"))).status).toBe(
                404,
            );
        }
        expect(creates).toBe(8);
        expect(b.state).toBe("active");
    } finally {
        await Promise.all(edges.map((edge) => edge.close()));
    }
});

test("an in-flight command renews after primary election without reusing its stale context", async () => {
    const initial: EdgeRoute = {
        hostname: "a.localhost",
        origin: "http://a.localhost",
        canonicalOrigin: "http://a.localhost",
        instanceId: "site",
        domainRevision: 1,
        instanceRevision: 1,
        resourceRevision: "1",
        expiresAt: Date.now() + 60000,
        controlLease: "old",
    };
    let current = {
        ...initial,
        canonicalOrigin: "http://b.localhost",
        instanceRevision: 2,
        domainRevision: 2,
        controlLease: "new",
    };
    const lease = new RouteLease(initial, { resolve: async () => current });
    expect(await lease.refresh()).toBe("new");
    expect(() => lease.update(current)).toThrow("changed");
    current = { ...current, canonicalOrigin: "http://foreign.localhost" };
    await expect(lease.refresh()).rejects.toThrow("changed authority");
    current = { ...current, instanceId: "foreign", instanceRevision: 3 };
    await expect(lease.refresh()).rejects.toThrow("changed authority");
});
