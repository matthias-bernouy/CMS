import { afterEach, describe, expect, test } from "bun:test";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import { derivative, localCacheTestFixture } from "./fixture";

const fixture = localCacheTestFixture();
afterEach(fixture.cleanup);

describe("LocalSourceImageCache recovery", () => {
    test("detects byte corruption through SHA-256 and removes the entry", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root });
        await cache.putDerivative("key", await derivative("valid"));
        const dataFile = (await readdir(join(root, "objects"))).find((name) => name.endsWith(".webp"))!;
        await writeFile(join(root, "objects", dataFile), "corrupt");
        expect(await cache.getDerivative("key")).toBeNull();
        expect((await readdir(join(root, "objects"))).filter((name) => !name.endsWith(".tmp"))).toEqual([]);
    });

    test("never exposes an incomplete atomic write", async () => {
        const root = await fixture.cacheRoot();
        const objects = join(root, "objects");
        const cache = new LocalSourceImageCache({ directory: root });
        await cache.initialize();
        await writeFile(join(objects, `${"a".repeat(64)}.json.partial.tmp`), "{}");
        await writeFile(join(objects, `${"b".repeat(64)}-${"c".repeat(64)}.webp`), "partial");
        const restarted = new LocalSourceImageCache({ directory: root });
        await restarted.initialize();
        expect(await restarted.getDerivative("unknown")).toBeNull();
    });

    test("sweeps restart debris before allowing the first concurrent write", async () => {
        const root = await fixture.cacheRoot();
        const objects = join(root, "objects");
        const lookups = join(root, "lookups");
        const first = new LocalSourceImageCache({ directory: root });
        await first.putDerivative("missing-data", await derivative("missing"));
        await first.putDerivative("invalid-metadata", await derivative("invalid"));
        await first.initialize();
        const objectNames = await readdir(objects);
        const missingMetadata = objectNames.find((name) => name.endsWith(".json"))!;
        const missingRecord = JSON.parse(await readFile(join(objects, missingMetadata), "utf8")) as {
            dataFile: string;
        };
        await unlink(join(objects, missingRecord.dataFile));
        const remainingMetadata = (await readdir(objects)).find(
            (name) => name.endsWith(".json") && name !== missingMetadata,
        )!;
        await writeFile(join(objects, remainingMetadata), "{");
        await writeFile(join(objects, `${"a".repeat(64)}-${"b".repeat(64)}.webp`), "orphan");
        await writeFile(join(objects, `${"c".repeat(64)}.json.partial.tmp`), "partial");
        await writeFile(join(lookups, `${"d".repeat(64)}.json`), "{}");
        await writeFile(join(lookups, `${"e".repeat(64)}.json.partial.tmp`), "partial");

        const restarted = new LocalSourceImageCache({ directory: root });
        const firstInitialization = restarted.initialize();
        const secondInitialization = restarted.initialize();
        expect(firstInitialization).toBe(secondInitialization);
        await Promise.all([
            firstInitialization,
            restarted.putDerivative("survives-initialization", await derivative("survivor")),
        ]);

        expect(new TextDecoder().decode((await restarted.getDerivative("survives-initialization"))!.bytes)).toBe(
            "survivor",
        );
        expect((await readdir(objects)).filter((name) => name.endsWith(".json"))).toHaveLength(1);
        expect((await readdir(objects)).filter((name) => name.endsWith(".webp"))).toHaveLength(1);
        expect(await readdir(lookups)).toEqual([]);
    });

    test.each([
        ["future creation", { createdAt: 101, freshUntil: 200 }],
        ["overlong freshness", { createdAt: 100, freshUntil: 3_600_101 }],
    ])("fails closed when persisted lookup has %s", async (_label, timestamps) => {
        const root = await fixture.cacheRoot();
        const first = new LocalSourceImageCache({ directory: root, now: () => 100 });
        const derivativeKey = `derivative-${"a".repeat(64)}`;
        await first.putLookup("lookup", {
            derivativeKey,
            createdAt: 100,
            freshUntil: 200,
        });
        const metadataName = (await readdir(join(root, "lookups"))).find((name) => name.endsWith(".json"))!;
        const metadataPath = join(root, "lookups", metadataName);
        const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
        await writeFile(metadataPath, JSON.stringify({ ...metadata, ...timestamps }));

        const restarted = new LocalSourceImageCache({ directory: root, now: () => 100 });
        await restarted.initialize();

        expect(await restarted.getLookup("lookup")).toBeNull();
        expect(await readdir(join(root, "lookups"))).toEqual([]);
    });
});
