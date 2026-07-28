import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    bootstrapRepositoryRegistryIfEmpty,
    REPOSITORY_BOOTSTRAP_MARKER,
    RepositoryRegistryBootstrapIncompleteError,
} from "../../src/registryRoot";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();
const PLAN = "a".repeat(64);
const canonicalMarker = `{"planDigest":"${PLAN}","schema":"cms.integration.repository.bootstrap.v2","state":"commit-pending"}`;

afterEach(async () => await roots.cleanup());

describe("repository bootstrap marker", () => {
    test.each([
        [
            "non-canonical key order",
            `{"schema":"cms.integration.repository.bootstrap.v2","planDigest":"${PLAN}","state":"commit-pending"}`,
        ],
        ["trailing newline", `${canonicalMarker}\n`],
        ["duplicate key", canonicalMarker.replace('"schema"', `"planDigest":"${PLAN}","schema"`)],
        ["unknown field", canonicalMarker.replace("}", ',"extra":true}')],
        ["wrong state", canonicalMarker.replace("commit-pending", "complete")],
        ["invalid digest", canonicalMarker.replace(PLAN, "invalid")],
        ["malformed JSON", "{"],
    ])("rejects %s", async (_label, contents) => {
        const root = await roots.create();
        await writeFile(join(root, REPOSITORY_BOOTSTRAP_MARKER), contents);
        const bootstrap = mock(async () => ({ planDigest: PLAN, commit: async () => undefined }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toBeInstanceOf(
            RepositoryRegistryBootstrapIncompleteError,
        );
        expect(bootstrap).not.toHaveBeenCalled();
        expect(await readdir(root)).toContain(REPOSITORY_BOOTSTRAP_MARKER);
    });

    test("rejects an oversized marker before parsing it", async () => {
        const root = await roots.create();
        await writeFile(join(root, REPOSITORY_BOOTSTRAP_MARKER), "x".repeat(513));
        const bootstrap = mock(async () => ({ planDigest: PLAN, commit: async () => undefined }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toBeInstanceOf(
            RepositoryRegistryBootstrapIncompleteError,
        );
        expect(bootstrap).not.toHaveBeenCalled();
    });

    test("resumes from a valid marker before any catalog state was written", async () => {
        const root = await roots.create();
        await writeFile(join(root, REPOSITORY_BOOTSTRAP_MARKER), canonicalMarker);
        const commit = mock(async () => await writeFile(join(root, "catalog-entry"), "committed"));

        expect(await bootstrapRepositoryRegistryIfEmpty(root, async () => ({ planDigest: PLAN, commit }))).toBe(
            "bootstrapped",
        );
        expect(commit).toHaveBeenCalledTimes(1);
        expect(await readdir(root)).toEqual(["catalog-entry"]);
    });

    test("rejects symlink and directory markers without following them", async () => {
        const parent = await roots.create();
        for (const markerKind of ["symlink", "directory"] as const) {
            const root = join(parent, markerKind);
            await mkdir(root);
            if (markerKind === "symlink") {
                const target = join(parent, "valid-marker");
                await writeFile(target, canonicalMarker);
                await symlink(target, join(root, REPOSITORY_BOOTSTRAP_MARKER));
            } else {
                await mkdir(join(root, REPOSITORY_BOOTSTRAP_MARKER));
            }

            await expect(
                bootstrapRepositoryRegistryIfEmpty(root, async () => ({
                    planDigest: PLAN,
                    commit: async () => undefined,
                })),
            ).rejects.toBeInstanceOf(RepositoryRegistryBootstrapIncompleteError);
        }
    });

    test("revalidates the marker before removal", async () => {
        const root = await roots.create();
        const bootstrap = async () => ({
            planDigest: PLAN,
            commit: async () => {
                await writeFile(join(root, REPOSITORY_BOOTSTRAP_MARKER), canonicalMarker.replace(PLAN, "b".repeat(64)));
            },
        });

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toBeInstanceOf(
            RepositoryRegistryBootstrapIncompleteError,
        );
        expect(await readdir(root)).toContain(REPOSITORY_BOOTSTRAP_MARKER);
    });
});
