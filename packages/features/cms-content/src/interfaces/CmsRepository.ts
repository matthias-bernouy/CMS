import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSnippet } from "cms-content/interfaces/snippets";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";

export type BlocListItemResponse = {
    id: string, 
    name: string, 
    group: string, 
    description: string
}

export type PageLink = {
    path: string;
    title: string;
}

export type PageMeta = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    visible: boolean;
}

/**
 * Filter + sort for the admin Pages listing. Optional everywhere — an empty
 * query lists every page (title asc). Each implementation honours this the best
 * its engine allows (Mongo: in-query `$regex` + sort + indexes; in-memory: a
 * plain filter/sort). Page metadata is NOT encrypted, so unlike `UsersRepository`
 * substring search and sort on title/path are fully supported server-side.
 */
export type PagesQuery = {
    /** Case-insensitive substring matched against title AND path. */
    search?:    string;
    /** Keep only pages carrying this tag. */
    tag?:       string;
    /** "published" → visible only; "draft" → hidden only. */
    visible?:   "published" | "draft";
    sortBy?:    "title" | "path" | "visible";
    sortOrder?: "asc" | "desc";
}

export interface CmsRepository extends ContentReader {

    // BLOC
    createBloc(bloc: TBloc): Promise<TBloc>;
    replaceBloc(bloc: TBloc): Promise<TBloc>;

    getBlocsJS(): Promise<{ id: string, editorJS: string, viewJS: string }[]>;
    getBlocsList(): Promise<BlocListItemResponse[]>;
    getBlocViewJS(htmlTag: string): Promise<string | null>;
    /** Author-side source map for `p9r pull`. Returns null when the bloc has no source bundle (legacy push). */
    getBlocSource(htmlTag: string): Promise<Record<string, string> | null>;


    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    insertPage(path: string, title: string): Promise<void>;
    getPageById(id: string): Promise<TPage | null>;
    updatePage(page: Partial<TPage>): Promise<void>;
    deletePage(id: string): Promise<void>;
    getLinks(): Promise<PageLink[]>
    getPagesMetadata(opts?: PagesQuery): Promise<PageMeta[]>
    getTemplatesMetadata(): Promise<{id: string, identifier: string, name: string, category: string, createdAt: string}[]>


    // SYSTEM
    getSystem(): Promise<TSystem>;
    updateSystem(system: Partial<TSystem>): Promise<TSystem>;

    // TEMPLATE
    createTemplate(template: Omit<TTemplate, 'id'>): Promise<TTemplate>;
    getTemplateById(id: string): Promise<TTemplate | null>;
    getTemplateByIdentifier(identifier: string): Promise<TTemplate | null>;
    getAllTemplates(): Promise<TTemplate[]>;
    /** Distinct, sorted, non-empty `category` values across every template. */
    getTemplateCategories(): Promise<string[]>;
    updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null>;
    deleteTemplate(id: string): Promise<void>;

    // SNIPPET
    createSnippet(snippet: Omit<TSnippet, 'id'>): Promise<TSnippet>;
    getSnippetById(id: string): Promise<TSnippet | null>;
    getSnippetByIdentifier(identifier: string): Promise<TSnippet | null>;
    getAllSnippets(): Promise<TSnippet[]>;
    getSnippetsMetadata(): Promise<{id: string, identifier: string, name: string, category: string, updatedAt: string}[]>;
    updateSnippet(id: string, data: Partial<TSnippet>): Promise<TSnippet | null>;
    deleteSnippet(id: string): Promise<void>;
    findPagesUsingSnippet(identifier: string): Promise<TPage[]>;

}