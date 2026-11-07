import { expect, test } from "bun:test";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { implementContract } from "@bernouy/ulvia-sdk";
import { notesProviderDefinition } from "../../examples/provider";
import { notesFeature } from "../../examples/notes";
import { SITE, INSTANCE } from "./support/network";

test("compiling a Provider derives exact claims and never initializes handlers or adapters", async () => {
    let factories = 0;
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const definition = {
        ...base,
        implementations: [
            implementContract(notesFeature, {
                "notes.read": (_dependencies: {}) => {
                    factories++;
                    return (input) => ({ id: input.id, text: "Built" });
                },
            }),
        ],
    };
    const build = await compileProvider(definition);
    expect(factories).toBe(0);
    expect(build.manifest.manifest.implementations).toEqual([
        { contractId: "example/notes", version: "1.0.0", digest: build.contracts[0]!.digest, requires: [] },
    ]);
    expect((await compileProvider(definition)).manifest.digest).toBe(build.manifest.digest);
    expect(Object.isFrozen(build)).toBe(true);
    createProvider(
        build,
        {},
        { scope: { siteId: SITE, instanceId: INSTANCE }, authenticate: async () => null, authorize: async () => true },
    );
    expect(factories).toBe(1);
});

test("missing, unexpected and invalid handlers or unresolved requirements refuse the build", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const implementation = base.implementations[0]!;
    await expect(compileProvider({ ...base, implementations: [{ ...implementation, handlers: {} }] })).rejects.toThrow(
        "Handler table",
    );
    await expect(
        compileProvider({
            ...base,
            implementations: [{ ...implementation, handlers: { ...implementation.handlers, extra: () => () => null } }],
        }),
    ).rejects.toThrow("Handler table");
    await expect(
        compileProvider({
            ...base,
            implementations: [
                {
                    ...implementation,
                    requires: [
                        {
                            contractId: "example/missing",
                            capabilityId: "missing.read",
                            versionRange: "^1.0.0",
                            optional: false,
                        },
                    ],
                },
            ],
        }),
    ).rejects.toThrow();
    await expect(compileProvider({ ...base, buildVersionRange: "not-a-range" })).rejects.toThrow();
    const build = await compileProvider({
        ...base,
        implementations: [{ ...implementation, handlers: { "notes.read": () => null } }],
    });
    expect(() =>
        createProvider(
            build,
            { notes: { read: async () => null } },
            {
                scope: { siteId: SITE, instanceId: INSTANCE },
                authenticate: async () => null,
                authorize: async () => true,
            },
        ),
    ).toThrow("factory");
});

test("runtime uses the handler plan captured by compilation, not a mutated source table", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    let initialized = false;
    const handlers = {
        "notes.read": (_dependencies: {}) => {
            initialized = true;
            return (input: { id: string }) => ({ id: input.id, text: "Original" });
        },
    };
    const definition = { ...base, implementations: [{ ...base.implementations[0]!, handlers }] };
    const pending = compileProvider(definition);
    handlers["notes.read"] = () => {
        throw new Error("Mutated");
    };
    const build = await pending;
    createProvider(
        build,
        {},
        { scope: { siteId: SITE, instanceId: INSTANCE }, authenticate: async () => null, authorize: async () => true },
    );
    expect(initialized).toBe(true);
    expect(() =>
        createProvider(
            { ...build },
            {},
            {
                scope: { siteId: SITE, instanceId: INSTANCE },
                authenticate: async () => null,
                authorize: async () => true,
            },
        ),
    ).toThrow("compileProvider");
});
