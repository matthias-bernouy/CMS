import { describe, expect, test } from "bun:test";
import {
    admitProviderManifest,
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    type AdmittedProviderManifest,
} from "@bernouy/cms-repository/providers";
import { compareProviderManifests } from "@bernouy/cms-repository/providers/compatibility";
import { manifestCatalogueFixture } from "../catalogue/fixtures";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../../support/fixtures";

describe("manifest comparison trust boundary", () => {
    test("canonical reordering is unchanged and comparisons retain no mutable caller state", async () => {
        const { admission } = await manifestCatalogueFixture();
        const mutable = JSON.parse(JSON.stringify(admission));
        mutable.manifest = Object.fromEntries(Object.entries(mutable.manifest).reverse());
        const comparing = compareProviderManifests(admission, mutable);
        mutable.manifest.name = "Later mutation";
        const report = await comparing;
        expect(report.requiresApproval).toBe(false);
        expect(report.changes).toEqual([]);
        expect(Object.isFrozen(mutable.manifest)).toBe(false);
        expect(Object.isFrozen(report)).toBe(true);
    });

    test("rejects tampered artifacts and all new boundary limits", async () => {
        const { admission } = await manifestCatalogueFixture();
        for (const change of [
            { digest: `sha256:${"f".repeat(64)}` },
            { canonicalJson: `${admission.canonicalJson}\n` },
            { manifest: { ...admission.manifest, unknown: true } },
        ]) {
            await expect(
                compareProviderManifests(admission, { ...admission, ...change } as AdmittedProviderManifest),
            ).rejects.toThrow();
        }
        for (const limit of [
            { maxDocumentBytes: 32 },
            { maxJsonDepth: 2 },
            { maxImplementations: 0 },
            { maxImplementations: Number.NaN },
        ]) {
            await expect(
                compareProviderManifests(admission, admission, { ...DEFAULT_PROVIDER_MANIFEST_LIMITS, ...limit }),
            ).rejects.toThrow();
        }
    });

    test("compares historical artifacts after their contract releases are yanked", async () => {
        const { contracts, document, admission } = await manifestCatalogueFixture();
        const next = await admitProviderManifest({ ...document, version: "1.0.1" }, contracts);
        await contracts.setYank("forms.submission", "1.0.0", { reason: "Historical withdrawal" });
        const report = await compareProviderManifests(admission, next);
        expect(report.requiresApproval).toBe(true);
        expect(report.changes).toEqual([
            { category: "metadata", kind: "changed", path: "$.version", before: "1.0.0", after: "1.0.1" },
        ]);
    });

    test("reports changed exact implementation digests without asserting reference validity", async () => {
        const { admission } = await manifestCatalogueFixture();
        const contracts = await releaseCatalogue({
            ...contractDocument("forms.submission", "form.submission.create"),
            name: "Other catalogue release",
        });
        const release = (await contracts.get("forms.submission", "1.0.0"))!.admission;
        const next = await admitProviderManifest(
            manifestDocument([implementation("forms.submission", "1.0.0", release.digest)]),
            contracts,
        );
        const report = await compareProviderManifests(admission, next);
        expect(report.requiresApproval).toBe(true);
        expect(report.changes).toEqual([
            {
                category: "implementation",
                kind: "changed",
                path: '$.implementations["forms.submission@1.0.0"].digest',
                before: admission.manifest.implementations[0]!.digest,
                after: release.digest,
            },
        ]);
    });
});
