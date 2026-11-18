import { createHash } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { publicationCollection } from "../../repository/resources/collection";
import { registryCalls, registrySession } from "../../repository/client";
import { assertCondition, requireRecord } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { settingsTenants } from "../../content/settings/tenant";

async function collectionPublisher(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const namespace = `performance-${crypto.randomUUID().replaceAll("-", "")}`;
    const account = await repositoryApi(environment.registry.origin).signup(
        `${namespace}@performance.test`,
        `Fixture-${crypto.randomUUID()}!`,
    );
    const calls = registryCalls(
        scenarioClient(inventory, registrySession(environment.registry.origin, account.cookie)),
    );
    const ownership = await calls.fixture("namespace-claim", { namespace });
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    return async (name: string, version: string) => {
        const resource = await publicationCollection(namespace, implementation, [], {
            suffix: `case-${createHash("sha256").update(name).digest("hex").slice(0, 12)}`,
            version,
            configuration: {
                schema: {
                    type: "object",
                    properties: { title: { type: "string", maxLength: 64 } },
                    required: ["title"],
                },
                defaults: { title: "Default" },
            },
        });
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
        assertCondition(result.kind === "collection" && result.added === true && result.digest === resource.digest);
        return resource;
    };
}

/** At most 64 immutable artifacts per environment; all thirteen leased tenants can reuse each artifact once. */
export function collectionResources(inventory: CapabilityInventory) {
    const environments = new WeakMap<
        QueryEnvironment,
        {
            publish: ReturnType<typeof collectionPublisher>;
            resources: Map<string, Promise<Awaited<ReturnType<typeof publicationCollection>>>>;
        }
    >();
    return async (environment: QueryEnvironment, name: string, version = "1.0.0") => {
        let state = environments.get(environment);
        if (!state) {
            state = { publish: collectionPublisher(inventory, environment), resources: new Map() };
            environments.set(environment, state);
        }
        const key = JSON.stringify([name, version]);
        let resource = state.resources.get(key);
        if (!resource) {
            assertCondition(state.resources.size < 64);
            resource = state.publish.then((publish) => publish(name, version));
            state.resources.set(key, resource);
        }
        return resource;
    };
}

export async function collectionTarget(
    state: Pick<Awaited<ReturnType<ReturnType<typeof settingsTenants>>>["value"], "fixture">,
    resource: Awaited<ReturnType<typeof publicationCollection>>,
) {
    const catalogue = await state.fixture("list-collection-catalogue", { limit: 1 }, "ulvia/cms.installations");
    assertCondition(Array.isArray(catalogue.releases) && catalogue.releases.length === 1);
    const source = requireRecord(catalogue.releases[0]);
    const pin = {
        repositoryId: source.repositoryId,
        publisherId: resource.namespace,
        collectionId: resource.id,
        version: resource.version,
        digest: resource.digest,
    };
    const review = await state.fixture("get-collection-release", pin, "ulvia/cms.installations");
    assertCondition(review.digest === resource.digest && typeof review.browserRiskDigest === "string");
    return { ...pin, approvedBrowserRiskDigest: review.browserRiskDigest };
}
