import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, resolvedPackage, temporaryCacheRoot } from "./fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("filesystem integration package cache", () => {
    test("materializes canonical content into a durable read-only object", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const events: string[] = [];
        const cache = new FsIntegrationPackageCache({ root: cacheRoot, observe: ({ type }) => events.push(type) });
        const input = await resolvedPackage();

        const result = await cache.materialize(input, {
            kind: input.envelope.kind,
            version: input.envelope.version,
            digest: input.digest,
        });

        expect(result.digest).toBe(input.digest);
        expect(await readFile(join(result.root, "assets/payload.bin"))).toEqual(Uint8Array.from([0, 1, 2, 3]));
        const object = join(cacheRoot, "objects/sha256", input.digest);
        expect(await readFile(join(object, "package.json"))).toEqual(input.canonicalBytes);
        expect((await stat(object)).mode & 0o777).toBe(0o550);
        expect((await stat(join(object, "package.json"))).mode & 0o777).toBe(0o440);
        expect((await stat(result.root)).mode & 0o777).toBe(0o550);
        expect((await stat(join(result.root, "assets"))).mode & 0o777).toBe(0o550);
        expect((await stat(join(result.root, "assets/payload.bin"))).mode & 0o777).toBe(0o440);
        expect((await stat(join(cacheRoot, ".staging"))).dev).toBe((await stat(join(cacheRoot, "objects/sha256"))).dev);
        expect(await readdir(join(cacheRoot, ".staging"))).toEqual([]);
        expect(events).toEqual(["materialized"]);
    });

    test("survives restart and preserves an explicitly base64 textual representation", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage({
            files: {
                "definition.json": { encoding: "utf8", content: '{"kind":"cache-demo","version":"1.0.0"}' },
                "release-notes.md": { encoding: "utf8", content: "# Release\n" },
                "assets/text.txt": {
                    encoding: "base64",
                    content: "dGV4dCBzdG9yZWQgYXMgYmFzZTY0",
                },
            },
        });
        const first = new FsIntegrationPackageCache({ root: cacheRoot });
        const written = await first.materialize(input);

        const restarted = new FsIntegrationPackageCache({ root: cacheRoot });
        const restored = await restarted.get(input.digest);

        expect(restored?.root).toBe(written.root);
        expect(restored?.envelope.files["assets/text.txt"]?.encoding).toBe("base64");
        expect(await readFile(join(cacheRoot, "objects/sha256", input.digest, "package.json"))).toEqual(
            input.canonicalBytes,
        );
    });

    test("reuses an existing valid object without replacing it", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const first = new FsIntegrationPackageCache({ root: cacheRoot });
        const materialized = await first.materialize(input);
        const object = join(cacheRoot, "objects/sha256", input.digest);
        const before = await lstat(object);
        const events: string[] = [];

        const reused = await new FsIntegrationPackageCache({
            root: cacheRoot,
            observe: ({ type }) => events.push(type),
        }).materialize(input);

        const after = await lstat(object);
        expect(reused.root).toBe(materialized.root);
        expect(after.ino).toBe(before.ino);
        expect(await readdir(join(cacheRoot, ".staging"))).toEqual([]);
        expect(events).toEqual(["hit"]);
    });

    test("recovers the final read-only mode after an interrupted publication", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        await new FsIntegrationPackageCache({ root: cacheRoot }).materialize(input);
        const object = join(cacheRoot, "objects/sha256", input.digest);
        await chmod(object, 0o750);

        expect((await new FsIntegrationPackageCache({ root: cacheRoot }).get(input.digest))?.digest).toBe(input.digest);
        expect((await stat(object)).mode & 0o777).toBe(0o550);
    });

    test("rejects source identity disagreement before creating an object", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });
        const input = await resolvedPackage();

        await expect(cache.materialize(input, { version: "2.0.0" })).rejects.toThrow(/version must be "2.0.0"/);
        await cache.init();
        expect(await readdir(join(cacheRoot, "objects/sha256"))).toEqual([]);
    });

    test("rejects invalid repair timing configuration without filesystem work", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);

        expect(() => new FsIntegrationPackageCache({ root: cacheRoot, repairLockWaitMs: Number.NaN })).toThrow(
            /repair lock wait/,
        );
        expect(() => new FsIntegrationPackageCache({ root: cacheRoot, repairLockStaleAgeMs: 0 })).toThrow(
            /repair lock stale age/,
        );
        expect(await readdir(cacheRoot)).toEqual([]);
    });
});
