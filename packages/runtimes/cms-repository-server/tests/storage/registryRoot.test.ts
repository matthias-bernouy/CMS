import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    bootstrapRepositoryRegistryIfEmpty,
    REPOSITORY_BOOTSTRAP_MARKER,
    RepositoryRegistryBootstrapIncompleteError,
    validateRepositoryRegistryRoot,
} from "../../src/registryRoot";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();
const PLAN_A = "a".repeat(64);
const PLAN_B = "b".repeat(64);

afterEach(async () => await roots.cleanup());

describe("repository registry root", () => {
    test("runs bootstrap only for a completely empty registry root", async () => {
        const root = await roots.create();
        const bootstrap = mock(async (target: string) => ({
            planDigest: PLAN_A,
            commit: async () => await writeFile(join(target, "catalog-entry"), "validated publication"),
        }));

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("bootstrapped");
        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    test("never invokes bootstrap when registry state exists without a marker", async () => {
        const root = await roots.create();
        await mkdir(join(root, ".staging"));
        const bootstrap = mock(async () => {
            throw new Error("must not be called");
        });

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).not.toHaveBeenCalled();
    });

    test("does not claim the registry until preparation validates without writing", async () => {
        const root = await roots.create();
        const bootstrap = mock(async () => {
            expect(await readdir(root)).toEqual([]);
            throw new Error("official package validation failed");
        });

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow(
            "official package validation failed",
        );
        expect(await readdir(root)).toEqual([]);
    });

    test("does not commit when concurrent state appears during preparation", async () => {
        const root = await roots.create();
        let releasePreparation!: () => void;
        let preparationStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            preparationStarted = resolve;
        });
        const release = new Promise<void>((resolve) => {
            releasePreparation = resolve;
        });
        const commit = mock(async () => undefined);
        const bootstrap = mock(async () => {
            preparationStarted();
            await release;
            return { planDigest: PLAN_A, commit };
        });

        const result = bootstrapRepositoryRegistryIfEmpty(root, bootstrap);
        await started;
        await writeFile(join(root, "concurrent-state"), "owned by another initializer");
        releasePreparation();

        expect(await result).toBe("already-initialized");
        expect(commit).not.toHaveBeenCalled();
        expect(await readdir(root)).not.toContain(REPOSITORY_BOOTSTRAP_MARKER);
    });

    test("resumes an interrupted commit only for the exact reconstructed plan", async () => {
        const root = await roots.create();
        let attempt = 0;
        const bootstrap = mock(async (target: string) => ({
            planDigest: PLAN_A,
            commit: async () => {
                attempt += 1;
                await writeFile(join(target, "catalog-entry"), `attempt-${attempt}`);
                if (attempt === 1) {
                    throw new Error("simulated interruption");
                }
            },
        }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow("simulated interruption");
        expect(await readFile(join(root, REPOSITORY_BOOTSTRAP_MARKER), "utf8")).toBe(
            `{"planDigest":"${PLAN_A}","schema":"cms.integration.repository.bootstrap.v2","state":"commit-pending"}`,
        );

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("bootstrapped");
        expect(await readFile(join(root, "catalog-entry"), "utf8")).toBe("attempt-2");
        expect(await readdir(root)).not.toContain(REPOSITORY_BOOTSTRAP_MARKER);
        expect(bootstrap).toHaveBeenCalledTimes(2);
    });

    test("replays idempotently when commit completed before marker removal", async () => {
        const root = await roots.create();
        let attempt = 0;
        const bootstrap = mock(async (target: string) => ({
            planDigest: PLAN_A,
            commit: async () => {
                attempt += 1;
                const destination = join(target, "complete-catalog-entry");
                if (!(await Bun.file(destination).exists())) {
                    await writeFile(destination, "committed bytes");
                }
                if (attempt === 1) {
                    throw new Error("crash after commit");
                }
            },
        }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow("crash after commit");
        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("bootstrapped");
        expect(await readFile(join(root, "complete-catalog-entry"), "utf8")).toBe("committed bytes");
        expect(attempt).toBe(2);
    });

    test("fails closed when the reconstructed plan no longer matches", async () => {
        const root = await roots.create();
        let planDigest = PLAN_A;
        const bootstrap = mock(async () => ({
            planDigest,
            commit: async () => {
                throw new Error("simulated interruption");
            },
        }));

        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toThrow("simulated interruption");
        planDigest = PLAN_B;
        await expect(bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).rejects.toBeInstanceOf(
            RepositoryRegistryBootstrapIncompleteError,
        );
        expect(await readdir(root)).toContain(REPOSITORY_BOOTSTRAP_MARKER);
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
