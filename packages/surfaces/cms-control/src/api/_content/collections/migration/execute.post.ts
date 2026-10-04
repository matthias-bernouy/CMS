import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { invalidateCollections, collectionService } from "cms-control/core/content/installedCollections/service";
import {
    parseCollectionReleaseTargets,
    stageCollectionTargets,
} from "cms-control/core/content/installedCollections/staging";

export default async function executeMigration(request: Request, cms: ControlCms): Promise<Response> {
    await requireControlAdministrator(request, cms);
    const body = await collectionBody(request);
    const service = collectionService(cms);
    if (
        !service.migrations ||
        !Number.isSafeInteger(body.revision) ||
        (body.revision as number) < 0 ||
        typeof body.planDigest !== "string"
    ) {
        throw Object.assign(new Error("Collection migration service, revision and plan digest are required"), {
            status: 400,
        });
    }
    const targets = await stageCollectionTargets(cms, parseCollectionReleaseTargets(body.targets));
    const record = await service.migrations.execute(service.siteId, targets, body.revision as number, body.planDigest);
    invalidateCollections(cms);
    return Response.json(result(record), { status: 201 });
}

function result(record: { id: string; status: string; expectedCollectionRevision: number; pageCount: number }) {
    return {
        id: record.id,
        status: record.status,
        collectionRevision: record.expectedCollectionRevision + 1,
        migratedPages: record.pageCount,
    };
}
