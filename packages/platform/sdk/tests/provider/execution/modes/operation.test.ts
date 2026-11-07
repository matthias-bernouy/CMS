import { expect, test } from "bun:test";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { contractBinary, defineCapability, z } from "@bernouy/ulvia-sdk";
import { notesProviderDefinition } from "../../../../examples/provider";
import { notesFeature } from "../../../../examples/notes";
import { unitProvider } from "../../support/runtime";
test("operation handlers return a standard handle instead of the terminal result schema", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    for (const output of [z.boolean(), contractBinary({ maxBytes: 4 })]) {
        const terminal = defineCapability({
            id: "test.capability",
            access: "public",
            behavior: { effect: "query", execution: "sync", sensitive: false },
            bindings: [{ id: "mcp", transport: "mcp" }],
            input: z.strictObject({ start: z.boolean() }),
            output,
            errors: {},
        });
        const feature = {
            ...notesFeature,
            contractId: "example/operation",
            documents: {},
            capabilities: [
                {
                    ...terminal,
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
                    id: "start",
                },
            ],
        };
        const operationId = crypto.randomUUID();
        const build = await compileProvider({
            ...base,
            implementations: [{ feature, handlers: { start: (_dependencies: {}) => () => ({ operationId }) } }],
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
