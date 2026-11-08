import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { TPage } from "content/pages/interfaces/pages";
import { analyzeExpandedPageDocument } from "content/blocs/core/markup/validation/documents/expandedPageDocument";
import { boundedDiagnostics } from "content/application/core/validation/diagnostics";
import { resolvePageRouteTarget } from "content/pages/core/queries/resolvePublishedRoute";
import { fragmentReader, localFragmentDiagnostics } from "./fragments";
import { collectDocumentLinks, linkIssue } from "./collect";

import type { PageLinkAnalysis } from "content/application/interfaces/diagnostics";
import type { PageFragmentIndexCache } from "./fragmentIndexCache";

type Analysis = ReturnType<typeof analyzeExpandedPageDocument>;

export async function analyzePageLinks(...args: Parameters<typeof analyzePageLinkReport>) {
    return (await analyzePageLinkReport(...args)).diagnostics;
}

/** One metadata batch and one bounded Page batch; never crawl linked Pages recursively. */
export async function analyzePageLinkReport(
    repository: Pick<
        ContentRepository,
        "getSystem" | "getPageRoute" | "getPageRoutes" | "getPageById" | "getPagesByIds"
    >,
    analysis: Analysis,
    page: Pick<TPage, "path" | "visible"> & Partial<Pick<TPage, "id">>,
    availablePaths: readonly string[],
    options: Readonly<{
        fragmentIndexes?: PageFragmentIndexCache;
        /** Already captured Pages from this validation batch; never grants an additional read. */
        snapshotPages?: ReadonlyMap<string, TPage>;
    }> = {},
): Promise<PageLinkAnalysis> {
    if (!analysis.root.querySelector("a[href], form[cms-mutation-redirect], iframe[src]")) {
        return {
            diagnostics: analysis.diagnostics,
            hasErrors: analysis.diagnostics.some((value) => value.severity === "error"),
            complete: true,
        };
    }
    const system = await repository.getSystem();
    const { links, diagnostics } = collectDocumentLinks(
        analysis.root,
        page.path,
        system.site.host,
        analysis.context.location,
    );
    const own = new Set([page.path, ...availablePaths]);
    const paths = [...new Set(links.flatMap((link) => (link.path && !own.has(link.path) ? [link.path] : [])))];
    const routes = repository.getPageRoutes
        ? await repository.getPageRoutes(paths)
        : (await Promise.all(paths.map((path) => repository.getPageRoute(path)))).filter((route) => route !== null);
    const byPath = new Map(routes.map((route) => [route.path, route]));
    const destinationIds = [
        ...new Set(
            routes.filter((route) => route.state !== "gone" && route.pageId !== page.id).map((route) => route.pageId),
        ),
    ];
    const ids = options.snapshotPages ? destinationIds : destinationIds.slice(0, 32);
    const pages = options.snapshotPages
        ? ids.flatMap((id) => {
              const target = options.snapshotPages!.get(id);
              return target ? [target] : [];
          })
        : repository.getPagesByIds
          ? await repository.getPagesByIds(ids)
          : (await Promise.all(ids.map((id) => repository.getPageById(id)))).filter((target) => target !== null);
    const byId = new Map(pages.map((target) => [target.id, target]));
    const readFragment = fragmentReader(analysis, options.fragmentIndexes);
    const missingSeverity = page.visible ? "error" : "warning";
    let complete = true;
    for (const link of links) {
        const ownRoute = byPath.get(link.path!);
        const selfAlias =
            page.id &&
            ownRoute?.pageId === page.id &&
            ownRoute.state !== "gone" &&
            (ownRoute.state === "redirect" ||
                ownRoute.language === system.site.language ||
                system.site.activeLanguages.includes(ownRoute.language));
        if (own.has(link.path!) || selfAlias) {
            if (link.fragment) {
                diagnostics.push(...localFragmentDiagnostics(link, analysis, missingSeverity));
            }
            continue;
        }
        const route = byPath.get(link.path!);
        const target = route ? byId.get(route.pageId) : undefined;
        if (route && route.state !== "gone" && route.pageId !== page.id && !ids.includes(route.pageId)) {
            complete = false;
            diagnostics.push(
                linkIssue(
                    link,
                    "page.link_analysis_incomplete",
                    "warning",
                    "The destination exceeds the 32-Page analysis budget and was not verified.",
                ),
            );
        } else if (!route || route.state === "gone" || !target || !resolvePageRouteTarget(route, target, system)) {
            diagnostics.push(
                linkIssue(
                    link,
                    "page.route_missing",
                    missingSeverity,
                    `Page content references an unavailable route: ${link.path!.slice(0, 256)}`,
                ),
            );
        } else {
            if (!target.visible) {
                diagnostics.push(
                    linkIssue(
                        link,
                        "page.route_draft",
                        "warning",
                        `The destination ${link.path!.slice(0, 256)} is still a draft.`,
                    ),
                );
            }
            if (link.fragment) {
                diagnostics.push(...readFragment(link, target, target.visible ? missingSeverity : "warning"));
            }
        }
    }
    const combined = [...analysis.diagnostics, ...diagnostics];
    return {
        diagnostics: boundedDiagnostics(combined),
        hasErrors: combined.some((value) => value.severity === "error"),
        complete,
    };
}
