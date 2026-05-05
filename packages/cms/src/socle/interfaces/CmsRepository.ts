import type { TBloc, TPage, TSnippet, TSystem, TTemplate } from "./models";

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

export interface CmsRepository {

    // BLOC
    createBloc(bloc: TBloc): Promise<TBloc>;
    replaceBloc(bloc: TBloc): Promise<TBloc>;

    getBlocsJS(): Promise<{ id: string, editorJS: string, viewJS: string }[]>;
    getBlocsList(): Promise<BlocListItemResponse[]>;
    getBlocViewJS(htmlTag: string): Promise<string | null>;


    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    insertPage(path: string, title: string): Promise<void>;
    getPageById(id: string): Promise<TPage | null>;
    updatePage(page: Partial<TPage>): Promise<void>;
    getLinks(): Promise<PageLink[]>
    getPagesMetadata(): Promise<{id: string, path: string, title: string, tags: string[], visible: boolean}[]>
    getTemplatesMetadata(): Promise<{id: string, name: string, category: string, createdAt: string}[]>


    // SYSTEM
    getSystem(): Promise<TSystem>;
    updateSystem(system: Partial<TSystem>): Promise<TSystem>;

    // TEMPLATE
    createTemplate(template: Omit<TTemplate, 'id'>): Promise<TTemplate>;
    getTemplateById(id: string): Promise<TTemplate | null>;
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