import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { observeHttp } from "./http";

test("a declared null output with an empty HTTP body remains a valid fully consumed result", async () => {
    const f = await inventoryFixture();
    let status = 204;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status }) });
    try {
        const target = {
            ...f.target,
            definition: {
                ...f.target.definition,
                output: { type: "null" as const },
                bindings: f.target.definition.bindings.map((binding) =>
                    binding.transport === "http"
                        ? { ...binding, response: { ...binding.response, contentTypes: [], successStatuses: [204] } }
                        : binding,
                ),
            },
        };
        const sample = await observeHttp({
            origin: server.url.origin,
            target,
            binding: "http",
            input: {},
            credentials: {},
            assert: (output) => {
                expect(output).toBeNull();
            },
        });
        expect(sample.validated).toBe(true);
        expect(sample.completed).toBe(true);
        expect(sample.streamConsumed).toBe(true);
        expect(sample.responseBytes).toBe(0);
        status = 200;
        const unexpected = await observeHttp({
            origin: server.url.origin,
            target,
            binding: "http",
            input: {},
            credentials: {},
            assert: () => {},
        });
        expect(unexpected.validated).toBe(false);
        expect(unexpected.failure).toBe("undeclared-http-success-status");
    } finally {
        server.stop(true);
    }
});
