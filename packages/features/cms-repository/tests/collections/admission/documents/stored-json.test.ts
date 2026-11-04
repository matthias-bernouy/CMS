import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import {
    DEFAULT_COLLECTION_LIMITS,
    verifyStoredCollectionRelease,
    parseCollectionReleaseJson,
    verifyStoredCollectionReleaseJson,
} from "@bernouy/cms-repository/collections";

const source = new URL("../../../../fixtures/collections/v1/atlas.collection.json", import.meta.url);
const digest = (text: string) => `sha256:${new Bun.CryptoHasher("sha256").update(text).digest("hex")}`;

test("stored JSON verifies canonical identity while retaining strict parsing and collection bounds", async () => {
    const raw = await readFile(source, "utf8");
    const release = parseCollectionReleaseJson(raw);
    // Capture the canonical representation through the same object verifier used for stored artifacts.
    const canonical = canonicalizeIJson(release);
    const expected = await verifyStoredCollectionRelease(release, digest(canonical));
    expect(await verifyStoredCollectionReleaseJson(canonical, digest(canonical))).toEqual(expected);
    expect(Object.isFrozen((await verifyStoredCollectionReleaseJson(canonical, digest(canonical))).release)).toBe(true);
    await expect(verifyStoredCollectionReleaseJson(canonical, digest("changed"))).rejects.toThrow("digest mismatch");
    for (const [input, code] of [
        ['{"kind":"collection","kind":"collection"}', "duplicate_json_property"],
        [new Uint8Array([0xc3, 0x28]), "invalid_utf8"],
        ['{"kind":"unknown"}', "invalid_collection"],
    ] as const) {
        await expect(verifyStoredCollectionReleaseJson(input, digest(canonical))).rejects.toMatchObject({
            name: "CollectionValidationError",
            code,
        });
    }
    await expect(
        verifyStoredCollectionReleaseJson(canonical, digest(canonical), {
            ...DEFAULT_COLLECTION_LIMITS,
            maxDocumentBytes: 64,
        }),
    ).rejects.toMatchObject({ code: "body_limit_exceeded" });
});
