import { expect, test } from "bun:test";
import { contractBinary, defineContract, defineOperation, implementContract, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";
test("streaming uploads are bounded and invalid bytes leave business state unchanged", async () => {
    let writes = 0;
    const upload = defineContract({
        contractId: "example/upload",
        name: "Upload",
        publisherId: "example",
        version: "1.0.0",
        operations: [
            defineOperation({
                input: z.strictObject({ payload: contractBinary({ maxBytes: 4 }) }),
                output: z.int().min(0).max(4),
                errors: {},
                access: "admin",
                behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "PUT",
                        path: "/upload",
                        input: { body: { binaryProperty: "payload" } },
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                ],
                id: "bytes.put",
            }),
        ],
    });
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(upload, {
                "bytes.put": (_dependencies: {}) => async (_input, context) => {
                    const bytes = await new Response(context.binaryBody.stream).arrayBuffer();
                    writes++;
                    return bytes.byteLength;
                },
            }),
        ],
    });
    const runtime = unitProvider(build, {});
    const valid = await runtime.call("example/upload", "bytes.put", "/upload", {
        method: "PUT",
        body: new Uint8Array(4),
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toBe(4);
    expect(writes).toBe(1);
    const oversized = await runtime.call("example/upload", "bytes.put", "/upload", {
        method: "PUT",
        body: new Uint8Array(5),
    });
    expect(oversized.status).toBe(503);
    expect(writes).toBe(1);
    const claimed = await runtime.call("example/upload", "bytes.put", "/upload", {
        method: "PUT",
        body: new Uint8Array(5),
        headers: { "content-length": "5" },
    });
    expect(claimed.status).toBe(503);
    expect(writes).toBe(1);
});
