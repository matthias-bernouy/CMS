import { expect, test } from "bun:test";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../src/cli";
import { readNamespacePrivateKey } from "../../src/commands/namespace/credentials";

test("namespace key generation preserves private files and rejects unsafe key readers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-namespace-key-"));
    const path = join(root, "owner.pem");
    const output: string[] = [];
    const options = {
        cwd: root,
        environment: { ULVIA_DATA_DIR: join(root, "data") },
        log: (message: string) => output.push(message),
    };
    try {
        await runCli(["namespace", "keygen", "--key-file", "owner.pem"], options);
        const privateKey = await readFile(path, "utf8");
        expect(privateKey).toContain("BEGIN PRIVATE KEY");
        expect((await lstat(path)).mode & 0o077).toBe(0);
        expect(output.join("\n")).not.toContain(privateKey);
        expect(output.join("\n")).toContain("Public key:");
        await expect(runCli(["namespace", "keygen", "--key-file", "owner.pem"], options)).rejects.toThrow();
        expect(await readFile(path, "utf8")).toBe(privateKey);
        expect(await readNamespacePrivateKey(path)).toBe(privateKey);
        const linked = join(root, "linked.pem");
        await symlink(path, linked);
        await expect(readNamespacePrivateKey(linked)).rejects.toThrow();
        const oversized = join(root, "oversized.pem");
        await writeFile(oversized, "x".repeat(4097), { mode: 0o600 });
        await expect(readNamespacePrivateKey(oversized)).rejects.toThrow();
        await expect(
            runCli(["namespace", "revoke", "community", "--repository", "https://repository.example"], options),
        ).rejects.toThrow("--yes");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
