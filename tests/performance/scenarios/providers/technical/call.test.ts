import { expect, test } from "bun:test";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { officialCapabilityInventory } from "../../../capabilities/inventory";
import { callConnection } from "./call";

test("technical connection calls use real SDK signing, complete JSON bodies and narrow account authority", async () => {
    const inventory = await officialCapabilityInventory();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/provider.connections" &&
            row.definition.id === "connections.configure",
    )!;
    const account = { instanceId: "owned-test-instance", secret: "a".repeat(64) };
    const connectionId = `performance-${crypto.randomUUID()}`;
    let received = 0;
    let origin = "";
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            received++;
            const token = request.headers.get("authorization")!.slice("Bearer ".length);
            const claims = verifyProviderInvocationToken(token, account.secret);
            expect(claims.instanceId).toBe(account.instanceId);
            expect(claims.connectionId).toBe(connectionId);
            expect(claims.contractId).toBe(target.release.contractId);
            expect(claims.contractVersion).toBe(target.release.version);
            expect(claims.capabilityId).toBe("connections.configure");
            expect(claims.requestId).toBe(request.headers.get("x-ulvia-request-id")!);
            expect(claims.systemServiceId).toBeUndefined();
            expect(claims.subjectId).toBeUndefined();
            expect(claims.sourceInstallationId).toBeUndefined();
            expect(new URL(request.url).pathname).toBe("/provider/connections");
            expect(await request.json()).toEqual({
                connectionId,
                cmsUrl: origin,
                token: "b".repeat(64),
                generation: 1,
            });
            return Response.json({ connectionId, configured: true });
        },
    });
    origin = server.url.origin;
    try {
        const call = {
            origin,
            target,
            binding: "http",
            credentials: {},
            input: { connectionId, cmsUrl: origin, token: "b".repeat(64), generation: 1 },
            assert(value: unknown) {
                expect(value).toEqual({ connectionId, configured: true });
            },
        };
        const observed = await callConnection(call, account, connectionId);
        expect(observed.validated && observed.completed && observed.streamConsumed).toBe(true);
        expect(observed.responseBytes).toBeGreaterThan(0);
        expect(JSON.stringify(observed)).not.toContain(account.secret);
        expect(JSON.stringify(observed)).not.toContain("b".repeat(64));
        await expect(callConnection({ ...call, origin: "https://ulvia.fr" }, account, connectionId)).rejects.toThrow();
        await expect(
            callConnection({ ...call, input: { ...call.input, generation: 0 } }, account, connectionId),
        ).rejects.toThrow();
        expect(received).toBe(1);
    } finally {
        server.stop(true);
    }
});
