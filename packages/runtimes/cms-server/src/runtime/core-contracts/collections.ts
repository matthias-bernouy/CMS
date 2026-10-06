import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CollectionMigrationTarget } from "@bernouy/cms-content/migrations";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import type { CoreOperationExecutor } from "../core-operations/CoreOperationExecutor";
import type { CoreStores } from "../stores/core";

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

function projectMigrationPlan(plan: Awaited<ReturnType<CoreStores["collectionMigrations"]["plan"]>>) {
    return {
        expectedRevision: plan.expectedCollectionRevision,
        planDigest: plan.planDigest,
        targets: plan.targets,
        totalPages: plan.totalPages,
        operationCount: plan.operationCount,
        blockedReasons: plan.blockedReasons,
    };
}

function projectMigrationResult(record: Awaited<ReturnType<CoreStores["collectionMigrations"]["execute"]>>) {
    return {
        migrationId: record.id,
        status: record.status,
        collectionRevision: record.collectionRevisionAfterCommit ?? record.expectedCollectionRevision,
        totalPages: record.pageCount,
        operationCount: record.operationGroups.reduce((total, group) => total + group.operations.length, 0),
    };
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

function projectSnapshot(snapshot: Awaited<ReturnType<CoreStores["collections"]["snapshot"]>>) {
    return {
        revision: snapshot.revision,
        items: snapshot.collections.map((collection) => projectInstalled(collection, snapshot.revision, false)),
    };
}

function projectInstalled(
    collection: Awaited<ReturnType<CoreStores["collections"]["snapshot"]>>["collections"][number],
    revision: number,
    detailed: boolean,
) {
    const { release, ...installation } = collection;
    return {
        collectionId: installation.collectionId,
        publisherId: release.publisherId,
        version: release.version,
        digest: installation.digest,
        ...(installation.repositoryId ? { repositoryId: installation.repositoryId } : {}),
        dataGeneration: release.dataGeneration ?? 1,
        blocCount: release.blocs.length,
        pageCount: release.pages?.length ?? 0,
        assetCount: release.assets.length,
        textCount: release.texts?.length ?? 0,
        themeTokenCount: release.theme?.categories.reduce((total, category) => total + category.tokens.length, 0) ?? 0,
        ...(detailed
            ? {
                  revision,
                  configurationJson: JSON.stringify(installation.configuration),
                  overriddenLocaleCount: Object.keys(installation.textOverrides).length,
              }
            : {}),
    };
}

function targets(value: unknown): readonly CollectionMigrationTarget[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const record = entry as Record<string, unknown>;
        const digest = requiredText(record.digest);
        const repositoryId = typeof record.repositoryId === "string" ? record.repositoryId : undefined;
        return { digest, ...(repositoryId ? { repositoryId } : {}) };
    });
}

function parseConfiguration(value: unknown): unknown {
    if (typeof value !== "string") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return parseStrictJson(new TextEncoder().encode(value), MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
}

async function collectionCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (status === 423) {
            throw new CoreCapabilityDispatchError("MIGRATION_IN_PROGRESS", 423);
        }
        if (error instanceof TypeError || error instanceof RangeError || status === 400 || status === 422) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        throw error;
    }
}

function integer(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
