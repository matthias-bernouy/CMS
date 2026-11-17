import { expect, test } from "bun:test";
import { exerciseLoad, assertDeliveryLoad } from "./load";

test("a failed delivery load retains actual attempts, latency, bytes and timeouts before the blocking assertion", async () => {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => new Response("controlled-unavailable", { status: 503 }),
    });
    try {
        const result = await exerciseLoad(
            { cmsUrl: `http://127.0.0.1:${server.port}` },
            {
                page: {
                    request: {
                        async get() {
                            throw new DOMException("Controlled timeout", "TimeoutError");
                        },
                    },
                },
            },
        );
        expect(result.attempted).toBe(5);
        expect(result.requests).toBe(0);
        expect(result.errors).toBe(5);
        expect(result.timeouts).toBe(1);
        expect(result.responseBytes).toBe(4 * Buffer.byteLength("controlled-unavailable"));
        expect(result.samplesMs).toHaveLength(5);
        expect(result.elapsedMs).toBeGreaterThan(1000);
        expect(result.requestsPerMinute).toBe(0);
        expect(() => assertDeliveryLoad(result)).toThrow();
    } finally {
        await server.stop(true);
    }
});
