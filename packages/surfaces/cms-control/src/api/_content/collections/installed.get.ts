import type { ControlCms } from "cms-control/ControlCms";
import { collectionService } from "cms-control/core/content/installedCollections/service";
export default async function installed(_req: Request, cms: ControlCms) {
    const { store, siteId } = collectionService(cms);
    const system = await cms.repository.getSystem();
    return Response.json(
        {
            ...(await store.snapshot(siteId)),
            languages: [system.site.language, ...(system.site.additionalLanguages ?? [])],
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
