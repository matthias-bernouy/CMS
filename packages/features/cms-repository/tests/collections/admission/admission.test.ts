import { describe, expect, test } from "bun:test";
import { admitCollectionRelease, admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";
import { canonicalIJsonBytes } from "@bernouy/cms-repository/contracts/protocol";
import { collectionDocument } from "../fixtures";
import { contractDocument, releaseCatalogue } from "../../providers/support/fixtures";

describe("collection authored bundle admission", () => {
    test("supports the full identifier length admitted by contracts", async () => {
        const capabilityId = "a".repeat(128);
        const contracts = await releaseCatalogue(contractDocument("payment", capabilityId));
        const source = collectionDocument();
        (source.blocs as Record<string, unknown>[])[0]!.requires = [
            { contractId: "payment", capabilityId, versionRange: "^1.0.0" },
        ];
        expect((await admitCollectionRelease(source, [], { contracts })).digest).toMatch(/^sha256:/);
    });

    test("hashes only fully verified normalized data", async () => {
        const source = collectionDocument();
        const admission = await admitCollectionRelease(source);
        const reordered = structuredClone(source);
        (reordered.blocs as unknown[]).reverse();
        expect((await admitCollectionRelease(reordered)).digest).toBe(admission.digest);
        expect((await admitCollectionReleaseJson(JSON.stringify(source))).digest).toBe(admission.digest);
        expect(admission.digest).toBe(
            `sha256:${new Bun.CryptoHasher("sha256").update(canonicalIJsonBytes(admission.release)).digest("hex")}`,
        );
        expect(Object.isFrozen(admission)).toBe(true);
        expect((await admitCollectionRelease({ ...source, name: "New name" })).digest).not.toBe(admission.digest);
    });

    test("requires one common contract witness for all requirements of one bloc", async () => {
        const contracts = await releaseCatalogue(
            contractDocument("payment", "create-link"),
            contractDocument("payment", "refund", "2.0.0"),
        );
        const source = collectionDocument();
        const blocs = source.blocs as Record<string, unknown>[];
        const create = { contractId: "payment", capabilityId: "create-link", versionRange: "^1.0.0 || ^2.0.0" };
        const refund = { contractId: "payment", capabilityId: "refund", versionRange: "^1.0.0 || ^2.0.0" };
        blocs[0]!.requires = [create, refund];
        await expect(admitCollectionRelease(source, [], { contracts })).rejects.toMatchObject({
            code: "resolution_failed",
        });
        blocs[0]!.requires = [create];
        blocs[1]!.requires = [refund];
        await expect(admitCollectionRelease(source, [], { contracts })).rejects.toMatchObject({
            code: "resolution_failed",
        });
        blocs[1] = {
            ...blocs[1],
            lightdom: "<main>Independent resource</main>",
            uses: [],
            slots: {},
            defaultContent: "",
        };
        expect((await admitCollectionRelease(source, [], { contracts })).release.blocs).toHaveLength(2);
        await expect(admitCollectionRelease(source)).rejects.toMatchObject({ code: "resolution_failed" });
        await contracts.setYank("payment", "1.0.0", { reason: "Withdrawn" });
        await expect(admitCollectionRelease(source, [], { contracts })).rejects.toMatchObject({
            code: "resolution_failed",
        });
    });

    test("snapshots release and all asset bytes before any asynchronous work", async () => {
        const first = new Uint8Array([1, 2]);
        const second = new Uint8Array([3, 4]);
        const source = collectionDocument();
        source.assets = [first, second].map((bytes, index) => ({
            id: `asset-${index}`,
            mediaType: "application/octet-stream",
            byteLength: bytes.length,
            digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
        }));
        const pending = admitCollectionRelease(source, [
            { id: "asset-0", bytes: first },
            { id: "asset-1", bytes: second },
        ]);
        first.fill(9);
        second.fill(9);
        source.name = "Mutated";
        const admission = await pending;
        expect(admission.release.name).toBe("Atlas UI");
        expect(new Uint8Array(await admission.assets[0]!.bytes.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
        expect(new Uint8Array(await admission.assets[1]!.bytes.arrayBuffer())).toEqual(new Uint8Array([3, 4]));
        await expect(admitCollectionRelease(source)).rejects.toMatchObject({ code: "asset_mismatch" });
    });
});
