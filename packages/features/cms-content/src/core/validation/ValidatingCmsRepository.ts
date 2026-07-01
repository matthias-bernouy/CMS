import type {
    CmsRepository, BlocListItemResponse, PageLink, PageMeta, PagesQuery,
} from "cms-content/interfaces/CmsRepository";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TTemplate } from "cms-content/interfaces/templates";
import type { TSystem } from "cms-content/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "cms-content/core/validation/pages";
import { validateTemplateCreate, validateTemplatePatch } from "cms-content/core/validation/templates";
import { assertContentRefsExist } from "cms-content/core/validation/assertContentRefsExist";
import { validateSettingsPatch } from "cms-content/core/validation/settings";

/**
 * Decorator that VALIDATES + NORMALIZES every authored-content write before
 * delegating to the wrapped repository — the single, unbypassable barrier so
 * the same rules apply whether the writer is the admin API, the `p9r` CLI, or
 * anything else. Reads (and non-content writes: blocs, settings, deletes) are
 * passed straight through.
 *
 * Compose it at the composition root around any real implementation:
 *   `new ValidatingCmsRepository(new MongoCmsRepository(db))`
 */
export class ValidatingCmsRepository implements CmsRepository {
    constructor(private readonly inner: CmsRepository) {}

    // ── Validated authored-content writes ─────────────────────────────────
    async insertPage(path: string, title: string): Promise<void> {
        return this.inner.insertPage(validatePagePath(path), validatePageTitle(title));
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        const valid = validatePagePatch(page);
        if (valid.content !== undefined) await assertContentRefsExist(this.inner, valid.content);
        return this.inner.updatePage(valid);
    }

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        const valid = validateTemplateCreate(template);
        await assertContentRefsExist(this.inner, valid.content);
        return this.inner.createTemplate(valid);
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const valid = validateTemplatePatch(data);
        if (valid.content !== undefined) await assertContentRefsExist(this.inner, valid.content);
        return this.inner.updateTemplate(id, valid);
    }

    // ── Pass-through: blocs (compiled + validated upstream) ────────────────
    createBloc(bloc: TBloc): Promise<TBloc>  { return this.inner.createBloc(bloc); }
    replaceBloc(bloc: TBloc): Promise<TBloc> { return this.inner.replaceBloc(bloc); }
    getBlocsJS()              { return this.inner.getBlocsJS(); }
    getBlocsList(): Promise<BlocListItemResponse[]> { return this.inner.getBlocsList(); }
    getBlocViewJS(htmlTag: string) { return this.inner.getBlocViewJS(htmlTag); }
    getBlocSource(htmlTag: string) { return this.inner.getBlocSource(htmlTag); }

    // ── Pass-through: page reads + non-content writes ──────────────────────
    getPage(path: string)    { return this.inner.getPage(path); }
    getAllPages()            { return this.inner.getAllPages(); }
    getPublishedPage(path: string) { return this.inner.getPublishedPage(path); }
    getPublishedPages()      { return this.inner.getPublishedPages(); }
    getPageById(id: string)  { return this.inner.getPageById(id); }
    deletePage(id: string)   { return this.inner.deletePage(id); }
    getLinks(): Promise<PageLink[]> { return this.inner.getLinks(); }
    getPagesMetadata(opts?: PagesQuery): Promise<PageMeta[]> { return this.inner.getPagesMetadata(opts); }
    getTemplatesMetadata()   { return this.inner.getTemplatesMetadata(); }
    getTagCounts()           { return this.inner.getTagCounts(); }
    getCategoryCounts(resource: "templates") { return this.inner.getCategoryCounts(resource); }

    // ── Pass-through: system (settings validated elsewhere) ────────────────
    getSystem(): Promise<TSystem> { return this.inner.getSystem(); }
    updateSystem(system: Partial<TSystem>): Promise<TSystem> { return this.inner.updateSystem(validateSettingsPatch(system)); }

    // ── Pass-through: template reads + deletes ─────────────────────────────
    getTemplateById(id: string)               { return this.inner.getTemplateById(id); }
    getTemplateByIdentifier(identifier: string){ return this.inner.getTemplateByIdentifier(identifier); }
    getAllTemplates()                          { return this.inner.getAllTemplates(); }
    getTemplateCategories()                    { return this.inner.getTemplateCategories(); }
    deleteTemplate(id: string)                 { return this.inner.deleteTemplate(id); }
}
