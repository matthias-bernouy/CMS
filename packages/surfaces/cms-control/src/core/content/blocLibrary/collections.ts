import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { SiteBlocCollection } from "@bernouy/cms-content";
import type { LibraryBloc, LibraryCollection } from "./types";

export function libraryCollectionRows(
    sites: SiteBlocCollection[],
    blocs: LibraryBloc[],
    selected: string | undefined,
    basePath: string,
    installed: InstalledCollection[] = [],
    locale?: string,
): LibraryCollection[] {
    const rows: LibraryCollection[] = sites.map((site) =>
        row(
            {
                key: `site:${site.id}`,
                name: site.name,
                description: site.description,
                kind: "site",
                siteId: site.id,
                icon: site.icon ?? "folder",
            },
            selected,
            basePath,
        ),
    );
    for (const item of installed) {
        rows.push(
            row(
                {
                    key: `installed:${item.collectionId}`,
                    installedId: item.collectionId,
                    kind: "installed",
                    name: resolveCollectionTranslation(item.release, item.release.name, locale),
                    description: item.release.description
                        ? resolveCollectionTranslation(item.release, item.release.description, locale)
                        : "",
                    version: item.release.version,
                    digest: item.digest,
                },
                selected,
                basePath,
            ),
        );
    }
    if (blocs.some(({ origin, installedCollectionId }) => origin.kind !== "site-builder" && !installedCollectionId)) {
        rows.push(
            row(
                { key: "code", name: "Custom code", description: "Blocs maintained in your codebase.", kind: "code" },
                selected,
                basePath,
            ),
        );
    }
    return rows.map((collection) => {
        const blocCount = blocs.filter((bloc) => belongsToCollection(bloc, collection)).length;
        const noun = collection.isSite ? "composition" : "bloc";
        return { ...collection, blocCount, countLabel: `${blocCount} ${noun}${blocCount === 1 ? "" : "s"}` };
    });
}

function row(
    fields: Pick<LibraryCollection, "key" | "name" | "description" | "kind"> & Partial<LibraryCollection>,
    selected: string | undefined,
    basePath: string,
): LibraryCollection {
    return {
        blocCount: 0,
        countLabel: "",
        isSite: fields.kind === "site",
        isCode: fields.kind === "code",
        isInstalled: fields.kind === "installed",
        href: `${basePath}/admin/collections/${encodeURIComponent(fields.key)}/overview`,
        active: fields.key === selected,
        ...fields,
    };
}

export function belongsToCollection(bloc: LibraryBloc, collection: LibraryCollection): boolean {
    if (collection.isInstalled) {
        return bloc.installedCollectionId === collection.installedId;
    }
    if (collection.isSite) {
        return bloc.origin.kind === "site-builder" && (bloc.collectionId ?? "site") === collection.siteId;
    }
    return bloc.origin.kind !== "site-builder" && !bloc.installedCollectionId;
}

export function matchingCollections(
    collections: LibraryCollection[],
    blocs: LibraryBloc[],
    search = "",
): LibraryCollection[] {
    const query = search.trim().toLowerCase();
    return collections.filter(
        (collection) =>
            !query ||
            [
                collection.name,
                collection.description,
                ...blocs
                    .filter((bloc) => belongsToCollection(bloc, collection))
                    .flatMap(({ name, group, tag }) => [name, group, tag]),
            ].some((value) => value.toLowerCase().includes(query)),
    );
}
