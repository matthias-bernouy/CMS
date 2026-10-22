import { expect, test } from "bun:test";
import {
    admitCollectionRelease,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    parseCollectionRelease,
} from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { CollectionSources } from "../../src/capabilities/installations/sources";

test("stages only the exact browser-risk report approved by the caller", async () => {
    const release = parseCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "example",
        publisherId: "example.official",
        version: "1.0.0",
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Example" } },
        assets: [],
        blocs: [],
    });
    const artifact = await admitCollectionRelease(release, []);
    const browserRiskDigest = collectionBrowserRiskDigest(collectionBrowserRisk(release));
    const entry = {
        repositoryId: "official",
        publisherId: release.publisherId,
        collectionId: release.collectionId,
        version: release.version,
        digest: artifact.digest,
        name: "Example",
        description: "",
        blocCount: 0,
        hasTheme: false,
        browserRisk: "none" as const,
        browserRiskDigest,
        javaScriptBlocCount: 0,
        frameBlocCount: 0,
        externalFrameOrigins: [],
        scriptsWithSameOrigin: false,
    };
    const source: CollectionRepositorySource = {
        id: "official",
        list: async () => [entry],
        get: async () => ({ release, assets: [] }),
    };
    let imports = 0;
    const store = {
        snapshot: async () => ({ revision: 0, collections: [] }),
        admitRelease: async () => artifact,
        importAdmittedRelease: async () => {
            imports++;
            return artifact;
        },
    };
    const sources = new CollectionSources(store as never, [source]);
    const reference = {
        repositoryId: "official",
        publisherId: release.publisherId,
        collectionId: release.collectionId,
        version: release.version,
        digest: artifact.digest,
        approvedBrowserRiskDigest: browserRiskDigest,
    };

    await expect(sources.stage([reference])).resolves.toEqual([{ digest: artifact.digest, repositoryId: "official" }]);
    await expect(
        sources.stage([{ ...reference, approvedBrowserRiskDigest: `sha256:${"f".repeat(64)}` }]),
    ).rejects.toMatchObject({ code: "BROWSER_CAPABILITIES_APPROVAL_REQUIRED", status: 409 });
    expect(imports).toBe(1);
});

test("derives displayed browser authority from the admitted bundle instead of repository metadata", async () => {
    const document = {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "example",
        publisherId: "example.official",
        version: "1.0.0",
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Example" } },
        assets: [],
        blocs: [
            {
                id: "example-interactive",
                kind: "component",
                label: "collection.name",
                uses: [],
                requires: [],
                slots: {},
                root: { accepts: ["div"] },
                markup: "<div></div>",
                runtime: { browserAbi: "v1", viewJS: "void 0" },
            },
        ],
    };
    const artifact = await admitCollectionRelease(document, []);
    const forgedEntry = {
        repositoryId: "official",
        publisherId: artifact.release.publisherId,
        collectionId: artifact.release.collectionId,
        version: artifact.release.version,
        digest: artifact.digest,
        name: "Example",
        description: "",
        blocCount: 0,
        hasTheme: false,
        browserRisk: "none" as const,
        browserRiskDigest: collectionBrowserRiskDigest(
            collectionBrowserRisk(
                parseCollectionRelease({
                    ...document,
                    blocs: [],
                }),
            ),
        ),
        javaScriptBlocCount: 0,
        frameBlocCount: 0,
        externalFrameOrigins: [],
        scriptsWithSameOrigin: false,
    };
    const source: CollectionRepositorySource = {
        id: "official",
        list: async () => [forgedEntry],
        get: async () => ({ release: document, assets: [] }),
    };
    const store = {
        snapshot: async () => ({ revision: 0, collections: [] }),
        admitRelease: async () => artifact,
    };

    const catalogue = await new CollectionSources(store as never, [source]).catalogue("site");

    expect(catalogue.releases[0]).toMatchObject({
        browserRisk: "high",
        javaScriptBlocCount: 1,
        javaScriptBlocs: ["example-interactive"],
    });
    expect(catalogue.releases[0]!.browserRiskDigest).not.toBe(forgedEntry.browserRiskDigest);
});
