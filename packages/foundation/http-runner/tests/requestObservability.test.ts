import { describe, expect, test } from "bun:test";
import { createMemoryLogger } from "@bernouy/logging/testing";
import {
    BunRunner,
    PublicHttpError,
    REQUEST_ID_HEADER,
    MAX_REQUEST_TIMING_ENTRIES,
    currentRequestId,
    currentRequestHeaders,
    currentRequestLogAttributes,
    finishRequestTiming,
    isValidRequestId,
    measureCurrentRequestTiming,
    measureRequestTiming,
    recordCurrentRequestTiming,
    recordRequestTiming,
    requestId,
    requestTimingSnapshot,
    requestTimingCountSnapshot,
    runWithRequestContext,
    runWithoutRequestContext,
    serverTimingHeader,
} from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { requestCompletionLevel } from "http-runner/default-implementation/bunRequestDispatch";

describe("request context", () => {
    test("accepts only canonical UUID v4 values and keeps one id per Request", () => {
        const valid = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const accepted = new Request("http://local", { headers: { [REQUEST_ID_HEADER]: valid } });
        const rejected = new Request("http://local", {
            headers: { [REQUEST_ID_HEADER]: "user@example.com" },
        });

        expect(isValidRequestId(valid)).toBe(true);
        expect(requestId(accepted)).toBe(valid);
        expect(requestId(accepted)).toBe(valid);
        expect(requestId(rejected)).not.toBe("user@example.com");
        expect(isValidRequestId(requestId(rejected))).toBe(true);
    });

    test("returns the request id on normal and unhandled error responses", async () => {
        const memory = createMemoryLogger({
            service: "http-test",
            level: "debug",
            context: currentRequestLogAttributes,
        });
        const runner = new BunRunner({ logger: memory.logger });
        runner.group("/observed", (group) => {
            group.get("/ok", () => new Response("ok"));
            group.get("/error", () => {
                throw new Error("private failure");
            });
        });
        const server = serveForTest(runner);

        try {
            const ok = await server.request("GET", "/observed/ok");
            const failed = await server.request("GET", "/observed/error");
            expect(isValidRequestId(ok.headers.get(REQUEST_ID_HEADER) ?? "")).toBe(true);
            expect(isValidRequestId(failed.headers.get(REQUEST_ID_HEADER) ?? "")).toBe(true);
            expect(failed.status).toBe(500);
            expect(await failed.text()).not.toContain("private failure");
            const failure = memory.records.find((record) => record.event === "http.request.unhandled");
            expect(failure?.attributes?.requestId).toBe(failed.headers.get(REQUEST_ID_HEADER));
            expect(memory.records.filter((record) => record.event === "http.request.completed")).toHaveLength(2);
        } finally {
            server.stop();
        }
    });

    test("returns and propagates the request id on unmatched 404 responses", async () => {
        const inbound = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const server = serveForTest(new BunRunner());

        try {
            const generated = await server.request("GET", "/missing");
            const propagated = await server.request("GET", "/also-missing", {
                headers: { [REQUEST_ID_HEADER]: inbound },
            });

            expect(generated.status).toBe(404);
            expect(isValidRequestId(generated.headers.get(REQUEST_ID_HEADER) ?? "")).toBe(true);
            expect(propagated.status).toBe(404);
            expect(propagated.headers.get(REQUEST_ID_HEADER)).toBe(inbound);
        } finally {
            server.stop();
        }
    });

    test("isolates request ids across concurrent asynchronous handlers", async () => {
        const first = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const second = "ea7a3428-a45e-48d1-8a1c-bc61921ff0b5";
        const observed: Array<{ phase: string; requestId: string | undefined }> = [];
        let releaseFirst!: () => void;
        let releaseSecond!: () => void;
        const firstBarrier = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const secondBarrier = new Promise<void>((resolve) => {
            releaseSecond = resolve;
        });
        const runner = new BunRunner();
        runner.get("/first", async () => {
            observed.push({ phase: "first-before", requestId: currentRequestId() });
            releaseSecond();
            await firstBarrier;
            observed.push({ phase: "first-after", requestId: currentRequestId() });
            return new Response("first");
        });
        runner.get("/second", async () => {
            observed.push({ phase: "second-before", requestId: currentRequestId() });
            releaseFirst();
            await secondBarrier;
            observed.push({ phase: "second-after", requestId: currentRequestId() });
            return new Response("second");
        });
        const server = serveForTest(runner);

        try {
            await Promise.all([
                server.request("GET", "/first", { headers: { [REQUEST_ID_HEADER]: first } }),
                server.request("GET", "/second", { headers: { [REQUEST_ID_HEADER]: second } }),
            ]);
            expect(observed).toContainEqual({ phase: "first-before", requestId: first });
            expect(observed).toContainEqual({ phase: "first-after", requestId: first });
            expect(observed).toContainEqual({ phase: "second-before", requestId: second });
            expect(observed).toContainEqual({ phase: "second-after", requestId: second });
            expect(currentRequestId()).toBeUndefined();
        } finally {
            server.stop();
        }
    });

    test("projects the authoritative request id into outbound headers", async () => {
        const inbound = new Request("https://example.test", {
            headers: { [REQUEST_ID_HEADER]: "11d38c6a-0e6a-4f68-9dad-2a92c17b8300" },
        });

        await runWithRequestContext(inbound, async () => {
            const headers = currentRequestHeaders({
                [REQUEST_ID_HEADER]: "ea7a3428-a45e-48d1-8a1c-bc61921ff0b5",
                accept: "application/json",
            });
            expect(headers.get(REQUEST_ID_HEADER)).toBe("11d38c6a-0e6a-4f68-9dad-2a92c17b8300");
            expect(headers.get("accept")).toBe("application/json");
        });
    });

    test("can detach durable background work from an inbound request", async () => {
        const inbound = new Request("https://example.test", {
            headers: { [REQUEST_ID_HEADER]: "11d38c6a-0e6a-4f68-9dad-2a92c17b8300" },
        });

        await runWithRequestContext(inbound, async () => {
            expect(currentRequestId()).toBeDefined();
            expect(runWithoutRequestContext(() => currentRequestId())).toBeUndefined();
            expect(currentRequestId()).toBeDefined();
        });
    });

    test("serializes an explicit public error code without exposing private fields", async () => {
        const memory = createMemoryLogger({ service: "http-test", level: "debug" });
        const runner = new BunRunner({ logger: memory.logger });
        runner.get("/coded-error", () => {
            throw Object.assign(
                new PublicHttpError(503, "Repository unavailable", { code: "repository_unavailable" }),
                { privateDetail: "internal.example.test" },
            );
        });
        const server = serveForTest(runner);

        try {
            const response = await server.request("GET", "/coded-error");
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({
                error: "Repository unavailable",
                code: "repository_unavailable",
            });
            expect(memory.records.find((record) => record.event === "http.request.failed")?.attributes?.status).toBe(
                503,
            );
        } finally {
            server.stop();
        }
    });

    test("does not classify handled client errors as unhandled failures", async () => {
        const memory = createMemoryLogger({ service: "http-test", level: "debug" });
        const runner = new BunRunner({ logger: memory.logger });
        runner.post("/validation", () => {
            throw new PublicHttpError(400, "Invalid title", { field: "title" });
        });
        const server = serveForTest(runner);

        try {
            const response = await server.request("POST", "/validation");
            expect(response.status).toBe(400);
            expect(memory.records.some((record) => record.level === "error")).toBe(false);
            expect(memory.records.find((record) => record.event === "http.request.completed")?.attributes?.status).toBe(
                400,
            );
        } finally {
            server.stop();
        }
    });

    test("records returned server failures at error level", async () => {
        const memory = createMemoryLogger({ service: "http-test", level: "debug" });
        const runner = new BunRunner({ logger: memory.logger });
        runner.get("/unavailable", () => new Response("Unavailable", { status: 503 }));
        const server = serveForTest(runner);

        try {
            expect((await server.request("GET", "/unavailable")).status).toBe(503);
            expect(memory.records.find((record) => record.event === "http.request.completed")).toMatchObject({
                level: "error",
                attributes: { status: 503 },
            });
        } finally {
            server.stop();
        }
    });

    test("attaches internal stage timings only to the structured completion record", async () => {
        const memory = createMemoryLogger({ service: "http-test", level: "debug" });
        const runner = new BunRunner({ logger: memory.logger });
        runner.get("/timed", async (request) => {
            await measureRequestTiming(request, "cms_auth", async () => Promise.resolve());
            return new Response("ok");
        });
        const server = serveForTest(runner);

        try {
            const response = await server.request("GET", "/timed");
            const completion = memory.records.find((record) => record.event === "http.request.completed");
            expect(response.headers.has("server-timing")).toBe(false);
            expect(completion?.attributes?.timings).toEqual({ cms_auth: expect.any(Number) });
        } finally {
            server.stop();
        }
    });

    test("dispatches explicit HEAD routes inside groups", async () => {
        const runner = new BunRunner();
        runner.group("/public", (group) => {
            group.addEndpoint(
                "HEAD",
                "/resource",
                () => new Response(null, { headers: { etag: '"resource-digest"' } }),
            );
        });
        const server = serveForTest(runner);

        try {
            const response = await server.request("HEAD", "/public/resource");
            expect(response.status).toBe(200);
            expect(response.headers.get("etag")).toBe('"resource-digest"');
            expect(await response.text()).toBe("");
        } finally {
            server.stop();
        }
    });
});

