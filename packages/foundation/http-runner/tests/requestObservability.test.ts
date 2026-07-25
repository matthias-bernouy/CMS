import { describe, expect, spyOn, test } from "bun:test";
import {
    BunRunner,
    CMS_CORRELATION_HEADER,
    MAX_REQUEST_TIMING_ENTRIES,
    finishRequestTiming,
    isValidCorrelationId,
    measureRequestTiming,
    recordRequestTiming,
    requestCorrelationId,
    requestTimingSnapshot,
    serverTimingHeader,
} from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";

describe("request correlation", () => {
    test("accepts only canonical UUID v4 values and keeps one id per Request", () => {
        const valid = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const accepted = new Request("http://local", { headers: { [CMS_CORRELATION_HEADER]: valid } });
        const rejected = new Request("http://local", {
            headers: { [CMS_CORRELATION_HEADER]: "user@example.com" },
        });

        expect(isValidCorrelationId(valid)).toBe(true);
        expect(requestCorrelationId(accepted)).toBe(valid);
        expect(requestCorrelationId(accepted)).toBe(valid);
        expect(requestCorrelationId(rejected)).not.toBe("user@example.com");
        expect(isValidCorrelationId(requestCorrelationId(rejected))).toBe(true);
    });

    test("returns the correlation id on normal and unhandled error responses", async () => {
        const errorLog = spyOn(console, "error").mockImplementation(() => {});
        const runner = new BunRunner();
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
            expect(isValidCorrelationId(ok.headers.get(CMS_CORRELATION_HEADER) ?? "")).toBe(true);
            expect(isValidCorrelationId(failed.headers.get(CMS_CORRELATION_HEADER) ?? "")).toBe(true);
            expect(failed.status).toBe(500);
            expect(await failed.text()).not.toContain("private failure");
        } finally {
            server.stop();
            errorLog.mockRestore();
        }
    });

    test("returns and propagates the correlation id on unmatched 404 responses", async () => {
        const inbound = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const server = serveForTest(new BunRunner());

        try {
            const generated = await server.request("GET", "/missing");
            const propagated = await server.request("GET", "/also-missing", {
                headers: { [CMS_CORRELATION_HEADER]: inbound },
            });

            expect(generated.status).toBe(404);
            expect(isValidCorrelationId(generated.headers.get(CMS_CORRELATION_HEADER) ?? "")).toBe(true);
            expect(propagated.status).toBe(404);
            expect(propagated.headers.get(CMS_CORRELATION_HEADER)).toBe(inbound);
        } finally {
            server.stop();
        }
    });

    test("serializes an explicit public error code without exposing private fields", async () => {
        const errorLog = spyOn(console, "error").mockImplementation(() => {});
        const runner = new BunRunner();
        runner.get("/coded-error", () => {
            throw Object.assign(new Error("Repository unavailable"), {
                status: 503,
                publicCode: "repository_unavailable",
                privateDetail: "internal.example.test",
            });
        });
        const server = serveForTest(runner);

        try {
            const response = await server.request("GET", "/coded-error");
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({
                error: "Repository unavailable",
                code: "repository_unavailable",
            });
        } finally {
            server.stop();
            errorLog.mockRestore();
        }
    });
});

describe("request timing", () => {
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
