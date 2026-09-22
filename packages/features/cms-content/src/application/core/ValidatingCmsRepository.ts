import type {
    CmsRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
} from "cms-content/application/interfaces/CmsRepository";
import type {
    BlocRecord,
    SiteBlocCollection,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { validateSiteBlocCollectionInput } from "cms-content/blocs/core/catalogue/siteBlocCollections";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "cms-content/pages/core/validation/page";
import { assertContentRefsExist } from "cms-content/editor/core/markup/validation/assertContentRefsExist";
import { validateSettingsPatch } from "cms-content/settings/core/validation";
import {
    validateBlocWrite,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "cms-content/blocs/core/validation";
/**
 * Decorator that VALIDATES + NORMALIZES every authored-content write before
 * delegating to the wrapped repository — the single, unbypassable barrier so
 * the same rules apply whether the writer is the admin API, migration tooling,
 * or anything else. Reads (and non-content writes: blocs, settings, deletes) are
 * passed straight through.
 *
 * Compose it at the composition root around any real implementation:
 *   `new ValidatingCmsRepository(new MongoCmsRepository(db))`
 */
export class ValidatingCmsRepository implements CmsRepository {
    constructor(private readonly inner: CmsRepository) {}
    getSiteBlocCollections(): Promise<SiteBlocCollection[]> {
        return this.inner.getSiteBlocCollections();
    }
    async createSiteBlocCollection(input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        return this.inner.createSiteBlocCollection(validateSiteBlocCollectionInput(input));
    }
    async updateSiteBlocCollection(id: string, input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        return this.inner.updateSiteBlocCollection(id, validateSiteBlocCollectionInput(input));
    }
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
    getBlocRecord(tag: string): Promise<BlocRecord | null> {
        return this.inner.getBlocRecord(tag);
    }
    getBlocRecords(): Promise<BlocRecord[]> {
        return this.inner.getBlocRecords();
    }
    async createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord> {
        const validated = validateSiteBlocDefinition(definition);
        if (validated.collectionId !== undefined) {
            const collections = await this.getSiteBlocCollections();
            if (!collections.some(({ id }) => id === validated.collectionId)) {
                throw new ContentValidationError("collectionId", "site collection was not found");
            }
        }
        return this.inner.createSiteBloc(validated);
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
    getPublishedPageById(id: string) {
        return this.inner.getPublishedPageById(id);
    }
    getPublishedPages() {
        return this.inner.getPublishedPages();
    }
    getPageRoute(path: string) {
        return this.inner.getPageRoute?.(path) ?? Promise.resolve(null);
    }
    getPageById(id: string) {
        return this.inner.getPageById(id);
    }
    deletePage(id: string) {
        return this.inner.deletePage(id);
    }
    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        _system?: TSystem,
        expectedPaths?: Record<string, string>,
    ) {
        if (!this.inner.setPagePaths) {
            throw new Error("Page path management is not available.");
        }
        const system = await this.inner.getSystem();
        const plan = planPagePaths(paths, system);
        return this.inner.setPagePaths(id, plan.paths, system, expectedPaths);
    }
    deletePageWithAlternative(id: string, alternativeId: string | null) {
        if (!this.inner.deletePageWithAlternative) {
            throw new Error("Page deletion with alternatives is not available.");
        }
        return this.inner.deletePageWithAlternative(id, alternativeId);
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
