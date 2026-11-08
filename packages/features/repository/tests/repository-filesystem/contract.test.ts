import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";

const compiled = resolve(
    import.meta.dir,
    "../../../../runtimes/ulvia-cli/dist/bootstrap/contracts/repository/definition.json",
);
const publicCapabilities = new Set([
    "repository-info",
    "catalogue-list",
    "collection-catalogue",
    "catalogue-search",
    "namespace-get",
    "release-download",
    "asset-download",
    "publication-state",
]);

test("the official Registry release uses authenticated account operations and has no signing bindings", async () => {
    const artifact = await admitContractReleaseJson(await readFile(compiled));
    expect(artifact.release.version).toBe("1.1.0");
    expect(artifact.release.capabilities).toHaveLength(23);
    expect(artifact.bindings).toHaveLength(23);
    for (const capability of artifact.release.capabilities) {
        expect(capability.access).toBe(publicCapabilities.has(capability.id) ? "public" : "authenticated");
        expect(capability.bindings.every((binding) => binding.transport === "http")).toBe(true);
        expect(JSON.stringify(capability.input)).not.toContain('"proof"');
        expect(JSON.stringify(capability.input)).not.toContain('"publicKey"');
        expect(JSON.stringify(capability.bindings)).not.toContain("x-repository-proof");
    }
    expect(artifact.release.capabilities.some(({ id }) => id === "namespace-rotate" || id === "namespace-revoke")).toBe(
        false,
    );
});

test("Registry SDK generation retains the released digest", async () => {
    const artifact = await admitContractReleaseJson(await readFile(compiled));
    expect(artifact.digest).toBe("sha256:6c459684fb72e50e8e8093e74563c3f111d3f007639df12d5ad09379c2f834ef");
});
