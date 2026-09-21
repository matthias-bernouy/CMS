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
    kind: "site" | "code";
    siteId?: string;
    icon?: string;
    blocCount: number;
    countLabel: string;
    isSite: boolean;
    isCode: boolean;
    href: string;
    active: boolean;
};

export type BlocLibraryResponse = {
    groups: Array<{ label: string; count: number; blocs: LibraryBloc[] }>;
    isOverview: boolean;
    isCollection: boolean;
    isAdd: boolean;
    hasSiteCollections: boolean;
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
};
