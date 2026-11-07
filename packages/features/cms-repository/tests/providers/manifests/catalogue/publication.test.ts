import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/ulvia-providers";
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
        expect(await catalogue.get("ulvia/ulvia.example", "1.0.0")).toBe(record);
        expect(await catalogue.findByDigest(admission.digest)).toBe(record);
        expect(Object.isFrozen(await catalogue.list())).toBe(true);
        expect(await catalogue.get("ulvia/missing", "1.0.0")).toBeNull();
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
        await catalogue.setYank("ulvia/ulvia.example", "1.0.0", { reason: "Historical release" });
        await expect(
            admitProviderManifest(
                {
                    ...document,
                    version: "2.0.0",
                    provenance: { publisherId: "other.publisher", publishedAt: "2026-09-24T00:00:00Z" },
                },
                contracts,
            ),
        ).rejects.toThrow("namespace must match");
        expect(await catalogue.list()).toHaveLength(1);
    });

    test("independent publishers can concurrently publish the same local Provider name", async () => {
        const { admission, catalogue, document, contracts } = await manifestCatalogueFixture();
        const other = await admitProviderManifest(
            {
                ...document,
                providerId: "other.publisher/ulvia.example",
                version: "2.0.0",
                provenance: { publisherId: "other.publisher", publishedAt: "2026-09-24T00:00:00Z" },
            },
            contracts,
        );
        const results = await Promise.allSettled([catalogue.publish(admission), catalogue.publish(other)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
        expect(await catalogue.list()).toHaveLength(2);
    });

    test("sorts all providers and versions deterministically without enforcing behavioral bumps", async () => {
        const { catalogue, document, contracts } = await manifestCatalogueFixture();
        const identities = [
            ["ulvia/z.provider", "1.0.0"],
            ["ulvia/a.provider", "1.10.0"],
            ["ulvia/a.provider", "1.2.0-alpha.1"],
            ["ulvia/a.provider", "1.2.0"],
            ["ulvia/a.provider", "1.2.1"],
        ];
        for (const [providerId, version] of identities) {
            await catalogue.publish(
                await admitProviderManifest(
                    { ...document, providerId, version, buildVersionRange: "^9.0.0" },
                    contracts,
                ),
            );
        }
        expect(
            (await catalogue.list()).map(
                (record) => `${record.admission.manifest.providerId}@${record.admission.manifest.version}`,
            ),
        ).toEqual([
            "ulvia/a.provider@1.2.0-alpha.1",
            "ulvia/a.provider@1.2.0",
            "ulvia/a.provider@1.2.1",
            "ulvia/a.provider@1.10.0",
            "ulvia/z.provider@1.0.0",
        ]);
        expect(await catalogue.list("ulvia/a.provider")).toHaveLength(4);
    });
});

test("Provider previews have ordered targets, exact promotion and independent stable maintenance", async () => {
    const { admission, catalogue, document, contracts } = await manifestCatalogueFixture();
    await catalogue.publish(admission);
    const publish = async (version: string) =>
        catalogue.publish(await admitProviderManifest({ ...document, version }, contracts));
    await publish("1.1.0-beta.2");
    await expect(publish("1.1.0-beta.1")).rejects.toThrow("increase within its release target");
    expect(await catalogue.list()).toHaveLength(2);
    await publish("1.0.1");
    await publish("1.1.0");
    await expect(publish("1.1.0-rc.1")).rejects.toThrow("increase within its release target");
    expect((await catalogue.get(admission.manifest.providerId, "1.1.0"))?.admission.manifest.version).toBe("1.1.0");
});
