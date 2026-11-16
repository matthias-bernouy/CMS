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
    "bootstrap-recipes",
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
    expect(artifact.release.version).toBe("1.3.0");
    expect(artifact.release.capabilities).toHaveLength(27);
    expect(artifact.bindings).toHaveLength(27);
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

test("Registry SDK generation pins the reviewed indexed-discovery release digest", async () => {
    const artifact = await admitContractReleaseJson(await readFile(compiled));
    expect(artifact.digest).toBe("sha256:216131fbd6fa34c015c8dbdb1e1954d6217ba7b85e44d6f51d137d5b21979409");
});
