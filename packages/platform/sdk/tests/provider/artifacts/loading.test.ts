import { expect, test } from "bun:test";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { loadImplementations } from "@bernouy/ulvia-sdk/provider";
import { artifactFixture, mounted } from "./fixture";

test("runtime loading verifies metadata without touching authored docs, fixtures or Zod input schemas", async () => {
    const f = await artifactFixture();
    const source = {
        ...f.feature,
        get documents(): never {
            throw new Error("No documentation IO at runtime");
        },
        get fixtures(): never {
            throw new Error("No fixture hydration at runtime");
        },
        capabilities: [
            {
                ...f.capability,
                get input(): never {
                    throw new Error("No Zod conversion at runtime");
                },
            },
        ],
    };
    let projections = 0;
    const implementation = implementFeature(source, {
        services: (services: { allowed(id: string): Promise<boolean>; read(id: string): Promise<string> }) => {
            projections++;
            return services;
        },
    });
    const loaded = await loadImplementations([implementation], f.artifact);
    expect(projections).toBe(0);
    expect(loaded.implementations).toEqual(f.build.implementations);
    expect(loaded.contracts[0]!.canonicalJson).toBe(f.build.contracts[0]!.canonicalJson);
    expect(loaded.contracts[0]!.release.documentation).toEqual(f.build.contracts[0]!.release.documentation);
    expect(loaded.contracts[0]!.documentationAssets).toBeUndefined();
    expect(await mounted(loaded, { allowed: async () => true, read: async (id) => `read:${id}` })()).toBe("read:one");
    expect(projections).toBe(1);
    expect(Object.keys(JSON.parse(f.artifact.contracts[0].canonicalJson).capabilities[0])).not.toContain("authorize");
});

test("runtime attachment captures factories and authorization before asynchronous metadata verification", async () => {
    const f = await artifactFixture();
    const implementation = { ...f.implementation, handlers: { ...f.implementation.handlers } };
    const pending = loadImplementations([implementation], f.artifact);
    implementation.handlers.read = () => () => "Changed";
    const loaded = await pending;
    expect(await mounted(loaded, { allowed: async () => true, read: async () => "Original" })()).toBe("Original");
});

test("guards run before every durable lookup and denied replays cannot read cached outcomes", async () => {
    const f = await artifactFixture(true);
    const loaded = await loadImplementations([f.implementation], f.artifact);
    let allowed = true;
    let guards = 0;
    let reads = 0;
    let lookups = 0;
    let cached: unknown;
    const call = mounted(
        loaded,
        {
            allowed: async () => {
                guards++;
                return allowed;
            },
            read: async () => {
                reads++;
                return "One";
            },
        },
        {
            executeKeyed: async (_invocation, execute) => {
                lookups++;
                return (cached ??= await execute());
            },
        },
    );
    expect(await call()).toBe("One");
    expect(await call()).toBe("One");
    allowed = false;
    await expect(call()).rejects.toMatchObject({ code: "DENIED", status: 403 });
    expect({ guards, reads, lookups }).toEqual({ guards: 3, reads: 1, lookups: 2 });
});
