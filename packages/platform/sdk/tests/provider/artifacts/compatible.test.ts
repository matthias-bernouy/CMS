import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { loadCompatibleImplementation, selectImplementationBuilds } from "@bernouy/ulvia-sdk/provider";
import { artifactFixture, mounted } from "./fixture";

async function retainedFixture() {
    const fixture = await artifactFixture();
    const release = structuredClone(fixture.build.contracts[0]!.release);
    const old = await admitContractRelease({ ...release, description: "Original release documentation" });
    return { ...fixture, old, source: fixture.build.implementations[0]! };
}

test("an explicitly retained exact release executes current code and preserves live authorization", async () => {
    const f = await retainedFixture();
    const build = await loadCompatibleImplementation(f.build, f.source, f.old);
    const selected = selectImplementationBuilds([f.build, build], [build.implementations[0]!]);
    let allowed = true;
    let reads = 0;
    const call = mounted(selected, {
        allowed: async () => allowed,
        read: async () => {
            reads++;
            return "Original";
        },
    });
    expect(selected.contracts[0]!.digest).toBe(f.old.digest);
    expect(await call()).toBe("Original");
    allowed = false;
    await expect(call()).rejects.toMatchObject({ code: "DENIED", status: 403 });
    expect(reads).toBe(1);
});

test("retention rejects changed access, behavior, bounds, ownership and corrupted bytes before service calls", async () => {
    const f = await retainedFixture();
    for (const field of ["access", "behavior", "input"] as const) {
        const release = structuredClone(f.old.release);
        const capability = release.capabilities[0]!;
        const changed =
            field === "access"
                ? { ...capability, access: "public" }
                : field === "behavior"
                  ? { ...capability, behavior: { ...capability.behavior, sensitive: true } }
                  : {
                        ...capability,
                        input: {
                            ...capability.input,
                            properties: {
                                ...capability.input.properties,
                                id: { type: "string", maxLength: 256 },
                            },
                        },
                    };
        const old = await admitContractRelease({ ...release, capabilities: [changed] });
        await expect(loadCompatibleImplementation(f.build, f.source, old)).rejects.toThrow("differs from its executor");
    }
    const foreign = await admitContractRelease({
        ...f.old.release,
        contractId: "other/artifact",
        publisherId: "other",
    });
    await expect(loadCompatibleImplementation(f.build, f.source, foreign)).rejects.toThrow("identity differs");
    await expect(
        loadCompatibleImplementation(f.build, f.source, {
            ...f.old,
            canonicalJson: f.old.canonicalJson.replace("Original release", "Changed release"),
        }),
    ).rejects.toThrow("digest mismatch");
});

test("retained selection rejects duplicates, unknown claims and conflicting coordinates", async () => {
    const f = await retainedFixture();
    const old = await loadCompatibleImplementation(f.build, f.source, f.old);
    expect(() => selectImplementationBuilds([f.build, old], [f.source, old.implementations[0]!])).toThrow();
    expect(() => selectImplementationBuilds([f.build], [{ ...f.source, digest: f.old.digest }])).toThrow();
    expect(() => selectImplementationBuilds([old, old], [old.implementations[0]!])).toThrow();
});

test("retained inputs keep their smaller string ceiling while reusing the broader executor", async () => {
    const f = await retainedFixture();
    const release = structuredClone(f.old.release);
    const capability = release.capabilities[0]!;
    capability.input.properties.id = { type: "string", maxLength: 64 };
    const old = await admitContractRelease(release);
    const build = await loadCompatibleImplementation(f.build, f.source, old);
    expect(build.implementedContracts[0]!.capabilities[0]!.definition.input.properties.id).toMatchObject({
        maxLength: 64,
    });
    let calls = 0;
    const call = mounted(build, {
        allowed: async () => true,
        read: async () => {
            calls++;
            return "Accepted";
        },
    });
    expect(await call()).toBe("Accepted");
    expect(calls).toBe(1);
    const changed = structuredClone(release);
    changed.capabilities[0]!.output = { type: "string", maxLength: 64 };
    await expect(loadCompatibleImplementation(f.build, f.source, await admitContractRelease(changed))).rejects.toThrow(
        "differs from its executor",
    );
});
