import { describe, expect, test } from "bun:test";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS, type AdmittedProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { manifestCatalogueFixture } from "./fixtures";

describe("provider catalogue integrity and bounds", () => {
    test("rejects tampered manifest, digest, canonical JSON and admission envelope", async () => {
        const { admission, catalogue } = await manifestCatalogueFixture();
        for (const change of [
            { manifest: { ...admission.manifest, name: "Tampered" } },
            { digest: `sha256:${"0".repeat(64)}` },
            { canonicalJson: `${admission.canonicalJson}\n` },
            { kind: "provider-manifest" },
            { additional: true },
        ]) {
            await expect(catalogue.publish({ ...admission, ...change } as AdmittedProviderManifest)).rejects.toThrow();
        }
        expect(await catalogue.list()).toHaveLength(0);
    });

    test("applies document, depth and count limits again at publication", async () => {
        const { admission, contracts } = await manifestCatalogueFixture();
        for (const limit of [
            { maxDocumentBytes: 32 },
            { maxJsonDepth: 2 },
            { maxImplementations: 0 },
            { maxAllowedOrigins: 0 },
        ]) {
            const catalogue = new InMemoryProviderManifestCatalogue(contracts, {
                ...DEFAULT_PROVIDER_MANIFEST_LIMITS,
                ...limit,
            });
            await expect(catalogue.publish(admission)).rejects.toThrow();
            expect(await catalogue.list()).toHaveLength(0);
        }
    });

    test("validates configured bounds and snapshots the caller's limit options", async () => {
        const { admission, contracts } = await manifestCatalogueFixture();
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
            expect(
                () =>
                    new InMemoryProviderManifestCatalogue(contracts, {
                        ...DEFAULT_PROVIDER_MANIFEST_LIMITS,
                        maxImplementations: value,
                    }),
            ).toThrow("safe integer");
        }
        const limits = { ...DEFAULT_PROVIDER_MANIFEST_LIMITS };
        const catalogue = new InMemoryProviderManifestCatalogue(contracts, limits);
        limits.maxImplementations = 0;
        expect((await catalogue.publish(admission)).admission.digest).toBe(admission.digest);
    });
});
