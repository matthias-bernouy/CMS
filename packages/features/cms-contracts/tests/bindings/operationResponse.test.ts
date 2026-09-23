import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-contracts/bindings";
import { capability, objectSchema } from "../support/fixtures";

describe("HTTP operation response compilation", () => {
    const binaryResult = {
        type: "binary",
        maxBytes: 10 * 1024 * 1024,
        mediaTypes: ["application/pdf"],
    };

    test("distinguishes the operation handle from the final result", () => {
        const compiled = compileHttpBinding(
            capability({
                behavior: { effect: "command", idempotency: "keyed", execution: "operation" },
                output: binaryResult,
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/exports",
                    input: { body: true },
                    response: { successStatuses: [202], contentTypes: ["application/json"] },
                },
            }),
        );

        expect(compiled.response).toEqual({
            kind: "operation-handle",
            successStatuses: [202],
            contentTypes: ["application/json"],
            errorStatuses: { INVALID_RECIPIENT: 422 },
        });
    });

    test("requires the protocol operation response", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "command", idempotency: "keyed", execution: "operation" },
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/exports",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("operation responses must declare only status 202");
    });

    test("rejects nullable binary final results without a distinct encoding", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "command", idempotency: "keyed", execution: "operation" },
                    output: { ...binaryResult, nullable: true },
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/exports",
                        input: { body: true },
                        response: { successStatuses: [202], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("binary response outputs must be non-nullable");
    });

    test("rejects binary values nested in an operation final result", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "command", idempotency: "keyed", execution: "operation" },
                    output: objectSchema({ report: binaryResult }, ["report"]),
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/exports",
                        input: { body: true },
                        response: { successStatuses: [202], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("explicit transport encoding");
    });

    test("reserves status 202 for operation execution", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [202], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("status 202 requires operation execution");
    });
});
