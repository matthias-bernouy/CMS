import { expect, test } from "bun:test";
import { defineContract, defineOperation, implementContract, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesContract } from "../../examples/notes";
import { notesProviderDefinition } from "../../examples/provider";
import { unitProvider } from "./support/runtime";
const status = defineOperation({
    id: "test.operation",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [{ id: "mcp", transport: "mcp" }],
    input: z.strictObject({}),
    output: z.boolean(),
    errors: {},
});
const child = defineContract({
    contractId: "example/special-notes",
    name: "Specialized notes",
    publisherId: "example",
    version: "1.0.0",
    extends: notesContract,
    operations: [
        {
            ...status,
            access: "public",
            behavior: { effect: "query", execution: "sync", sensitive: false },
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "GET",
                    path: "/notes-status",
                    response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                },
            ],
            id: "notes.status",
        },
    ],
});
test("specialized contracts type and mount inherited handlers under concrete and ancestor calls", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(child, {
                "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "Inherited" }),
                "notes.status": (_dependencies: {}) => () => true,
            }),
        ],
    });
    expect(build.manifest.manifest.implementations.map((implementation) => implementation.contractId)).toEqual([
        "example/special-notes",
    ]);
    expect(build.contracts).toHaveLength(2);
    const runtime = unitProvider(build, {});
    for (const contractId of ["example/special-notes", "example/notes"]) {
        const response = await runtime.call(contractId, "notes.read", "/notes/welcome");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: "welcome", text: "Inherited" });
    }
    expect(await (await runtime.call("example/special-notes", "notes.status", "/notes-status")).json()).toBe(true);
});
test("multiple exact versions dispatch only to their matching typed handler", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const newer = defineContract({ ...notesContract, version: "1.1.0" });
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(notesContract, {
                "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "Original" }),
            }),
            implementContract(newer, {
                "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "New" }),
            }),
        ],
    });
    const runtime = unitProvider(build, {});
    for (const [version, text] of [
        ["1.0.0", "Original"],
        ["1.1.0", "New"],
    ]) {
        const response = await runtime.call("example/notes", "notes.read", "/notes/welcome", {}, version);
        expect(await response.json()).toEqual({ id: "welcome", text });
    }
    expect((await runtime.call("example/notes", "notes.read", "/notes/welcome", {}, "2.0.0")).status).toBe(404);
    await expect(
        compileProvider({
            ...base,
            implementations: [
                implementContract(child, {
                    "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "A" }),
                    "notes.status": (_dependencies: {}) => () => true,
                }),
                implementContract(
                    { ...child, version: "1.1.0" },
                    {
                        "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "B" }),
                        "notes.status": (_dependencies: {}) => () => true,
                    },
                ),
            ],
        }),
    ).rejects.toThrow("Ambiguous inherited");
});
test("every exact ancestor exposes its effective inherited capabilities through the same handler", async () => {
    const grandchild = defineContract({
        ...child,
        contractId: "example/grandchild",
        name: "Grandchild",
        extends: child,
        operations: [
            {
                ...child.operations[0],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/ready",
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                ],
                id: "notes.ready",
            },
        ],
    });
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(grandchild, {
                "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "Three levels" }),
                "notes.status": (_dependencies: {}) => () => true,
                "notes.ready": (_dependencies: {}) => () => true,
            }),
        ],
    });
    const runtime = unitProvider(build, {});
    for (const contractId of ["example/grandchild", "example/special-notes", "example/notes"]) {
        const response = await runtime.call(contractId, "notes.read", "/notes/welcome");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: "welcome", text: "Three levels" });
    }
});
