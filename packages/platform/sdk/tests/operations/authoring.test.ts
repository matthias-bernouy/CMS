import { expect, test } from "bun:test";
import { defineContract, defineOperation, z } from "@bernouy/ulvia-sdk";
import type { OperationSource } from "@bernouy/ulvia-sdk";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesContract, readNote } from "../../examples/notes";
import { notesProviderDefinition } from "../../examples/provider";

test("one operation retains multiple named mocks, including different outcomes for the same input", async () => {
    const operation = defineOperation({
        ...readNote,
        mocks: [
            {
                id: "first",
                input: { id: "welcome" },
                outcome: { kind: "success", output: { id: "welcome", text: "First state" } },
            },
            {
                id: "second",
                input: { id: "welcome" },
                outcome: { kind: "success", output: { id: "welcome", text: "Second state" } },
            },
            {
                id: "missing",
                input: { id: "welcome" },
                outcome: { kind: "error", code: "NOT_FOUND", output: { message: "Missing" } },
            },
        ],
    });
    const built = await compileContract(defineContract({ ...notesContract, operations: [operation] }));
    const mocks = built.release.capabilities[0]!.mocks!;
    expect(mocks.map(({ id }) => id)).toEqual(["first", "second", "missing"]);
    expect(mocks.map(({ input }) => input)).toEqual(Array(3).fill({ id: "welcome" }));
    expect(mocks.map(({ outcome }) => outcome.kind)).toEqual(["success", "success", "error"]);
    expect(built.release.capabilities[0]!.bindings.map(({ transport }) => transport)).toEqual(["http", "mcp"]);
});

test("mock admission checks inputs, success/error payloads, declared error codes and local IDs", async () => {
    const valid = {
        id: "scenario",
        input: { id: "welcome" },
        outcome: { kind: "success" as const, output: { id: "welcome", text: "Hello" } },
    };
    const invalid: NonNullable<OperationSource["mocks"]>[] = [
        [{ ...valid, input: { id: 42 } }],
        [{ ...valid, outcome: { kind: "success", output: { text: "Missing required ID" } } }],
        [{ ...valid, outcome: { kind: "error", code: "UNKNOWN" } }],
        [{ ...valid, outcome: { kind: "error", code: "NOT_FOUND", output: { message: 42 } } }],
        [valid, valid],
    ];
    for (const mocks of invalid) {
        await expect(compileContract({ ...notesContract, operations: [{ ...readNote, mocks }] })).rejects.toThrow();
    }
});

test("duplicate operation IDs refuse before implementation factories can run", async () => {
    let factories = 0;
    const definition = notesProviderDefinition("http://127.0.0.1:5103");
    await expect(
        compileProvider({
            ...definition,
            implementations: [
                {
                    contract: { ...notesContract, operations: [readNote, readNote] },
                    handlers: {
                        "notes.read": () => {
                            factories++;
                            return () => ({ id: "one", text: "One" });
                        },
                    },
                },
            ],
        }),
    ).rejects.toThrow("duplicate operation ID");
    expect(factories).toBe(0);
    await expect(compileContract({ ...notesContract, operations: [readNote, { ...readNote }] })).rejects.toThrow(
        "duplicate operation ID",
    );
});

test("operation metadata keeps protocol validation and optional response effects/deprecation", async () => {
    const operation = defineOperation({
        id: "session.set",
        access: "public",
        behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
        input: z.strictObject({ remember: z.boolean() }),
        output: z.strictObject({ ok: z.boolean() }),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "POST",
                path: "/session",
                input: { body: true },
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        responseEffects: ["session"],
        deprecation: { retirement: true, reason: "Fixture retirement" },
    });
    const source = defineContract({
        contractId: "ulvia/cms.access",
        publisherId: "ulvia",
        name: "Access fixture",
        version: "1.0.0",
        operations: [operation],
    });
    const admission = await compileContract(source);
    expect(admission.release.capabilities[0]).toMatchObject({
        responseEffects: ["session"],
        deprecation: operation.deprecation,
    });
    await expect(compileContract({ ...source, contractId: "ulvia/other" })).rejects.toThrow("reserved");
    await expect(
        compileContract({
            ...notesContract,
            operations: [{ ...readNote, bindings: [readNote.bindings[0], readNote.bindings[0]] }],
        }),
    ).rejects.toThrow("duplicate binding");
});

test("compilation snapshots operation list membership before asynchronous admission", async () => {
    const operations: OperationSource[] = [readNote];
    const pending = compileContract({ ...notesContract, operations });
    operations[0] = { ...readNote, id: "notes.changed" };
    expect((await pending).release.capabilities.map(({ id }) => id)).toEqual(["notes.read"]);
});
