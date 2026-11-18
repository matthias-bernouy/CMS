import { lifecycleScenarios } from "../lifecycle";
import { sampleCollectionResources } from "./resources/samples";
import { prepareCollectionMutation, COLLECTION_MUTATIONS } from "./collections";
import { prepareRepositoryConfiguration, prepareRepositoryCreation } from "./repository";
import { freshTenants } from "./fresh";
import { initializationActions } from "../initialization/actions/plan";
import { contractUpgradeScenarios } from "./upgrades/plan";
import { collectionUpgradeScenarios } from "./collection-upgrades/plan";
import { installationReadScenarios } from "./read/plan";
import { metadataCatalogueScenarios } from "./catalogue/plan";
import { siteDiscoveryScenarios } from "./read/discovery/plan";
import { usageReaderScenarios } from "./read/collections/read/usage/plan";
import { operationReaderScenarios } from "./read/collections/operations/plan";
import { collectionReadContexts } from "./read/collections/context";
import { collectionReaderScenarios } from "./read/collections/plan";
import type { CapabilityInventory } from "../../capabilities/types";
import type { settingsTenants } from "../content/settings/tenant";

export function installationScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    const readerContexts = collectionReadContexts(inventory);
    const resources = sampleCollectionResources(inventory);
    const fresh = freshTenants(inventory);
    const collections = lifecycleScenarios(
        inventory,
        fixture,
        "installation-collections",
        "ulvia/cms.installations",
        COLLECTION_MUTATIONS,
        async (environment, capability, obligation, sampleIndex) => {
            const resource = await resources(
                environment,
                `${capability}-${obligation.binding}-${obligation.variant}`,
                sampleIndex,
            );
            return prepareCollectionMutation(
                await lease(environment),
                environment,
                resource,
                capability,
                obligation.binding,
            );
        },
    );
    const repository = lifecycleScenarios(
        inventory,
        fixture,
        "installation-repository",
        "ulvia/cms.installations",
        ["initialization.repository.configure"],
        async (environment, _capability, obligation) =>
            prepareRepositoryConfiguration(await lease(environment), environment, obligation.binding),
    );
    const creation = lifecycleScenarios(
        inventory,
        fixture,
        "installation-repository",
        "ulvia/cms.installations",
        ["initialization.repository.create"],
        async (environment, _capability, obligation) =>
            prepareRepositoryCreation(
                await fresh(environment, obligation.binding, false),
                environment,
                obligation.binding,
            ),
    );
    return [
        ...collections,
        ...repository,
        ...contractUpgradeScenarios(inventory, fixture, lease),
        ...collectionUpgradeScenarios(inventory, fixture, lease),
        ...creation,
        ...initializationActions(inventory, fixture, fresh),
        ...installationReadScenarios(inventory, fixture, lease),
        ...collectionReaderScenarios(inventory, fixture, readerContexts),
        ...operationReaderScenarios(inventory, fixture, readerContexts),
        ...usageReaderScenarios(inventory, fixture, readerContexts),
        ...siteDiscoveryScenarios(inventory, fixture),
        ...metadataCatalogueScenarios(inventory, fixture),
    ];
}
