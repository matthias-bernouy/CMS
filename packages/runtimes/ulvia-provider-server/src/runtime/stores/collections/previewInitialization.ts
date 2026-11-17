import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import type { ContentRepository } from "@bernouy/content";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import {
    CollectionStore,
    MemoryCollectionStorage,
    applyInitializationPages,
} from "@bernouy/repository/collections/installations";
import type { InitializationServiceOptions } from "@bernouy/repository/collections/installations";
import type { ContractSelectionStore } from "@bernouy/repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { previewCapabilities } from "./preview/capabilities";
import { previewRepository } from "./preview/repository";

/** Disposable adapters reproduce the actual Content validation before any durable business write. */
export function previewInitialization(
    repository: ContentRepository,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
): InitializationServiceOptions["validateCandidate"] {
    return async (plan, artifacts, _execution, context) => {
        const collections = new CollectionStore(
            new MemoryCollectionStorage(undefined, context.verifier),
            undefined,
            context.validateResources,
        );
        for (const artifact of artifacts) {
            context.signal.throwIfAborted();
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
        const preview = new ValidatingContentRepository(
            previewRepository(withInstalledCollections(inner, collections, "default")),
            {
                ...previewCapabilities(selections, releases),
                requireQueryCapabilityResolution: true,
                requireSvgCapabilityResolution: true,
            },
        );
        await applyInitializationPages(
            preview,
            plan,
            artifacts.map(({ release }) => release),
            {
                pageIds: {},
                completedPages: [],
                checkpoint: async () => {},
                assertLease: async () => {
                    context.signal.throwIfAborted();
                },
            },
        );
    };
}
