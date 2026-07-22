import { describe, expect, test } from "bun:test";
import { executeFunction, type FunctionExecutionFailure } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("function server failure observability", () => {
    test("correlates a server assertion without inventing call context", async () => {
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction(
            {
                id: "serverGuard",
                method: "POST",
                steps: [
                    {
                        assert: {
                            condition: { equals: [true, false] },
                            failure: { status: 503, error: "internal provider detail" },
                        },
                    },
                ],
                return: { body: { ok: true } },
            },
            functionRequest(),
            {
                sources: new InMemorySourceRepository(),
                reportFailure: (failure) => failures.push(failure),
            },
        );
        expect(response.status).toBe(503);
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({ error: "Function execution failed", correlationId });
        expect(failures).toEqual([
            {
                kind: "function_execution_failure",
                correlationId,
                functionId: "serverGuard",
                status: 503,
            },
        ]);
    });

    test("correlates an explicit server-error return", async () => {
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction(
            {
                id: "temporarilyUnavailable",
                method: "POST",
                steps: [],
                return: { status: 503, body: { error: "private availability reason" } },
            },
            functionRequest(),
            {
                sources: new InMemorySourceRepository(),
                reportFailure: (failure) => failures.push(failure),
            },
        );
        expect(response.status).toBe(503);
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({ error: "Function execution failed", correlationId });
        expect(failures).toEqual([
            {
                kind: "function_execution_failure",
                correlationId,
                functionId: "temporarilyUnavailable",
                status: 503,
            },
        ]);
        expect(JSON.stringify(failures)).not.toContain("private availability reason");
    });

    test("does not let a failing reporter change the safe response", async () => {
        const response = await executeFunction(
            {
                id: "invalidOutput",
                method: "POST",
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: { id: { type: "string" } },
                            required: ["id"],
                        },
                    },
                ],
                steps: [],
                return: { body: { id: 42 } },
            },
            functionRequest(),
            {
                sources: new InMemorySourceRepository(),
                reportFailure: () => {
                    throw new Error("logging unavailable");
                },
            },
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });
});

function functionRequest(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}
