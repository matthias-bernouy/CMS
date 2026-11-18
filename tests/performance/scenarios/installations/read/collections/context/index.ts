import { freshTenants } from "../../../fresh";
import { createCollectionRegistry } from "./registry";
import { prepareCollectionTenant } from "./tenant";
import { collectionReadState } from "./state";
import { prepareCollectionCorpus } from "./corpus";
import { collectionReadResource } from "../resources/collection";
import { assertCondition } from "../../../../queries/types";
import { collectionFixtureStage } from "./stage";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";

/** Three profile entries per exact environment; failed writes are never implicitly retried. */
export function collectionCorpusCache<T>(create: (environment: QueryEnvironment, profile: string) => Promise<T>) {
    const profiles = new WeakMap<QueryEnvironment, Map<string, Promise<T>>>();
    return (environment: QueryEnvironment, profile: string) => {
        assertCondition(["large", "history", "invalidation"].includes(profile), "collection-read-context-profile");
        let entries = profiles.get(environment);
        if (!entries) {
            entries = new Map();
            profiles.set(environment, entries);
        }
        let value = entries.get(profile);
        if (!value) {
            value = Promise.resolve().then(() => create(environment, profile));
            entries.set(profile, value);
        }
        return value;
    };
}

/** One tracked tenant per profile shares bounded state across readers; the owned stack removes all three. */
export function collectionReadContexts(inventory: CapabilityInventory, prepareCorpus = prepareCollectionCorpus) {
    const fresh = freshTenants(inventory);
    const registries = new WeakMap<QueryEnvironment, ReturnType<typeof createCollectionRegistry>>();
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const create = async (environment: QueryEnvironment, profile: string) => {
        let pending = registries.get(environment);
        if (!pending) {
            pending = collectionFixtureStage("registry", () => createCollectionRegistry(inventory, environment, fresh));
            registries.set(environment, pending);
        }
        const registry = await pending;
        const ownership = await collectionFixtureStage("namespace", () => registry.claim());
        const tenant = await collectionFixtureStage("tenant", () => fresh(environment, "http"));
        try {
            const ready = await collectionFixtureStage("tenant-ready", () =>
                prepareCollectionTenant(inventory, tenant, registry.origin),
            );
            const state = collectionReadState({
                registry,
                ...ready,
                namespace: ownership.namespace,
                namespaceRevision: ownership.revision,
                create: (index, patch) =>
                    collectionReadResource(
                        ownership.namespace,
                        implementation,
                        index,
                        patch,
                        profile === "large" && index === 0,
                    ),
            });
            await collectionFixtureStage(`corpus-${profile}`, () => prepareCorpus(state, profile));
            return state;
        } catch (error) {
            await tenant.close();
            throw error;
        }
    };
    return collectionCorpusCache(create);
}
