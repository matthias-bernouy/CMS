import { pageContentPaths } from "@bernouy/cms-content";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";

/** Parses every authored internal Page path once so admission enforces link budgets. */
export function validateDeclaredPageLinks(release: Pick<CollectionRelease, "pages" | "blocs">): void {
    for (const page of release.pages ?? []) {
        const sources = [page.document.html, ...pageLinkSources(release, page.uses)];
        sources.flatMap(pageLinks);
    }
}

export function pageLinkSources(release: Pick<CollectionRelease, "blocs">, rootBlocs: readonly string[]): string[] {
    const sources: string[] = [];
    const byId = new Map(release.blocs.map((bloc) => [bloc.id, bloc]));
    const pending = [...rootBlocs];
    const seen = new Set<string>();
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const bloc = byId.get(id);
        if (!bloc) {
            continue;
        }
        if (bloc.lightdom) {
            sources.push(bloc.lightdom);
        }
        pending.push(...bloc.uses);
    }
    return sources;
}

export function pageLinks(html: string): readonly string[] {
    return pageContentPaths(html);
}
