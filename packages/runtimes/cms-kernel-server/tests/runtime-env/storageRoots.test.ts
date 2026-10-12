import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCmsStorageRoots } from "../../src/runtime/stores/storageRoots";

const cleanup: string[] = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CMS storage root validation", () => {
    test("accepts an existing media root", async () => {
        const root = await fixtureRoot();
        const files = join(root, "files");
        await mkdir(files);

        await expect(validateCmsStorageRoots(files)).resolves.toBeUndefined();
    });

    test("rejects missing roots before runtime composition", async () => {
        const root = await fixtureRoot();
        await expect(validateCmsStorageRoots(join(root, "missing"))).rejects.toThrow(
            /CMS_FILES_DIR must reference an existing directory/,
        );
    });
});

async function fixtureRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-storage-roots-"));
    cleanup.push(root);
    return root;
}
