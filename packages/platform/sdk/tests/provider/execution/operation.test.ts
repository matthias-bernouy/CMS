import { expect, test } from "bun:test";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { contractBinary, defineOperation, z } from "@bernouy/ulvia-sdk";
import { notesProviderDefinition } from "../../../examples/provider";
import { notesContract } from "../../../examples/notes";
import { unitProvider } from "../support/runtime";

test("operation handlers return a standard handle instead of the terminal result schema", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    for (const output of [z.boolean(), contractBinary({ maxBytes: 4 })]) {
        const terminal = defineOperation({
            input: z.strictObject({ start: z.boolean() }),
            output,
            errors: {},
        });
        const contract = {
            ...notesContract,
            contractId: "example/operation",
            documents: {},
            capabilities: {
                start: {
                    operation: terminal,
                    access: "admin" as const,
                    behavior: {
                        effect: "command" as const,
                        execution: "operation" as const,
                        sensitive: false,
                        idempotency: "natural" as const,
                    },
                    bindings: [
                        {
                            id: "http",
                            transport: "http" as const,
                            method: "POST" as const,
                            path: "/start",
                            input: { body: true as const },
                            response: { successStatuses: [202], contentTypes: ["application/json"], errorStatuses: {} },
                        },
                    ],
                },
            },
        };
        const operationId = crypto.randomUUID();
        const build = await compileProvider({
            ...base,
            implementations: [{ contract, handlers: { start: (_dependencies: {}) => () => ({ operationId }) } }],
        });
        const runtime = unitProvider(build, {});
        const response = await runtime.call("example/operation", "start", "/start", {
            method: "POST",
            body: '{"start":true}',
            headers: { "content-type": "application/json" },
        });
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ operationId });
    }
});
