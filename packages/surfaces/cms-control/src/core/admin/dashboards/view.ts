import { createBlocUsageResolver, expandCompositions, hardenStoredHtml } from "@bernouy/cms-content";
import { renderCollectionTexts } from "@bernouy/cms-content/rendering";
import type { DashboardRecord } from "@bernouy/cms-dashboards";
import { dashboardNavigationViews } from "@bernouy/cms-dashboards";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { parseHTML } from "linkedom";
import type { ControlCms } from "cms-control/ControlCms";
import { resolvePreviewCollectionAssets } from "cms-control/core/content/bloc/preview/assets";

export type ResolvedDashboardView = {
    selected: ReturnType<typeof dashboardNavigationViews>[number];
    installation: InstalledCollection;
    view: NonNullable<InstalledCollection["release"]["views"]>[number];
    installations: readonly InstalledCollection[];
};

export function resolveDashboardView(
    dashboard: DashboardRecord,
    viewId: string,
    installations: readonly InstalledCollection[],
): ResolvedDashboardView | null {
    const selected = dashboardNavigationViews(dashboard.navigation).find((item) => item.use === viewId);
    const [collectionId, selectedViewId] = selected?.use.split(":") ?? [];
    const installation = installations.find((item) => item.collectionId === collectionId);
    const view = installation?.release.views?.find((item) => item.id === selectedViewId);
    return selected && installation && view ? { selected, installation, view, installations } : null;
}

export async function renderDashboardView(
    cms: ControlCms,
    resolved: ResolvedDashboardView,
    locale?: string,
): Promise<{ html: string; runtime: string }> {
    const records = await cms.repository.getBlocRecords();
    const blocs = records.flatMap((record) => (record.artifact ? [record.artifact] : []));
    const resolveUsage = createBlocUsageResolver(blocs, cms.repository);
    const used = await resolveUsage(resolved.view.html);
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = hardenStoredHtml(resolved.view.html);
    expandCompositions(document.body, blocs, "delivery");
    const system = await cms.repository.getSystem();
    renderCollectionTexts(
        document.body,
        locale || system.site.language || "en",
        resolved.installations.map((item) => ({ collection: item.release, overrides: item.textOverrides })),
    );
    let html = document.body.innerHTML;
    let scripts = (
        await Promise.all(
            used.map(async (tag) => {
                const script = await cms.repository.getBlocViewJS(tag);
                return script
                    ? `try {\n${script}\n} catch (error) { console.error(${JSON.stringify(`[dashboard-view] ${tag}`)}, error); }`
                    : "";
            }),
        )
    ).filter(Boolean);
    if (cms.config.deliveryUrl) {
        const releases = resolved.installations.map(({ release }) => release);
        [html, scripts] = await Promise.all([
            resolvePreviewCollectionAssets(html, releases, cms.config.deliveryUrl),
            Promise.all(
                scripts.map((script) => resolvePreviewCollectionAssets(script, releases, cms.config.deliveryUrl!)),
            ),
        ]);
    }
    return { html, runtime: scripts.join("\n") };
}
