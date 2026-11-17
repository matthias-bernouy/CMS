import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";

for (const method of ["POST", "DELETE"]) {
    test(`the real pinned transport delivers the entire ${method} JSON body without instrumentation`, async () => {
        const payload = JSON.stringify({ value: "Performance transport fixture ✓" });
        const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(request) {
                const received = await request.text();
                return Response.json({ bytes: Buffer.byteLength(received), matches: received === payload });
            },
        });
        try {
            const network = new NodeGatewayHttpNetwork({
                authorize: async () => ({ token: "test-only-transport-credential" }),
                allowPrivateAddresses: true,
            });
            const response = await network.exchange({
                origin: server.url.origin,
                pathAndQuery: "/fixture",
                method,
                headers: { "content-type": "application/json" },
                body: payload,
                requestId: randomUUID(),
                providerTokenRef: "test-only",
                authentication: {
                    kind: "capability",
                    instanceId: "performance-instance",
                    contractId: "performance/payload",
                    contractVersion: "1.0.0",
                    capabilityId: "echo",
                },
                signal: AbortSignal.timeout(5000),
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(
                result.bytes,
                "A performance sample is invalid when the declared JSON body is lost in transport",
            ).toBe(Buffer.byteLength(payload));
            expect(result.matches).toBe(true);
        } finally {
            server.stop(true);
        }
    });
}
