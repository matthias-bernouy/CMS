import type {
    CmsRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
} from "cms-content/interfaces/CmsRepository";
import type {
    BlocOwnership,
    BlocRecord,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "cms-content/core/validation/documents/pages";
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
    async insertPage(path: string, title: string, content?: string): Promise<void> {
        const validPath = validatePagePath(path);
        const validTitle = validatePageTitle(title);
        if (content === undefined) {
            return this.inner.insertPage(validPath, validTitle);
        }
        const validContent = validatePagePatch({ content }).content!;
        await assertContentRefsExist(this.inner, validContent);
        return this.inner.insertPage(validPath, validTitle, validContent);
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        const valid = validatePagePatch(page);
        if (valid.content !== undefined) {
            await assertContentRefsExist(this.inner, valid.content);
        }
        return this.inner.updatePage(valid);
    }

    // ── Pass-through: blocs (compiled + validated upstream) ────────────────
    createBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.createBloc(validateBlocWrite(bloc));
    }
    replaceBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.replaceBloc(validateBlocWrite(bloc));
    }
    deleteBloc(tag: string, ownership: BlocOwnership): Promise<boolean> {
        return this.inner.deleteBloc(tag, ownership);
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
    getBlocsList(options?: Parameters<CmsRepository["getBlocsList"]>[0]): Promise<BlocListItemResponse[]> {
        return this.inner.getBlocsList(options);
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
    getTagCounts() {
        return this.inner.getTagCounts();
    }

    // ── Pass-through: system (settings validated elsewhere) ────────────────
    getSystem(): Promise<TSystem> {
        return this.inner.getSystem();
    }
    updateSystem(system: Partial<TSystem>): Promise<TSystem> {
        return this.inner.updateSystem(validateSettingsPatch(system));
    }
}
