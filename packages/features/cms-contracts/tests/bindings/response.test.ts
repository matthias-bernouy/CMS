import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-contracts/bindings";
import { capability, objectSchema, stringSchema } from "../support/fixtures";

describe("HTTP response binding compilation", () => {
    test("sorts successful statuses into an immutable plan", () => {
        const compiled = compileHttpBinding(
            capability({
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/messages",
                    input: { body: true },
                    response: { successStatuses: [201, 200], contentTypes: ["application/json"] },
                },
            }),
        );

        expect(compiled.response.kind).toBe("result");
        expect(compiled.response.successStatuses).toEqual([200, 201]);
        expect(compiled.response.errorStatuses).toEqual({ INVALID_RECIPIENT: 422 });
        expect(Object.isFrozen(compiled.response.successStatuses)).toBe(true);
    });

    test("rejects non-success statuses and ambiguous JSON media types", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [400], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("must be 2xx");
        expect(() =>
            compileHttpBinding(
                capability({
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/problem+json"] },
                    },
                }),
            ),
        ).toThrow("only application/json");
    });

    test("checks binary response media types against the output schema", () => {
        const binary = {
            type: "binary",
            maxBytes: 1024,
            mediaTypes: ["application/pdf"],
        };
        expect(() =>
            compileHttpBinding(
                capability({
                    output: binary,
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["image/png"] },
                    },
                }),
            ),
        ).toThrow("declared by the output schema");
    });

    test("rejects nullable binary response outputs", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    output: {
                        type: "binary",
                        nullable: true,
                        maxBytes: 1024,
                        mediaTypes: ["application/pdf"],
                    },
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/pdf"] },
                    },
                }),
            ),
        ).toThrow("binary response outputs must be non-nullable");
    });

    test("rejects response content metadata on bodyless statuses", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    output: { type: "null" },
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { successStatuses: [204], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("cannot declare a response content type");
    });

    test("rejects binary values nested inside a JSON response", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    output: objectSchema(
                        {
                            name: stringSchema(100),
                            attachment: {
                                type: "binary",
                                maxBytes: 1024,
                                mediaTypes: ["application/pdf"],
                            },
                        },
                        ["name", "attachment"],
                    ),
                }),
            ),
        ).toThrow("explicit transport encoding");
    });

    test("treats HEAD responses as bodyless independently of their status", () => {
        const binding = {
            transport: "http",
            method: "HEAD",
            path: "/v1/messages",
            response: { successStatuses: [200], contentTypes: [] },
        };
        const compiled = compileHttpBinding(
            capability({
                behavior: { effect: "query", execution: "sync" },
                input: objectSchema({}),
                output: { type: "null" },
                binding,
            }),
        );

        expect(compiled.response).toEqual({
            kind: "result",
            successStatuses: [200],
            contentTypes: [],
            errorStatuses: { INVALID_RECIPIENT: 422 },
        });
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    input: objectSchema({}),
                    output: objectSchema({ ok: { type: "boolean" } }, ["ok"]),
                    binding,
                }),
            ),
        ).toThrow("HEAD responses require a null output schema");
    });
});
