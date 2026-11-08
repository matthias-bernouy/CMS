import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
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
    const profile = loaded.profiles.find(({ id }) => id === profileId)!;
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
