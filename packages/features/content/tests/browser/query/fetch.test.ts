import { describe, test, expect, afterEach } from "bun:test";
import { runFetch } from "../../../src/browser/binding/runtime/query/queryFetch";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

function respond(status: number, body: string, requestId?: string) {
    globalThis.fetch = (async () =>
        new Response(body || null, {
            status,
            headers: requestId ? { "x-ulvia-request-id": requestId } : undefined,
        })) as unknown as typeof fetch;
}

function rejectWith(err: unknown) {
    globalThis.fetch = (async () => {
        throw err;
    }) as unknown as typeof fetch;
}

const signal = new AbortController().signal;

describe("runFetch — success", () => {
    test("2xx JSON object → success with parsed data", async () => {
        respond(200, JSON.stringify({ a: 1 }));
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: { a: 1 }, status: 200 });
    });

    test("2xx JSON array → success with parsed data", async () => {
        respond(200, JSON.stringify([1, 2]));
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: [1, 2], status: 200 });
    });

    test("204 No Content → success with null", async () => {
        respond(204, "");
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: null, status: 204 });
    });

    test("2xx empty body → success with null", async () => {
        respond(200, "   ");
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: null, status: 200 });
    });
});

describe("runFetch — declared errors and technical failures", () => {
    test("decodes a declared error with its output and request id", async () => {
        respond(404, '{"error":{"code":"NOT_FOUND","retryable":false,"output":{"id":"page-a"}}}', "req-a");
        expect(await runFetch("/x", signal)).toEqual({
            kind: "error",
            code: "NOT_FOUND",
            retryable: false,
            output: { id: "page-a" },
            status: 404,
            requestId: "req-a",
        });
    });

    test("decodes a Gateway failure", async () => {
        respond(503, '{"failure":{"code":"not_ready","retryable":true}}');
        expect(await runFetch("/x", signal)).toEqual({
            kind: "failure",
            code: "not_ready",
            retryable: true,
            status: 503,
        });
    });

    test("an undeclared HTTP envelope becomes an invalid response failure", async () => {
        respond(500, '{"error":{"code":"UNKNOWN"}}');
        expect(await runFetch("/x", signal)).toEqual({
            kind: "failure",
            code: "invalid_response",
            retryable: false,
            status: 500,
        });
    });

    test("2xx with invalid JSON becomes a failure", async () => {
        respond(200, "{ not json");
        expect(await runFetch("/x", signal)).toEqual({
            kind: "failure",
            code: "invalid_response",
            retryable: false,
            status: 200,
        });
    });

    test("network failure becomes a retryable failure", async () => {
        rejectWith(new TypeError("Failed to fetch"));
        expect(await runFetch("/x", signal)).toEqual({
            kind: "failure",
            code: "network_error",
            retryable: true,
        });
    });
});

describe("runFetch — abort", () => {
    test("AbortError → aborted (not an error)", async () => {
        rejectWith(Object.assign(new Error("aborted"), { name: "AbortError" }));
        expect(await runFetch("/x", signal)).toEqual({ kind: "aborted" });
    });
});
