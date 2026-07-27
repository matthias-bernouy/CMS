import { describe, expect, test } from "bun:test";
import {
    createIntegrationRegistryCatalogSnapshot,
    PublishedIntegrationVerificationBundleReader,
    type IntegrationRegistryValidatedCatalogEntry,
    type StoredIntegrationVerificationBundle,
} from "@bernouy/cms-integration-registry";
import { catalogEntry } from "./fixtures";

const DIGEST = "b".repeat(64);
const BUNDLE = { digest: DIGEST } as StoredIntegrationVerificationBundle;

describe("PublishedIntegrationVerificationBundleReader", () => {
    test.each([undefined, "blocked", "inadmissible"] as const)(
        "serves a bundle referenced by a public version with status %s",
        async (status) => {
            let reads = 0;
            const reader = readerFor(entryWithBundle(status), async () => {
                reads++;
                return BUNDLE;
            });

            await expect(reader.get(DIGEST)).resolves.toBe(BUNDLE);
            expect(reads).toBe(1);
        },
    );

    test("does not consult storage for an orphan or not-yet-activated candidate bundle", async () => {
        let reads = 0;
        const storage = async () => {
            reads++;
            return BUNDLE;
        };

        await expect(readerFor(catalogEntry("commerce"), storage).get(DIGEST)).resolves.toBeNull();
        await expect(readerFor(entryWithBundle("unverified"), storage).get(DIGEST)).resolves.toBeNull();
        expect(reads).toBe(0);
    });

    test("fails closed when a published index references missing immutable content", async () => {
        const reader = readerFor(entryWithBundle(undefined), async () => null);

        await expect(reader.get(DIGEST)).rejects.toThrow(`Published verification bundle ${DIGEST} is unavailable`);
    });
});

function entryWithBundle(status: "blocked" | "inadmissible" | "unverified" | undefined) {
    const entry = catalogEntry("commerce");
    return {
        ...entry,
        index: {
            ...entry.index,
            versions: entry.index.versions.map((version) => ({
                ...version,
                verificationDigest: DIGEST,
                ...(status ? { status } : {}),
            })),
        },
    } satisfies IntegrationRegistryValidatedCatalogEntry;
}

function readerFor(
    entry: IntegrationRegistryValidatedCatalogEntry,
    get: (digest: string) => Promise<StoredIntegrationVerificationBundle | null>,
) {
    const snapshot = createIntegrationRegistryCatalogSnapshot({ entries: [entry] });
    return new PublishedIntegrationVerificationBundleReader({
        catalog: { current: () => snapshot },
        bundles: { get },
    });
}
