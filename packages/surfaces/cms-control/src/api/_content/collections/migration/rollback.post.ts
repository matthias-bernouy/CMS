import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { invalidateCollections, collectionService } from "cms-control/core/content/installedCollections/service";

export default async function rollbackMigration(request: Request, cms: ControlCms): Promise<Response> {
    await requireControlAdministrator(request, cms);
    const body = await collectionBody(request);
    const service = collectionService(cms);
    if (!service.migrations || typeof body.id !== "string") {
        throw Object.assign(new Error("Collection migration service and ID are required"), { status: 400 });
    }
    const record = await service.migrations.rollback(service.siteId, body.id);
    invalidateCollections(cms);
    return Response.json({ id: record.id, status: record.status });
}
