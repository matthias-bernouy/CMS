import { expect, test } from "bun:test";
import { contractBinary, defineContract, defineOperation, implementContract, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";
const download = defineContract({
    contractId: "example/bytes",
    name: "Bytes",
    publisherId: "example",
    version: "1.0.0",
    operations: [
        defineOperation({
            input: z.strictObject({}),
            output: contractBinary({ maxBytes: 4 }),
            errors: {},
            access: "public",
            behavior: { effect: "query", execution: "sync", sensitive: false },
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "GET",
                    path: "/bytes",
                    response: { successStatuses: [200], contentTypes: ["application/octet-stream"], errorStatuses: {} },
                },
            ],
            id: "bytes.read",
        }),
    ],
});
async function binaryRuntime(read: () => Uint8Array | Response) {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [implementContract(download, { "bytes.read": (_dependencies: {}) => read })],
    });
    return unitProvider(build, {});
}
test("binary handlers can return bounded bytes or stream Responses", async () => {
    let read = () => new Uint8Array([1, 2, 3, 4]) as Uint8Array | Response;
    const runtime = await binaryRuntime(() => read());
    const bytes = await runtime.call("example/bytes", "bytes.read", "/bytes");
    expect(bytes.status).toBe(200);
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    read = () =>
        new Response(new Uint8Array([4, 3, 2, 1]), { headers: { "content-type": "application/octet-stream" } });
    const streamed = await runtime.call("example/bytes", "bytes.read", "/bytes");
    expect(new Uint8Array(await streamed.arrayBuffer())).toEqual(new Uint8Array([4, 3, 2, 1]));
    read = () => new Uint8Array(5);
    expect((await runtime.call("example/bytes", "bytes.read", "/bytes")).status).toBe(503);
});
test("binary stream overflow and consumer cancellation release the original source", async () => {
    let cancelled = false;
    const runtime = await binaryRuntime(
        () =>
            new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        controller.enqueue(new Uint8Array([1, 2, 3]));
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers: { "content-type": "application/octet-stream" } },
            ),
    );
    const overflowing = await runtime.call("example/bytes", "bytes.read", "/bytes");
    await expect(overflowing.arrayBuffer()).rejects.toThrow();
    await Bun.sleep(0);
    expect(cancelled).toBe(true);
    cancelled = false;
    const response = await runtime.call("example/bytes", "bytes.read", "/bytes");
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    reader.releaseLock();
    await Bun.sleep(0);
    expect(cancelled).toBe(true);
});
test("declared oversized binary responses cancel without consuming bytes", async () => {
    let cancelled = false;
    const runtime = await binaryRuntime(
        () =>
            new Response(
                new ReadableStream<Uint8Array>({
                    cancel() {
                        cancelled = true;
                    },
                }),
                {
                    headers: { "content-type": "application/octet-stream", "content-length": "5" },
                },
            ),
    );
    expect((await runtime.call("example/bytes", "bytes.read", "/bytes")).status).toBe(503);
    await Bun.sleep(0);
    expect(cancelled).toBe(true);
});
