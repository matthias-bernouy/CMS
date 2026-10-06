import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreOperationExecutor } from "../../operations/CoreOperationExecutor";
import type { CmsCoreCapabilityStores } from "../dependencies";
import { projectMigrationPlan, projectMigrationResult, projectSnapshot, projectInstalled } from "./projection";
import { collectionCommand, integer, parseConfiguration, requiredText, targets } from "./support";
import type { CollectionSources } from "./sources";

export function registerCollectionCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreCapabilityStores,
    operations?: CoreOperationExecutor,
    sources?: CollectionSources,
): void {
    dispatcher.register("ulvia.cms.collections", "list", async (_input, context) => {
        const snapshot = await core.collections.snapshot(context.siteId);
        return projectSnapshot(snapshot);
    });
    dispatcher.register("ulvia.cms.collections", "get", async (input, context) => {
        const snapshot = await core.collections.snapshot(context.siteId);
        const collection = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId);
        if (!collection) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectInstalled(collection, snapshot.revision, true);
    });
    dispatcher.register("ulvia.cms.collections", "catalogue", async (_input, context) => {
        if (!sources) {
            return {
                revision: await core.collections.revision(context.siteId),
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
            const before = await core.collections.snapshot(context.siteId);
            assertRevision(before.revision, expectedRevision);
            const staged = await collectionTargets(input.targets, sources);
            const installed = new Set(before.collections.map(({ collectionId }) => collectionId));
            for (const target of staged) {
                const artifact = await core.collections.getRelease(target.digest);
                if (artifact && installed.has(artifact.release.collectionId)) {
                    throw new CoreCapabilityDispatchError("INVALID_STATE", 409);
                }
            }
            const snapshot = await core.collections.installMany(context.siteId, staged, expectedRevision);
            return projectSnapshot(snapshot);
        }),
    );
    dispatcher.register("ulvia.cms.collections", "upgrade", async (input, context) => {
        const expectedRevision = integer(input.expectedRevision);
        const before = await core.collections.snapshot(context.siteId);
        assertRevision(before.revision, expectedRevision);
        const [target] = await collectionTargets([input.target], sources);
        if (!target) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const artifact = await core.collections.getRelease(target.digest);
        const current = artifact
            ? before.collections.find(({ collectionId }) => collectionId === artifact.release.collectionId)
            : undefined;
        if (!artifact || !current) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if ((current.release.dataGeneration ?? 1) !== (artifact.release.dataGeneration ?? 1)) {
            throw new CoreCapabilityDispatchError("MIGRATION_REQUIRED", 409);
        }
        try {
            return projectSnapshot(
                await core.collections.upgrade(
                    context.siteId,
                    target.digest,
                    expectedRevision,
                    target.repositoryId ?? "",
                ),
            );
        } catch (error) {
            if (await revisionChanged(core, context.siteId, expectedRevision)) {
                throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
            }
            const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
            if (status === 409) {
                throw new CoreCapabilityDispatchError("INVALID_STATE", 409);
            }
            throw error;
        }
    });
    dispatcher.register("ulvia.cms.collections", "update-configuration", async (input, context) =>
        collectionCommand(async () => {
            const snapshot = await core.collections.saveConfiguration(
                context.siteId,
                requiredText(input.collectionId),
                integer(input.expectedRevision),
                parseConfiguration(input.configurationJson),
            );
            return projectSnapshot(snapshot);
        }),
    );
    dispatcher.register("ulvia.cms.collections", "plan-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationPlan(
                await core.collectionMigrations.plan(
                    context.siteId,
                    await collectionTargets(input.targets, sources),
                    integer(input.expectedRevision),
                ),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.collections", "get-migration", async (input, context) => {
        const progress = await core.collectionMigrations.getProgress(context.siteId, requiredText(input.migrationId));
        if (!progress) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return progress;
    });
    registerMigrationOperation(dispatcher, operations, "apply-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationResult(
                await core.collectionMigrations.execute(
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
                await core.collectionMigrations.resume(context.siteId, requiredText(input.migrationId)),
            ),
        ),
    );
    registerMigrationOperation(dispatcher, operations, "rollback-migration", async (input, context) =>
        collectionCommand(async () =>
            projectMigrationResult(
                await core.collectionMigrations.rollback(context.siteId, requiredText(input.migrationId)),
            ),
        ),
    );
}

async function collectionTargets(value: unknown, sources?: CollectionSources) {
    return sources ? sources.stage(value) : targets(value);
}

function assertRevision(actual: number, expected: number): void {
    if (actual !== expected) {
        throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
    }
}

async function revisionChanged(core: CmsCoreCapabilityStores, siteId: string, expected: number): Promise<boolean> {
    return (await core.collections.revision(siteId)) !== expected;
}

function registerMigrationOperation(
    dispatcher: CoreCapabilityRegistry,
    operations: CoreOperationExecutor | undefined,
    capabilityId: string,
    handler: Parameters<CoreOperationExecutor["register"]>[2],
): void {
    if (!operations) {
        return;
    }
    operations.register("ulvia.cms.collections", capabilityId, handler);
    dispatcher.register("ulvia.cms.collections", capabilityId, (input, context) =>
        operations.enqueue("ulvia.cms.collections", capabilityId, input, context),
    );
}
