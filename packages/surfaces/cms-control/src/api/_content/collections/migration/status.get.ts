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
    const record = await service.migrations.get(service.siteId, id);
    if (!record) {
        throw Object.assign(new Error("Unknown collection migration"), { status: 404 });
    }
    return Response.json({
        id: record.id,
        status: record.status,
        updatedAt: record.updatedAt,
        error: record.error,
        migratedPages: record.pages.filter((page) => page.state === "applied").length,
        totalPages: record.pages.length,
    });
}
