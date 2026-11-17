import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { operationCompletion } from "./operation";
import { observe } from "./observe";
import type { ClientCall } from "./types";

const id = "10000000-0000-4000-8000-000000000001";
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

test("operations measure through durable terminal success and charge every fully consumed status poll", async () => {
    const f = await inventoryFixture();
    let polls = 0;
    let asserted = false;
    const complete = operationCompletion(
        async () => {
            polls++;
            return {
                observation: { ...f.measurement, traceId: `poll-${polls}`, requestBytes: 2 },
                output: {
                    operationId: id,
                    status: polls < 3 ? "running" : "succeeded",
                    ...(polls === 3 ? { result: { ok: true } } : {}),
                },
            };
        },
        "performance/child",
        "get-operation",
        (operationId) => ({ operationId }),
    );
    const call: ClientCall = {
        origin: "http://localhost",
        target: {
            ...f.target,
            definition: {
                ...f.target.definition,
                behavior: { ...f.target.definition.behavior, execution: "operation" },
            },
        },
        binding: "http",
        input: {},
        credentials: {},
        complete,
        assert: (result) => {
            expect(result).toEqual({ ok: true });
            asserted = true;
        },
    };
    const response = await observe(
        call,
        "root",
        12,
        async () => Response.json({ operationId: id }, { status: 202 }),
        decode,
    );
    expect(Boolean(response.completed && response.validated && asserted)).toBe(true);
    expect(response.operation?.polls).toBe(3);
    expect(response.relatedTraces).toEqual(["poll-1", "poll-2", "poll-3"]);
    expect(response.durationMs).toBeGreaterThanOrEqual(390);
    expect(response.requestBytes).toBe(18);
    expect(response.responseBytes).toBe(Buffer.byteLength(JSON.stringify({ operationId: id })) + 33);
});

test("wrong handles, failed/incomplete/mismatched operations and unobserved completion cannot receive credit", async () => {
    const f = await inventoryFixture();
    const operation = {
        ...f.target,
        definition: {
            ...f.target.definition,
            behavior: { ...f.target.definition.behavior, execution: "operation" as const },
        },
    };
    const state = { operationId: id, status: "succeeded", result: { ok: true } };
    for (const output of [
        { ...state, status: "failed" },
        { ...state, operationId: "another" },
        { ...state, status: "unknown" },
        { operationId: id, status: "succeeded" },
        { ...state, result: { missing: "ok" } },
    ]) {
        const complete = operationCompletion(
            async () => ({ observation: { ...f.measurement, traceId: "poll" }, output }),
            "performance/child",
            "get-operation",
            (operationId) => ({ operationId }),
        );
        const result = await observe(
            {
                origin: "http://localhost",
                target: operation,
                binding: "http",
                input: {},
                credentials: {},
                assert: () => {},
                complete,
            },
            "root",
            0,
            async () => Response.json({ operationId: id }, { status: 202 }),
            decode,
        );
        expect(result.completed || result.validated).toBe(false);
        expect(result.failure).toBeDefined();
        expect(result.operation?.polls).toBe(1);
    }
    for (const complete of [async () => ({ ok: true }), async () => new Promise<never>(() => {})]) {
        const result = await observe(
            {
                origin: "http://localhost",
                target: operation,
                binding: "http",
                input: {},
                credentials: {},
                assert: () => {},
                complete,
                timeoutMs: 30,
            },
            "root",
            0,
            async () => Response.json({ operationId: id }, { status: 202 }),
            decode,
        );
        expect(result.validated || result.completed).toBe(false);
        expect(["operation-poll-evidence-incomplete", "timeout"]).toContain(result.failure!);
    }
    const invalid = await observe(
        {
            origin: "http://localhost",
            target: operation,
            binding: "http",
            input: {},
            credentials: {},
            assert: () => {},
            complete: async () => ({ ok: true }),
        },
        "root",
        0,
        async () => Response.json({ operationId: "private-invalid-handle" }, { status: 202 }),
        decode,
    );
    expect(invalid.failure).toBe("operation-handle-invalid");
    expect(JSON.stringify(invalid)).not.toContain("private-invalid-handle");
});
