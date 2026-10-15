import type { CollectionStore, InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { pageLinkSources } from "@bernouy/cms-repository/collections";
import { pageContentPaths, pageRouteClaims, type PageRouteRegistry, type TPage } from "@bernouy/cms-content";

type CollectionSnapshot = { readonly revision: number; readonly collections: readonly InstalledCollection[] };

/** Prevents a collection mutation from orphaning references stored by editable Pages. */
export async function validateCollectionMutationPageLinks(
    store: CollectionStore,
    siteId: string,
    method: string,
    args: readonly unknown[],
    getSitePages: () => Promise<readonly TPage[]>,
    resolveSitePath?: (path: string) => Promise<boolean>,
    routes?: PageRouteRegistry,
): Promise<void> {
    const current = await store.snapshot(siteId);
    const candidate = await candidateSnapshot(store, current, method, args);
    const targetEntries = candidate.collections.flatMap((installation) =>
        (installation.release.pages ?? []).map(
            (page) =>
                [
                    `${installation.release.publisherId}\0${installation.collectionId}\0${page.id}`,
                    page.defaultPath,
                ] as const,
        ),
    );
    const candidatePages = new Map<string, string>(targetEntries);
    const targets = new Set(
        candidate.collections.flatMap((installation) =>
            (installation.release.pages ?? []).map((page) => page.defaultPath),
        ),
    );
    for (const route of (await routes?.list(siteId)) ?? []) {
        if (route.page.kind !== "contribution") {
            continue;
        }
        const key = `${route.page.sourceId}\0${route.page.contributionId}\0${route.page.pageId}`;
        if (candidatePages.has(key)) {
            for (const path of pageRouteClaims(route)) {
                targets.add(path);
            }
        }
    }
    const sitePages = await getSitePages();
    const siteTargets = new Map(sitePages.map((page) => [page.path, page]));
    for (const path of new Set(targetEntries.map(([, defaultPath]) => defaultPath))) {
        if (await resolveSitePath?.(path)) {
            throw Object.assign(new Error(`A collection Page route conflicts with a site Page route: ${path}`), {
                status: 409,
            });
        }
    }
    for (const page of sitePages) {
        for (const path of pageContentPaths(page.content)) {
            if (!siteTargets.has(path) && !targets.has(path) && !(await resolveSitePath?.(path))) {
                throw Object.assign(new Error("A collection mutation would orphan a site Page reference"), {
                    status: 409,
                });
            }
        }
    }
    for (const installation of candidate.collections) {
        for (const page of installation.release.pages ?? []) {
            const sources = [page.document.html, ...pageLinkSources(installation.release, page.uses)];
            for (const path of sources.flatMap(pageContentPaths)) {
                if (!siteTargets.has(path) && !targets.has(path) && !(await resolveSitePath?.(path))) {
                    throw Object.assign(new Error("A collection Page references an unavailable site Page"), {
                        status: 409,
                    });
                }
            }
        }
    }
}

async function candidateSnapshot(
    store: CollectionStore,
    current: CollectionSnapshot,
    method: string,
    args: readonly unknown[],
): Promise<CollectionSnapshot> {
    if (method === "uninstall") {
        return { ...current, collections: current.collections.filter(({ collectionId }) => collectionId !== args[1]) };
    }
    const digests = mutationDigests(method, args);
    if (digests.length === 0) {
        return current;
    }
    const replacements = await Promise.all(
        digests.map(async (digest) => {
            const artifact = await store.getRelease(digest);
            if (!artifact) {
                throw Object.assign(new Error("Unknown collection release"), { status: 404 });
            }
            return artifact;
        }),
    );
    const byCollection = new Map(replacements.map((artifact) => [artifact.release.collectionId, artifact]));
    const retained = current.collections.filter(({ collectionId }) => !byCollection.has(collectionId));
    const installed = replacements.map((artifact) => {
        const previous = current.collections.find(({ collectionId }) => collectionId === artifact.release.collectionId);
        return {
            collectionId: artifact.release.collectionId,
            digest: artifact.digest,
            configuration: previous?.configuration ?? {},
            textOverrides: previous?.textOverrides ?? {},
            release: artifact.release,
        } as InstalledCollection;
    });
    return { ...current, collections: [...retained, ...installed] };
}

function mutationDigests(method: string, args: readonly unknown[]): string[] {
    if (method === "install" || method === "upgrade") {
        return typeof args[1] === "string" ? [args[1]] : [];
    }
    if (method === "installMany") {
        return (args[1] as readonly { digest: string }[]).map(({ digest }) => digest);
    }
    if (method === "commitMigration") {
        return (args[1] as readonly { digest: string }[]).map(({ digest }) => digest);
    }
    if (method === "restoreMigration") {
        const originals = args[1] as readonly { collectionId: string; digest: string }[];
        const replaced = new Set(
            (args[2] as readonly { collectionId: string }[]).map(({ collectionId }) => collectionId),
        );
        return originals.filter(({ collectionId }) => replaced.has(collectionId)).map(({ digest }) => digest);
    }
    return [];
}
