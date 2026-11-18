import { operationCompletion } from "../../../../../harness/clients/operation";
import { collectionMetadata, collectionPin } from "../resources/expected";
import { assertCondition, requireRecord } from "../../../../queries/types";
import type { CollectionReadResource } from "../resources/collection";
import type { CollectionReadState, CollectionCorpusRegistry } from "./types";
import type { FreshTenant } from "../../../fresh";

export function collectionReadState(
    options: Readonly<{
        tenant: FreshTenant;
        registry: CollectionCorpusRegistry;
        repositoryId: string;
        namespace: string;
        namespaceRevision: number;
        revision: number;
        create(index: number, patch: number): Promise<CollectionReadResource>;
    }>,
): CollectionReadState {
    const { tenant, registry, repositoryId, namespace } = options;
    const installed = new Map<string, CollectionReadResource>();
    const resources: CollectionReadResource[] = [];
    const upgrades: CollectionReadState["upgrades"] = [];
    let revision = options.revision;
    let title = "Default";
    let failedWrite = false;
    const write = async (action: () => Promise<void>) => {
        assertCondition(!failedWrite, "collection-read-unknown-write-outcome");
        try {
            await action();
        } catch (error) {
            failedWrite = true;
            throw error;
        }
    };
    const target = (resource: CollectionReadResource) => ({
        ...collectionPin(resource, repositoryId),
        approvedBrowserRiskDigest: collectionMetadata(resource, repositoryId).browserRiskDigest,
    });
    return {
        tenant,
        registry,
        repositoryId,
        namespace,
        installed,
        resources,
        upgrades,
        revision: () => revision,
        title: () => title,
        create: options.create,
        async publish(resource) {
            assertCondition(
                resources.length < 128 && resource.namespace === namespace,
                "collection-read-owned-publication-bound",
            );
            await write(async () => {
                await registry.publish(resource, options.namespaceRevision);
                resources.push(resource);
            });
        },
        async install(rows) {
            assertCondition(
                rows.length > 0 && installed.size + rows.length <= 64 && rows.every((row) => !installed.has(row.id)),
                "collection-read-installation-bound",
            );
            await write(async () => {
                const result = await tenant.fixture("install-collections", {
                    expectedRevision: revision,
                    targets: rows.map(target),
                });
                assertCondition(
                    result.revision === revision + 1 &&
                        Array.isArray(result.items) &&
                        result.items.length === installed.size + rows.length,
                    "collection-read-installed-revision",
                );
                revision++;
                for (const resource of rows) {
                    installed.set(resource.id, resource);
                }
            });
        },
        async upgrade(resource) {
            assertCondition(installed.has(resource.id), "collection-read-upgrade-installed");
            await write(async () => {
                const targets = [target(resource)];
                const review = await tenant.fixture("plan-collection-upgrade", { targets });
                assertCondition(
                    review.status === "applicable" &&
                        review.expectedRevision === revision &&
                        review.issueCount === 0 &&
                        typeof review.planDigest === "string",
                    "collection-read-upgrade-review",
                );
                let operationId: string | undefined;
                const poll = operationCompletion(tenant.client, "ulvia/cms.installations", "get-operation", (id) => ({
                    operationId: id,
                }));
                const result = await tenant.client(
                    "ulvia/cms.installations",
                    "apply-collection-upgrade",
                    "http",
                    { targets, planDigest: review.planDigest },
                    (output) => {
                        const row = requireRecord(output);
                        assertCondition(
                            row.status === "completed" &&
                                row.collectionRevision === revision + 1 &&
                                typeof row.upgradeId === "string" &&
                                /^sha256:[a-f0-9]{64}$/u.test(row.upgradeId),
                            "collection-read-upgrade-terminal",
                        );
                    },
                    {
                        complete: (id, signal, record) => {
                            operationId = id;
                            return poll(id, signal, record);
                        },
                        idempotencyKey: crypto.randomUUID(),
                    },
                );
                assertCondition(result.observation.validated && operationId, "collection-read-upgrade-validated");
                const upgradeId = String(requireRecord(result.output).upgradeId);
                const durable = await tenant.fixture("get-collection-upgrade", { upgradeId });
                assertCondition(
                    durable.status === "completed" &&
                        durable.upgradeId === upgradeId &&
                        durable.collectionRevision === revision + 1,
                    "collection-read-upgrade-durable-history",
                );
                revision++;
                installed.set(resource.id, resource);
                upgrades.push({ upgradeId, operationId, revision });
            });
        },
        async configure(value) {
            assertCondition(
                installed.size > 0 && installed.size <= 64 && value.length <= 64,
                "collection-read-configuration-scope",
            );
            await write(async () => {
                const resource = [...installed.values()][0]!;
                const result = await tenant.fixture("update-collection-configuration", {
                    collectionId: resource.id,
                    expectedRevision: revision,
                    configurationJson: JSON.stringify({ title: value }),
                });
                assertCondition(result.revision === revision + 1, "collection-read-configuration-revision");
                revision++;
                title = value;
            });
        },
        close: tenant.close,
    };
}
