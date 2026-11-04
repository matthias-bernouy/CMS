import { expect, test } from "bun:test";
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runCli } from "../../src/cli";
import { readClientConfig, updateClientConfig } from "../../src/runtime/repository/config";
import { savedRepositoryCredential } from "../../src/runtime/repository/connection";
import { readRepositoryToken } from "../../src/runtime/repository/token";

const token = `pat_${"a".repeat(43)}`;

test("CLI credentials use one private bounded file, refuse old schemas and never follow config symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-pat-config-"));
    const path = join(root, "config.json");
    try {
        expect(await readClientConfig(root)).toEqual({ schema: "ulvia.client.v1" });
        await updateClientConfig(root, async (config) => {
            config.repository = {
                url: "https://repository.example",
                repositoryId: "registry",
                token,
                generation: randomUUID(),
            };
        });
        expect((await lstat(path)).mode & 0o077).toBe(0);
        const saved = await readFile(path, "utf8");
        await chmod(path, 0o644);
        await expect(readClientConfig(root)).rejects.toThrow("private bounded");
        await chmod(path, 0o600);
        for (const invalid of [
            "x".repeat(65_537),
            '{"schema":"ulvia.client.v1","schema":"ulvia.client.v1"}',
            JSON.stringify({ schema: "ulvia.client.v2", identities: {} }),
            JSON.stringify({ schema: "ulvia.client.v1", identities: {} }),
        ]) {
            await writeFile(path, invalid);
            await expect(readClientConfig(root)).rejects.toThrow();
        }
        await writeFile(path, saved);
        const link = join(root, "linked");
        await symlink(root, link);
        await rm(path);
        await symlink(join(root, "target.json"), path);
        await writeFile(join(root, "target.json"), saved, { mode: 0o600 });
        await expect(readClientConfig(root)).rejects.toThrow();
        await expect(updateClientConfig(link, async () => undefined)).rejects.toThrow("real directory");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("saved PAT credentials refuse other origins and invalidate active operations after logout or replacement", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-pat-credential-"));
    try {
        const save = () =>
            updateClientConfig(root, async (config) => {
                config.repository = {
                    url: "https://repository.example",
                    repositoryId: "registry",
                    token,
                    generation: randomUUID(),
                };
            });
        await save();
        const credential = await savedRepositoryCredential(root, "https://repository.example/");
        expect(await credential.resolveToken()).toBe(token);
        await expect(savedRepositoryCredential(root, "https://another.example")).rejects.toThrow("No credentials");
        await save();
        await expect(credential.resolveToken()).rejects.toThrow("changed");
        const replacement = await savedRepositoryCredential(root, "https://repository.example");
        await updateClientConfig(root, async (config) => {
            delete config.repository;
        });
        await expect(replacement.resolveToken()).rejects.toThrow("changed");
        await expect(runCli(["identity", "create", "owner"], { home: root })).rejects.toThrow("Unknown command");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("PAT stdin is byte-bounded and always releases the input stream", async () => {
    expect(await readRepositoryToken(new Blob([`${token}\n`]).stream())).toBe(token);
    let cancelled = false;
    const oversized = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new Uint8Array(129));
        },
        cancel() {
            cancelled = true;
        },
    });
    await expect(readRepositoryToken(oversized)).rejects.toThrow("byte limit");
    expect(cancelled).toBe(true);
    expect(oversized.locked).toBe(false);
    const invalid = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new Uint8Array([255]));
        },
    });
    await expect(readRepositoryToken(invalid)).rejects.toThrow();
    expect(invalid.locked).toBe(false);
});
