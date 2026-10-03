import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { collectionService, invalidateCollections } from "cms-control/core/content/installedCollections/service";

export default async function configuration(req: Request, cms: ControlCms) {
    await requireControlAdministrator(req, cms);
    const input = await collectionBody(req);
    const { store, siteId } = collectionService(cms);
    try {
        const result = await store.saveConfiguration(
            siteId,
            input.collectionId as string,
            input.revision as number,
            input.configuration,
        );
        invalidateCollections(cms);
        return Response.json(result);
    } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
            throw Object.assign(error, { status: 400 });
        }
        throw error;
    }
}
