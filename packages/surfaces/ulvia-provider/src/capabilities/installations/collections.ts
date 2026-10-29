import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsCollectionDependencies } from "../../ports";
import { projectUpgradePlan, projectUpgradeResult, projectSnapshot, projectInstalled } from "./projection";
import { collectionCommand, integer, parseConfiguration, requiredText, targets } from "./support";
import type { CollectionSources } from "./sources";
import { registerCollectionOperationCapabilities } from "./operations";

export function registerCollectionInstallationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsCollectionDependencies,
    operations?: ProviderOperationExecutor,
    sources?: CollectionSources,
): void {
    registerCollectionOperationCapabilities(dispatcher, operations);
    dispatcher.register("ulvia.cms.installations", "list-collection-installations", async (_input, context) => {
        return dependencies.collections.listInstalled(context.siteId);
    });
    dispatcher.register("ulvia.cms.installations", "list-site-usage", async (input, context) =>
        collectionCommand(async () => {
            const inventory = await dependencies.collectionUpgrades.inventory(context.siteId);
            const cursor = input.cursor === undefined ? "" : requiredText(input.cursor);
            const parts = cursor.split(":");
            const offset = cursor ? Number(parts.pop()) : 0;
            if (
                cursor &&
                (parts.join(":") !== inventory.digest ||
                    !Number.isSafeInteger(offset) ||
                    offset < 0 ||
                    offset > inventory.references.length)
            ) {
                throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
            }
            const limit = input.limit === undefined ? 100 : integer(input.limit);
            if (limit < 1 || limit > 500) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const next = offset + limit;
            return {
                complete: inventory.complete,
                digest: inventory.digest,
                unknown: inventory.unknown.slice(0, 1024),
                unknownCount: inventory.unknown.length,
                total: inventory.references.length,
                references: inventory.references.slice(offset, next),
                ...(next < inventory.references.length ? { cursor: `${inventory.digest}:${next}` } : {}),
            };
        }),
    );
    dispatcher.register("ulvia.cms.installations", "get-collection-installation", async (input, context) => {
        const installed = await dependencies.collections.readInstalled(
            context.siteId,
            requiredText(input.collectionId),
        );
        if (!installed) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectInstalled(installed.collection, installed.revision, true);
    });
    dispatcher.register("ulvia.cms.installations", "list-available-collections", async (_input, context) => {
        if (!sources) {
            return {
                revision: await dependencies.collections.revision(context.siteId),
                repositories: [],
                releases: [],
                installed: [],
            };
        }
        return sources.catalogue(context.siteId);
    });
    dispatcher.register("ulvia.cms.installations", "install-collection", async (input, context) =>
        collectionCommand(async () => {
            const expectedRevision = integer(input.expectedRevision);
            const before = await dependencies.collections.listInstalled(context.siteId);
            assertRevision(before.revision, expectedRevision);
            const staged = await collectionTargets(input.targets, sources);
            const installed = new Set(before.items.map(({ collectionId }) => collectionId));
            for (const target of staged) {
                const artifact = await dependencies.collections.getRelease(target.digest);
                if (artifact && installed.has(artifact.release.collectionId)) {
                    throw new ProviderCapabilityDispatchError("INVALID_STATE", 409);
                }
            }
            const snapshot = await dependencies.collections.installMany(context.siteId, staged, expectedRevision);
            return projectSnapshot(snapshot);
        }),
    );
    dispatcher.register("ulvia.cms.installations", "update-collection-configuration", async (input, context) =>
        collectionCommand(async () => {
            const snapshot = await dependencies.collections.saveConfiguration(
                context.siteId,
                requiredText(input.collectionId),
                integer(input.expectedRevision),
                parseConfiguration(input.configurationJson),
            );
            return projectSnapshot(snapshot);
        }),
    );
    dispatcher.register("ulvia.cms.installations", "plan-collection-upgrade", async (input, context) =>
        collectionCommand(async () => {
            const prepared = await sources?.prepare(input.targets);
            const staged = await collectionTargets(
                input.targets,
                sources,
                prepared?.map(({ target }) => target),
            );
            return projectUpgradePlan(
                await dependencies.collectionUpgrades.plan(
                    context.siteId,
                    staged,
                    prepared?.map(({ artifact }) => artifact),
                ),
                structuredClone(input.targets),
            );
        }),
    );
    dispatcher.register("ulvia.cms.installations", "get-site-upgrade-status", async (_input, context) => {
        const active = await dependencies.collectionUpgrades.storage.getActive(context.siteId);
        return {
            maintenance: active !== null,
            ...(active
                ? {
                      activeUpgrade: {
                          id: active.id,
                          kind: active.kind,
                          status: active.status,
                          createdAt: active.createdAt,
                      },
                  }
                : {}),
        };
    });
    dispatcher.register("ulvia.cms.installations", "get-collection-upgrade", async (input, context) => {
        const intent = await dependencies.collectionUpgrades.storage.get(
            context.siteId,
            requiredText(input.upgradeId),
            "collection",
        );
        if (!intent) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectUpgradeResult(intent);
    });
    registerUpgradeOperation(dispatcher, operations, "apply-collection-upgrade", async (input, context) =>
        collectionCommand(async () =>
            projectUpgradeResult(
                await dependencies.collectionUpgrades.apply(
                    context.siteId,
                    await collectionTargets(input.targets, sources),
                    requiredText(input.planDigest),
                ),
            ),
        ),
    );
    registerUpgradeOperation(dispatcher, operations, "resume-collection-upgrade", async (input, context) =>
        collectionCommand(async () =>
            projectUpgradeResult(
                await dependencies.collectionUpgrades.resume(context.siteId, requiredText(input.upgradeId)),
            ),
        ),
    );
}

async function collectionTargets(
    value: unknown,
    sources?: CollectionSources,
    prepared?: readonly { digest: string; repositoryId: string }[],
) {
    const staged = prepared ?? (sources ? await sources.stage(value) : targets(value));
    return staged.map((target, index) => {
        const input = (value as Record<string, unknown>[])[index]!;
        return {
            ...target,
            ...(input.configurationJson === undefined
                ? {}
                : { configuration: parseConfiguration(input.configurationJson) as Record<string, unknown> }),
            ...(input.textOverridesJson === undefined
                ? {}
                : {
                      textOverrides: parseConfiguration(input.textOverridesJson) as Record<
                          string,
                          Record<string, string>
                      >,
                  }),
        };
    });
}

function assertRevision(actual: number, expected: number): void {
    if (actual !== expected) {
        throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
    }
}

function registerUpgradeOperation(
    dispatcher: ProviderCapabilityRegistry,
    operations: ProviderOperationExecutor | undefined,
    capabilityId: string,
    handler: Parameters<ProviderOperationExecutor["register"]>[2],
): void {
    if (!operations) {
        return;
    }
    operations.register("ulvia.cms.installations", capabilityId, handler);
    dispatcher.register("ulvia.cms.installations", capabilityId, (input, context) =>
        operations.enqueue("ulvia.cms.installations", capabilityId, input, context),
    );
}
