import type { TBloc, TPage, TSnippet, TSystem, TTemplate } from "./models";
import type { DataProviderConsumers, TDataMockup, TDataProvider, TDataProviderListItem } from "./Data/data";

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
    /** Author-side source map for `p9r pull`. Returns null when the bloc has no source bundle (legacy push). */
    getBlocSource(htmlTag: string): Promise<Record<string, string> | null>;


    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    insertPage(path: string, title: string): Promise<void>;
    getPageById(id: string): Promise<TPage | null>;
    updatePage(page: Partial<TPage>): Promise<void>;
    getLinks(): Promise<PageLink[]>
    getPagesMetadata(): Promise<{id: string, path: string, title: string, tags: string[], visible: boolean}[]>
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

    // DATA PROVIDER
    createDataProvider(provider: Omit<TDataProvider, 'createdAt' | 'lastSyncAt'>): Promise<TDataProvider>;
    getDataProvider(id: string): Promise<TDataProvider | null>;
    getDataProviders(): Promise<TDataProvider[]>;
    /** Slim projection for the admin table — never exposes the raw spec or auth secrets. */
    getDataProvidersList(): Promise<TDataProviderListItem[]>;
    updateDataProvider(id: string, data: Partial<TDataProvider>): Promise<TDataProvider | null>;
    deleteDataProvider(id: string): Promise<void>;
    /** Pages / templates / snippets whose content references the given provider's `server` URL. Empty / whitespace input matches nothing. */
    findConsumersOfProvider(providerServerUrl: string): Promise<DataProviderConsumers>;

    // DATA MOCKUP
    listMockups(providerId: string): Promise<TDataMockup[]>;
    getMockup(providerId: string, method: string, path: string, name: string): Promise<TDataMockup | null>;
    /** Active mockup for the given operation (at most one). Null if none active. */
    getActiveMockup(providerId: string, method: string, path: string): Promise<TDataMockup | null>;
    /** Throws on (providerId, method, path, name) collision. First mockup of an operation becomes active automatically. */
    createMockup(mockup: Omit<TDataMockup, 'updatedAt' | 'active'>): Promise<TDataMockup>;
    /** Patch body / status / name of an existing mockup. Renaming must keep it unique within (providerId, method, path). */
    updateMockup(providerId: string, method: string, path: string, name: string, patch: Partial<Pick<TDataMockup, 'status' | 'body' | 'name'>>): Promise<TDataMockup | null>;
    deleteMockup(providerId: string, method: string, path: string, name: string): Promise<void>;
    /** Set `name` as the active mockup for the operation. Pass `null` to clear active for the operation. */
    setActiveMockup(providerId: string, method: string, path: string, name: string | null): Promise<void>;

}