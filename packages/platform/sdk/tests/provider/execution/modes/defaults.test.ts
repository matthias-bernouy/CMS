import { defineFeature } from "@bernouy/ulvia-sdk";
import { expect, test } from "bun:test";
import { contractBinary, capabilitiesFor, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";

const meta = { contractId: "example/modes", publisherId: "example", version: "1.0.0", name: "Modes" };
const context = { requestId: "local", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };

test("default execute preserves streamed upload bounds and refuses oversized input before writes", async () => {
    let writes = 0;
    const defineCapability = capabilitiesFor<{}>();
    const upload = defineCapability({
        id: "upload",
        access: "admin",
        behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
        input: z.strictObject({ payload: contractBinary({ maxBytes: 4 }) }),
        output: z.int().min(0).max(4),
        errors: {},
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
        execute: async ({ context }) => {
            const bytes = await new Response(context.binaryBody.stream).arrayBuffer();
            writes++;
            return bytes.byteLength;
        },
    });
    const feature = defineFeature({ ...meta, capabilities: [upload] });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const runtime = unitProvider(build, {});
    const response = await runtime.call(meta.contractId, upload.id, "/upload", {
        method: "PUT",
        body: new Uint8Array(4),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toBe(4);
    const rejected = await runtime.call(meta.contractId, upload.id, "/upload", {
        method: "PUT",
        body: new Uint8Array(5),
    });
    expect(rejected.status).toBe(503);
    expect(writes).toBe(1);
});

test("default execute supports operation handles and streamed outputs while local JSON calls refuse unsupported modes", async () => {
    const defineCapability = capabilitiesFor<{}>();
    let starts = 0;
    const start = defineCapability({
        id: "start",
        access: "admin",
        behavior: { effect: "command", execution: "operation", sensitive: false, idempotency: "natural" },
        input: z.strictObject({}),
        output: z.boolean(),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "POST",
                path: "/start",
                response: { successStatuses: [202], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        execute: () => {
            starts++;
            return { operationId: "00000000-0000-4000-8000-000000000001" };
        },
    });
    const bytes = defineCapability({
        id: "bytes",
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: z.strictObject({}),
        output: contractBinary({ maxBytes: 4 }),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: "/bytes",
                response: { successStatuses: [200], contentTypes: ["application/octet-stream"], errorStatuses: {} },
            },
        ],
        execute: () =>
            new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "application/octet-stream" } }),
    });
    await expect(executeCapability(start, { input: {}, services: {}, context })).rejects.toThrow("synchronous JSON");
    await expect(executeCapability(bytes, { input: {}, services: {}, context })).rejects.toThrow("synchronous JSON");
    expect(starts).toBe(0);
    const feature = defineFeature({ ...meta, capabilities: [start, bytes] });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const runtime = unitProvider(build, {});
    const started = await runtime.call(meta.contractId, start.id, "/start", { method: "POST" });
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ operationId: "00000000-0000-4000-8000-000000000001" });
    const downloaded = await runtime.call(meta.contractId, bytes.id, "/bytes");
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(starts).toBe(1);
});
