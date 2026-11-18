import { lifecycleScenarios } from "../lifecycle";
import { NAMESPACE_MUTATIONS, prepareNamespace } from "./namespaces";
import { CONTRACT_PUBLICATION } from "./publication/fixture";
import { preparePublication } from "./publication/cases";
import { COLLECTION_PUBLICATION } from "./publication/collection-fixture";
import { prepareCollectionPublication } from "./publication/collection-cases";
import { preparePublicationRead, PUBLICATION_READERS } from "./publication/read/contract";
import { prepareCollectionRead } from "./publication/read/collection";
import { registryReadScenarios } from "./catalogue-read/plan";
import type { CapabilityInventory } from "../../capabilities/types";

export function repositoryScenarios(inventory: CapabilityInventory, fixture: string) {
    const namespaces = lifecycleScenarios(
        inventory,
        fixture,
        "repository",
        "ulvia/repository",
        NAMESPACE_MUTATIONS,
        (environment, capability, obligation) =>
            prepareNamespace(inventory, environment, capability, obligation.binding),
    );
    const publications = lifecycleScenarios(
        inventory,
        fixture,
        "repository-publication",
        "ulvia/repository",
        CONTRACT_PUBLICATION,
        (environment, capability, obligation) =>
            preparePublication(inventory, environment, capability, obligation.binding),
    );
    const collections = lifecycleScenarios(
        inventory,
        fixture,
        "repository-collection",
        "ulvia/repository",
        COLLECTION_PUBLICATION,
        (environment, capability, obligation) =>
            prepareCollectionPublication(inventory, environment, capability, obligation.binding),
    );
    const readers = lifecycleScenarios(
        inventory,
        fixture,
        "repository-publication-read",
        "ulvia/repository",
        PUBLICATION_READERS,
        (environment, capability, obligation) =>
            preparePublicationRead(inventory, environment, capability, obligation.binding),
        ["invalidation"],
    );
    const collectionReaders = lifecycleScenarios(
        inventory,
        fixture,
        "repository-collection-read",
        "ulvia/repository",
        ["source-get", "publication-check-collection"],
        (environment, capability, obligation) =>
            prepareCollectionRead(inventory, environment, capability, obligation.binding),
        ["invalidation"],
    );
    return [
        ...namespaces,
        ...publications,
        ...collections,
        ...readers,
        ...collectionReaders,
        ...registryReadScenarios(inventory, fixture),
    ];
}
