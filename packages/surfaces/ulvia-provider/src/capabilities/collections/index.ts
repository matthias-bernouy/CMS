import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsCollectionDependencies } from "../../ports";
import { projectMigrationPlan, projectMigrationResult, projectSnapshot, projectInstalled } from "./projection";
import { collectionCommand, integer, parseConfiguration, requiredText, targets } from "./support";
import type { CollectionSources } from "./sources";
import { registerCollectionOperationCapabilities } from "./operations";

export function registerCollectionCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsCollectionDependencies,
    operations?: ProviderOperationExecutor,
    sources?: CollectionSources,
): void {
    registerCollectionOperationCapabilities(dispatcher, operations);
    dispatcher.register("ulvia.cms.collections", "list", async (_input, context) => {
        const snapshot = await dependencies.collections.snapshot(context.siteId);
        return projectSnapshot(snapshot);
    });
    dispatcher.register("ulvia.cms.collections", "get", async (input, context) => {
        const snapshot = await dependencies.collections.snapshot(context.siteId);
        const collection = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId);
        if (!collection) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectInstalled(collection, snapshot.revision, true);
    });
    dispatcher.register("ulvia.cms.collections", "catalogue", async (_input, context) => {
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
    dispatcher.register("ulvia.cms.collections", "install", async (input, context) =>
        collectionCommand(async () => {
            const expectedRevision = integer(input.expectedRevision);
            const before = await dependencies.collections.snapshot(context.siteId);
            assertRevision(before.revision, expectedRevision);
            const staged = await collectionTargets(input.targets, sources);
            const installed = new Set(before.collections.map(({ collectionId }) => collectionId));
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
    dispatcher.register("ulvia.cms.collections", "upgrade", async (input, context) => {
        const expectedRevision = integer(input.expectedRevision);
        const before = await dependencies.collections.snapshot(context.siteId);
        assertRevision(before.revision, expectedRevision);
        const [target] = await collectionTargets([input.target], sources);
        if (!target) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const artifact = await dependencies.collections.getRelease(target.digest);
        const current = artifact
            ? before.collections.find(({ collectionId }) => collectionId === artifact.release.collectionId)
            : undefined;
        if (!artifact || !current) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if ((current.release.dataGeneration ?? 1) !== (artifact.release.dataGeneration ?? 1)) {
            throw new ProviderCapabilityDispatchError("MIGRATION_REQUIRED", 409);
        }
        try {
            return projectSnapshot(
                await dependencies.collections.upgrade(
                    context.siteId,
                    target.digest,
                    expectedRevision,
                    target.repositoryId ?? "",
                ),
            );
        } catch (error) {
            if (await revisionChanged(dependencies, context.siteId, expectedRevision)) {
                throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
            }
            const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
            if (status === 409) {
                throw new ProviderCapabilityDispatchError("INVALID_STATE", 409);
            }
            throw error;
        }
    });
    dispatcher.register("ulvia.cms.collections", "update-configuration", async (input, context) =>
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
    dispatcher.register("ulvia.cms.collections", "plan-migration", async (input, context) =>
        collectionCommand(async () => {
            const references = structuredClone(input.targets);
            return projectMigrationPlan(
                await dependencies.collectionMigrations.plan(
                    context.siteId,
                    await collectionTargets(input.targets, sources),
                    await dependencies.collections.revision(context.siteId),
                ),
                references,
            );
        }),
    );
    dispatcher.register("ulvia.cms.collections", "migration-status", async (input, context) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 20;
        const [active, audits] = await Promise.all([
            dependencies.collectionMigrations.getActive(context.siteId),
            dependencies.collectionMigrations.listAudits(context.siteId, limit),
        ]);
        return {
            maintenance: active !== null,
            ...(active
                ? { activeMigration: { id: active.id, status: active.status, updatedAt: active.updatedAt } }
                : {}),
            migrations: audits.map(({ id, status, createdAt, updatedAt, totalPages, operationCount }) => ({
                id,
                status,
                createdAt,
                updatedAt,
                totalPages,
                operationCount,
            })),
        };
    });
    dispatcher.register("ulvia.cms.collections", "get-migration", async (input, context) => {
        const progress = await dependencies.collectionMigrations.getProgress(
            context.siteId,
            requiredText(input.migrationId),
        );
        if (!progress) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return progress;
    });
    registerMigrationOperation(dispatcher, operations, "apply-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationResult(
                await dependencies.collectionMigrations.execute(
                    context.siteId,
                    await collectionTargets(input.targets, sources),
                    integer(input.expectedRevision),
                    requiredText(input.planDigest),
                ),
            ),
        ),
    );
    registerMigrationOperation(dispatcher, operations, "resume-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationResult(
                await dependencies.collectionMigrations.resume(context.siteId, requiredText(input.migrationId)),
            ),
        ),
    );
    registerMigrationOperation(dispatcher, operations, "rollback-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationResult(
                await dependencies.collectionMigrations.rollback(context.siteId, requiredText(input.migrationId)),
            ),
        ),
    );
}

async function collectionTargets(value: unknown, sources?: CollectionSources) {
    return sources ? sources.stage(value) : targets(value);
}

function assertRevision(actual: number, expected: number): void {
    if (actual !== expected) {
        throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
    }
}

async function revisionChanged(
    dependencies: CmsCollectionDependencies,
    siteId: string,
    expected: number,
): Promise<boolean> {
    return (await dependencies.collections.revision(siteId)) !== expected;
}

function registerMigrationOperation(
    dispatcher: ProviderCapabilityRegistry,
    operations: ProviderOperationExecutor | undefined,
    capabilityId: string,
    handler: Parameters<ProviderOperationExecutor["register"]>[2],
): void {
    if (!operations) {
        return;
    }
    operations.register("ulvia.cms.collections", capabilityId, handler);
    dispatcher.register("ulvia.cms.collections", capabilityId, (input, context) =>
        operations.enqueue("ulvia.cms.collections", capabilityId, input, context),
    );
}
