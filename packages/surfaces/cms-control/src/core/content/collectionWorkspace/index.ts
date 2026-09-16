import { composeThemeSettings } from "@bernouy/cms-content";
import {
    collectIntegrationInstallationThemeContributions,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import { blocDefaultAttributes } from "cms-control/core/content/bloc/defaultAttributes";
import { blocLibrary } from "cms-control/core/content/blocLibrary";
import { resolvedCollectionInstallations } from "cms-control/core/content/blocLibrary/availability";
import type { LibraryBloc, LibraryCollection } from "cms-control/core/content/blocLibrary/types";
import { collectionWorkspacePath, type CollectionWorkspaceSection } from "./routes";
import { collectionThemeProjection } from "./theme";
import type { CollectionWorkspaceBloc, CollectionWorkspaceCollection, CollectionWorkspaceResponse } from "./types";

export type CollectionWorkspaceQuery = {
    collection?: string;
    section?: CollectionWorkspaceSection;
    bloc?: string;
    token?: string;
    theme?: string;
};

export async function collectionWorkspace(
    cms: ControlCms,
    query: CollectionWorkspaceQuery,
    basePath: string,
): Promise<CollectionWorkspaceResponse> {
    const section = query.section ?? "overview";
    const installationsPromise = cms.integrationInstallations
        .list()
        .then((installations) => resolvedCollectionInstallations(cms, installations));
    const [library, installations, system] = await Promise.all([
        blocLibrary(
            cms,
            {
                collection: query.collection,
                ...(section === "blocs" ? { bloc: query.bloc } : {}),
            },
            basePath,
            { installations: installationsPromise },
        ),
        installationsPromise,
        section === "theme" && query.collection ? cms.repository.getSystem() : Promise.resolve(undefined),
    ]);
    const collections = library.collections.map((collection) =>
        workspaceCollection(collection, installations, basePath),
    );
    const collection = library.collection
        ? workspaceCollection(library.collection, installations, basePath)
        : undefined;
    const isCollection = Boolean(collection);
    const showsBlocs = collection && section === "blocs";
    const selectedTag = showsBlocs ? (library.bloc?.tag ?? library.groups[0]?.blocs[0]?.tag) : undefined;
    const selectedRecord = selectedTag ? await cms.repository.getBlocRecord(selectedTag) : undefined;
    const defaults = selectedRecord ? blocDefaultAttributes(selectedRecord) : [];
    const groups = showsBlocs
        ? library.groups.map((group) => {
              const blocs = group.blocs.map((bloc) => workspaceBloc(bloc, collection, basePath, selectedTag, defaults));
              return { ...group, blocs, current: blocs.some(({ current }) => current) };
          })
        : [];
    const bloc = groups.flatMap((group) => group.blocs).find(({ current }) => current);
    const themeProjection = collection
        ? collectionThemeProjection(
              library.collection!,
              installations,
              system
                  ? composeThemeSettings(system.theme, collectIntegrationInstallationThemeContributions(installations))
                  : undefined,
              query.token,
              query.theme,
              basePath,
          )
        : undefined;
    return {
        isLanding: !isCollection,
        isCollection,
        isOverview: isCollection && section === "overview",
        isTheme: isCollection && section === "theme",
        isBlocs: isCollection && section === "blocs",
        isTexts: isCollection && section === "texts",
        section,
        collections,
        catalogCollections: library.explore,
        ...(collection
            ? {
                  collection,
                  theme: themeProjection!.summary,
                  ...(themeProjection?.detail ? { themeDetail: themeProjection.detail } : {}),
              }
            : {}),
        groups,
        ...(bloc ? { bloc } : {}),
        emptyTitle: library.emptyTitle,
        emptyDescription: library.emptyDescription,
        hasSiteCollections: library.hasSiteCollections,
        hasManagedCollections: library.hasManagedCollections,
        hasCodeCollections: library.hasCodeCollections,
    };
}

function workspaceCollection(
    collection: LibraryCollection,
    installations: IntegrationInstallation[],
    basePath: string,
): CollectionWorkspaceCollection {
    const path = (section: CollectionWorkspaceSection) => collectionWorkspacePath(basePath, collection.key, section);
    const installation = installations.find(({ id }) => id === collection.installationId);
    return {
        ...collection,
        canCheckUpdates: collection.isManaged && installation?.status === "success",
        href: path("overview"),
        kindLabel: collection.isSite
            ? "Private collection"
            : collection.isManaged
              ? "Imported collection"
              : "Code collection",
        overviewHref: path("overview"),
        themeHref: path("theme"),
        blocsHref: path("blocs"),
        textsHref: path("texts"),
    };
}

function workspaceBloc(
    bloc: LibraryBloc,
    collection: CollectionWorkspaceCollection,
    basePath: string,
    selectedTag: string | undefined,
    defaults: CollectionWorkspaceBloc["defaultAttributes"],
): CollectionWorkspaceBloc {
    const collectionPath = collectionWorkspacePath(basePath, collection.key, "blocs");
    return {
        ...bloc,
        href: `${collectionPath}?${new URLSearchParams({ bloc: bloc.tag })}`,
        previewUrl: `${basePath}/api/bloc/preview?id=${encodeURIComponent(bloc.tag)}`,
        current: bloc.tag === selectedTag,
        defaultAttributes: bloc.tag === selectedTag ? defaults : [],
    };
}
