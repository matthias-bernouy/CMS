import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreOperationExecutor } from "../../core-operations/CoreOperationExecutor";
import type { CoreStores } from "../../stores/core";
import { projectMigrationPlan, projectMigrationResult, projectSnapshot, projectInstalled } from "./projection";
import { collectionCommand, integer, parseConfiguration, requiredText, targets } from "./support";

export function registerCollectionCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CoreStores,
    operations?: CoreOperationExecutor,
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
    dispatcher.register("ulvia.cms.collections", "install", async (input, context) =>
        collectionCommand(async () => {
            const snapshot = await core.collections.installMany(
                context.siteId,
                targets(input.targets),
                integer(input.expectedRevision),
            );
            return projectSnapshot(snapshot);
        }),
    );
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
                    targets(input.targets),
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
                    targets(input.targets),
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
