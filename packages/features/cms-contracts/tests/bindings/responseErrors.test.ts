import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-contracts/bindings";
import { capability, objectSchema, stringSchema } from "../support/fixtures";

describe("HTTP error response binding compilation", () => {
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
