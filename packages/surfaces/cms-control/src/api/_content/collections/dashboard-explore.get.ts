import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { ControlCms } from "cms-control/ControlCms";
import { requireDashboardAdmin } from "cms-control/core/admin/dashboards/access";
import { collectionService } from "cms-control/core/content/installedCollections/service";

export default async function exploreDashboards(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    const { siteId, store, sources = [] } = collectionService(cms);
    const [installed, listed] = await Promise.all([
        store.snapshot(siteId),
        Promise.allSettled(sources.map((source) => source.list())),
    ]);
    const unavailableRepositories = listed.flatMap((result, index) =>
        result.status === "rejected" ? [sources[index]!.id] : [],
    );
    const latest = new Map<string, CollectionRepositoryEntry>();
    for (const result of listed) {
        if (result.status !== "fulfilled") {
            continue;
        }
        for (const entry of result.value) {
            const key = `${entry.repositoryId}/${entry.publisherId}/${entry.collectionId}`;
            const previous = latest.get(key);
            if (!previous || compareSemVer(entry.version, previous.version) > 0) {
                latest.set(key, entry);
            }
        }
    }
    const dashboards = [...latest.values()].flatMap((entry) => {
        const installation = installed.collections.find(
            (item) => item.collectionId === entry.collectionId && item.release.publisherId === entry.publisherId,
        );
        return (entry.dashboards ?? []).map((dashboard) => ({
            repositoryId: entry.repositoryId,
            publisherId: entry.publisherId,
            collectionId: entry.collectionId,
            collectionName: entry.name,
            version: entry.version,
            digest: entry.digest,
            dashboardId: dashboard.id,
            name: dashboard.name,
            icon: dashboard.icon ?? "layout",
            description: dashboard.description ?? "",
            viewCount: dashboard.viewCount,
            installed: installation?.digest === entry.digest,
            installedVersion: installation?.release.version ?? null,
        }));
    });
    return Response.json(
        { dashboards, unavailableRepositories, revision: installed.revision },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
