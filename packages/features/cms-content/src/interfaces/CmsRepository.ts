import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { BlocListOptions } from "cms-content/interfaces/ContentReader";
import type {
    BlocOwnership,
    BlocRecord,
    SiteBlocCollection,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";

export type BlocListItemResponse = {
    id: string;
    name: string;
    group: string;
    description: string;
    thumbnail?: TBloc["thumbnail"];
    compositionHTML?: string;
    internal?: boolean;
    nativeElement?: string;
    ownership: TBloc["ownership"];
};

export type PageLink = {
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
};

export interface CmsRepository extends ContentReader {
    getSiteBlocCollections(): Promise<SiteBlocCollection[]>;
    updateSiteBlocCollection(id: string, input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection>;
    createSiteBlocCollection(input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection>;

    // BLOC
    createBloc(bloc: TBlocWrite): Promise<TBloc>;
    replaceBloc(bloc: TBlocWrite): Promise<TBloc>;
    setBlocCatalogue(tag: string, ownership: BlocOwnership, catalogue: "active" | "inactive"): Promise<void>;
    deleteBloc(tag: string, ownership: BlocOwnership): Promise<boolean>;

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

    getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]>;
    getBlocsList(options?: BlocListOptions): Promise<BlocListItemResponse[]>;
    getBlocViewJS(htmlTag: string): Promise<string | null>;
    /** Author-side source map for resource export. Returns null when the bloc has no source bundle. */
    getBlocSource(htmlTag: string): Promise<Record<string, string> | null>;

    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    getPublishedPage(path: string): Promise<TPage | null>;
    getPublishedPages(): Promise<TPage[]>;
    insertPage(path: string, title: string, content?: string): Promise<void>;
    updatePage(page: Partial<TPage>): Promise<void>;
    deletePage(id: string): Promise<void>;
    getLinks(): Promise<PageLink[]>;
    getPagesMetadata(opts?: PagesQuery): Promise<PageMeta[]>;
    getTagCounts(): Promise<ValueCount[]>;

    // SYSTEM
    getSystem(): Promise<TSystem>;
    updateSystem(system: Partial<TSystem>): Promise<TSystem>;
}
