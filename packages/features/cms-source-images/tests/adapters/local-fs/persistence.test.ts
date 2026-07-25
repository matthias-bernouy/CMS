import { afterEach, describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import { derivative, localCacheTestFixture } from "./fixture";

const fixture = localCacheTestFixture();
afterEach(fixture.cleanup);

describe("LocalSourceImageCache persistence", () => {
    test("persists derivatives and lookups across instances", async () => {
        const root = await fixture.cacheRoot();
        const first = new LocalSourceImageCache({ directory: root, now: () => 100 });
        const derivativeKey = `derivative-${"a".repeat(64)}`;
        await first.putDerivative(derivativeKey, await derivative("bytes", 100));
        await first.putLookup("lookup-key", {
            derivativeKey,
            freshUntil: 2_000,
            createdAt: 100,
        });
        await first.dispose();
        const second = new LocalSourceImageCache({ directory: root, now: () => 100 });
        expect(new TextDecoder().decode((await second.getDerivative(derivativeKey))!.bytes)).toBe("bytes");
        expect(await second.getLookup("lookup-key")).toEqual({
            derivativeKey,
            freshUntil: 2_000,
            createdAt: 100,
        });
    });

    test("uses only opaque digests in physical names and metadata", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root });
        const secretKey = "https://storage.test/private/seller-123/file.png?token=secret";
        await cache.putDerivative(secretKey, await derivative("opaque"));
        const files = await readdir(join(root, "objects"));
        expect(files.every((name) => /^[a-f0-9]{64}(?:-[a-f0-9]{64}\.webp|\.json)$/.test(name))).toBe(true);
        const metadata = await Promise.all(
            files.filter((name) => name.endsWith(".json")).map((name) => readFile(join(root, "objects", name), "utf8")),
        );
        expect(metadata.join("")).not.toContain("storage.test");
        expect(metadata.join("")).not.toContain("seller-123");
        expect(metadata.join("")).not.toContain("secret");
    });

    test("atomically overwrites a deterministic key without stale bytes", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root });
        await cache.putDerivative("key", await derivative("first"));
        await cache.putDerivative("key", await derivative("second"));
        expect(new TextDecoder().decode((await cache.getDerivative("key"))!.bytes)).toBe("second");
        expect((await readdir(join(root, "objects"))).filter((name) => name.endsWith(".webp"))).toHaveLength(1);
    });

    test("rejects a caller-provided ETag that does not match bytes", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root });
        const value = { ...(await derivative("value")), etag: '"wrong"' };
        await expect(cache.putDerivative("key", value)).rejects.toThrow("ETag");
        expect(await cache.getDerivative("key")).toBeNull();
    });
});
