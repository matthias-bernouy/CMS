import { expect, test } from "bun:test";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { EDGE_ROUTING_SERVICE, ROUTING_INSTANCE_ID } from "@bernouy/hosting/routing";
import { officialCapabilityInventory } from "../../capabilities/inventory";
import { observeSignedProvider } from "./signed";

test("routing requests use the real SDK signature with fixed machine authority and no account connection identity", async () => {
    const inventory = await officialCapabilityInventory();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/provider.routing" &&
            row.definition.id === "domains.resolve",
    )!;
    const secret = "c".repeat(64);
    let received = 0;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            received++;
            const claims = verifyProviderInvocationToken(request.headers.get("authorization")!.slice(7), secret);
            expect(claims.instanceId).toBe(ROUTING_INSTANCE_ID);
            expect(claims.systemServiceId).toBe(EDGE_ROUTING_SERVICE);
            expect(claims.connectionId).toBeUndefined();
            expect(claims.subjectId).toBeUndefined();
            expect(claims.sourceInstallationId).toBeUndefined();
            expect(claims.contractId).toBe(target.release.contractId);
            expect(claims.contractVersion).toBe(target.release.version);
            expect(claims.requestId).toBe(request.headers.get("x-ulvia-request-id")!);
            expect(request.method).toBe("QUERY");
            expect(new URL(request.url).pathname).toBe("/hosting/routing/resolve");
            expect(await request.json()).toEqual({ hostname: "missing.localhost" });
            return Response.json(null);
        },
    });
    try {
        const call = {
            origin: server.url.origin,
            target,
            binding: "http",
            input: { hostname: "missing.localhost" },
            credentials: {},
            assert(value: unknown) {
                expect(value).toBeNull();
            },
        };
        const result = await observeSignedProvider(call, { kind: "routing", secret });
        expect(result.validated && result.completed && result.streamConsumed).toBe(true);
        expect(JSON.stringify(result)).not.toContain(secret);
        await expect(
            observeSignedProvider(call, { kind: "account", secret, instanceId: "forged", connectionId: "forged" }),
        ).rejects.toThrow("signed-fixture-target-mismatch");
        expect(received).toBe(1);
    } finally {
        server.stop(true);
    }
});
