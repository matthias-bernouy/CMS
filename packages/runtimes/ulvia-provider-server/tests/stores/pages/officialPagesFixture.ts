import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { repositoryFixture } from "../../provider-contracts/official/fixture";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { installOfficialCollections } from "../../../src/runtime/instances/instanceInitialization";
import { initialPagesFixture } from "./initialPagesFixture";
import {
    selectedCapabilityResolver,
    selectedPublicSvgCapabilityValidator,
} from "../../../src/runtime/stores/selections/capabilities";

/** The production installer and Content validators run against real bundled artifacts. */
export async function officialPagesFixture(profileId: string) {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);
    const base = loaded.profiles.find(({ id }) => id === profileId)!;
    const pins = (await fixture.collections.list()).filter(
        ({ collectionId }) => collectionId === "ulvia/mossa" || profileId === "repository",
    );
    const releases = await Promise.all(
        pins.map(async (pin) => parseCollectionRelease(await fixture.collections.getMetadata(pin))),
    );
    const profile = {
        ...base,
        collections: pins.map(({ publisherId, collectionId, version, digest }) => ({
            publisherId,
            collectionId,
            version,
            digest,
        })),
        initialPages: releases.flatMap((release) =>
            release.bootstraps!.flatMap((recipe) =>
                recipe.pages
                    .filter(
                        (page) =>
                            !(
                                profileId === "repository" &&
                                release.collectionId === "ulvia/mossa" &&
                                page.id === "login"
                            ),
                    )
                    .map((page) => ({ ...page, collectionId: release.collectionId })),
            ),
        ),
    };

    const store = new CollectionStore(new MemoryCollectionStorage(), fixture.catalogue);
    const selections = { get: async () => ({ plan: { selections: profile.contracts } }) };
    const repo = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), store, "default"),
        {
            resolveCapabilities: selectedCapabilityResolver("default", selections as never, fixture.catalogue),
            requireQueryCapabilityResolution: true,
            validateSvgCapabilities: selectedPublicSvgCapabilityValidator(
                "default",
                selections as never,
                fixture.catalogue,
            ),
            requireSvgCapabilityResolution: true,
        },
    );
    const { receipts, records } = initialPagesFixture();
    const composition = { stores: { repo, collections: store, db: { collection: () => receipts } } };
    const seed = () =>
        installOfficialCollections(composition as never, fixture.collections, profile, {
            throwIfLeaseLost: () => {},
        } as never);
    return { repo, store, profile, seed, records };
}
