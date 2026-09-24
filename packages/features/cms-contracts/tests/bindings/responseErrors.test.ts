import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-contracts/bindings";
import { capability, objectSchema, stringSchema } from "../support/fixtures";

describe("HTTP error response binding compilation", () => {
    test("distinguishes HEAD error codes that share one status without a body", () => {
        const compiled = compileHttpBinding(
            capability({
                behavior: { effect: "query", execution: "sync" },
                input: objectSchema({}),
                output: { type: "null" },
                errors: [
                    { code: "MISSING", retryable: false },
                    { code: "EXPIRED", retryable: false },
                ],
                binding: {
                    transport: "http",
                    method: "HEAD",
                    path: "/v1/items",
                    response: {
                        successStatuses: [200],
                        contentTypes: [],
                        errorStatuses: { MISSING: 404, EXPIRED: 404 },
                    },
                },
            }),
        );
        expect(compiled.response.errorStatuses).toEqual({ MISSING: 404, EXPIRED: 404 });
        expect(compiled.response.errorEnvelope).toEqual({
            kind: "headers",
            encoding: "json-percent",
            codeHeader: "x-ulvia-error-code",
            requestIdHeader: "x-ulvia-request-id",
        });
        expect(Object.isFrozen(compiled.response.errorEnvelope)).toBe(true);
    });

    test("requires one valid HTTP status for every declared error", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: {
                            successStatuses: [200],
                            contentTypes: ["application/json"],
                            errorStatuses: {},
                        },
                    },
                }),
            ),
        ).toThrow("must exactly match declared errors");
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: {
                            successStatuses: [200],
                            contentTypes: ["application/json"],
                            errorStatuses: { INVALID_RECIPIENT: 200 },
                        },
                    },
                }),
            ),
        ).toThrow("must be 4xx or 5xx");
    });

    test("requires null error outputs for HEAD", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    input: objectSchema({}),
                    output: { type: "null" },
                    errors: [
                        {
                            code: "NOT_FOUND",
                            retryable: false,
                            output: objectSchema({ message: stringSchema(256) }, ["message"]),
                        },
                    ],
                    binding: {
                        transport: "http",
                        method: "HEAD",
                        path: "/v1/messages",
                        response: {
                            successStatuses: [200],
                            contentTypes: [],
                            errorStatuses: { NOT_FOUND: 404 },
                        },
                    },
                }),
            ),
        ).toThrow("HEAD error responses require a null output schema");
    });
});
