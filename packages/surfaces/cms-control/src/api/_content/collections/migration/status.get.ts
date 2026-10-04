import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionService } from "cms-control/core/content/installedCollections/service";

export default async function migrationStatus(request: Request, cms: ControlCms): Promise<Response> {
    await requireControlAdministrator(request, cms);
    const id = new URL(request.url).searchParams.get("id");
    const service = collectionService(cms);
    if (!service.migrations || !id) {
        throw Object.assign(new Error("Collection migration service and ID are required"), { status: 400 });
    }
    const progress = await service.migrations.getProgress(service.siteId, id);
    if (!progress) {
        throw Object.assign(new Error("Unknown collection migration"), { status: 404 });
    }
    return Response.json({
        id: progress.id,
        status: progress.status,
        updatedAt: progress.updatedAt,
        error: progress.error,
        migratedPages: progress.appliedPages,
        rolledBackPages: progress.rolledBackPages,
        totalPages: progress.totalPages,
    });
}
