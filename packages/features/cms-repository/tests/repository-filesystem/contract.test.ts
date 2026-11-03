import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { admitRepositoryContract } from "@bernouy/cms-repository/repository/contract";

const source = resolve(import.meta.dir, "../../src/repository/capabilities/contract");

test("HTTP-only Repository source snapshots have an explicit new immutable release coordinate", async () => {
    const artifact = await admitRepositoryContract();
    expect(artifact.release.version).toBe("1.1.0");
    expect(artifact.digest).toBe("sha256:e03cd7065076d2ac9f9762727af3e06a03635de5e5531b55ebf8cccecf562185");
    expect(artifact.release.capabilities).toHaveLength(17);
    expect(artifact.bindings).toHaveLength(17);
    expect(
        artifact.release.capabilities.filter((capability) =>
            capability.bindings?.some((binding) => binding.transport === "mcp"),
        ),
    ).toHaveLength(0);
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
