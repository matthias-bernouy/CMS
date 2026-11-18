import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { registryCalls, registrySession } from "../client";
import { publicationContract } from "../resources/contract";
import { assertCondition } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export const CONTRACT_PUBLICATION = [
    "publication-begin",
    "publication-asset",
    "publication-status",
    "publication-commit",
    "publication-abort",
    "publication-yank",
    "release-download",
    "asset-download",
    "artifact-source-put",
    "artifact-source-get",
    "source-read",
] as const;

/** A publisher owns exactly one new namespace, regardless of preceding scenario volume. */
export async function publicationFixture(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
) {
    const namespace = `performance-${randomUUID().replaceAll("-", "")}`;
    const api = repositoryApi(environment.registry.origin);
    const account = await api.signup(`${namespace}@performance.test`, `Fixture-${randomUUID()}!`);
    const client = scenarioClient(inventory, registrySession(environment.registry.origin, account.cookie));
    const calls = registryCalls(client);
    const owned = await calls.fixture("namespace-claim", { namespace });
    const scope = { namespace, namespaceRevision: owned.revision };
    const resource = await publicationContract(namespace);
    const coordinate = { kind: "contract", publisherId: namespace, id: resource.contractId, version: resource.version };
    const source = {
        ...scope,
        id: resource.contractId,
        version: resource.version,
        kind: "contract",
    };
    const upload =
        capability === "publication-begin"
            ? null
            : await calls.fixture("publication-begin", { ...scope, manifest: resource.manifest });
    const uploadScope = upload ? { ...scope, uploadId: upload.uploadId } : scope;
    const stagedOnly = ["publication-begin", "publication-asset", "publication-status", "publication-abort"].includes(
        capability,
    );
    if (upload && !stagedOnly) {
        await calls.checked("publication-asset", {
            ...uploadScope,
            assetId: resource.asset.id,
            bytes: resource.bytes,
            contentDigest: resource.asset.digest,
        });
    }
    const committed = !stagedOnly && capability !== "publication-commit";
    if (committed) {
        const result = await calls.fixture("publication-commit", uploadScope);
        assertCondition(result.kind === "contract" && result.digest === resource.digest && result.added === true);
    }
    if (["artifact-source-get", "source-read"].includes(capability)) {
        await calls.checked("artifact-source-put", {
            ...source,
            sourceJson: resource.sourceJson,
            releaseDigest: resource.digest,
        });
    }
    const input =
        capability === "publication-begin"
            ? { ...scope, manifest: resource.manifest }
            : capability === "publication-asset"
              ? {
                    ...uploadScope,
                    assetId: resource.asset.id,
                    bytes: resource.bytes,
                    contentDigest: resource.asset.digest,
                }
              : capability === "publication-yank"
                ? {
                      ...coordinate,
                      namespaceRevision: owned.revision,
                      expectedRevision: 0,
                      reason: "Performance fixture yank",
                  }
                : capability === "release-download"
                  ? coordinate
                  : capability === "asset-download"
                    ? { ...coordinate, assetId: resource.asset.id }
                    : capability === "artifact-source-put"
                      ? { ...source, sourceJson: resource.sourceJson, releaseDigest: resource.digest }
                      : capability === "artifact-source-get" || capability === "source-read"
                        ? source
                        : uploadScope;
    return { ...calls, resource, coordinate, scope, source, upload, uploadScope, input, committed };
}
