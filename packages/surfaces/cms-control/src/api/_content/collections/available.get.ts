import type { ControlCms } from "cms-control/ControlCms";
import { collectionService } from "cms-control/core/content/installedCollections/service";
export default async function available(_req: Request, cms: ControlCms) {
    const { store, siteId, sources = [] } = collectionService(cms);
    const [releases, snapshot] = await Promise.all([
        Promise.all(sources.map((source) => source.list())).then((rows) => rows.flat()),
        store.snapshot(siteId),
    ]);
    return Response.json(
        {
            repositories: sources.map((source) => source.id),
            releases,
            revision: snapshot.revision,
            installed: snapshot.collections.map((item) => ({
                collectionId: item.collectionId,
                digest: item.digest,
                version: item.release.version,
            })),
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
