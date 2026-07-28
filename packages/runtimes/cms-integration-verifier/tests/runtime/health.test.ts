import { afterEach, describe, expect, test } from "bun:test";
import { startVerifierHealthServer, VerificationRuntimeHealth } from "../../src";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

describe("verification runtime health", () => {
    test("keeps liveness separate while readiness follows bounded pull-loop state", async () => {
        const timestamps = ["2026-07-27T08:00:00.000Z", "2026-07-27T08:01:00.000Z", "2026-07-27T08:02:00.000Z"];
        const health = new VerificationRuntimeHealth(() => timestamps.shift()!);
        const server = startVerifierHealthServer(0, health);
        servers.push(server);
        const origin = `http://127.0.0.1:${server.port}`;

        expect((await fetch(`${origin}/live`)).status).toBe(200);
        const starting = await fetch(`${origin}/ready`);
        expect(starting.status).toBe(503);
        expect(await starting.json()).toEqual({ ready: false, state: "starting", consecutiveFailures: 0 });

        health.success();
        const ready = await fetch(`${origin}/ready`);
        expect(ready.status).toBe(200);
        expect(await ready.json()).toEqual({
            ready: true,
            state: "ready",
            consecutiveFailures: 0,
            lastSuccessAt: "2026-07-27T08:00:00.000Z",
        });

        health.failure({ code: "protocol-upstream-unavailable", retryable: true });
        health.failure({ code: "worker-operation-failed", retryable: false });
        const degraded = await fetch(`${origin}/ready`);
        expect(degraded.status).toBe(503);
        expect(await degraded.json()).toEqual({
            ready: false,
            state: "degraded",
            consecutiveFailures: 2,
            lastSuccessAt: "2026-07-27T08:00:00.000Z",
            lastFailure: {
                code: "worker-operation-failed",
                retryable: false,
                occurredAt: "2026-07-27T08:02:00.000Z",
            },
        });
    });
});
