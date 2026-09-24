import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-contracts";
import { compileContractBindings, compileHttpBinding } from "@bernouy/cms-contracts/bindings";
import { capability, capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("HTTP route binding compilation", () => {
    test("requires path mappings to match placeholders exactly", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    input: objectSchema({ id: stringSchema(64) }, ["id"]),
                    binding: {
                        transport: "http",
                        method: "GET",
                        path: "/v1/messages/{messageId}",
                        input: { path: { wrong: "id" } },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("exactly match placeholders");
    });

    test("requires path inputs to be required non-nullable scalars", () => {
        expect(() =>
            compileHttpBinding(
                capability({
                    behavior: { effect: "query", execution: "sync" },
                    input: objectSchema({ id: { type: "string", maxLength: 64, nullable: true } }),
                    binding: {
                        transport: "http",
                        method: "GET",
                        path: "/v1/messages/{id}",
                        input: { path: { id: "id" } },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                }),
            ),
        ).toThrow("required and non-nullable");
    });

    test("rejects static and parameterized routes that can match the same request", () => {
        const first = capabilityDocument({
            id: "email.message.get",
            behavior: { effect: "query", execution: "sync" },
            input: objectSchema({ id: stringSchema(64) }, ["id"]),
            binding: {
                transport: "http",
                method: "GET",
                path: "/v1/messages/{id}",
                input: { path: { id: "id" } },
                response: { successStatuses: [200], contentTypes: ["application/json"] },
            },
        });
        const second = capabilityDocument({
            id: "email.message.current",
            behavior: { effect: "query", execution: "sync" },
            input: objectSchema({}),
            binding: {
                transport: "http",
                method: "GET",
                path: "/v1/messages/current",
                response: { successStatuses: [200], contentTypes: ["application/json"] },
            },
        });
        const release = parseContractRelease(contractDocument({ capabilities: [first, second] }));

        expect(() => compileContractBindings(release)).toThrow("overlapping HTTP routes");
    });
});
