import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readRepositoryManagementToken } from "../src/credentials";
import { bootstrapRepositoryRegistryIfEmpty, validateRepositoryRegistryRoot } from "../src/registryRoot";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repository storage contracts", () => {
    test("runs bootstrap only for a completely empty registry root", async () => {
        const root = await temporaryRoot();
        const bootstrap = mock(async (target: string) => {
            await writeFile(join(target, "bootstrap-marker"), "validated publication");
        });

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("bootstrapped");
        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    test("never invokes bootstrap when any registry state already exists", async () => {
        const root = await temporaryRoot();
        await mkdir(join(root, ".staging"));
        const bootstrap = mock(async () => undefined);

        expect(await bootstrapRepositoryRegistryIfEmpty(root, bootstrap)).toBe("already-initialized");
        expect(bootstrap).not.toHaveBeenCalled();
    });

    test("rejects a symlink registry root", async () => {
        const parent = await temporaryRoot();
        const actual = join(parent, "actual");
        const linked = join(parent, "linked");
        await mkdir(actual);
        await symlink(actual, linked);

        await expect(validateRepositoryRegistryRoot(linked)).rejects.toThrow("non-symlink directory");
    });

    test("reads a bounded management token from a regular secret file", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "token");
        await writeFile(tokenFile, "management-secret\n", { mode: 0o600 });

        expect(await readRepositoryManagementToken(tokenFile)).toBe("management-secret");

        await writeFile(tokenFile, "two tokens");
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("one non-empty Bearer token");
        await writeFile(tokenFile, "x".repeat(8_193));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });

    test("refuses symlinked and malformed management token files without exposing their paths", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "private-token");
        const linkedTokenFile = join(root, "linked-token");
        await writeFile(tokenFile, "management-secret", { mode: 0o600 });
        await symlink(tokenFile, linkedTokenFile);

        for (const path of [linkedTokenFile, root, join(root, "missing-token")]) {
            const failure = readRepositoryManagementToken(path).catch((error) => error);
            expect(String(await failure)).toContain("bounded regular file");
            expect(String(await failure)).not.toContain(path);
        }

        await writeFile(tokenFile, new Uint8Array([0xc3, 0x28]));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-repository-server-"));
    roots.push(root);
    return root;
}
