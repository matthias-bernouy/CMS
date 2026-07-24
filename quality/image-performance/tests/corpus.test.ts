import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCorpus } from "../core/corpus";
import { syntheticPng } from "../core/png";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("image performance corpus", () => {
    test("is deterministic and does not expose source paths", async () => {
        const directory = await temporaryDirectory();
        const secretName = "customer-offer-private-name.png";
        await writeFile(join(directory, secretName), syntheticPng(320, 240, 7));
        await writeFile(join(directory, "invalid.svg"), "<svg></svg>");

        const first = await loadCorpus({ directory });
        const second = await loadCorpus({ directory });
        const serialized = JSON.stringify(first);

        expect(first.fingerprint).toBe(second.fingerprint);
        expect(first.assets).toHaveLength(1);
        expect(first.rejected).toBe(1);
        expect(first.assets[0]?.assetId).toBe("asset-0001");
        expect(serialized).not.toContain(secretName);
        expect(serialized).not.toContain(directory);
    });

    test("rejects a corpus with no supported raster image", async () => {
        const directory = await temporaryDirectory();
        await writeFile(join(directory, "invalid.txt"), "not an image");

        await expect(loadCorpus({ directory })).rejects.toThrow("no supported raster image");
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "cms-image-corpus-test-"));
    directories.push(directory);
    return directory;
}
