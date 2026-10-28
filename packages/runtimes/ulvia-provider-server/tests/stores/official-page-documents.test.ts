import { seedOfficialPages } from "../../src/runtime/instances/profiles/seedPages";
import { initialPagesFixture } from "./initialPagesFixture";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createCmsPage, InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { collectionExampleDocument } from "@bernouy/cms-repository/collections";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { initialPages } from "../../src/runtime/instances/profiles/initialPages";
import {
    selectedCapabilityResolver,
    selectedPublicSvgCapabilityValidator,
} from "../../src/runtime/stores/selectedQueryCapabilities";

test("official initial Pages and a translated input example use ordinary Content writes", async () => {
    const bootstrap = resolve(import.meta.dir, "../../../ulvia-cli/dist/bootstrap");
    const index = await Bun.file(resolve(bootstrap, "index.json")).json();
    const catalogue = new InMemoryReleaseCatalogue();
    const admissions = await Promise.all(
        (index.contracts as string[]).map(async (path) =>
            admitContractReleaseJson(await Bun.file(resolve(bootstrap, path)).text()),
        ),
    );
    await publishContractSet(catalogue, admissions);
    const store = new CollectionStore(new MemoryCollectionStorage(), catalogue);
    const artifact = await store.importRelease(
        await Bun.file(resolve(bootstrap, index.collection)).json(),
        index.collectionAssets.map((asset: { id: string; path: string }) => ({
            id: asset.id,
            bytes: Bun.file(resolve(bootstrap, asset.path)),
        })),
    );
    await store.install("default", artifact.digest, 0);
    const selections = {
        get: async () => ({
            plan: {
                selections: admissions.map(({ release, digest }) => ({
                    contractId: release.contractId,
                    version: release.version,
                    digest,
                })),
            },
        }),
    };
    const repo = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), store, "default"),
        {
            resolveCapabilities: selectedCapabilityResolver("default", selections as never, catalogue),
            requireQueryCapabilityResolution: true,
            validateSvgCapabilities: selectedPublicSvgCapabilityValidator("default", selections as never, catalogue),
            requireSvgCapabilityResolution: true,
        },
    );
    const { receipts, records } = initialPagesFixture();
    await seedOfficialPages(
        { stores: { repo, collections: store, db: { collection: () => receipts } } } as never,
        { id: "official", collection: { digest: artifact.digest }, initialPages } as never,
        { throwIfLeaseLost: () => {} } as never,
    );
    for (const seed of initialPages) {
        const page = (await repo.getPage(seed.path))!;
        expect(page.visible).toBe(true);
        expect(page.indexing).toEqual({ enabled: false });
        expect(Object.hasOwn(page, "origin")).toBe(false);
    }
    expect(records.size).toBe(initialPages.length);
    const input = collectionExampleDocument(artifact.release, "control-group-default");
    const created = await createCmsPage(repo, { path: "/example-input", title: "Input example", content: input.html });
    expect(created.content).toContain('placeholder="{{ cms.i18n.ulvia-official.ui-search }}"');
    expect(await repo.getAllPages()).toHaveLength(initialPages.length + 1);
}, 30_000);
