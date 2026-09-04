import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { validateRepositoryRegistryRoot } from "../../src/registryRoot";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();

afterEach(async () => await roots.cleanup());

describe("repository registry root", () => {
    test("accepts an empty writable directory without populating it", async () => {
        const root = await roots.create();

        await expect(validateRepositoryRegistryRoot(root)).resolves.toBeUndefined();
        expect(await readdir(root)).toEqual([]);
    });

    test("rejects a symlink registry root", async () => {
        const parent = await roots.create();
        const actual = join(parent, "actual");
        const linked = join(parent, "linked");
        await mkdir(actual);
        await symlink(actual, linked);

        await expect(validateRepositoryRegistryRoot(linked)).rejects.toThrow("non-symlink directory");
    });
});
