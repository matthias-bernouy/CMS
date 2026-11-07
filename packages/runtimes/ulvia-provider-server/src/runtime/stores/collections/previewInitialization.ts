import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import type { ContentRepository } from "@bernouy/cms-content";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import {
    CollectionStore,
    MemoryCollectionStorage,
    applyInitializationPages,
} from "@bernouy/cms-repository/collections/installations";
import type { InitializationServiceOptions } from "@bernouy/cms-repository/collections/installations";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { selectedCapabilityResolver, selectedPublicSvgCapabilityValidator } from "../selections/capabilities";

/** Disposable adapters reproduce the actual Content validation before any durable business write. */
export function previewInitialization(
    repository: ContentRepository,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
): InitializationServiceOptions["validateCandidate"] {
    return async (plan, artifacts) => {
        const collections = new CollectionStore(new MemoryCollectionStorage());
        for (const artifact of artifacts) {
            await collections.importAdmittedRelease(artifact);
        }
        if (artifacts.length) {
            await collections.installMany(
                "default",
                artifacts.map(({ digest }) => ({ digest })),
                0,
            );
        }
        const inner = new InMemoryContentRepository();
        await inner.updateSystem(await repository.getSystem(), await inner.getSystemRevision());
        const preview = new ValidatingContentRepository(withInstalledCollections(inner, collections, "default"), {
            resolveCapabilities: selectedCapabilityResolver("default", selections, releases),
            requireQueryCapabilityResolution: true,
            validateSvgCapabilities: selectedPublicSvgCapabilityValidator("default", selections, releases),
            requireSvgCapabilityResolution: true,
        });
        await applyInitializationPages(
            preview,
            plan,
            artifacts.map(({ release }) => release),
            {
                pageIds: {},
                completedPages: [],
                checkpoint: async () => {},
                assertLease: async () => {},
            },
        );
    };
}
