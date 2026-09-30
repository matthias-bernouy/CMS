import type { ControlCms } from "cms-control/ControlCms";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { collectionService, invalidateCollections } from "cms-control/core/content/installedCollections/service";
export default async function texts(req: Request, cms: ControlCms) {
    const input = (await collectionBody(req)) as { collectionId: string; revision: number; overrides: unknown };
    const { store, siteId } = collectionService(cms);
    try {
        const result = await store.saveTexts(siteId, input.collectionId, input.revision, input.overrides);
        invalidateCollections(cms);
        return Response.json(result);
    } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
            throw Object.assign(error, { status: 400 });
        }
        throw error;
    }
}
