import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";

const source = resolve(import.meta.dir, "../../../../official-repository/contracts/repository");
const compiled = resolve(
    import.meta.dir,
    "../../../../runtimes/ulvia-cli/dist/bootstrap/contracts/repository/definition.json",
);
const publicCapabilities = new Set([
    "repository-info",
    "catalogue-list",
    "catalogue-search",
    "namespace-get",
    "release-download",
    "asset-download",
    "publication-state",
]);

test("the official Registry release uses authenticated account operations and has no signing bindings", async () => {
    const artifact = await admitContractReleaseJson(await readFile(compiled));
    expect(artifact.release.version).toBe("1.0.0");
    expect(artifact.release.capabilities).toHaveLength(22);
    expect(artifact.bindings).toHaveLength(22);
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

test("Registry fragments live in the official repository and compile exactly once", async () => {
    const metadata = JSON.parse(await readFile(join(source, "definition.json"), "utf8"));
    expect(metadata).not.toHaveProperty("capabilities");
    const entries = await readdir(join(source, "capabilities"), { recursive: true, withFileTypes: true });
    const declarations = [];
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
            declarations.push(JSON.parse(await readFile(join(entry.parentPath, entry.name), "utf8")));
        }
    }
    const artifact = await admitContractReleaseJson(await readFile(compiled));
    expect(new Set(declarations.map((capability) => capability.id)).size).toBe(declarations.length);
    expect(declarations.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [...artifact.release.capabilities].sort((a, b) => a.id.localeCompare(b.id)),
    );
});
