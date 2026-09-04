import type { ControlCms } from "cms-control/ControlCms";
import { BlocOwnershipConflictError, type CmsRepository } from "@bernouy/cms-content";
import { invalidateBlocAssets, invalidatePagesReferencingBloc } from "cms-control/core/admin/server/cache/invalidation";

export async function deleteIntegrationBlocArtifact(
    cms: ControlCms,
    repository: CmsRepository,
    tag: string,
    installationId: string,
): Promise<(() => Promise<void>) | null> {
    const record = await repository.getBlocRecord(tag);
    if (!record?.artifact) {
        return null;
    }
    if (record.ownership.kind !== "integration" || record.ownership.installationId !== installationId) {
        throw new BlocOwnershipConflictError(tag);
    }
    const previous = structuredClone(record.artifact);
    await invalidatePagesReferencingBloc(cms, tag);
    if (!(await repository.deleteBloc(tag, record.ownership))) {
        return null;
    }
    invalidateBlocAssets(cms, tag);
    return async () => {
        await repository.createBloc(previous);
        invalidateBlocAssets(cms, tag);
        await invalidatePagesReferencingBloc(cms, tag);
    };
}
