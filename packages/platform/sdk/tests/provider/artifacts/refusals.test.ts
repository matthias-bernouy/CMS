import { expect, test } from "bun:test";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { loadImplementations } from "@bernouy/ulvia-sdk/provider";
import { artifactFixture } from "./fixture";

test("missing fields, wrong formats, duplicate releases and corrupt metadata fail before service construction", async () => {
    const f = await artifactFixture();
    let projections = 0;
    const source = implementFeature(f.feature, {
        services: (services: {}) => {
            projections++;
            return { allowed: async () => true, read: async () => "one" };
        },
    });
    const row = f.artifact.contracts[0];
    for (const artifact of [
        {},
        { ...f.artifact, kind: "ulvia-sdk-runtime/v2" },
        { ...f.artifact, extra: true },
        { ...f.artifact, contracts: [row, row] },
        { ...f.artifact, contracts: [{ ...row, digest: `sha256:${"0".repeat(64)}` }] },
        { ...f.artifact, contracts: [{ ...row, canonicalJson: row.canonicalJson + " " }] },
        { ...f.artifact, implementations: [...f.artifact.implementations, ...f.artifact.implementations] },
    ]) {
        await expect(loadImplementations([source], artifact)).rejects.toThrow();
    }
    expect(projections).toBe(0);
});

test("runtime code must match exact versions, complete capability coverage, behavior and requirement claims", async () => {
    const f = await artifactFixture();
    for (const implementation of [
        implementFeature({ ...f.feature, version: "1.1.0" }),
        implementFeature({ ...f.feature, capabilities: [] }),
        implementFeature({ ...f.feature, capabilities: [{ ...f.capability, access: "public" }] }),
        implementFeature(f.feature, {
            requires: [{ contractId: "example/other", capabilityId: "read", versionRange: "^1.0.0", optional: false }],
        }),
    ]) {
        await expect(loadImplementations([implementation], f.artifact)).rejects.toThrow();
    }
});

test("runtime artifact count, individual size and total metadata budgets are enforced before admission", async () => {
    const f = await artifactFixture();
    const row = f.artifact.contracts[0];
    for (const contracts of [
        Array.from({ length: 513 }, () => row),
        [{ ...row, canonicalJson: "x".repeat(1024 * 1024 + 1) }],
        Array.from({ length: 65 }, () => ({ ...row, canonicalJson: "x".repeat(1024 * 1024) })),
    ]) {
        await expect(loadImplementations([f.implementation], { ...f.artifact, contracts })).rejects.toThrow();
    }
});
