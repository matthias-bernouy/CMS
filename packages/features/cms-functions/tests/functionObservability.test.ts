import { describe, expect, test } from "bun:test";
import {
    executeFunction,
    type CmsFunction,
    type FunctionExecutionFailure,
} from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("function failure observability", () => {
    test("correlates a failed call with its safe execution context", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:payments",
            endpoints: [{
                urn: "urn:payments:createPayment",
                method: "POST",
                targetUrl: "https://payments.test/create",
                output: [
                    { status: "200", body: { type: "object" } },
                    {
                        status: "503",
                        body: {
                            type: "object",
                            properties: { error: { type: "string" } },
                        },
                    },
                ],
            }],
        });
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction(callFunction(), request(), {
            sources,
            includeCallErrorDetails: true,
            reportFailure: failure => failures.push(failure),
            deps: {
                fetchImpl: async () => Response.json({
                    error: "provider failed",
                    secret: "must-not-be-observable",
                }, { status: 503 }),
            },
        });

        expect(response.status).toBe(502);
        const correlationId = response.headers.get("x-correlation-id");
        expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(failures).toEqual([{
            kind: "function_execution_failure",
            correlationId,
            functionId: "createPaymentForOrder",
            status: 502,
            stepId: "createPayment",
            source: "payments",
            endpoint: "createPayment",
            callStatus: 503,
        }]);
        expect(JSON.stringify(failures)).not.toContain("provider failed");
        expect(JSON.stringify(failures)).not.toContain("must-not-be-observable");
    });

    test("correlates an unexpected repository failure without swallowing it", async () => {
        const sources = new InMemorySourceRepository();
        sources.getEndpoint = async () => {
            throw new Error("repository secret must stay server-side");
        };
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction(callFunction(), request(), {
            sources,
            reportFailure: failure => failures.push(failure),
        });

        expect(response.status).toBe(500);
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(failures).toEqual([{
            kind: "function_execution_failure",
            correlationId,
            functionId: "createPaymentForOrder",
            status: 500,
            stepId: "createPayment",
            source: "payments",
            endpoint: "createPayment",
        }]);
        expect(JSON.stringify(failures)).not.toContain("repository secret");
    });

    test("correlates a server assertion without inventing call context", async () => {
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction({
            id: "serverGuard",
            method: "POST",
            steps: [{
                assert: {
                    condition: { equals: [true, false] },
                    failure: { status: 503, error: "internal provider detail" },
                },
            }],
            return: { body: { ok: true } },
        }, request(), {
            sources: new InMemorySourceRepository(),
            reportFailure: failure => failures.push(failure),
        });

        expect(response.status).toBe(503);
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(failures).toEqual([{
            kind: "function_execution_failure",
            correlationId,
            functionId: "serverGuard",
            status: 503,
        }]);
    });

    test("correlates an explicit server-error return", async () => {
        const failures: FunctionExecutionFailure[] = [];
        const response = await executeFunction({
            id: "temporarilyUnavailable",
            method: "POST",
            steps: [],
            return: {
                status: 503,
                body: { error: "private availability reason" },
            },
        }, request(), {
            sources: new InMemorySourceRepository(),
            reportFailure: failure => failures.push(failure),
        });

        expect(response.status).toBe(503);
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(failures).toEqual([{
            kind: "function_execution_failure",
            correlationId,
            functionId: "temporarilyUnavailable",
            status: 503,
        }]);
        expect(JSON.stringify(failures)).not.toContain("private availability reason");
    });

    test("does not let a failing reporter change the safe response", async () => {
        const response = await executeFunction({
            id: "invalidOutput",
            method: "POST",
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: { id: { type: "string" } },
                    required: ["id"],
                },
            }],
            steps: [],
            return: { body: { id: 42 } },
        }, request(), {
            sources: new InMemorySourceRepository(),
            reportFailure: () => {
                throw new Error("logging unavailable");
            },
        });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });
});

function callFunction(): CmsFunction {
    return {
        id: "createPaymentForOrder",
        method: "POST",
        steps: [{
            id: "createPayment",
            call: { source: "payments", endpoint: "createPayment" },
        }],
        return: { body: "$steps.createPayment" },
    };
}

function request(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}
