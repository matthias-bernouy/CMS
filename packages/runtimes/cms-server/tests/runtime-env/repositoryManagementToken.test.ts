import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositoryManagementTokenFile } from "../../src/repositoryManagement/tokenFile";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repository management token file", () => {
    test("reads the exact bytes of a bounded regular file", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "token");
        await writeFile(tokenFile, "opaque-management-token", { mode: 0o600 });

        expect(await readRepositoryManagementTokenFile(tokenFile)).toBe("opaque-management-token");

        const maximumToken = "x".repeat(8_192);
        await writeFile(tokenFile, maximumToken);
        expect(await readRepositoryManagementTokenFile(tokenFile)).toBe(maximumToken);
    });

    test("rejects empty and oversized files without an unbounded read", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "token");

        await writeFile(tokenFile, "");
        await expect(readRepositoryManagementTokenFile(tokenFile)).rejects.toThrow("non-empty regular file");

        await writeFile(tokenFile, "x".repeat(8_193));
        await expect(readRepositoryManagementTokenFile(tokenFile)).rejects.toThrow("at most 8192 bytes");
    });

    test("rejects symlinks and other non-regular filesystem entries", async () => {
        const root = await temporaryRoot();
        const target = join(root, "target");
        const link = join(root, "token-link");
        const directory = join(root, "directory");
        await writeFile(target, "must-not-be-followed");
        await symlink(target, link);
        await mkdir(directory);

        await expect(readRepositoryManagementTokenFile(link)).rejects.toThrow("regular file");
        await expect(readRepositoryManagementTokenFile(directory)).rejects.toThrow("regular file");
        await expect(readRepositoryManagementTokenFile("relative-token")).rejects.toThrow("absolute");
    });

    test("rejects whitespace and malformed UTF-8 rather than changing token bytes", async () => {
        const root = await temporaryRoot();
        const tokenFile = join(root, "token");

        for (const token of ["token\n", "two tokens", "\ttoken"]) {
            await writeFile(tokenFile, token);
            await expect(readRepositoryManagementTokenFile(tokenFile)).rejects.toThrow("no whitespace");
        }

        await writeFile(tokenFile, Uint8Array.from([0xc3, 0x28]));
        await expect(readRepositoryManagementTokenFile(tokenFile)).rejects.toThrow("valid UTF-8");
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-server-repository-management-"));
    temporaryRoots.push(root);
    return root;
}
