import { randomUUID } from "node:crypto";
import { authoredFixture } from "../../fixtures/authored";
import { requireRecord, assertCondition } from "../queries/types";
import { authoringCalls } from "./client";
import { operationCompletion } from "../../harness/clients/operation";
import type { ScenarioClient } from "../../harness/clients/session";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { AuthoredKind } from "../../fixtures/authored";

export const AUTHORING_ARTIFACTS = [
    "claim-namespace",
    "list-namespaces",
    "list-preparations",
    "get-connection",
    "prepare-collection",
    "prepare-contract",
    "prepare-workflow",
    "prepare-provider-manifest",
    "publish-collection",
    "publish-contract",
    "publish-workflow",
    "publish-provider-manifest",
    "publish-collection-operation",
    "get-publication-operation",
    "get-collection-sources",
    "get-contract-sources",
    "get-workflow-sources",
    "get-provider-manifest-sources",
    "get-source-snapshot",
    "discard-preparation",
] as const;

export async function authoringFixture(
    client: ScenarioClient,
    capability: string,
    implementation: ContractParentReference,
) {
    const calls = authoringCalls(client);
    const suffix = randomUUID().replaceAll("-", "");
    const namespace = capability === "claim-namespace" ? `performance-${suffix}` : "performance-authoring";
    const kind: AuthoredKind = capability.includes("workflow")
        ? "workflow"
        : capability.includes("provider-manifest")
          ? "provider-manifest"
          : capability.includes("contract")
            ? "contract"
            : "collection";
    const source = authoredFixture(kind, namespace, implementation, suffix);
    if (capability !== "claim-namespace") {
        const owned = requireRecord(await calls.fixture("claim-namespace", { namespace }));
        assertCondition(owned.namespace === namespace && owned.state === "active");
    }
    const needsPreparation =
        capability.startsWith("publish-") ||
        (capability.startsWith("get-") && !["get-connection"].includes(capability)) ||
        capability === "discard-preparation" ||
        capability === "list-preparations";
    const prepared = needsPreparation
        ? requireRecord(await calls.fixture(`prepare-${kind}`, { sourceJson: source.sourceJson }))
        : null;
    if (prepared) {
        assertCondition(
            prepared.valid === true && Array.isArray(prepared.diagnostics) && prepared.diagnostics.length === 0,
        );
    }
    const publication = prepared ? { preparationId: prepared.preparationId, expectedDigest: prepared.digest } : {};
    const sources = capability.endsWith("-sources") || capability === "get-source-snapshot";
    if (sources) {
        const published = requireRecord(await calls.fixture(`publish-${kind}`, publication));
        assertCondition(published.digest === prepared!.digest);
    }
    const complete = operationCompletion(client, "ulvia/cms.authoring", "get-publication-operation", (operationId) => ({
        ...publication,
        operationId,
    }));
    let operationId: string | undefined;
    if (capability === "get-publication-operation") {
        const result = await calls.call("publish-collection-operation", "http", publication, undefined, {
            complete: (id, signal, recordPoll) => {
                operationId = id;
                return complete(id, signal, recordPoll);
            },
        });
        assertCondition(result.observation.validated);
    }
    const input: Readonly<Record<string, unknown>> =
        capability === "claim-namespace"
            ? { namespace }
            : capability === "list-namespaces"
              ? { namespace, limit: 32 }
              : capability === "list-preparations"
                ? { limit: 8 }
                : capability.startsWith("prepare-")
                  ? { sourceJson: source.sourceJson }
                  : capability.startsWith("publish-")
                    ? publication
                    : capability === "discard-preparation"
                      ? { preparationId: prepared!.preparationId }
                      : capability === "get-publication-operation"
                        ? { ...publication, operationId }
                        : capability === "get-source-snapshot"
                          ? { namespace, id: source.id, kind, version: source.version }
                          : sources
                            ? {
                                  namespace,
                                  version: source.version,
                                  [`${kind === "provider-manifest" ? "provider" : kind}Id`]: source.id,
                              }
                            : {};
    return { ...calls, source, prepared, publication, input, complete };
}
