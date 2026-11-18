import { freshTenants } from "../../fresh";
import { collectionCorpusCache } from "../../read/collections/context";
import { createCollectionRegistry } from "../../read/collections/context/registry";
import { prepareCollectionTenant } from "../../read/collections/context/tenant";
import { collectionFixtureStage } from "../../read/collections/context/stage";
import { metadataResources } from "./resources";
import { metadataConnections } from "./connections";
import { initializeMetadataProfile } from "./profile";
import { assertCondition } from "../../../queries/types";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

/** Three bounded profile tenants and one Registry serve every metadata-reader family. */
export function metadataContexts(inventory: CapabilityInventory) {
    const fresh = freshTenants(inventory);
    const registries = new WeakMap<QueryEnvironment, ReturnType<typeof createCollectionRegistry>>();
    return collectionCorpusCache(async (environment, profile) => {
        let pending = registries.get(environment);
        if (!pending) {
            pending = collectionFixtureStage("metadata-registry", () =>
                createCollectionRegistry(inventory, environment, fresh),
            );
            registries.set(environment, pending);
        }
        const registry = await pending;
        const ownership = await collectionFixtureStage("metadata-namespace", () => registry.claim());
        const tenant = await collectionFixtureStage("metadata-tenant", () => fresh(environment, "http"));
        try {
            const ready = await collectionFixtureStage("metadata-tenant-ready", () =>
                prepareCollectionTenant(inventory, tenant, registry.origin),
            );
            const resources = metadataResources(registry.calls, ownership.namespace, ownership.revision);
            const connections = await collectionFixtureStage("metadata-connections", () =>
                metadataConnections(environment, ready.tenant, resources, ready.repositoryId),
            );
            await collectionFixtureStage(`metadata-${profile}`, () =>
                initializeMetadataProfile(resources, connections, profile),
            );
            let failed = false;
            const write = async (task: () => Promise<void>) => {
                assertCondition(!failed, "metadata-context-unknown-write-outcome");
                try {
                    await task();
                } catch (error) {
                    failed = true;
                    throw error;
                }
            };
            return {
                environment,
                tenant: ready.tenant,
                resources,
                connections,
                repositoryId: ready.repositoryId,
                mutateDocumentation: () =>
                    write(async () => {
                        await resources.contract(resources.contracts.length);
                        const next = await resources.provider(0, resources.nextProviderPatch());
                        await connections.connect([next]);
                        await connections.select();
                    }),
                mutateCatalogue: () =>
                    write(async () => {
                        await resources.provider(0, resources.nextProviderPatch());
                    }),
                mutateStatus: () =>
                    write(async () => {
                        await connections.toggle();
                    }),
                refreshSelectedObservation: () =>
                    write(async () => {
                        const row = connections.rows.get(0)!;
                        const selected = resources.providers.find(
                            (resource) => resource.index === 0 && resource.version === row.manifestVersion,
                        )!;
                        await connections.connect([selected]);
                    }),
            };
        } catch (error) {
            await tenant.close();
            throw error;
        }
    });
}

export type MetadataContext = Awaited<ReturnType<ReturnType<typeof metadataContexts>>>;
