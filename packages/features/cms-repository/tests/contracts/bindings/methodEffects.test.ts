import { describe, expect, test } from "bun:test";
import { compileHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { capability, objectSchema } from "../support/fixtures";

describe("HTTP method and capability effect", () => {
    test("requires queries for GET and HEAD independently of idempotency", () => {
        for (const method of ["GET", "HEAD"]) {
            for (const idempotency of ["keyed", "natural", "none"]) {
                expect(() =>
                    compileHttpBinding(
                        capability({
                            behavior: { effect: "command", execution: "sync", idempotency },
                            input: objectSchema({}),
                            output: { type: "null" },
                            binding: {
                                transport: "http",
                                method,
                                path: "/v1/items",
                                response: {
                                    successStatuses: [200],
                                    contentTypes: method === "HEAD" ? [] : ["application/json"],
                                },
                            },
                        }),
                    ),
                ).toThrow(`${method} capabilities must be queries`);
            }
        }
    });

    test("allows POST queries", () => {
        expect(
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                }),
            ).method,
        ).toBe("POST");
    });

    test("allows an empty string path value with an unambiguous encoding", () => {
        const compiled = compileHttpBinding(
            capability({
                behavior: { effect: "query", execution: "sync" },
                input: objectSchema({ id: { type: "string", maxLength: 20 } }, ["id"]),
                binding: {
                    transport: "http",
                    method: "GET",
                    path: "/v1/items/{id}",
                    input: { path: { id: "id" } },
                    response: { successStatuses: [200], contentTypes: ["application/json"] },
                },
            }),
        );
        expect(compiled.pathParameters).toEqual([{ encoding: "uri-component", property: "id", wireName: "id" }]);
    });
});
