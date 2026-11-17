import { expect } from "bun:test";
import { statistics } from "../harness/measurements/statistics";
import type { mcpContainers } from "../../integration/instance/containers";
import type { connectBrowser } from "../../integration/instance/oauth";

type Stack = Awaited<ReturnType<typeof mcpContainers>>;
type Connection = Awaited<ReturnType<typeof connectBrowser>>;

/** Retain failed requests too; a bounded early stop remains an incomplete, failing load. */
export async function exerciseLoad(
    stack: Pick<Stack, "cmsUrl">,
    connection: { page: { request: Pick<Connection["page"]["request"], "get"> } },
) {
    let success = 0;
    let administrators = 0;
    let responseBytes = 0;
    let errors = 0;
    let timeouts = 0;
    const samplesMs: number[] = [];
    const started = performance.now();
    const paths = ["/performance-image", "/performance-image-two", "/performance-image-three"];
    for (let index = 0; index < 420; index++) {
        const due = started + index * 300;
        if (due > performance.now()) {
            await Bun.sleep(due - performance.now());
        }
        const requestStarted = performance.now();
        try {
            if (index % 4 === 3) {
                const response = await connection.page.request.get(`${stack.cmsUrl}/performance-literal`, {
                    timeout: 10_000,
                });
                try {
                    responseBytes += (await response.body()).byteLength;
                    expect(response.status(), `administrator request ${index}`).toBe(200);
                    expect(response.headers()["cache-control"]).toBe("private, no-store");
                    administrators++;
                } finally {
                    await response.dispose();
                }
            } else {
                const response = await fetch(`${stack.cmsUrl}${paths[index % 3]}`, {
                    signal: AbortSignal.timeout(10_000),
                });
                responseBytes += (await response.arrayBuffer()).byteLength;
                expect(response.status, `public request ${index}`).toBe(200);
            }
            success++;
        } catch (error) {
            errors++;
            if (error instanceof Error && error.name === "TimeoutError") {
                timeouts++;
            }
        } finally {
            samplesMs.push(performance.now() - requestStarted);
        }
        if (errors >= 5) {
            break;
        }
    }
    const elapsedMs = performance.now() - started;
    return {
        requests: success,
        attempted: samplesMs.length,
        administrators,
        pages: paths.length,
        elapsedMs,
        requestsPerMinute: (success * 60_000) / elapsedMs,
        responseBytes,
        samplesMs,
        p50Ms: statistics(samplesMs).p50,
        p95Ms: statistics(samplesMs).p95,
        errors,
        timeouts,
    };
}

export function assertDeliveryLoad(load: Awaited<ReturnType<typeof exerciseLoad>>) {
    expect(load.attempted).toBe(420);
    expect(load.requests).toBe(420);
    expect(load.administrators).toBe(105);
    expect(load.errors).toBe(0);
    expect(load.timeouts).toBe(0);
    expect(load.elapsedMs).toBeGreaterThan(120_000);
    expect(load.requestsPerMinute, "actual completed requests/minute").toBeGreaterThanOrEqual(200);
}
