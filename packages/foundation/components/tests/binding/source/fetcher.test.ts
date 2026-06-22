import { describe, test, expect, afterEach } from "bun:test";
import { runFetch } from "../../../src/binding/fetcher";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Minimal Response stub — runFetch only reads `ok`, `status`, `text()`. */
function respond(status: number, body: string) {
    globalThis.fetch = (async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    })) as unknown as typeof fetch;
}

function rejectWith(err: unknown) {
    globalThis.fetch = (async () => { throw err; }) as unknown as typeof fetch;
}

const signal = new AbortController().signal;

describe("runFetch — success", () => {
    test("2xx JSON object → success with parsed data", async () => {
        respond(200, JSON.stringify({ a: 1 }));
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: { a: 1 } });
    });

    test("2xx JSON array → success with parsed data", async () => {
        respond(200, JSON.stringify([1, 2]));
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: [1, 2] });
    });

    test("204 No Content → success with null", async () => {
        respond(204, "");
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: null });
    });

    test("2xx empty body → success with null", async () => {
        respond(200, "   ");
        expect(await runFetch("/x", signal)).toEqual({ kind: "success", data: null });
    });
});

describe("runFetch — errors carry the status", () => {
    test("404 → error with status 404", async () => {
        respond(404, "not found");
        expect(await runFetch("/x", signal)).toEqual({ kind: "error", status: 404, message: "HTTP 404" });
    });

    test("500 → error with status 500", async () => {
        respond(500, "");
        expect(await runFetch("/x", signal)).toEqual({ kind: "error", status: 500, message: "HTTP 500" });
    });

    test("401 surfaces the status (for a future global interceptor)", async () => {
        respond(401, "");
        expect(await runFetch("/x", signal)).toMatchObject({ kind: "error", status: 401 });
    });

    test("2xx with invalid JSON → error (status kept)", async () => {
        respond(200, "{ not json");
        expect(await runFetch("/x", signal)).toEqual({ kind: "error", status: 200, message: "Invalid JSON response" });
    });

    test("network failure → error with status null", async () => {
        rejectWith(new TypeError("Failed to fetch"));
        expect(await runFetch("/x", signal)).toEqual({ kind: "error", status: null, message: "Failed to fetch" });
    });
});

describe("runFetch — abort", () => {
    test("AbortError → aborted (not an error)", async () => {
        rejectWith(Object.assign(new Error("aborted"), { name: "AbortError" }));
        expect(await runFetch("/x", signal)).toEqual({ kind: "aborted" });
    });
});
