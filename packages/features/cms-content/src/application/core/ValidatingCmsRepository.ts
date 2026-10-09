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
    SiteBlocGroup,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
import type { PageCreateOptions, TPage } from "cms-content/pages/interfaces/pages";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { validateSiteBlocGroupInput } from "cms-content/blocs/core/catalogue/siteBlocGroups";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import {
    validatePageCreateOptions,
    validatePagePath,
    validatePageTitle,
    validatePagePatch,
} from "cms-content/pages/core/validation/page";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import { assertContentSupportsSurface } from "cms-content/blocs/core/markup/validation/assertContentSurface";
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
    async getContentContributions() {
        return (await this.inner.getContentContributions?.()) ?? { revision: 0, pages: [], texts: [] };
    }
    getSiteBlocGroups(): Promise<SiteBlocGroup[]> {
        return this.inner.getSiteBlocGroups();
    }
    async createSiteBlocGroup(input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup> {
        return this.inner.createSiteBlocGroup(validateSiteBlocGroupInput(input));
    }
    async updateSiteBlocGroup(id: string, input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup> {
        return this.inner.updateSiteBlocGroup(id, validateSiteBlocGroupInput(input));
    }
    // ── Validated authored-content writes ─────────────────────────────────
    async insertPage(path: string, title: string, content?: string, options?: PageCreateOptions): Promise<void> {
        const validPath = validatePagePath(path);
        const validTitle = validatePageTitle(title);
        const validOptions = validatePageCreateOptions(options);
        if (content === undefined) {
            return this.inner.insertPage(validPath, validTitle, undefined, validOptions);
        }
        const validContent = validatePagePatch({ content }).content!;
        await assertContentRefsExist(this.inner, validContent);
        await assertContentSupportsSurface(this.inner, validContent, validOptions?.surface ?? "delivery");
        return this.inner.insertPage(validPath, validTitle, validContent, validOptions);
    }

    async updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<TPage | null> {
        const valid = validatePagePatch(page);
        const current =
            valid.id &&
            (valid.content !== undefined || valid.surface !== undefined || valid.visible === true) &&
            this.inner.getPageById
                ? await this.inner.getPageById(valid.id)
                : null;
        if (current && valid.surface !== undefined && valid.surface !== current.surface) {
            throw new ContentValidationError("surface", "cannot change after Page creation");
        }
        if (valid.content !== undefined) {
            await assertContentRefsExist(this.inner, valid.content);
            await assertContentSupportsSurface(
                this.inner,
                valid.content,
                current?.surface ?? valid.surface ?? "delivery",
            );
        } else if (valid.visible === true && current) {
            await assertContentRefsExist(this.inner, current.content);
            await assertContentSupportsSurface(this.inner, current.content, current.surface);
        }
        return this.inner.updatePage(valid, expectedRevision);
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
        if (validated.groupId !== undefined) {
            const groups = await this.getSiteBlocGroups();
            if (!groups.some(({ id }) => id === validated.groupId)) {
                throw new ContentValidationError("groupId", "site Bloc group was not found");
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
    scanPages(cursor: string | undefined, limit: number) {
        return this.inner.scanPages(cursor, limit);
    }
    scanPagesByContentReference(
        reference: Parameters<CmsRepository["scanPagesByContentReference"]>[0],
        cursor: string | undefined,
        limit: number,
    ) {
        return this.inner.scanPagesByContentReference(reference, cursor, limit);
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
    deletePage(id: string, expectedRevision?: number) {
        return this.inner.deletePage(id, expectedRevision);
    }
    async setPagePaths(
        id: string,
        paths: Record<string, string>,
        _system?: TSystem,
        expectedPaths?: Record<string, string>,
        expectedRevision?: number,
    ) {
        if (!this.inner.setPagePaths) {
            throw new Error("Page path management is not available.");
        }
        const system = await this.inner.getSystem();
        const plan = planPagePaths(paths, system);
        return this.inner.setPagePaths(id, plan.paths, system, expectedPaths, expectedRevision);
    }
    deletePageWithAlternative(id: string, alternativeId: string | null, expectedRevision?: number) {
        if (!this.inner.deletePageWithAlternative) {
            throw new Error("Page deletion with alternatives is not available.");
        }
        return this.inner.deletePageWithAlternative(id, alternativeId, expectedRevision);
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
    getSystemRevision(): Promise<number> {
        return this.inner.getSystemRevision();
    }
    updateSystem(system: Partial<TSystem>, expectedRevision?: number): Promise<TSystem> {
        return this.inner.updateSystem(validateSettingsPatch(system), expectedRevision);
    }
}
