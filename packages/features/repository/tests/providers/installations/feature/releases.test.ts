import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
test("Installations SDK authoring preserves all 53 canonical capabilities, exact digest and document bytes", async () => {
    const compiled = await compileContract(installationsFeature);
    expect(compiled.release.capabilities).toHaveLength(53);
    expect(compiled.digest).toBe("sha256:b03756c83c522da525803d72eadee171cbb4153b9f6d5881efbf23798f6ea745");
    expect(compiled.documentationAssets).toHaveLength(7);
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
    expect(compiled.contracts[0]!.release.capabilities).toHaveLength(53);
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
