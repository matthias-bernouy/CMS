import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
test("Installations SDK authoring preserves all 50 canonical capabilities, exact digest and document bytes", async () => {
    const compiled = await compileContract(installationsFeature);
    expect(compiled.release.capabilities).toHaveLength(50);
    expect(compiled.digest).toBe("sha256:109492b625294814e4a6780048f968e4ec6623bd245f8c8c30f8860043b0bf3e");
    expect(compiled.documentationAssets).toHaveLength(6);
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
    expect(compiled.contracts[0]!.release.capabilities).toHaveLength(50);
    expect(
        compiled.contracts[0]!.release.capabilities.filter(
            (capability) => capability.behavior.execution === "operation",
        )
            .map(({ id }) => id)
            .sort(),
    ).toEqual([
        "apply-collection-upgrade",
        "apply-contract-upgrade",
        "initialization.apply",
        "resume-collection-upgrade",
        "resume-contract-upgrade",
    ]);
    expect(projections).toBe(0);
});
