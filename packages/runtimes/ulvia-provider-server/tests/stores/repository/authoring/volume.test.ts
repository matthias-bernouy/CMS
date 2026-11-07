import { expect, spyOn, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { authoringFixture, sourceSnapshot } from "./fixture";

test("preflight stops loading historical metadata at its byte budget even below the entry limit", async () => {
    const f = await authoringFixture();
    try {
        const stable = await f.authoring.prepare(sourceSnapshot());
        await f.authoring.publish(stable.preparationId, stable.digest);
        const { canonicalJson } = await new RemoteRepositoryClient(f.base).pull({
            kind: "collection",
            publisherId: "community",
            id: "community/sample",
            version: "1.0.0",
        });
        const release = JSON.parse(canonicalJson);
        const messages = Object.fromEntries(
            Array.from({ length: 520 }, (_, index) => [`extra${index}`, "x".repeat(4096)]),
        );
        for (let index = 1; index <= 17; index++) {
            const document = {
                ...release,
                version: `1.0.${index}`,
                translations: { ...release.translations, en: { ...release.translations.en, ...messages } },
            };
            await writeFile(
                join(f.root, "registry", "releases/community/sample", `1.0.${index}.json`),
                canonicalizeIJson(document),
            );
        }
        let loadedBytes = 0;
        const original = LocalCollectionRepository.prototype.getMetadata;
        const reads = spyOn(LocalCollectionRepository.prototype, "getMetadata").mockImplementation(async function (
            this: LocalCollectionRepository,
            publisher,
            collection,
            version,
        ) {
            const metadata = await original.call(this, publisher, collection, version);
            if (metadata) {
                loadedBytes += Buffer.byteLength(metadata.canonicalJson);
            }
            return metadata;
        });
        try {
            expect((await f.authoring.prepare(sourceSnapshot("1.1.0"))).preflight).toBe("incomplete");
            expect(loadedBytes).toBeGreaterThan(32 * 1024 * 1024);
            expect(loadedBytes).toBeLessThanOrEqual(40 * 1024 * 1024); // At most one validated 8 MiB document crosses the retained-history budget.
            expect(reads.mock.calls.length).toBeLessThan(20);
        } finally {
            reads.mockRestore();
        }
    } finally {
        await f.close();
    }
}, 15_000);

test("orphaned temporary entries cannot make preflight traverse an unbounded directory", async () => {
    const f = await authoringFixture();
    try {
        const stable = await f.authoring.prepare(sourceSnapshot());
        await f.authoring.publish(stable.preparationId, stable.digest);
        for (let index = 0; index < 300; index++) {
            await writeFile(join(f.root, "registry", "releases/community/sample", `orphan-${index}.tmp`), "");
        }
        const metadata = spyOn(LocalCollectionRepository.prototype, "getMetadata");
        try {
            expect((await f.authoring.prepare(sourceSnapshot("1.1.0"))).preflight).toBe("incomplete");
            expect(metadata.mock.calls.length).toBeLessThanOrEqual(2);
        } finally {
            metadata.mockRestore();
        }
    } finally {
        await f.close();
    }
});
