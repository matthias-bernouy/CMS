import type { ContentRepository } from "@bernouy/cms-content";
import type { PageRoute } from "@bernouy/cms-content";
import { analyzePageLinks } from "@bernouy/cms-content";
import { assertContentRefsExist } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageSnapshot } from "../usage/snapshot";
import { localBlocDocuments } from "../usage/localDocuments";
import type { UpgradeIssue } from "../interfaces";

export async function validateUpgradeContent(
    repository: ContentRepository,
    snapshot: UsageSnapshot,
    releases: readonly CollectionRelease[],
): Promise<UpgradeIssue[]> {
    const installedIds = new Set(
        snapshot.installed.collections.flatMap(({ release }) => release.blocs.map(({ id }) => id)),
    );
    const current = await repository.getBlocsList({ includeHidden: true });
    const targetBlocs = releases.flatMap((release) =>
        release.blocs.map((bloc) => ({
            id: bloc.id,
            root: bloc.root,
            kind: bloc.kind,
            slots: bloc.slots,
            uses: bloc.uses,
            markupHTML: bloc.markup,
            ...(bloc.kind === "component" ? { settings: bloc.settings } : {}),
        })),
    );
    const finalBlocs = [...current.filter((bloc) => !installedIds.has(bloc.id)), ...targetBlocs];
    const issues: UpgradeIssue[] = [];
    const documents = snapshot.pages.map((page) => ({ location: `page:${page.id}:${page.path}`, html: page.content }));
    const byLocation = new Map(snapshot.pages.map((page) => [`page:${page.id}:${page.path}`, page]));
    const byId = new Map(snapshot.pages.map((page) => [page.id, page]));
    const routes = new Map<string, PageRoute | null>();
    const reads = {
        getSystem: async () => snapshot.system,
        getPageById: async (id: string) => byId.get(id) ?? null,
        getPagesByIds: async (ids: readonly string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
        getPageRoute: repository.getPageRoute.bind(repository),
        getPageRoutes: async (paths: readonly string[]) => {
            const missing = paths.filter((path) => !routes.has(path));
            if (missing.length > 0) {
                const loaded = repository.getPageRoutes
                    ? await repository.getPageRoutes(missing)
                    : (await Promise.all(missing.map((path) => repository.getPageRoute(path)))).filter(
                          (route) => route !== null,
                      );
                for (const path of missing) {
                    routes.set(path, null);
                }
                for (const route of loaded) {
                    routes.set(route.path, route);
                }
            }
            return paths.flatMap((path) => (routes.get(path) ? [routes.get(path)!] : []));
        },
    };
    for (const record of snapshot.records.filter(({ contributionId }) => !contributionId)) {
        for (const [name, html] of Object.entries(localBlocDocuments(record))) {
            documents.push({ location: `local-bloc:${record.tag}/${name}`, html });
        }
    }
    for (const { location, html } of documents) {
        try {
            const page = byLocation.get(location);
            const analysis = await assertContentRefsExist(
                { getBlocsList: async () => finalBlocs },
                html,
                {},
                { complete: Boolean(page) },
            );
            if (page && analysis) {
                const diagnostics = await analyzePageLinks(reads, analysis, page, [page.path]);
                for (const diagnostic of diagnostics.filter(
                    (value) =>
                        value.severity === "error" ||
                        value.code === "analysis.truncated" ||
                        value.code === "page.link_analysis_incomplete",
                )) {
                    issues.push({
                        code: diagnostic.severity === "error" ? "incompatible-content" : "incomplete",
                        location,
                        message: diagnostic.message,
                    });
                }
            }
        } catch (error) {
            issues.push({
                code: "incompatible-content",
                location,
                message: error instanceof Error ? error.message : "Content is incompatible with the target releases",
            });
        }
    }
    return issues;
}
