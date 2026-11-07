import { expect, test } from "bun:test";
import { defineFeature, implementFeature } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
import { author, metadata, MissingNote, read } from "./fixture";

test("feature policies map denied guards before every durable receipt lookup, including replays", async () => {
    let denied = false;
    let writes = 0;
    let lookups = 0;
    let receipt: unknown;
    const guardFailure = new MissingNote("private-namespace-credential");
    const write = author({
        ...read,
        id: "write",
        bindings: read.bindings.map((binding) => ({ ...binding, method: "POST" as const })),
        behavior: { effect: "command", execution: "sync", idempotency: "keyed", sensitive: true },
        authorize: () => {
            if (denied) {
                throw guardFailure;
            }
        },
        execute: async () => {
            writes++;
            return "written";
        },
    });
    const feature = defineFeature({
        ...metadata,
        capabilities: [write],
        mapError: () => ({ code: "FORBIDDEN", output: { message: "Access was revoked." } }),
    });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const runtime = unitProvider(
        build,
        { notes: { read: async () => "unused" } },
        {
            executeKeyed: async (_invocation, execute) => {
                lookups++;
                return (receipt ??= await execute());
            },
        },
    );
    const first = await runtime.call(metadata.contractId, "write", "/read/one", {
        method: "POST",
        headers: { "idempotency-key": "key" },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toBe("written");
    denied = true;
    const replay = await runtime.call(metadata.contractId, "write", "/read/one", {
        method: "POST",
        headers: { "idempotency-key": "key" },
    });
    expect(replay.status).toBe(403);
    expect(await replay.text()).not.toContain(guardFailure.message);
    expect(lookups).toBe(1);
    expect(writes).toBe(1);
});
