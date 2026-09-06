import type { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";

export type BlocLibraryQuery = {
    collection?: string;
    view?: string;
    search?: string;
    category?: string;
    visibility?: string;
    bloc?: string;
};

export type LibraryBloc = Awaited<ReturnType<typeof siteBlocCatalogue>>[number] & {
    resourceId?: string;
    selected: boolean;
    selectable: boolean;
    thumbnailUrl?: string;
    href: string;
};

export type LibraryCollection = {
    key: string;
    name: string;
    description: string;
    kind: "site" | "managed" | "code";
    siteId?: string;
    installationId?: string;
    status?: string;
    blocCount: number;
    countLabel: string;
    statusLabel?: string;
    version?: string;
    isSite: boolean;
    isManaged: boolean;
    isCode: boolean;
    href: string;
    active: boolean;
    canCheckUpdates: boolean;
    canManageAvailability: boolean;
    coverUrl?: string;
    iconUrl?: string;
};

export type AvailableLibraryCollection = {
    kind: string;
    label: string;
    description: string;
    category: string;
    version?: string;
    iconUrl?: string;
    coverUrl?: string;
    resourceCount: number;
    canImport: boolean;
};

export type BlocLibraryResponse = {
    isOverview: boolean;
    isCollection: boolean;
    isAdd: boolean;
    hasSiteCollections: boolean;
    hasManagedCollections: boolean;
    hasCodeCollections: boolean;
    collections: LibraryCollection[];
    visibleCollections: LibraryCollection[];
    collection?: LibraryCollection;
    blocs: LibraryBloc[];
    bloc?: LibraryBloc;
    categories: Array<{ value: string; label: string }>;
    totalCount: number;
    filteredCount: number;
    stateOptions: Array<{ value: string; label: string }>;
    emptyTitle: string;
    emptyDescription: string;
    selectedResources: string[];
    available: AvailableLibraryCollection[];
};
