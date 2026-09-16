import type {
    AvailableLibraryCollection,
    LibraryBloc,
    LibraryCollection,
} from "cms-control/core/content/blocLibrary/types";
import type { BlocDefaultAttribute } from "cms-control/core/content/bloc/defaultAttributes";
import type { CollectionWorkspaceSection } from "./routes";

export type CollectionThemeSummaryView = {
    mode: "declared" | "extended" | "inherited";
    statusLabel: string;
    description: string;
    providerLabel: string;
    dependencyRange?: string;
    categoryCount: number;
    tokenCount: number;
};

export type CollectionThemeNavigationTokenView = {
    variable: string;
    label: string;
    navigationLabel: string;
    href: string;
    current: boolean;
};

export type CollectionThemeNavigationCategoryView = {
    id: string;
    label: string;
    navigationLabel: string;
    description: string;
    siteOwned: boolean;
    tokens: CollectionThemeNavigationTokenView[];
    tokenCount: number;
    current: boolean;
};

export type CollectionThemeTokenView = {
    id: string;
    variable: string;
    label: string;
    description: string;
    type: string;
    sourceLabel: string;
    sourceDescription: string;
    inherited: boolean;
    catalogEditable: boolean;
    sourceId: string;
    categoryId: string;
    light: string;
    dark: string;
    lightResolved: string;
    darkResolved: string;
    lightReference?: string;
    darkReference?: string;
    lightReferenceLabel?: string;
    darkReferenceLabel?: string;
    lightOverridden: boolean;
    darkOverridden: boolean;
    darkUsesLight: boolean;
    lightIssue?: string;
    darkIssue?: string;
};

export type CollectionThemeDetailView = {
    overview: boolean;
    overviewHref: string;
    navigationLabel: string;
    categories: CollectionThemeNavigationCategoryView[];
    category?: Pick<CollectionThemeNavigationCategoryView, "id" | "label" | "description" | "siteOwned">;
    token?: CollectionThemeTokenView;
    relatedTokens: Array<{
        variable: string;
        label: string;
        href: string;
        relationship: "References" | "Used by";
    }>;
    profile: {
        selectedThemeId: string;
        selectedThemeName: string;
        active: boolean;
        themes: Array<{ id: string; name: string }>;
    };
    specimen: {
        kind: string;
        view: "overview" | "focus";
        bindings: Record<string, string>;
        tokens: Array<{ variable: string; light: string; dark: string }>;
        active?: string;
        activeType?: string;
        focus: string[];
        represented: boolean;
    };
};

export type CollectionWorkspaceCollection = Omit<LibraryCollection, "href"> & {
    href: string;
    kindLabel: string;
    overviewHref: string;
    themeHref: string;
    blocsHref: string;
    textsHref: string;
};

export type CollectionWorkspaceBloc = Omit<LibraryBloc, "href"> & {
    href: string;
    previewUrl: string;
    current: boolean;
    defaultAttributes: BlocDefaultAttribute[];
};

export type CollectionWorkspaceResponse = {
    isLanding: boolean;
    isCollection: boolean;
    isOverview: boolean;
    isTheme: boolean;
    isBlocs: boolean;
    isTexts: boolean;
    section: CollectionWorkspaceSection;
    collections: CollectionWorkspaceCollection[];
    catalogCollections: Array<
        Omit<AvailableLibraryCollection, "href"> & {
            imported: boolean;
            href?: string;
        }
    >;
    collection?: CollectionWorkspaceCollection;
    theme?: CollectionThemeSummaryView;
    themeDetail?: CollectionThemeDetailView;
    groups: Array<{ label: string; count: number; blocs: CollectionWorkspaceBloc[]; current: boolean }>;
    bloc?: CollectionWorkspaceBloc;
    emptyTitle: string;
    emptyDescription: string;
    hasSiteCollections: boolean;
    hasManagedCollections: boolean;
    hasCodeCollections: boolean;
};
