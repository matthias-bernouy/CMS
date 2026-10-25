import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { admitRepositoryContract } from "@bernouy/cms-repository/repository/contract";

const source = resolve(import.meta.dir, "../../src/repository/capabilities/contract");

test("splitting Repository capability sources preserves the existing immutable release digest", async () => {
    const artifact = await admitRepositoryContract();
    expect(artifact.digest).toBe("sha256:097bce6cb52cfbf6df0b987f5e8d375cad793d29a60c9153ab0e5bd176109005");
    expect(artifact.release.capabilities).toHaveLength(14);
    expect(artifact.bindings).toHaveLength(14);
    expect(
        artifact.release.capabilities.filter((capability) =>
            capability.bindings?.some((binding) => binding.transport === "mcp"),
        ),
    ).toHaveLength(13);
});

test("static Repository assembly includes each authored fragment exactly once and no inline capabilities", async () => {
    const metadata = JSON.parse(await readFile(join(source, "definition.json"), "utf8"));
    expect(metadata).not.toHaveProperty("capabilities");
    const entries = await readdir(join(source, "capabilities"), { recursive: true, withFileTypes: true });
    const declarations = [];
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
            declarations.push(JSON.parse(await readFile(join(entry.parentPath, entry.name), "utf8")));
        }
    }
    const artifact = await admitRepositoryContract();
    expect(new Set(declarations.map((capability) => capability.id)).size).toBe(declarations.length);
    expect(declarations.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [...artifact.release.capabilities].sort((a, b) => a.id.localeCompare(b.id)),
    );
});
