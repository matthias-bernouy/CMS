import { describe, expect, test } from "bun:test";
import { snapshotCollectionAssets, verifyCollectionAssets } from "../../../src/collections/core/admission/assets";
import { CollectionValidationError } from "../../../src/collections/core/errors";
import { DEFAULT_COLLECTION_LIMITS as limits } from "../../../src/collections/core/limits";
import { parseAssets } from "../../../src/collections/core/parsing/assets";
import type { CollectionBundleAsset } from "../../../src/collections/interfaces/CollectionAssets";

const emptyDigest = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const emptyAsset = { id: "empty.txt", mediaType: "text/plain", byteLength: 0, digest: emptyDigest };

async function declaration(id: string, bytes: Uint8Array) {
    const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    return {
        id,
        mediaType: "application/octet-stream",
        byteLength: bytes.length,
        digest: `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    };
}

describe("collection assets", () => {
    test("sorts independent immutable declarations and accepts empty bytes", async () => {
        const authored = [{ ...emptyAsset, id: "z.txt" }, emptyAsset];
        const parsed = parseAssets(authored, limits);
        expect(parsed.map((asset) => asset.id)).toEqual(["empty.txt", "z.txt"]);
        expect(parsed.every((asset) => asset.generation === 1)).toBe(true);
        expect(parseAssets([{ ...emptyAsset, generation: 2 }], limits)[0]!.generation).toBe(2);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed[0])).toBe(true);
        expect(Object.isFrozen(authored[0])).toBe(false);
        const snapshots = snapshotCollectionAssets(
            parsed,
            [
                { id: "z.txt", bytes: new Blob([]) },
                { id: "empty.txt", bytes: new Uint8Array() },
            ],
            limits,
        );
        await verifyCollectionAssets(parsed, snapshots);
        expect(snapshots.map((asset) => asset.id)).toEqual(["empty.txt", "z.txt"]);
    });

    test("rejects unknown fields, paths, URLs, invalid media types, sizes and digests", () => {
        for (const change of [
            { url: "https://example.com/empty.txt" },
            { id: "../empty.txt" },
            { id: "Empty.txt" },
            { id: "https://example.com/empty.txt" },
            { mediaType: "image/*" },
            { mediaType: "text/plain;charset=utf-8" },
            { mediaType: "Text/Plain" },
            { byteLength: -1 },
            { byteLength: 0.5 },
            { byteLength: Number.MAX_SAFE_INTEGER + 1 },
            { byteLength: limits.maxAssetBytes + 1 },
            { digest: emptyDigest.toUpperCase() },
            { digest: "sha256:bad" },
        ]) {
            expect(() => parseAssets([{ ...emptyAsset, ...change }], limits)).toThrow(CollectionValidationError);
        }
        expect(() => parseAssets([emptyAsset, emptyAsset], limits)).toThrow("duplicate");
        expect(() => parseAssets([emptyAsset, { ...emptyAsset, id: "second" }], { ...limits, maxAssets: 1 })).toThrow();
        expect(() => parseAssets([{ ...emptyAsset, byteLength: 2 }], { ...limits, maxBundleBytes: 1 })).toThrow(
            "bundle byte",
        );
        expect(() => parseAssets(new Array(1), limits)).toThrow("dense");
    });

    test("requires a dense exact set without extra, missing or duplicate assets", () => {
        const parsed = parseAssets([emptyAsset], limits);
        for (const assets of [
            [],
            [{ id: "other", bytes: new Uint8Array() }],
            [
                { id: emptyAsset.id, bytes: new Uint8Array() },
                { id: "extra", bytes: new Uint8Array() },
            ],
        ]) {
            expect(() => snapshotCollectionAssets(parsed, assets, limits)).toThrow("asset set");
        }
        const pair = parseAssets([emptyAsset, { ...emptyAsset, id: "second" }], limits);
        expect(() =>
            snapshotCollectionAssets(
                pair,
                [
                    { id: emptyAsset.id, bytes: new Uint8Array() },
                    { id: emptyAsset.id, bytes: new Uint8Array() },
                ],
                limits,
            ),
        ).toThrow("duplicate");
        expect(() => snapshotCollectionAssets(parsed, new Array(1), limits)).toThrow("dense");
        const missingBytes = [{ id: emptyAsset.id }] as unknown as CollectionBundleAsset[];
        expect(() => snapshotCollectionAssets(parsed, missingBytes, limits)).toThrow("asset bytes");
    });

    test("checks actual size, aggregate bounds and SHA-256", async () => {
        const parsed = parseAssets([emptyAsset], limits);
        expect(() =>
            snapshotCollectionAssets(parsed, [{ id: emptyAsset.id, bytes: new Uint8Array(1) }], limits),
        ).toThrow("size mismatch");
        const bytes = new Uint8Array([1, 2]);
        const declared = parseAssets([await declaration("first", bytes), await declaration("second", bytes)], limits);
        Object.defineProperty(bytes, "byteLength", {
            get() {
                throw new Error("Caller getters must not override byte limits");
            },
        });
        const supplied = declared.map(({ id }) => ({ id, bytes }));
        expect(() => snapshotCollectionAssets(declared, supplied, { ...limits, maxAssetBytes: 1 })).toThrow(
            "byte limit",
        );
        expect(() => snapshotCollectionAssets(declared, supplied, { ...limits, maxBundleBytes: 3 })).toThrow(
            "byte limit",
        );
        const snapshots = snapshotCollectionAssets(
            declared,
            supplied.map(({ id }) => ({ id, bytes: new Uint8Array([3, 4]) })),
            limits,
        );
        await expect(verifyCollectionAssets(declared, snapshots)).rejects.toThrow("digest mismatch");
    });

    test("rejects declared media types that do not match the verified bytes", async () => {
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        const definition = await declaration("mark.svg", svg);
        const snapshots = snapshotCollectionAssets(
            [{ ...definition, mediaType: "image/png" }],
            [{ id: definition.id, bytes: svg }],
            limits,
        );
        await expect(verifyCollectionAssets([{ ...definition, mediaType: "image/png" }], snapshots)).rejects.toThrow(
            "does not match recognized image/svg+xml",
        );

        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const pngDefinition = await declaration("pixel.png", png);
        const pngSnapshots = snapshotCollectionAssets(
            [{ ...pngDefinition, mediaType: "image/png" }],
            [{ id: pngDefinition.id, bytes: png }],
            limits,
        );
        await expect(
            verifyCollectionAssets([{ ...pngDefinition, mediaType: "image/png" }], pngSnapshots),
        ).resolves.toBeUndefined();
    });

    test("snapshots every caller buffer before the first asynchronous hash", async () => {
        const first = new Uint8Array([1, 2, 3]);
        const second = new Uint8Array([4, 5, 6]);
        const parsed = parseAssets([await declaration("first", first), await declaration("second", second)], limits);
        const supplied = [
            { id: "first", bytes: first },
            { id: "second", bytes: second },
        ];
        const snapshots = snapshotCollectionAssets(parsed, supplied, limits);
        const verification = verifyCollectionAssets(parsed, snapshots);
        first.fill(255);
        second.fill(255);
        supplied.reverse();
        supplied[0]!.id = "changed";
        await verification;
        expect(new Uint8Array(await snapshots[0]!.bytes.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        expect(new Uint8Array(await snapshots[1]!.bytes.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
        expect(Object.isFrozen(first)).toBe(false);
        expect(Object.isFrozen(snapshots)).toBe(true);
        expect(Object.isFrozen(snapshots[0])).toBe(true);
        expect(Object.isFrozen(snapshots[0]!.bytes)).toBe(true);
    });
});