describe("request timing", () => {
    test("promotes slow successful requests without escalating ordinary traffic", () => {
        expect(requestCompletionLevel(200, 99.99)).toBe("debug");
        expect(requestCompletionLevel(200, 100)).toBe("info");
        expect(requestCompletionLevel(503, 1)).toBe("error");
    });

    test("records nested service stages against the active request context", async () => {
        const request = new Request("http://local");
        let now = 10;

        await runWithRequestContext(request, async () => {
            await measureCurrentRequestTiming(
                "nested_service",
                async () => {
                    now = 14;
                },
                () => now,
            );
            expect(recordCurrentRequestTiming("nested_service", 2)).toBe(true);
        });

        expect(requestTimingSnapshot(request)).toEqual({ nested_service: 6 });
        expect(requestTimingCountSnapshot(request)).toEqual({ nested_service: 2 });
        expect(recordCurrentRequestTiming("outside_request", 1)).toBe(false);
    });

    test("accumulates stages, preserves operation errors, and snapshots defensively", async () => {
        const request = new Request("http://local");
        let now = 10;
        const clock = () => now;

        const value = await measureRequestTiming(
            request,
            "stage_one",
            async () => {
                now = 12.5;
                return "done";
            },
            clock,
        );
        await expect(
            measureRequestTiming(
                request,
                "stage_one",
                async () => {
                    now = 15;
                    throw new Error("operation failed");
                },
                clock,
            ),
        ).rejects.toThrow("operation failed");

        expect(value).toBe("done");
        expect(requestTimingSnapshot(request)).toEqual({ stage_one: 5 });
        expect(Object.isFrozen(requestTimingSnapshot(request))).toBe(true);
        expect(finishRequestTiming(request)).toEqual({ stage_one: 5 });
        expect(requestTimingCountSnapshot(request)).toEqual({ stage_one: 2 });
        expect(recordRequestTiming(request, "too_late", 1)).toBe(false);
    });

    test("bounds names and entry count without retaining unsafe metadata", () => {
        const request = new Request("http://local");
        expect(recordRequestTiming(request, "contains private@email", 4)).toBe(false);
        expect(recordRequestTiming(request, "negative", -1)).toBe(false);
        for (let index = 0; index < MAX_REQUEST_TIMING_ENTRIES; index++) {
            expect(recordRequestTiming(request, `stage_${index}`, index)).toBe(true);
        }
        expect(recordRequestTiming(request, "one_too_many", 1)).toBe(false);

        const header = serverTimingHeader(
            {
                cms_auth: 12.34,
                valid_but_private: 41,
                "secret;desc=private": 999,
            },
            new Set(["cms_auth"]),
        );
        expect(header).toBe("cms_auth;dur=12.3");
        expect(header).not.toContain("private");
    });

    test("keeps fifteen in-memory timing writes below the request overhead budget at p95", () => {
        const durations: number[] = [];
        for (let sample = 0; sample < 1_000; sample++) {
            const request = new Request("http://local");
            const startedAt = performance.now();
            for (let stage = 0; stage < 15; stage++) {
                recordRequestTiming(request, `cms_stage_${stage}`, stage);
            }
            requestTimingSnapshot(request);
            durations.push(performance.now() - startedAt);
        }
        durations.sort((left, right) => left - right);
        expect(durations[Math.floor(durations.length * 0.95)]).toBeLessThan(5);
    });
});
