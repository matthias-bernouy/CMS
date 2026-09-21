import type { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";
import type { BlocLibraryQuery, LibraryBloc, LibraryCollection } from "./types";

export function libraryBlocs(items: Awaited<ReturnType<typeof siteBlocCatalogue>>, basePath: string): LibraryBloc[] {
    return items.map((item) => ({
        ...item,
        ...(item.thumbnail
            ? {
                  thumbnailUrl: `${basePath}/api/bloc/thumbnail?id=${encodeURIComponent(item.tag)}`,
              }
            : {}),
        selected: item.active,
        selectable: false,
        editPath: item.editPath ? `${basePath}${item.editPath}` : null,
        href: item.editPath
            ? `${basePath}${item.editPath}`
            : `${basePath}/admin/collections/code/blocs?${new URLSearchParams({ bloc: item.tag })}`,
    }));
}

export function filterLibraryBlocs(blocs: LibraryBloc[], query: BlocLibraryQuery): LibraryBloc[] {
    const search = query.search?.trim().toLowerCase();
    return blocs.filter((bloc) => {
        const visibility = bloc.editable ? bloc.state : bloc.selected ? "available" : "hidden";
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
