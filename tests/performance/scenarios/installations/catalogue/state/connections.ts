import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { operationCompletion } from "../../../../harness/clients/operation";
import { seedCatalogueConnections } from "./seed";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { MetadataResources } from "./resources";
import type { FixtureConnection } from "./seed";
import type { FreshTenant } from "../../fresh";
import type { QueryEnvironment } from "../../../queries/execute";
import type { CatalogueProvider } from "../resources/provider";

export async function metadataConnections(
    environment: QueryEnvironment,
    tenant: FreshTenant,
    resources: MetadataResources,
    repositoryId: string,
) {
    const core = await tenant.fixture("list-provider-installations");
    assertCondition(Array.isArray(core.installations) && core.installations.length > 0, "metadata-core-installations");
    const baseline = [];
    for (const raw of core.installations) {
        const row = requireRecord(raw);
        baseline.push(await tenant.fixture("get-provider-installation", { installationId: row.id }));
    }
    const original = await tenant.fixture("plan-contract-upgrade", { selections: core.selections });
    assertCondition(
        original.status === "applicable" && canonicalizeIJson(original.source) === canonicalizeIJson(core.selections),
        "metadata-original-selection-review",
    );
    let selections = original.source;
    let selectionRevision = Number(original.expectedRevision);
    const identities = new Map<number, { id: string; accountId: string; instanceId: string }>();
    const rows = new Map<number, FixtureConnection>();
    let failed = false;
    const guard = async <T>(action: () => Promise<T>) => {
        assertCondition(!failed, "metadata-connections-unknown-write-outcome");
        try {
            return await action();
        } catch (error) {
            failed = true;
            throw error;
        }
    };
    return {
        baseline,
        rows,
        get selections() {
            return selections;
        },
        get revision() {
            return selectionRevision;
        },
        connect: (providers: readonly CatalogueProvider[]) =>
            guard(async () => {
                const writes = [];
                for (const resource of providers) {
                    assertCondition(identities.size <= 64, "metadata-connections-identity-bound");
                    let identity = identities.get(resource.index);
                    if (!identity) {
                        identity = {
                            id: crypto.randomUUID(),
                            accountId: `performance-account-${resource.index}`,
                            instanceId: `instance:${crypto.randomUUID()}`,
                        };
                        identities.set(resource.index, identity);
                    }
                    const imported = await tenant.fixture("import-provider-manifest", {
                        repositoryId,
                        publisherId: resource.namespace,
                        id: resource.id,
                        version: resource.version,
                        digest: resource.digest,
                    });
                    assertCondition(
                        imported.id === resource.id && imported.digest === resource.digest,
                        "metadata-import-exact-provider",
                    );
                    writes.push({ resource, ...identity });
                }
                for (const saved of await seedCatalogueConnections(environment, tenant, writes)) {
                    const index = providers.find((resource) => resource.id === saved.providerId)!.index;
                    rows.set(index, saved);
                }
            }),
        select: () =>
            guard(async () => {
                const target = resources.latestContract();
                const connection = rows.get(0);
                assertCondition(connection && Array.isArray(selections), "metadata-selected-provider-required");
                const next = [
                    ...selections.filter((value) => requireRecord(value).contractId !== target.id),
                    {
                        contractId: target.id,
                        version: target.version,
                        digest: target.digest,
                        installationId: connection.id,
                    },
                ];
                const review = await tenant.fixture("plan-contract-upgrade", { selections: next });
                assertCondition(
                    review.status === "applicable",
                    `metadata-selection-review-${String(review.status)}-${
                        Array.isArray(review.issues)
                            ? review.issues
                                  .map((value) =>
                                      String(requireRecord(value).code)
                                          .replace(/[^a-z-]/gu, "")
                                          .slice(0, 32),
                                  )
                                  .slice(0, 8)
                                  .join("-")
                            : "unknown"
                    }`,
                );
                assertCondition(review.expectedRevision === selectionRevision, "metadata-selection-review-revision");
                assertCondition(
                    canonicalizeIJson(review.source) === canonicalizeIJson(selections),
                    "metadata-selection-review-source",
                );
                const completed = await tenant.client(
                    "ulvia/cms.installations",
                    "apply-contract-upgrade",
                    "http",
                    { selections: review.selections, grants: review.grants, planDigest: review.planDigest },
                    (output) => {
                        const result = requireRecord(output);
                        assertCondition(
                            result.status === "completed" && result.selectionRevision === selectionRevision + 1,
                            "metadata-selection-terminal",
                        );
                    },
                    {
                        complete: operationCompletion(
                            tenant.client,
                            "ulvia/cms.installations",
                            "get-operation",
                            (operationId) => ({ operationId }),
                        ),
                        idempotencyKey: crypto.randomUUID(),
                    },
                );
                assertCondition(completed.observation.validated, "metadata-selection-completed");
                selectionRevision++;
                selections = review.selections;
            }),
        toggle: () =>
            guard(async () => {
                const row = rows.get(1);
                assertCondition(row, "metadata-unselected-control-connection");
                const action = row.status === "enabled" ? "disable" : "enable";
                const changed = await tenant.fixture("set-provider-status", {
                    installationId: row.id,
                    expectedRevision: row.revision,
                    action,
                });
                assertCondition(
                    changed.installationId === row.id &&
                        changed.status === (action === "disable" ? "disabled" : "enabled") &&
                        changed.revision === row.revision + 1,
                    "metadata-connection-status-revision",
                );
                rows.set(1, {
                    ...row,
                    status: action === "disable" ? "disabled" : "enabled",
                    revision: row.revision + 1,
                });
            }),
    };
}

export type MetadataConnections = Awaited<ReturnType<typeof metadataConnections>>;
