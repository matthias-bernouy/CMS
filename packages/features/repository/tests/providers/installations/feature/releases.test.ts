import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
test("Installations SDK authoring includes generic contract selection, exact digest and document bytes", async () => {
    const compiled = await compileContract(installationsFeature);
    expect(compiled.release.version).toBe("1.6.0");
    expect(compiled.release.capabilities).toHaveLength(62);
    expect(compiled.digest).toBe("sha256:d6e8e6608db7737cd0b64c2d4e47b6dfa33231e345ab798d4e7a8a351b0b73b3");
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
    expect(compiled.contracts[0]!.release.capabilities).toHaveLength(62);
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
