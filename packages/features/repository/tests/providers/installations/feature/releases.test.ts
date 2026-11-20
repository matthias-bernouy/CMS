import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
test("Installations SDK authoring adds two compatible control capabilities, exact digest and document bytes", async () => {
    const compiled = await compileContract(installationsFeature);
    expect(compiled.release.capabilities).toHaveLength(61);
    expect(compiled.digest).toBe("sha256:daa723417b1c3758602944b29a9f7e0254910c599ada5a783a369c66513ad753");
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
    expect(compiled.contracts[0]!.release.capabilities).toHaveLength(61);
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
