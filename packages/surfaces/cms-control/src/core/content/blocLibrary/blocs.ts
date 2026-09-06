import { integrationAssetUrl } from "./assets";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import { collectionSelectableResources } from "@bernouy/cms-integrations/resources";
import type { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";
import type { BlocLibraryQuery, LibraryBloc, LibraryCollection } from "./types";

export function selectedCollectionResources(installation?: IntegrationInstallation): string[] {
    const definition = installation?.definitionSnapshot;
    if (definition?.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return [];
    }
    return [
        ...(installation?.activeResources ??
            collectionSelectableResources(definition)
                .filter(({ defaultActive }) => defaultActive)
                .map(({ id }) => id)),
    ];
}

export function libraryBlocs(items: Awaited<ReturnType<typeof siteBlocCatalogue>>, basePath: string): LibraryBloc[] {
    return items.map((item) => ({
        ...item,
        ...(item.thumbnail
            ? {
                  thumbnailUrl:
                      item.origin.kind === "integration"
                          ? integrationAssetUrl(
                                basePath,
                                item.origin.integrationKind,
                                item.origin.definitionVersion,
                                item.thumbnail.path,
                            )
                          : `${basePath}/api/bloc/thumbnail?id=${encodeURIComponent(item.tag)}`,
              }
            : {}),
        selected: item.active,
        selectable: false,
        editPath: item.editPath ? `${basePath}${item.editPath}` : null,
        href: item.editPath
            ? `${basePath}${item.editPath}`
            : `${basePath}/admin/blocs?${new URLSearchParams({ collection: item.origin.kind === "integration" ? `managed:${item.origin.installationId}` : "code", bloc: item.tag })}`,
    }));
}

export function selectableBlocs(
    blocs: LibraryBloc[],
    collection: LibraryCollection | undefined,
    installation?: IntegrationInstallation,
): LibraryBloc[] {
    const definition = installation?.definitionSnapshot;
    if (definition?.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return blocs;
    }
    const resources = new Map(
        collectionSelectableResources(definition).map((resource) => [resource.artifact, resource.id]),
    );
    const selected = new Set(selectedCollectionResources(installation));
    return blocs.map((bloc) => {
        const resourceId = resources.get(bloc.tag);
        return resourceId
            ? {
                  ...bloc,
                  resourceId,
                  selected: selected.has(resourceId),
                  selectable: collection?.canManageAvailability === true,
              }
            : bloc;
    });
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
