import type { CmsRepository, BlocListItemResponse, PageLink, PagesQuery } from "@bernouy/cms-content";
import { countValues, isPublishedPage, normalizeTags } from "@bernouy/cms-content";
import type { TBloc, TPage, TSnippet, TSystem, TTemplate } from "@bernouy/cms-content";
import type { BuiltBloc } from "../build";
import { PagesStore } from "./pages";
import { SnippetsStore } from "./snippets";
import { TemplatesStore } from "./templates";
import { SystemStore } from "./system";
import { BlocsStore } from "./blocs";

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

    constructor(siteDir: string, builtBlocs: Map<string, BuiltBloc>) {
        this._pages         = new PagesStore(siteDir);
        this._snippets      = new SnippetsStore(siteDir);
        this._templates     = new TemplatesStore(siteDir);
        this._system        = new SystemStore(siteDir);
        this._blocs         = new BlocsStore(siteDir, builtBlocs);
    }

    // ── Bloc ──
    createBloc(bloc: TBloc):  Promise<TBloc> { return this._blocs.create(bloc); }
    replaceBloc(bloc: TBloc): Promise<TBloc> { return this._blocs.replace(bloc); }
    getBlocsJS():            Promise<{ id: string; editorJS: string; viewJS: string }[]> { return this._blocs.getAllJS(); }
    getBlocsList():          Promise<BlocListItemResponse[]>                              { return this._blocs.getList(); }
    getBlocViewJS(tag: string):                Promise<string | null>                     { return this._blocs.getViewJS(tag); }
    getBlocSource(tag: string):                Promise<Record<string, string> | null>     { return this._blocs.getSource(tag); }

    // ── Page ──
    getPage(path: string):                     Promise<TPage | null> { return this._pages.getByPath(path); }
    getPageById(id: string):                   Promise<TPage | null> { return this._pages.getById(id); }
    getAllPages():                             Promise<TPage[]>      { return this._pages.getAll(); }
    async getPublishedPage(path: string): Promise<TPage | null> {
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }
    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }
    insertPage(path: string, title: string):   Promise<void>         { return this._pages.insert(path, title); }
    updatePage(page: Partial<TPage>):          Promise<void>         { return this._pages.update(page); }
    deletePage(id: string):                    Promise<void>         { return this._pages.delete(id); }
    getLinks():                                Promise<PageLink[]>   { return this._pages.links(); }
    getPagesMetadata(opts?: PagesQuery) { return this._pages.metadata(opts); }
    getTemplatesMetadata() { return this._templates.metadata(); }
    async getTagCounts() {
        return countValues((await this._pages.getAll()).flatMap(p => normalizeTags((p as { tags: unknown }).tags)));
    }
    async getCategoryCounts(resource: "snippets" | "templates") {
        const values = resource === "snippets"
            ? (await this._snippets.getAll()).map(s => s.category)
            : (await this._templates.getAll()).map(t => t.category);
        return countValues(values);
    }

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
}
