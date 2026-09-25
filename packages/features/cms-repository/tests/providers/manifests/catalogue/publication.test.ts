import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { manifestCatalogueFixture } from "./fixtures";

describe("provider manifest catalogue publication", () => {
    test("indexes independent immutable snapshots and preserves its own acceptance time", async () => {
        const { admission, catalogue } = await manifestCatalogueFixture();
        const mutable = JSON.parse(JSON.stringify(admission));
        const publishing = catalogue.publish(mutable);
        mutable.manifest.name = "Changed after publication started";
        const record = await publishing;

        expect(record.publishedAt).toBe("2026-09-24T10:00:00.000Z");
        expect(record.admission.manifest.name).toBe(admission.manifest.name);
        expect(record.admission).not.toBe(admission);
        expect(record.admission).not.toBe(mutable);
        expect(Object.isFrozen(mutable.manifest)).toBe(false);
        expect(Object.isFrozen(record.admission.manifest.implementations)).toBe(true);
        expect(await catalogue.get("ulvia.example", "1.0.0")).toBe(record);
        expect(await catalogue.findByDigest(admission.digest)).toBe(record);
        expect(Object.isFrozen(await catalogue.list())).toBe(true);
        expect(await catalogue.get("missing", "1.0.0")).toBeNull();
    });

    test("keeps version keys immutable and simultaneous exact republishes idempotent", async () => {
        const { admission, catalogue, document, contracts } = await manifestCatalogueFixture();
        const copies = await Promise.all([catalogue.publish(admission), catalogue.publish(admission)]);
        expect(copies[0]).toBe(copies[1]);
        const changed = await admitProviderManifest({ ...document, name: "Changed claim" }, contracts);
        await expect(catalogue.publish(changed)).rejects.toThrow("already published");
        expect(await catalogue.list()).toHaveLength(1);
    });

    test("serializes conflicting concurrent first publications and publisher ownership", async () => {
        const { admission, catalogue, document, contracts } = await manifestCatalogueFixture();
        const changed = await admitProviderManifest({ ...document, name: "Another claim" }, contracts);
        const results = await Promise.allSettled([catalogue.publish(admission), catalogue.publish(changed)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        const otherPublisher = await admitProviderManifest(
            {
                ...document,
                version: "2.0.0",
                provenance: { publisherId: "other.publisher", publishedAt: "2026-09-24T00:00:00Z" },
            },
            contracts,
        );
        await catalogue.setYank("ulvia.example", "1.0.0", { reason: "Historical release" });
        await expect(catalogue.publish(otherPublisher)).rejects.toThrow("publisher ownership");
    });

    test("protects ownership when different publishers race across different versions", async () => {
        const { admission, catalogue, document, contracts } = await manifestCatalogueFixture();
        const other = await admitProviderManifest(
            {
                ...document,
                version: "2.0.0",
                provenance: { publisherId: "other.publisher", publishedAt: "2026-09-24T00:00:00Z" },
            },
            contracts,
        );
        const results = await Promise.allSettled([catalogue.publish(admission), catalogue.publish(other)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(await catalogue.list()).toHaveLength(1);
    });

    test("sorts all providers and versions deterministically without enforcing behavioral bumps", async () => {
        const { catalogue, document, contracts } = await manifestCatalogueFixture();
        const identities = [
            ["z.provider", "1.0.0"],
            ["a.provider", "1.10.0"],
            ["a.provider", "1.2.0+z"],
            ["a.provider", "1.2.0+a"],
            ["a.provider", "1.2.0-alpha.1"],
        ];
        await Promise.all(
            identities.map(async ([providerId, version]) =>
                catalogue.publish(
                    await admitProviderManifest(
                        { ...document, providerId, version, buildVersionRange: "^9.0.0" },
                        contracts,
                    ),
                ),
            ),
        );
        expect(
            (await catalogue.list()).map(
                (record) => `${record.admission.manifest.providerId}@${record.admission.manifest.version}`,
            ),
        ).toEqual([
            "a.provider@1.2.0-alpha.1",
            "a.provider@1.2.0+a",
            "a.provider@1.2.0+z",
            "a.provider@1.10.0",
            "z.provider@1.0.0",
        ]);
        expect(await catalogue.list("a.provider")).toHaveLength(4);
    });
});
