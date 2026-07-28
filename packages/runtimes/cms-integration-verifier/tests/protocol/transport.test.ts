import { describe, expect, test } from "bun:test";
import { VerificationProtocolError, createHttpCandidateWorkerClient } from "../../src";

describe("verification worker transport", () => {
    test("times out even when an injected transport does not settle by itself", async () => {
        const client = workerClient({
            requestTimeoutMs: 5,
            fetch: async (_input, init) =>
                await new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
                        once: true,
                    });
                }),
        });

        await expect(client.listClaimable(1)).rejects.toMatchObject({ kind: "timeout", retryable: true });
    });

    test("bounds response bytes before parsing and rejects non-JSON success bodies", async () => {
        const oversized = workerClient({
            maxResponseBytes: 32,
            fetch: async () =>
                new Response("{}", {
                    headers: { "content-type": "application/json", "content-length": "33" },
                }),
        });
        await expect(oversized.listClaimable(1)).rejects.toMatchObject({ kind: "invalid-response" });

        const text = workerClient({ fetch: async () => new Response("ok", { status: 200 }) });
        await expect(text.listClaimable(1)).rejects.toMatchObject({ kind: "invalid-response" });
    });

    test("never reflects transport failures or repository bodies containing credentials", async () => {
        const transportSecret = "worker-service-secret";
        const failed = workerClient({
            workerToken: transportSecret,
            fetch: async () => {
                throw new Error(`connection failed with ${transportSecret}`);
            },
        });
        const transportError = await captureError(failed.listClaimable(1));
        expect(transportError).toBeInstanceOf(VerificationProtocolError);
        expect(transportError.message).not.toContain(transportSecret);

        const bodySecret = "database-password";
        const rejected = workerClient({
            fetch: async () =>
                new Response(JSON.stringify({ code: bodySecret, error: bodySecret }), {
                    status: 503,
                    headers: { "content-type": "application/json" },
                }),
        });
        const httpError = await captureError(rejected.listClaimable(1));
        expect(httpError).toMatchObject({ kind: "http", status: 503, retryable: true });
        expect(httpError.message).not.toContain(bodySecret);
        expect((httpError as VerificationProtocolError).code).toBeUndefined();
    });
});

function workerClient(overrides: Partial<Parameters<typeof createHttpCandidateWorkerClient>[0]>) {
    return createHttpCandidateWorkerClient({
        repositoryUrl: "http://repository.internal",
        workerId: "worker-1",
        workerToken: "worker-secret",
        requestTimeoutMs: 1_000,
        maxResponseBytes: 1_048_576,
        fetch: async () =>
            new Response(JSON.stringify({ candidates: [] }), {
                headers: { "content-type": "application/json" },
            }),
        ...overrides,
    });
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error("Expected operation to fail");
}
