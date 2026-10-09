import type {
    BlocRecord,
    SiteBlocGroup,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
import type { PageCreateOptions, PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import type { PageReference } from "cms-content/pages/interfaces/routing";
import type { PageContentReference } from "cms-content/pages/core/queries/contentReferences";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import type { PageDocument, PageSurface } from "cms-content/pages/interfaces/document";
import type { ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";

export type ContentContributionSnapshot = {
    readonly revision: number;
    readonly pages: readonly { readonly surface: PageSurface; readonly document: PageDocument }[];
    readonly texts: readonly ContentTextSource[];
};

export type BlocListItemResponse = {
    id: string;
    name: string;
    group: string;
    catalogueOrder?: number;
    description: string;
    thumbnail?: TBloc["thumbnail"];
    compositionHTML?: string;
    componentHTML?: string;
    defaultContent?: string;
    slots?: TBloc["slots"];
    settings?: TBloc["settings"];
    internal?: boolean;
    surfaces?: TBloc["surfaces"];
    uses?: TBloc["uses"];
    nativeElement?: TBloc["nativeElement"];
    ownership: TBloc["ownership"];
};

export type BlocListOptions = {
    /** Include installed blocs hidden from the authoring catalogue. */
    includeInactive?: boolean;
};

export type PageLink = {
    page: Extract<PageReference, { kind: "site" }>;
    path: string;
    title: string;
    surface: TPage["surface"];
};

export type PageMeta = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    visible: boolean;
};

export type ValueCount = {
    value: string;
    count: number;
};

export type SiteBlocPublicationGuard = {
    /** Refreshes and verifies the graph-wide publication lease before persistence. */
    assertHeld(): Promise<void>;
};

/**
 * Filter + sort for the admin Pages listing. Optional everywhere — an empty
 * query lists every page (title asc). Each implementation honours this the best
 * its engine allows (Mongo: in-query `$regex` + sort + indexes; in-memory: a
 * plain filter/sort). Page metadata is NOT encrypted, so unlike `UsersRepository`
 * substring search and sort on title/path are fully supported server-side.
 */
export type PagesQuery = {
    /** Case-insensitive substring matched against title AND path. */
    search?: string;
    /** Keep only pages carrying this tag. */
    tag?: string;
    /** "published" → visible only; "draft" → hidden only. */
    visible?: "published" | "draft";
    sortBy?: "title" | "path" | "visible";
    sortOrder?: "asc" | "desc";
};

export type PageScan = {
    readonly pages: readonly TPage[];
    /** Opaque stable cursor for the next ID-ordered batch. */
    readonly nextCursor?: string;
};

export interface CmsRepository {
    /** Runtime projections supplied by package/extension adapters. */
    getContentContributions?(): Promise<ContentContributionSnapshot>;
    getSiteBlocGroups(): Promise<SiteBlocGroup[]>;
    updateSiteBlocGroup(id: string, input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup>;
    createSiteBlocGroup(input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup>;

    // BLOC
    createBloc(bloc: TBlocWrite): Promise<TBloc>;
    replaceBloc(bloc: TBlocWrite): Promise<TBloc>;

    getBlocRecord(tag: string): Promise<BlocRecord | null>;
    getBlocRecords(): Promise<BlocRecord[]>;
    createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord>;
    saveSiteBlocDraft(tag: string, draft: SiteBlocSnapshot, expectedDraftRevision: number): Promise<SiteBlocDefinition>;
    publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: SiteBlocPublicationGuard,
    ): Promise<BlocRecord>;
    archiveSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition>;
    restoreSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition>;
    withSiteBlocPublicationLock<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T>;

    getBlocsList(options?: BlocListOptions): Promise<BlocListItemResponse[]>;
    getBlocViewJS(htmlTag: string): Promise<string | null>;
    /** Author-side source map for resource export. Returns null when the bloc has no source bundle. */
    getBlocSource(htmlTag: string): Promise<Record<string, string> | null>;

    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getPageById(id: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    scanPages(cursor: string | undefined, limit: number): Promise<PageScan>;
    scanPagesByContentReference(
        reference: PageContentReference,
        cursor: string | undefined,
        limit: number,
    ): Promise<PageScan>;
    getPublishedPage(path: string): Promise<TPage | null>;
    getPublishedPageById(id: string): Promise<TPage | null>;
    getPublishedPages(): Promise<TPage[]>;
    /** Editorial route record access. Public consumers use `resolvePublishedRoute`. */
    getPageRoute(path: string): Promise<PageRoute | null>;
    insertPage(path: string, title: string, content?: string, options?: PageCreateOptions): Promise<void>;
    updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<TPage | null>;
    deletePage(id: string, expectedRevision?: number): Promise<void>;
    setPagePaths?(
        id: string,
        paths: Record<string, string>,
        system?: TSystem,
        expectedPaths?: Record<string, string>,
        expectedRevision?: number,
    ): Promise<TPage>;
    deletePageWithAlternative?(id: string, alternativeId: string | null, expectedRevision?: number): Promise<void>;
    getLinks(): Promise<PageLink[]>;
    getPagesMetadata(opts?: PagesQuery): Promise<PageMeta[]>;
    getTagCounts(): Promise<ValueCount[]>;

    // SYSTEM
    getSystem(): Promise<TSystem>;
    getSystemRevision(): Promise<number>;
    updateSystem(system: Partial<TSystem>, expectedRevision?: number): Promise<TSystem>;
}
