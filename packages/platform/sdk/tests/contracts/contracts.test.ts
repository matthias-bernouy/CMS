import { expect, test } from "bun:test";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { compileContract, compileContracts } from "@bernouy/ulvia-sdk/build";
import { defineContract, defineOperation, z } from "@bernouy/ulvia-sdk";
import type { ContractDefinition } from "@bernouy/ulvia-sdk";
import { notesContract, readNote, createReadNoteHandler } from "../../examples/notes";

const marker = defineOperation({ input: z.strictObject({}), output: z.boolean(), errors: {} });
function derived(id: string, parent: ContractDefinition, capabilityId = "notes.available") {
    return defineContract({
        contractId: id,
        name: "Specialized notes",
        publisherId: "example",
        version: "1.0.0",
        extends: parent,
        capabilities: {
            [capabilityId]: {
                operation: marker,
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                bindings: [{ id: "mcp", transport: "mcp" }],
            },
        },
    });
}

test("the fictitious feature compiles to a normal admitted HTTP/MCP contract with verified docs and mocks", async () => {
    const compiled = await compileContract(notesContract);
    expect(compiled.release).toMatchObject({
        contractId: "example/notes",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        version: "1.0.0",
    });
    const capability = compiled.release.capabilities[0]!;
    expect(capability.id).toBe("notes.read");
    expect(capability.bindings.map((binding) => binding.transport)).toEqual(["http", "mcp"]);
    expect(capability.mocks).toHaveLength(2);
    expect(capability.errors[0]!.code).toBe("NOT_FOUND");
    expect(compiled.documentationAssets).toHaveLength(1);
    const again = await admitContractBundleJson(compiled.canonicalJson, compiled.documentationAssets!);
    expect(again.digest).toBe(compiled.digest);
    expect(await compiled.documentationAssets![0]!.bytes.text()).toBe(notesContract.documents!["overview.md"]!);
    expect(Object.isFrozen(compiled.release)).toBe(true);
    const read = createReadNoteHandler({ read: async (id) => ({ id, text: "Hello" }) });
    expect(await read({ id: "welcome" }, undefined)).toEqual({ id: "welcome", text: "Hello" });
});

test("parent references and digests are generated from exact compiled parent sources", async () => {
    const child = derived("example/special-notes", notesContract);
    const releases = await compileContracts([child, notesContract]);
    expect(releases).toHaveLength(2);
    expect(releases[0]!.release.contractId).toBe("example/notes");
    expect(releases[1]!.release.extends).toEqual({
        contractId: "example/notes",
        version: "1.0.0",
        digest: releases[0]!.digest,
    });
    expect(releases[1]!.release.capabilities).toHaveLength(1);
    expect((await compileContract(child)).digest).toBe(releases[1]!.digest);
});

test("inheritance cycles, redeclared inherited capabilities and conflicting coordinates are refused", async () => {
    await expect(compileContract(derived("example/special-notes", notesContract, "notes.read"))).rejects.toThrow(
        "redeclare",
    );
    const cyclic: { extends?: ContractDefinition } & ContractDefinition = { ...notesContract };
    cyclic.extends = cyclic;
    await expect(compileContract(cyclic)).rejects.toThrow("Cyclic");
    await expect(compileContracts([notesContract, { ...notesContract, name: "Different" }])).rejects.toThrow(
        "Conflicting",
    );
    expect(await compileContracts([notesContract, { ...notesContract }])).toHaveLength(1);
});

test("documentation references, broken links and malformed mocks are checked by ordinary admission", async () => {
    await expect(compileContract({ ...notesContract, documents: {} })).rejects.toThrow("documentation");
    await expect(
        compileContract({ ...notesContract, documents: { "overview.md": "# Notes\n\n[Missing](missing.md)" } }),
    ).rejects.toThrow();
    await expect(compileContract({ ...notesContract, documents: { "../outside.md": "# Outside" } })).rejects.toThrow();
    await expect(compileContract({ ...notesContract, documents: { "overview.md": "No heading" } })).rejects.toThrow();
    const exposure = notesContract.capabilities["notes.read"];
    const invalid = {
        ...notesContract,
        capabilities: {
            "notes.read": {
                ...exposure,
                operation: {
                    ...readNote,
                    mocks: [
                        {
                            id: "invalid",
                            input: { id: "welcome" },
                            outcome: { kind: "success" as const, output: { text: "Missing id" } },
                        },
                    ],
                },
            },
        },
    };
    await expect(compileContract(invalid)).rejects.toThrow();
});

test("compilation is deterministic and snapshots source values before asynchronous hashing", async () => {
    const input = structuredClone(readNote.mocks![0]!.input);
    const mocks = [
        { id: "captured", input, outcome: { kind: "success" as const, output: { id: "welcome", text: "Original" } } },
    ];
    const documents = { ...notesContract.documents };
    const source = {
        ...notesContract,
        documents,
        capabilities: {
            "notes.read": {
                ...notesContract.capabilities["notes.read"],
                operation: { ...readNote, mocks },
            },
        },
    };
    const before = await compileContract(source);
    const pending = compileContract(source);
    input.id = "changed";
    mocks[0]!.outcome.output.text = "Changed";
    documents["overview.md"] = "# Changed";
    expect((await pending).digest).toBe(before.digest);
    expect((await compileContract(source)).digest).not.toBe(before.digest);
    expect((await compileContract(notesContract)).digest).toBe((await compileContract(notesContract)).digest);
});
