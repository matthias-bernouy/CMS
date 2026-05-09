import type { CmsRepository, BlocListItemResponse, PageLink } from "src/socle/interfaces/CmsRepository";
import type { TBloc, TPage, TSnippet, TSystem, TTemplate } from "src/socle/interfaces/models";
import type { DataProviderConsumers, TDataMockup, TDataProvider, TDataProviderListItem } from "src/socle/interfaces/Data/data";
import { findConsumersInCollections } from "src/socle/utils/dataProviderRefs";
import type { BuiltBloc } from "../build";
import { PagesStore } from "./pages";
import { SnippetsStore } from "./snippets";
import { TemplatesStore } from "./templates";
import { SystemStore } from "./system";
import { BlocsStore } from "./blocs";
import { DataProvidersStore } from "./dataProviders";
import { MockupsStore } from "./mockups";

/**
 * Filesystem-backed `CmsRepository` for `p9r dev`. Each call hits the local
 * `site/` directory directly; no remote, no DB, no auth. Bloc builds are
 * cached in memory and invalidated by the watcher.
 *
 * Writes persist back to the same files, so saves are immediately visible
 * in `git diff`. There's no scratch overlay — the live filesystem IS the
 * source of truth in dev.
 */
export class LocalFsCmsRepository implements CmsRepository {
    private readonly _pages:         PagesStore;
    private readonly _snippets:      SnippetsStore;
    private readonly _templates:     TemplatesStore;
    private readonly _system:        SystemStore;
    private readonly _blocs:         BlocsStore;
    private readonly _dataProviders: DataProvidersStore;
    private readonly _mockups:       MockupsStore;

    constructor(siteDir: string, builtBlocs: Map<string, BuiltBloc>) {
        this._pages         = new PagesStore(siteDir);
        this._snippets      = new SnippetsStore(siteDir);
        this._templates     = new TemplatesStore(siteDir);
        this._system        = new SystemStore(siteDir);
        this._blocs         = new BlocsStore(builtBlocs);
        this._dataProviders = new DataProvidersStore(siteDir);
        this._mockups       = new MockupsStore(siteDir);
    }

    // ── Bloc ──
    createBloc(_bloc: TBloc):  Promise<TBloc> { return this._blocs.rejectWrite(); }
    replaceBloc(_bloc: TBloc): Promise<TBloc> { return this._blocs.rejectWrite(); }
    getBlocsJS():            Promise<{ id: string; editorJS: string; viewJS: string }[]> { return this._blocs.getAllJS(); }
    getBlocsList():          Promise<BlocListItemResponse[]>                              { return this._blocs.getList(); }
    getBlocViewJS(tag: string):                Promise<string | null>                     { return this._blocs.getViewJS(tag); }
    getBlocSource(tag: string):                Promise<Record<string, string> | null>     { return this._blocs.getSource(tag); }

    // ── Page ──
    getPage(path: string):                     Promise<TPage | null> { return this._pages.getByPath(path); }
    getPageById(id: string):                   Promise<TPage | null> { return this._pages.getById(id); }
    getAllPages():                             Promise<TPage[]>      { return this._pages.getAll(); }
    insertPage(path: string, title: string):   Promise<void>         { return this._pages.insert(path, title); }
    updatePage(page: Partial<TPage>):          Promise<void>         { return this._pages.update(page); }
    getLinks():                                Promise<PageLink[]>   { return this._pages.links(); }
    getPagesMetadata() { return this._pages.metadata(); }
    getTemplatesMetadata() { return this._templates.metadata(); }

    // ── System ──
    getSystem():                               Promise<TSystem> { return this._system.get(); }
    updateSystem(patch: Partial<TSystem>):     Promise<TSystem> { return this._system.update(patch); }

