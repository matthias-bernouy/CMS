import { describe, expect, test } from "bun:test";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("function output projection", () => {
    test("projects the final function response against its declared output", async () => {
        const response = await executeFunction({
            ...baseFunction(),
            return: {
                body: {
                    id: "item-1",
                    internalSecret: "secret",
                    owner: { name: "Ada", email: "private@example.com" },
                    items: [{ id: "child-1", costPrice: 12 }],
                    providerData: { arbitrary: true },
                },
            },
        }, request(), { sources: new InMemorySourceRepository() });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: "item-1",
            owner: { name: "Ada" },
            items: [{ id: "child-1" }],
            providerData: { arbitrary: true },
        });
    });

    test("returns a generic error when the final response violates its contract", async () => {
        const response = await executeFunction({
            ...baseFunction(),
            return: { body: { id: 42, internalSecret: "must-not-leak" } },
        }, request(), { sources: new InMemorySourceRepository() });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });

    test("rejects a return status absent from a declared output contract", async () => {
        const response = await executeFunction({
            ...baseFunction(),
            return: { status: 201, body: { id: "item-1" } },
        }, request(), { sources: new InMemorySourceRepository() });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });

    test("keeps functions without an output contract compatible", async () => {
        const response = await executeFunction({
            ...baseFunction(),
            output: undefined,
            return: { body: { id: "item-1", adminOnly: true } },
        }, request(), { sources: new InMemorySourceRepository() });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: "item-1", adminOnly: true });
    });

    test("preserves a source correlation id without exposing source error details", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:provider",
            endpoints: [{
                urn: "urn:provider:load",
                method: "GET",
                targetUrl: "https://provider.test/load",
                output: [{ status: "200", body: { type: "object" } }],
            }],
        });
        const failures: Array<{ correlationId: string }> = [];
        const response = await executeFunction({
            id: "correlatedFailure",
            method: "GET",
            output: [{ status: "200", body: { type: "object" } }],
            steps: [{ id: "loaded", call: { source: "provider", endpoint: "load" } }],
            return: { body: "$steps.loaded" },
        }, request(), {
            sources,
            includeCallErrorDetails: true,
            deps: {
                fetchImpl: async () => Response.json({
                    error: "provider failure",
                    apiKey: "provider-secret",
                }, { status: 500 }),
                reportFailure: failure => failures.push(failure),
            },
        });

        expect(response.status).toBe(502);
        const correlationId = response.headers.get("x-correlation-id");
        expect(correlationId).toBeString();
        const payload = await response.json();
        expect(payload).toEqual({
            error: "Function execution failed",
            correlationId,
        });
        expect(failures).toEqual([expect.objectContaining({ correlationId })]);
        expect(JSON.stringify(payload)).not.toContain("provider-secret");
    });
});

function baseFunction(): CmsFunction {
    return {
        id: "safeOutput",
        method: "POST",
        output: [{
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    owner: {
                        type: "object",
                        properties: { name: { type: "string" } },
                    },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { id: { type: "string" } },
                        },
                    },
                    providerData: { type: "object" },
                },
                required: ["id"],
            },
        }],
        steps: [],
        return: { body: { id: "item-1" } },
    };
}

function request(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}
