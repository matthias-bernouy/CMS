import type { CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreStores } from "../stores/core";

export function registerOperationCapabilities(dispatcher: CoreCapabilityRegistry, core: CoreStores): void {
    dispatcher.register("ulvia.cms.operations", "status", async (input) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 20;
        const [active, audits] = await Promise.all([
            core.collectionMigrations.getActive("default"),
            core.collectionMigrations.listAudits("default", limit),
        ]);
        return {
            core: "ready",
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
}
