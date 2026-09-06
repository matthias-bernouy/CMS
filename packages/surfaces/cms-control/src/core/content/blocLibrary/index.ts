import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";
import { availableLibraryCollections, exploreLibraryCollections } from "./available";
import { filterLibraryBlocs, libraryBlocs, selectableBlocs, selectedCollectionResources } from "./blocs";
import { belongsToCollection, libraryCollectionRows, matchingCollections } from "./collections";
import type { BlocLibraryQuery, BlocLibraryResponse } from "./types";

export async function blocLibrary(
    cms: ControlCms,
    query: BlocLibraryQuery,
    basePath: string,
): Promise<BlocLibraryResponse> {
    const [sites, items, installations] = await Promise.all([
        cms.repository.getSiteBlocCollections(),
        siteBlocCatalogue(cms),
        cms.integrationInstallations.list(),
    ]);
    const allBlocs = libraryBlocs(items, basePath);
    const collections = libraryCollectionRows(sites, allBlocs, installations, query.collection, basePath);
    const collection = collections.find(({ key }) => key === query.collection);
    if (query.collection && !collection) {
        throw Object.assign(new Error("Collection not found"), { status: 404 });
    }
    const installation = installations.find(({ id }) => id === collection?.installationId);
    const scope = selectableBlocs(
        collection ? allBlocs.filter((bloc) => belongsToCollection(bloc, collection)) : allBlocs,
        collection,
        installation,
    );
    const blocs = filterLibraryBlocs(scope, query);
    const bloc = query.bloc ? scope.find(({ tag }) => tag === query.bloc) : undefined;
    if (query.bloc && !bloc) {
        throw Object.assign(new Error("Bloc not found in this collection"), { status: 404 });
    }
    const isAdd = query.view === "add";
    const isCollection = !isAdd && !!collection;
    const stateValues = collection?.isSite
        ? [
              ["", "All statuses"],
              ["published", "Published"],
              ["draft", "Draft"],
              ["archived", "Archived"],
          ]
        : [
              ["", "All blocs"],
              ["available", "Available"],
              ["hidden", "Hidden"],
          ];
    const isExplore = !isCollection;
    const groups = [...new Set(blocs.map((bloc) => bloc.group || "Other"))].sort().map((label) => {
        const members = blocs.filter((bloc) => (bloc.group || "Other") === label);
        return { label, count: members.length, blocs: members };
    });
    return {
        isExplore,
        explore: isExplore
            ? await exploreLibraryCollections(cms, installations, basePath, query.search, query.visibility)
            : [],
        groups,
        isOverview: !isAdd && !isCollection,
        isCollection,
        isAdd,
        hasSiteCollections: collections.some(({ isSite }) => isSite),
        hasManagedCollections: collections.some(({ isManaged }) => isManaged),
        hasCodeCollections: collections.some(({ isCode }) => isCode),
        collections,
        visibleCollections: matchingCollections(collections, allBlocs, query.search),
        ...(collection ? { collection } : {}),
        blocs,
        ...(bloc ? { bloc } : {}),
        categories: [
            { value: "", label: "All categories" },
            ...[...new Set(scope.map(({ group }) => group || "Other"))]
                .sort()
                .map((value) => ({ value, label: value })),
        ],
        totalCount: scope.length,
        filteredCount: blocs.length,
        stateOptions: stateValues.map(([value, label]) => ({ value: value!, label: label! })),
        emptyTitle: scope.length
            ? "No matching blocs"
            : collection?.isSite
              ? "Your collection starts here"
              : "No blocs in this collection",
        emptyDescription: scope.length
            ? "Try another search, category or visibility filter."
            : collection?.isSite
              ? "Create your first reusable composition."
              : "This collection has no available bloc metadata.",
        selectedResources: selectedCollectionResources(installation),
        available: isAdd ? await availableLibraryCollections(cms, installations, basePath, query.search) : [],
    };
}
