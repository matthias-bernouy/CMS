import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../../harness/clients/session";
import { registryCalls, registrySession } from "../../../repository/client";
import { publicationCollection } from "../../../repository/resources/collection";
import { assertCondition } from "../../../queries/types";
import { exampleSources } from "./source";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

export type ExampleProfile = "large" | "history" | "invalidation";
export type ExampleResource = Awaited<ReturnType<typeof publicationCollection>>;

async function publisher(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const namespace = `performance-${randomUUID().replaceAll("-", "")}`;
    const account = await repositoryApi(environment.registry.origin).signup(
        `${namespace}@performance.test`,
        `Fixture-${randomUUID()}!`,
    );
    const calls = registryCalls(
        scenarioClient(inventory, registrySession(environment.registry.origin, account.cookie)),
    );
    const ownership = await calls.fixture("namespace-claim", { namespace });
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    return async (profile: ExampleProfile, patch: number) => {
        const suffix = `examples-${profile}`;
        const id = `${namespace}/fixture-collection-${suffix}`;
        const resource = await publicationCollection(namespace, implementation, exampleSources(id, `1.0.${patch}`), {
            suffix,
            version: `1.0.${patch}`,
        });
        assertCondition(resource.id === id && resource.release.examples?.length === 65, "example-admitted-source");
        const scope = { namespace, namespaceRevision: ownership.revision };
        const upload = await calls.fixture("publication-begin", { ...scope, manifest: resource.manifest });
        const input = { ...scope, uploadId: upload.uploadId };
        for (const asset of resource.assets) {
            await calls.checked("publication-asset", {
                ...input,
                assetId: asset.id,
                bytes: asset.bytes,
                contentDigest: asset.digest,
            });
        }
        const result = await calls.fixture("publication-commit", input);
        assertCondition(result.added === true && result.digest === resource.digest, "example-publication-receipt");
        return resource;
    };
}

/** One bounded publisher supplies at most 21 immutable releases, shared across the two bindings. */
export function exampleResources(inventory: CapabilityInventory, createPublisher = publisher) {
    const environments = new WeakMap<
        QueryEnvironment,
        {
            publish: ReturnType<typeof publisher>;
            resources: Map<string, Promise<ExampleResource>>;
        }
    >();
    return (environment: QueryEnvironment, profile: ExampleProfile, patch: number) => {
        assertCondition(
            Number.isSafeInteger(patch) &&
                patch >= 0 &&
                patch <= (profile === "large" ? 0 : profile === "history" ? 8 : 10),
            "example-resource-version-bound",
        );
        let state = environments.get(environment);
        if (!state) {
            state = { publish: createPublisher(inventory, environment), resources: new Map() };
            environments.set(environment, state);
        }
        const key = `${profile}:${patch}`;
        let resource = state.resources.get(key);
        if (!resource) {
            assertCondition(state.resources.size < 21, "example-resource-count-bound");
            resource = state.publish.then((publish) => publish(profile, patch));
            state.resources.set(key, resource);
        }
        return resource;
    };
}
