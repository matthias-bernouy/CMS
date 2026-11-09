import { expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCollectionSources, compileCollectionSources } from "repository/exports/repository/authoring/build";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";

test("the immutable captured sources survive working directory edits and reject path escapes and links", async () => {
    const f = await sourceFixture();
    try {
        await writeFile(join(f.directory, "assets/data.txt"), "changed after release");
        const replay = await compileCollectionSources(join(f.root, "replay"), f.captured.sourceJson, f.captured.assets);
        expect(replay.admission.digest).toBe(f.admission.digest);
        expect(await replay.admission.assets[0]!.bytes.text()).toBe("immutable source bytes");
        const invalid = JSON.parse(f.sourceJson);
        invalid.files[0].path = "../outside/definition.json";
        await expect(
            compileCollectionSources(join(f.root, "replay"), JSON.stringify(invalid), f.captured.assets),
        ).rejects.toThrow();
        await symlink(join(f.directory, "definition.json"), join(f.directory, "translations/en/link.json"));
        await expect(captureCollectionSources(f.directory)).rejects.toThrow("Unsupported");
        await expect(
            compileCollectionSources(join(f.root, "replay"), f.sourceJson, [
                { id: "data.txt", bytes: new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]) },
            ]),
        ).rejects.toThrow("limit");
    } finally {
        await f.close();
    }
});

test("capture ignores root documentation before reading source bytes and retains root safety checks", async () => {
    const f = await sourceFixture();
    try {
        await writeFile(join(f.directory, "README.md"), "# Editing this collection");
        await writeFile(join(f.directory, "LICENSE"), new Uint8Array(1024 * 1024 + 1));
        const captured = await captureCollectionSources(f.directory);
        expect(
            JSON.parse(captured.sourceJson).files.some(
                ({ path }: { path: string }) => path === "README.md" || path === "LICENSE",
            ),
        ).toBe(false);
        const built = await compileCollectionSources(
            join(f.root, "documented-build"),
            captured.sourceJson,
            captured.assets,
        );
        expect(built.admission.digest).toBe(f.admission.digest);
        await rm(join(f.directory, "README.md"));
        await symlink(join(f.directory, "definition.json"), join(f.directory, "README.md"));
        await expect(captureCollectionSources(f.directory)).rejects.toThrow("Unsupported");
        await rm(join(f.directory, "README.md"));
        await mkdir(join(f.directory, "unsupported"));
        await expect(captureCollectionSources(f.directory)).rejects.toThrow("Unknown collection source directory");
    } finally {
        await f.close();
    }
});
