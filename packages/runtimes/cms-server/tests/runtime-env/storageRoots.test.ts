import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCmsStorageRoots } from "../../src/runtime/stores/storageRoots";

const cleanup: string[] = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CMS storage root validation", () => {
    test("accepts distinct sibling media and package-cache roots", async () => {
        const root = await fixtureRoot();
        const files = join(root, "files");
        const packages = join(root, "integration-packages");
        await Promise.all([mkdir(files), mkdir(packages)]);

        await expect(validateCmsStorageRoots(files, packages)).resolves.toBeUndefined();
    });

    test("rejects exact and symlink aliases by filesystem identity", async () => {
        const root = await fixtureRoot();
        const files = join(root, "files");
        const alias = join(root, "files-alias");
        await mkdir(files);
        await symlink(files, alias, "dir");

        await expect(validateCmsStorageRoots(files, files)).rejects.toThrow(/distinct directories/);
        await expect(validateCmsStorageRoots(files, alias)).rejects.toThrow(/distinct directories/);
    });

    test("rejects either root nested inside the other after realpath", async () => {
        const root = await fixtureRoot();
        const files = join(root, "files");
        const nested = join(files, "integration-packages");
        await mkdir(nested, { recursive: true });

        await expect(validateCmsStorageRoots(files, nested)).rejects.toThrow(/must not be inside CMS_FILES_DIR/);
        await expect(validateCmsStorageRoots(nested, files)).rejects.toThrow(/must not be inside/);
    });

    test("rejects missing roots before runtime composition", async () => {
        const root = await fixtureRoot();
        const files = join(root, "files");
        await mkdir(files);

        await expect(validateCmsStorageRoots(files, join(root, "missing"))).rejects.toThrow(
            /CMS_INTEGRATION_PACKAGE_CACHE_DIR must reference an existing directory/,
        );
    });
});

async function fixtureRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-storage-roots-"));
    cleanup.push(root);
    return root;
}
