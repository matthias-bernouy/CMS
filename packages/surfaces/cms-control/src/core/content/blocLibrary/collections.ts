import type { SiteBlocCollection } from "@bernouy/cms-content";
import type { LibraryBloc, LibraryCollection } from "./types";

export function libraryCollectionRows(
    sites: SiteBlocCollection[],
    blocs: LibraryBloc[],
    selected: string | undefined,
    basePath: string,
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
    if (blocs.some(({ origin }) => origin.kind !== "site-builder")) {
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
        isManaged: fields.kind === "managed",
        isCode: fields.kind === "code",
        href: `${basePath}/admin/collections/${encodeURIComponent(fields.key)}/overview`,
        active: fields.key === selected,
        canCheckUpdates: false,
        canManageAvailability: false,
        ...fields,
    };
}

export function belongsToCollection(bloc: LibraryBloc, collection: LibraryCollection): boolean {
    if (collection.isSite) {
        return bloc.origin.kind === "site-builder" && (bloc.collectionId ?? "site") === collection.siteId;
    }
    return bloc.origin.kind !== "site-builder";
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
