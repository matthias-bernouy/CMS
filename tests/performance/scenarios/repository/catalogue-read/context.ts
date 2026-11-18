import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { registryCalls, registrySession, registryClient } from "../client";
import { assertCondition } from "../../queries/types";
import { publicResourceFactory } from "./metadata/factory";
import { registryDiscoveryState } from "./metadata/state";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

/** Only immutable large/history corpora are shared; invalidation always owns fresh coordinates. */
export function discoveryContexts<T>(
    create: (environment: QueryEnvironment, profile: string, bootstrap: boolean) => Promise<T>,
) {
    const states = new WeakMap<QueryEnvironment, Map<string, Promise<T>>>();
    return (environment: QueryEnvironment, profile: string, bootstrap = false) => {
        assertCondition(
            ["large", "history", "invalidation"].includes(profile) && (!bootstrap || profile === "invalidation"),
            "registry-discovery-context-profile",
        );
        if (profile === "invalidation") {
            return Promise.resolve().then(() => create(environment, profile, bootstrap));
        }
        let cache = states.get(environment);
        if (!cache) {
            cache = new Map();
            states.set(environment, cache);
        }
        let value = cache.get(profile);
        if (!value) {
            value = Promise.resolve().then(() => create(environment, profile, false));
            cache.set(profile, value);
        }
        return value;
    };
}

export function registryReadContexts(inventory: CapabilityInventory) {
    const accounts = new WeakMap<
        QueryEnvironment,
        { actor: ReturnType<ReturnType<typeof repositoryApi>["signup"]>; namespaces: number }
    >();
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    return discoveryContexts(async (environment, profile, bootstrap) => {
        let publisher = accounts.get(environment);
        if (!publisher) {
            const suffix = randomUUID();
            publisher = {
                actor: repositoryApi(environment.registry.origin).signup(
                    `performance-discovery-${suffix}@performance.test`,
                    `Fixture-${randomUUID()}!`,
                ),
                namespaces: 0,
            };
            accounts.set(environment, publisher);
        }
        assertCondition(publisher.namespaces < 6, "registry-discovery-namespace-bound");
        publisher.namespaces++;
        const actor = await publisher.actor;
        const session = registrySession(environment.registry.origin, actor.cookie);
        const owner = registryCalls(scenarioClient(inventory, session));
        const read = registryCalls(scenarioClient(inventory, registrySession(environment.registry.origin, "")));
        const foreign = registryCalls(registryClient(inventory, environment));
        const namespace = `${bootstrap ? "a000-performance" : "performance"}-discovery-${randomUUID().replaceAll("-", "")}`;
        const claimed = await owner.fixture("namespace-claim", { namespace });
        assertCondition(claimed.namespace === namespace && claimed.state === "active", "registry-discovery-claim");
        const state = registryDiscoveryState(
            namespace,
            claimed.revision,
            owner,
            read,
            await publicResourceFactory(namespace, implementation, bootstrap),
            bootstrap ? ["collection"] : ["collection", "contract", "provider-manifest"],
        );
        await state.initialize(profile);
        return { state, owner, read, foreign, session, claimed };
    });
}

export type RegistryReadContext = Awaited<ReturnType<ReturnType<typeof registryReadContexts>>>;
