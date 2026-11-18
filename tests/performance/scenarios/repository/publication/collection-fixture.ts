import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { operationCompletion } from "../../../harness/clients/operation";
import { registryCalls, registrySession } from "../client";
import { publicationCollection } from "../resources/collection";
import { assertCondition } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export const COLLECTION_PUBLICATION = [
    "source-get",
    "source-put",
    "publication-check-collection",
    "publication-build",
    "publication-build-status",
] as const;

/** Every sample owns its namespace, upload and durable operation, including concurrent samples. */
export async function collectionPublicationFixture(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    extraFiles: (namespace: string) => readonly Readonly<{ path: string; content: string }>[] = () => [],
) {
    const namespace = `performance-${randomUUID().replaceAll("-", "")}`;
    const account = await repositoryApi(environment.registry.origin).signup(
        `${namespace}@performance.test`,
        `Fixture-${randomUUID()}!`,
    );
    const session = registrySession(environment.registry.origin, account.cookie);
    const client = scenarioClient(inventory, session);
    const calls = registryCalls(client);
    const owned = await calls.fixture("namespace-claim", { namespace });
    const scope = { namespace, namespaceRevision: owned.revision };
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const resource = await publicationCollection(namespace, implementation, extraFiles(namespace));
    const coordinate = { kind: "collection", publisherId: namespace, id: resource.id, version: resource.version };
    const source = { ...scope, collectionId: resource.id, version: resource.version };
    const building = capability === "publication-build" || capability === "publication-build-status";
    const upload = await calls.fixture("publication-begin", {
        ...scope,
        manifest: resource.manifest,
    });
    const uploadScope = { ...scope, uploadId: upload.uploadId };
    for (const asset of resource.assets) {
        await calls.checked("publication-asset", {
            ...uploadScope,
            assetId: asset.id,
            bytes: asset.bytes,
            contentDigest: asset.digest,
        });
    }
    const complete = operationCompletion(client, "ulvia/repository", "publication-build-status", (operationId) => ({
        ...uploadScope,
        operationId,
    }));
    let operationId: string | undefined;
    if (!building) {
        const result = await calls.fixture("publication-commit", uploadScope);
        assertCondition(result.kind === "collection" && result.digest === resource.digest && result.added === true);
        if (capability === "source-get") {
            await calls.checked("source-put", {
                ...source,
                sourceJson: resource.sourceJson,
                releaseDigest: resource.digest,
            });
        }
    } else if (capability === "publication-build-status") {
        const completed = await calls.call("publication-build", "http", uploadScope, undefined, {
            complete: (id, signal, recordPoll) => {
                operationId = id;
                return complete(id, signal, recordPoll);
            },
        });
        assertCondition(completed.observation.validated);
    }
    const input =
        capability === "publication-build"
            ? uploadScope
            : capability === "publication-build-status"
              ? { ...uploadScope, operationId }
              : capability === "publication-check-collection"
                ? { ...scope, canonicalJson: resource.canonicalJson }
                : capability === "source-put"
                  ? { ...source, sourceJson: resource.sourceJson, releaseDigest: resource.digest }
                  : source;
    return { ...calls, session, resource, coordinate, source, uploadScope, complete, input, operationId };
}