    // ── Template ──
    createTemplate(template: Omit<TTemplate, "id">):       Promise<TTemplate>          { return this._templates.create(template); }
    getTemplateById(id: string):                           Promise<TTemplate | null>   { return this._templates.getById(id); }
    getTemplateByIdentifier(identifier: string):           Promise<TTemplate | null>   { return this._templates.getByIdentifier(identifier); }
    getAllTemplates():                                     Promise<TTemplate[]>        { return this._templates.getAll(); }
    getTemplateCategories():                               Promise<string[]>           { return this._templates.categories(); }
    updateTemplate(id: string, data: Partial<TTemplate>):  Promise<TTemplate | null>   { return this._templates.update(id, data); }
    deleteTemplate(id: string):                            Promise<void>               { return this._templates.delete(id); }

    // ── Snippet ──
    createSnippet(s: Omit<TSnippet, "id">):                Promise<TSnippet>           { return this._snippets.create(s); }
    getSnippetById(id: string):                            Promise<TSnippet | null>    { return this._snippets.getById(id); }
    getSnippetByIdentifier(identifier: string):            Promise<TSnippet | null>    { return this._snippets.getByIdentifier(identifier); }
    getAllSnippets():                                      Promise<TSnippet[]>         { return this._snippets.getAll(); }
    getSnippetsMetadata() { return this._snippets.metadata(); }
    updateSnippet(id: string, data: Partial<TSnippet>):    Promise<TSnippet | null>    { return this._snippets.update(id, data); }
    deleteSnippet(id: string):                             Promise<void>               { return this._snippets.delete(id); }
    async findPagesUsingSnippet(identifier: string): Promise<TPage[]> {
        return this._snippets.findPagesUsing(identifier, await this._pages.getAll());
    }

    // ── Data providers ──

    async createDataProvider(p: Omit<TDataProvider, "createdAt" | "lastSyncAt">): Promise<TDataProvider> { return this._dataProviders.create(p); }
    getDataProvider(id: string):                                  Promise<TDataProvider | null>     { return this._dataProviders.getById(id); }
    getDataProviders():                                           Promise<TDataProvider[]>          { return this._dataProviders.getAll(); }
    getDataProvidersList():                                       Promise<TDataProviderListItem[]>  { return this._dataProviders.list(); }
    updateDataProvider(id: string, data: Partial<TDataProvider>): Promise<TDataProvider | null>     { return this._dataProviders.update(id, data); }
    async deleteDataProvider(id: string):                         Promise<void>                     { await this._dataProviders.delete(id); await this._mockups.deleteAllFor(id); }

    async findConsumersOfProvider(providerId: string): Promise<DataProviderConsumers> {
        const [pages, templates, snippets] = await Promise.all([
            this._pages.getAll(),
            this._templates.getAll(),
            this._snippets.getAll(),
        ]);
        return findConsumersInCollections(providerId, pages, templates, snippets);
    }

    // ── Data mockups ──

    listMockups(providerId: string):                                                                                                          Promise<TDataMockup[]>      { return this._mockups.listFor(providerId); }
    getMockup(providerId: string, method: string, path: string, name: string):                                                                Promise<TDataMockup | null> { return this._mockups.get(providerId, method, path, name); }
    getActiveMockup(providerId: string, method: string, path: string):                                                                        Promise<TDataMockup | null> { return this._mockups.getActive(providerId, method, path); }
    createMockup(input: Omit<TDataMockup, "updatedAt" | "active">):                                                                           Promise<TDataMockup>        { return this._mockups.create(input); }
    updateMockup(providerId: string, method: string, path: string, name: string, patch: Partial<Pick<TDataMockup, "status" | "body" | "name">>): Promise<TDataMockup | null> { return this._mockups.update(providerId, method, path, name, patch); }
    deleteMockup(providerId: string, method: string, path: string, name: string):                                                             Promise<void>               { return this._mockups.delete(providerId, method, path, name); }
    setActiveMockup(providerId: string, method: string, path: string, name: string | null):                                                   Promise<void>               { return this._mockups.setActive(providerId, method, path, name); }
}
