import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { bootstrapCollection } from "../fixture";

test("bounded bootstrap downloads verify the exact metadata and aggregate size before requesting assets", async () => {
    const source = bootstrapCollection();
    const bytes = new TextEncoder().encode("test");
    source.assets = [
        {
            id: "sample.txt",
            mediaType: "text/plain",
            byteLength: bytes.byteLength,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        },
    ];
    const artifact = await admitCollectionRelease(source, [{ id: "sample.txt", bytes }]);
    let metadata = 0;
    let assets = 0;
    const repository = new HttpCollectionRepository("local", "https://repository.example", {
        request: async (url) => {
            if (String(url).includes("/v1/releases/")) {
                metadata++;
                return Response.json(artifact.release);
            }
            assets++;
            return new Response(bytes);
        },
    });
    const reference = {
        publisherId: artifact.release.publisherId,
        collectionId: artifact.release.collectionId,
        version: artifact.release.version,
        digest: artifact.digest,
    };
    await expect(repository.get(reference, { maxAssetBytes: 3 })).rejects.toThrow("aggregate byte limit");
    expect(assets).toBe(0);
    await expect(
        repository.get({ ...reference, digest: `sha256:${"0".repeat(64)}` }, { maxAssetBytes: 4 }),
    ).rejects.toThrow("digest mismatch");
    expect(assets).toBe(0);
    expect((await repository.get(reference, { maxAssetBytes: 4 })).assets).toHaveLength(1);
    expect(assets).toBe(1);
    expect(metadata).toBe(3);
});
