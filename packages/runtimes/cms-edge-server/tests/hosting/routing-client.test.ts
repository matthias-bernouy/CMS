import { expect, test } from "bun:test";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { RoutingClient } from "../../src/runtime/hosting/client/RoutingClient";
import { RouteLease, routeContextKey } from "../../src/runtime/hosting/client/RouteLease";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import { runWithRequestContext } from "@bernouy/http-runner/observability";

const secret = "dedicated-edge-routing-secret".repeat(2);

test("routing work retains the ingress trace independently of its signed machine request identity", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const request = new Request("http://a.localhost/page", { headers: { "x-request-id": id } });
    const client = new RoutingClient("http://provider.internal", secret, (async (_url, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-request-id")).toBe(id);
        expect(headers.get("x-ulvia-request-id")).not.toBe(id);
        return Response.json(route());
    }) as typeof fetch);
    await runWithRequestContext(request, () => client.resolve("a.localhost"));
});
function route(): EdgeRoute {
    return {
        hostname: "a.localhost",
        origin: "http://a.localhost",
        canonicalOrigin: "http://a.localhost",
        instanceId: "instance:a",
        domainRevision: 1,
        instanceRevision: 2,
        resourceRevision: "11111111-1111-4111-8111-111111111111",
        controlLease: "opaque-scoped-control-lease",
        expiresAt: Date.now() + 60_000,
    };
}

test("a resource revision does not evict the tenant Gateway or change its control lease", async () => {
    const initial = route();
    const current = { ...initial, resourceRevision: "22222222-2222-4222-8222-222222222222" };
    expect(routeContextKey(current)).toBe(routeContextKey(initial));
    const lease = new RouteLease(initial, {
        resolve: async () => {
            throw new Error("unexpected renewal");
        },
    });
    lease.update(current);
    expect(await lease.token()).toBe(initial.controlLease);
});

test("routing client signs only the admitted machine scope and validates audience, response bounds and redirects", async () => {
    let calls = 0;
    let result: unknown = route();
    let status = 200;
    const client = new RoutingClient("http://provider.internal", secret, (async (url, options) => {
        calls++;
        expect(String(url)).toBe("http://provider.internal/hosting/routing/resolve");
        expect(options?.method).toBe("QUERY");
        expect(options?.redirect).toBe("manual");
        const claims = verifyProviderInvocationToken(
            new Headers(options?.headers).get("authorization")!.slice(7),
            secret,
        );
        expect(claims).toMatchObject({
            instanceId: "hosting:installation",
            contractId: "ulvia/provider.routing",
            capabilityId: "domains.resolve",
            systemServiceId: "cms-edge",
        });
        expect(claims.subjectId).toBeUndefined();
        return Response.json(result, { status });
    }) as typeof fetch);
    expect(await client.resolve("a.localhost")).toEqual(result);
    result = null;
    expect(await client.resolve("unknown.localhost")).toBeNull();
    result = { ...route(), hostname: "other.localhost" };
    await expect(client.resolve("a.localhost")).rejects.toThrow("audience");
    result = { ...route(), expiresAt: Date.now() - 1 };
    await expect(client.resolve("a.localhost")).rejects.toThrow("expiry");
    result = "x".repeat(16_385);
    await expect(client.resolve("a.localhost")).rejects.toThrow("too large");
    status = 302;
    await expect(client.resolve("a.localhost")).rejects.toThrow("302");
    const before = calls;
    await expect(client.resolve("x".repeat(254))).rejects.toThrow();
    expect(calls).toBe(before);
});

test("lease renewal coalesces, fences assignment changes and does not fall back after a refusal", async () => {
    const initial = route();
    let now = initial.expiresAt - 1;
    let calls = 0;
    const pending = Promise.withResolvers<EdgeRoute | null>();
    const lease = new RouteLease(
        initial,
        {
            resolve: async () => {
                calls++;
                return pending.promise;
            },
        },
        () => now,
    );
    const tokens = [lease.token(), lease.token()];
    pending.resolve({ ...initial, expiresAt: now + 60_000, controlLease: "renewed-scoped-control-lease" });
    expect(await Promise.all(tokens)).toEqual(["renewed-scoped-control-lease", "renewed-scoped-control-lease"]);
    expect(calls).toBe(1);
    expect(() => lease.update({ ...initial, instanceRevision: 3 })).toThrow("changed");
    now += 60_000;
    await expect(lease.token()).rejects.toThrow("too short");
    const refused = new RouteLease(initial, { resolve: async () => null }, () => now);
    await expect(refused.token()).rejects.toThrow("no longer active");
});

test("routing concurrency is bounded and failed calls release capacity", async () => {
    const gate = Promise.withResolvers<Response>();
    let calls = 0;
    const client = new RoutingClient(
        "http://provider.internal",
        secret,
        (async () => {
            calls++;
            return gate.promise;
        }) as typeof fetch,
        1,
    );
    const first = client.resolve("a.localhost");
    await expect(client.resolve("b.localhost")).rejects.toThrow("capacity");
    expect(calls).toBeLessThanOrEqual(1);
    gate.resolve(new Response(null, { status: 503 }));
    await expect(first).rejects.toThrow("503");
    await expect(client.resolve("a.localhost")).rejects.toThrow("503");
    expect(calls).toBe(2);
});

test("a live command can renew after its own instance revision while domain authority remains fixed", async () => {
    const initial = route();
    let current: EdgeRoute | null = { ...initial, instanceRevision: 3, controlLease: "new-instance-revision-lease" };
    let calls = 0;
    const lease = new RouteLease(initial, {
        resolve: async () => {
            calls++;
            return current;
        },
    });
    expect(await Promise.all([lease.refresh(), lease.refresh()])).toEqual([
        "new-instance-revision-lease",
        "new-instance-revision-lease",
    ]);
    expect(calls).toBe(1);
    expect(await lease.token()).toBe("new-instance-revision-lease");
    expect(calls).toBe(1);
    for (const change of [
        { instanceId: "instance:foreign" },
        { origin: "http://foreign.localhost" },
        { canonicalOrigin: "http://foreign.localhost" },
        { hostname: "foreign.localhost" },
        { domainRevision: 2 },
        { instanceRevision: 1 },
    ]) {
        current = { ...initial, ...change };
        await expect(lease.refresh()).rejects.toThrow("changed authority");
    }
    current = null;
    await expect(lease.refresh()).rejects.toThrow("no longer active");
});
