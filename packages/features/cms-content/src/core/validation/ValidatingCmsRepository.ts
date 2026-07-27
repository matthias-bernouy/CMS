import type {
    CmsRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
} from "cms-content/interfaces/CmsRepository";
import type { BlocRecord, SiteBlocDefinition, SiteBlocSnapshot, TBloc, TBlocWrite } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TTemplate } from "cms-content/interfaces/templates";
import type { TSystem } from "cms-content/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "cms-content/core/validation/documents/pages";
import { validateTemplateCreate, validateTemplatePatch } from "cms-content/core/validation/documents/templates";
import { assertContentRefsExist } from "cms-content/core/validation/documents/assertContentRefsExist";
import { validateSettingsPatch } from "cms-content/core/validation/settings";
import {
    validateBlocWrite,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "cms-content/core/validation/blocs";
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
        if (valid.content !== undefined) {
            await assertContentRefsExist(this.inner, valid.content);
        }
        return this.inner.updatePage(valid);
    }

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        const valid = validateTemplateCreate(template);
        await assertContentRefsExist(this.inner, valid.content);
        return this.inner.createTemplate(valid);
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const valid = validateTemplatePatch(data);
        if (valid.content !== undefined) {
            await assertContentRefsExist(this.inner, valid.content);
        }
        return this.inner.updateTemplate(id, valid);
    }

    // ── Pass-through: blocs (compiled + validated upstream) ────────────────
    createBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.createBloc(validateBlocWrite(bloc));
    }
    replaceBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.replaceBloc(validateBlocWrite(bloc));
    }
    getBlocRecord(tag: string): Promise<BlocRecord | null> {
        return this.inner.getBlocRecord(tag);
    }
    getBlocRecords(): Promise<BlocRecord[]> {
        return this.inner.getBlocRecords();
    }
    createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord> {
        return this.inner.createSiteBloc(validateSiteBlocDefinition(definition));
    }
    saveSiteBlocDraft(
        tag: string,
        draft: SiteBlocSnapshot,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        return this.inner.saveSiteBlocDraft(tag, validateSiteBlocSnapshot(draft, tag), expectedDraftRevision);
    }
    publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: SiteBlocPublicationGuard,
    ): Promise<BlocRecord> {
        return this.inner.publishSiteBloc(
            tag,
            validateBlocWrite(artifact),
            expectedDraftRevision,
            publicationDate,
            publicationGuard,
        );
    }
    archiveSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.inner.archiveSiteBloc(tag, expectedDraftRevision);
    }
    restoreSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.inner.restoreSiteBloc(tag, expectedDraftRevision);
    }
    withSiteBlocPublicationLock<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        return this.inner.withSiteBlocPublicationLock(operation);
    }
    getBlocsJS() {
        return this.inner.getBlocsJS();
    }
    getBlocsList(): Promise<BlocListItemResponse[]> {
        return this.inner.getBlocsList();
    }
    getBlocViewJS(htmlTag: string) {
        return this.inner.getBlocViewJS(htmlTag);
    }
    getBlocSource(htmlTag: string) {
        return this.inner.getBlocSource(htmlTag);
    }

    // ── Pass-through: page reads + non-content writes ──────────────────────
    getPage(path: string) {
        return this.inner.getPage(path);
    }
    getAllPages() {
        return this.inner.getAllPages();
    }
    getPublishedPage(path: string) {
        return this.inner.getPublishedPage(path);
    }
    getPublishedPages() {
        return this.inner.getPublishedPages();
    }
    getPageById(id: string) {
        return this.inner.getPageById(id);
    }
    deletePage(id: string) {
        return this.inner.deletePage(id);
    }
    getLinks(): Promise<PageLink[]> {
        return this.inner.getLinks();
    }
    getPagesMetadata(opts?: PagesQuery): Promise<PageMeta[]> {
        return this.inner.getPagesMetadata(opts);
    }
    getTemplatesMetadata() {
        return this.inner.getTemplatesMetadata();
    }
    getTagCounts() {
        return this.inner.getTagCounts();
    }
    getCategoryCounts(resource: "templates") {
        return this.inner.getCategoryCounts(resource);
    }

    // ── Pass-through: system (settings validated elsewhere) ────────────────
    getSystem(): Promise<TSystem> {
        return this.inner.getSystem();
    }
    updateSystem(system: Partial<TSystem>): Promise<TSystem> {
        return this.inner.updateSystem(validateSettingsPatch(system));
    }

    // ── Pass-through: template reads + deletes ─────────────────────────────
    getTemplateById(id: string) {
        return this.inner.getTemplateById(id);
    }
    getTemplateByIdentifier(identifier: string) {
        return this.inner.getTemplateByIdentifier(identifier);
    }
    getAllTemplates() {
        return this.inner.getAllTemplates();
    }
    getTemplateCategories() {
        return this.inner.getTemplateCategories();
    }
    deleteTemplate(id: string) {
        return this.inner.deleteTemplate(id);
    }
}
