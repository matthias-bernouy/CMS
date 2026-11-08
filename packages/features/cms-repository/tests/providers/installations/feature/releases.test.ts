import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { installationsFeature } from "@bernouy/cms-repository/features/installations";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
import { prepareContractSource } from "@bernouy/cms-repository/repository/authoring/build";
test("Installations SDK authoring preserves all 42 canonical capabilities, exact digest and document bytes", async () => {
    const compiled = await compileContract(installationsFeature);
    const old = (
        await prepareContractSource(
            resolve(import.meta.dir, "../../../../../../official-repository/contracts/cms.installations"),
        )
    ).admission;
    expect(compiled.release.capabilities).toHaveLength(42);
    expect(compiled.canonicalJson).toBe(old.canonicalJson);
    expect(compiled.digest).toBe(old.digest);
    expect(compiled.documentationAssets).toHaveLength(4);
    for (const asset of compiled.documentationAssets ?? []) {
        const expected = old.documentationAssets!.find(({ id }) => id === asset.id)!;
        expect(new Uint8Array(await asset.bytes.arrayBuffer())).toEqual(
            new Uint8Array(await expected.bytes.arrayBuffer()),
        );
    }
});
test("compiling Installations captures all defaults without constructing services or running business code", async () => {
    let projections = 0;
    const implementation = implementFeature(installationsFeature, {
        services: () => {
            projections++;
            throw new Error("Build must not project services");
        },
    });
    const compiled = await compileImplementations([implementation]);
    expect(compiled.contracts[0]!.release.capabilities).toHaveLength(42);
    expect(
        compiled.contracts[0]!.release.capabilities.filter(
            (capability) => capability.behavior.execution === "operation",
        )
            .map(({ id }) => id)
            .sort(),
    ).toEqual([
        "apply-collection-upgrade",
        "apply-contract-upgrade",
        "resume-collection-upgrade",
        "resume-contract-upgrade",
    ]);
    expect(projections).toBe(0);
});
