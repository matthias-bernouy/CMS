import { pageContentPaths } from "@bernouy/cms-content";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";

/** Parses every authored internal Page path once so admission enforces link budgets. */
export function validateDeclaredPageLinks(release: Pick<CollectionRelease, "pages" | "blocs" | "dependencies">): void {
    const available = new Set([
        ...(release.pages ?? []).map(({ defaultPath }) => defaultPath),
        ...(release.dependencies ?? []).flatMap(
            ({ imports }) => imports.pages?.map(({ defaultPath }) => defaultPath) ?? [],
        ),
    ]);
    for (const bloc of release.blocs) {
        const sources = [bloc.markup, bloc.defaultContent];
        for (const path of sources.flatMap((source) => (source ? pageLinks(source) : []))) {
            if (!available.has(path)) {
                throw new TypeError(`Collection Bloc ${bloc.id} references an undeclared Page route: ${path}`);
            }
        }
    }
    for (const page of release.pages ?? []) {
        const sources = [page.document.html, ...pageLinkSources(release, page.uses)];
        for (const path of sources.flatMap(pageLinks)) {
            if (!available.has(path)) {
                throw new TypeError(`Collection Page ${page.id} references an undeclared Page route: ${path}`);
            }
        }
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
        sources.push(bloc.markup);
        pending.push(...bloc.uses);
    }
    return sources;
}

export function pageLinks(html: string): readonly string[] {
    return pageContentPaths(html);
}
