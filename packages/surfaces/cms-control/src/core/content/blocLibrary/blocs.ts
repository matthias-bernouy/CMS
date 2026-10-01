import type { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";
import { DEFAULT_SITE_BLOC_COLLECTION_ID } from "@bernouy/cms-content";
import type { BlocLibraryQuery, LibraryBloc, LibraryCollection } from "./types";

export function libraryBlocs(items: Awaited<ReturnType<typeof siteBlocCatalogue>>, basePath: string): LibraryBloc[] {
    return items.map((item) => {
        const collection =
            item.origin.kind === "site-builder"
                ? `site:${item.collectionId ?? DEFAULT_SITE_BLOC_COLLECTION_ID}`
                : item.installedCollectionId
                  ? `installed:${item.installedCollectionId}`
                  : "code";
        return {
            ...item,
            ...(item.thumbnail
                ? {
                      thumbnailUrl: `${basePath}/api/bloc/thumbnail?id=${encodeURIComponent(item.tag)}`,
                  }
                : {}),
            selected: item.active,
            selectable: false,
            href: `${basePath}/admin/collections/${encodeURIComponent(collection)}/blocs?${new URLSearchParams({ bloc: item.tag })}`,
        };
    });
}

export function filterLibraryBlocs(blocs: LibraryBloc[], query: BlocLibraryQuery): LibraryBloc[] {
    const search = query.search?.trim().toLowerCase();
    return blocs.filter((bloc) => {
        const visibility = bloc.origin.kind === "site-builder" ? bloc.state : bloc.selected ? "available" : "hidden";
        return (
            (!query.category || (bloc.group || "Other") === query.category) &&
            (!query.visibility || visibility === query.visibility) &&
            (!search ||
                [bloc.name, bloc.description, bloc.group, bloc.tag].some((value) =>
                    value.toLowerCase().includes(search),
                ))
        );
    });
}
