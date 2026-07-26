import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositoryPublicationToken } from "../../src/repositoryPublication/tokenFile";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official repository publication token", () => {
    test("reads one exact bounded token from a regular file", async () => {
        const root = await temporaryRoot();
        const path = join(root, "token");
        await writeFile(path, "management-token", { mode: 0o600 });
        expect(await readRepositoryPublicationToken(path)).toBe("management-token");

        const maximum = "x".repeat(8_192);
        await writeFile(path, maximum);
        expect(await readRepositoryPublicationToken(path)).toBe(maximum);
    });

    test("rejects empty, oversized, whitespace, malformed, and relative token inputs", async () => {
        const root = await temporaryRoot();
        const path = join(root, "token");
        for (const contents of ["", "x".repeat(8_193), "token\n", "two tokens", Uint8Array.from([0xc3, 0x28])]) {
            await writeFile(path, contents);
            await expect(readRepositoryPublicationToken(path)).rejects.toThrow("bounded regular secret file");
        }
        await expect(readRepositoryPublicationToken("relative-token")).rejects.toThrow("bounded regular secret file");
    });

    test("never follows symlinks or accepts directories", async () => {
        const root = await temporaryRoot();
        const target = join(root, "target");
        const link = join(root, "link");
        const directory = join(root, "directory");
        await writeFile(target, "management-token");
        await symlink(target, link);
        await mkdir(directory);

        await expect(readRepositoryPublicationToken(link)).rejects.toThrow("bounded regular secret file");
        await expect(readRepositoryPublicationToken(directory)).rejects.toThrow("bounded regular secret file");
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-cli-repository-token-"));
    roots.push(root);
    return root;
}
