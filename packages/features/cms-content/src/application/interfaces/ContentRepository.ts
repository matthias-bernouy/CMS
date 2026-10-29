import type { RenderingResourceReads } from "cms-content/application/core/RenderingResourceReads";
import type {
    BlocRecord,
    SiteBlocGroup,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
import type { PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import type { PageReference } from "cms-content/pages/interfaces/routing";
import type { PageContentReference } from "cms-content/pages/core/queries/contentReferences";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import type { ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";
import type { PageCapabilityRequirement } from "./ContentReader";

export type ContentTextSnapshot = {
    readonly revision: number | string;
    readonly texts: readonly ContentTextSource[];
};

export type BlocListItemResponse = {
    id: string;
    name: string;
    group: string;
    categories?: TBloc["categories"];
    initialDocument?: TBloc["initialDocument"];
    catalogueOrder?: number;
    description: string;
    thumbnail?: TBloc["thumbnail"];
    kind: TBloc["kind"];
    markupHTML: string;
    browser?: TBloc["browser"];
    defaultContent?: string;
    slots?: TBloc["slots"];
    settings?: TBloc["settings"];
    catalogue?: TBloc["catalogue"];
    uses?: TBloc["uses"];
    root: TBloc["root"];
    styleCSS?: TBloc["styleCSS"];
    styleCollectionId?: TBloc["styleCollectionId"];
    hasBehavior: boolean;
    ownership: TBloc["ownership"];
};

export type BlocListOptions = {
    /** Rendering omits initialDocument, defaultContent, slots, settings and thumbnail. */
    projection?: "catalogue" | "rendering";
    /** Include Blocs hidden from the authoring catalogue. */
    includeHidden?: boolean;
};

export type PageLink = {
    page: Extract<PageReference, { kind: "site" }>;
    path: string;
    title: string;
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
    /** Stable Page ID returned by the preceding batch. */
    afterId?: string;
    /** Maximum rows projected by the backing store. */
    limit?: number;
};

export type PageScan = {
    readonly pages: readonly TPage[];
    /** Opaque stable cursor for the next ID-ordered batch. */
    readonly nextCursor?: string;
};

export interface ContentRepository {
    /** Runtime projections supplied by package/extension adapters. */
    getTextContributions?(reads?: RenderingResourceReads): Promise<ContentTextSnapshot>;
    getPageRequirements?(page: TPage, reads?: RenderingResourceReads): Promise<readonly PageCapabilityRequirement[]>;
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

    getBlocsList(options?: BlocListOptions, reads?: RenderingResourceReads): Promise<BlocListItemResponse[]>;
    getBlocViewJS(htmlTag: string): Promise<string | null>;
    /** Batch projection used by delivery to avoid one persistence read per rendered Bloc. */
    getBlocViewsJS(htmlTags: readonly string[]): Promise<Readonly<Record<string, string | null>>>;
    /** Compact revision of published site-owned Blocs used by rendered Pages. */
    getSiteBlocsRevision?(reads?: RenderingResourceReads): Promise<string>;
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
    getPublishedPagesByIds?(ids: readonly string[]): Promise<TPage[]>;
    getPublishedPages(): Promise<TPage[]>;
    /** Editorial route record access. Public consumers use `resolvePublishedRoute`. */
    getPageRoute(path: string): Promise<PageRoute | null>;
    getPageRoutes?(paths: readonly string[]): Promise<PageRoute[]>;
    insertPage(path: string, title: string, content?: string): Promise<void>;
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
    getSystem(reads?: RenderingResourceReads): Promise<TSystem>;
    getSystemRevision(reads?: RenderingResourceReads): Promise<number>;
    updateSystem(system: Partial<TSystem>, expectedRevision?: number): Promise<TSystem>;
}
