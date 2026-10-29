import type { RenderingResourceReads } from "cms-content/application/core/RenderingResourceReads";
import { PageMutationValidation } from "cms-content/pages/core/routing/mutations";
import type {
    ContentRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
} from "cms-content/application/interfaces/ContentRepository";
import type {
    BlocRecord,
    SiteBlocGroup,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { planPagePaths } from "cms-content/pages/core/lifecycle/pagePaths";
import { validateSiteBlocGroupInput } from "cms-content/blocs/core/catalogue/siteBlocGroups";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "cms-content/pages/core/validation/page";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import { validateSettingsPatch } from "cms-content/settings/core/validation";
import { validateSiteBlocDefinition, validateSiteBlocSnapshot } from "cms-content/blocs/core/validation";
import { validateBlocArtifact } from "cms-content/application/core/validation/blocArtifact";
import type { ContentBindingValidationOptions } from "cms-content/application/core/validation/bindingCapabilities";
/**
 * Decorator that VALIDATES + NORMALIZES every authored-content write before
 * delegating to the wrapped repository — the single, unbypassable barrier so
 * the same rules apply whether the writer is the admin API, migration tooling,
 * or anything else. Page link checks and mutations are serialized through this
 * facade; persistence revisions remain authoritative.
 *
 * Compose it at the composition root around any real implementation:
 *   `new ValidatingContentRepository(new MongoContentRepository(db))`
 */
export class ValidatingContentRepository implements ContentRepository {
    private readonly pageMutations: PageMutationValidation;
    constructor(
        private readonly inner: ContentRepository,
        private readonly bindingValidation: ContentBindingValidationOptions = {},
    ) {
        this.pageMutations = new PageMutationValidation(inner);
    }
    async getTextContributions(reads?: RenderingResourceReads) {
        return (await this.inner.getTextContributions?.(reads)) ?? { revision: 0, texts: [] };
    }
    async getPageRequirements(page: TPage, reads?: RenderingResourceReads) {
        return (await this.inner.getPageRequirements?.(page, reads)) ?? [];
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
    async insertPage(path: string, title: string, content?: string): Promise<void> {
        const validPath = validatePagePath(path);
        const validTitle = validatePageTitle(title);
        return this.pageMutations.run(async () => {
            if (content === undefined) {
                return this.inner.insertPage(validPath, validTitle, undefined);
            }
            const validContent = validatePagePatch({ content }).content!;
            await assertContentRefsExist(this.inner, validContent, this.bindingValidation);
            await this.pageMutations.content(validContent, [validPath]);
            return this.inner.insertPage(validPath, validTitle, validContent);
        });
    }

    async updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<TPage | null> {
        const valid = validatePagePatch(page);
        return this.pageMutations.run(async () => {
            const current = valid.id ? await this.inner.getPageById(valid.id) : null;
            if (valid.content !== undefined) {
                await assertContentRefsExist(this.inner, valid.content, this.bindingValidation);
            } else if (valid.visible === true && current) {
                await assertContentRefsExist(this.inner, current.content, this.bindingValidation);
            }
            if (current || valid.content !== undefined) {
                await this.pageMutations.content(valid.content ?? current!.content, [
                    ...(current ? [current.path] : []),
                    ...(valid.path ? [valid.path] : []),
                ]);
            }
            return this.inner.updatePage(valid, expectedRevision);
        });
    }

    // ── Pass-through: blocs (compiled + validated upstream) ────────────────
    async createBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.createBloc(await validateBlocArtifact(this.inner, bloc, this.bindingValidation));
    }
    async replaceBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.replaceBloc(await validateBlocArtifact(this.inner, bloc, this.bindingValidation));
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
    async publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: SiteBlocPublicationGuard,
    ): Promise<BlocRecord> {
        return this.inner.publishSiteBloc(
            tag,
            await validateBlocArtifact(this.inner, artifact, this.bindingValidation),
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
    getBlocsList(
        options?: Parameters<ContentRepository["getBlocsList"]>[0],
        reads?: RenderingResourceReads,
    ): Promise<BlocListItemResponse[]> {
        return this.inner.getBlocsList(options, reads);
    }
    getBlocViewJS(htmlTag: string) {
        return this.inner.getBlocViewJS(htmlTag);
    }
    getBlocViewsJS(htmlTags: readonly string[]) {
        return this.inner.getBlocViewsJS(htmlTags);
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
        reference: Parameters<ContentRepository["scanPagesByContentReference"]>[0],
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
    getPublishedPagesByIds(ids: readonly string[]) {
        return (
            this.inner.getPublishedPagesByIds?.(ids) ??
            Promise.all(ids.map((id) => this.inner.getPublishedPageById(id))).then((pages) =>
                pages.filter((page): page is TPage => page !== null),
            )
        );
    }
    getPublishedPages() {
        return this.inner.getPublishedPages();
    }
    getPageRoute(path: string) {
        return this.inner.getPageRoute?.(path) ?? Promise.resolve(null);
    }
    getPageRoutes(paths: readonly string[]) {
        return (
            this.inner.getPageRoutes?.(paths) ??
            Promise.all(paths.map((path) => this.inner.getPageRoute(path))).then((routes) =>
                routes.filter((route): route is NonNullable<typeof route> => route !== null),
            )
        );
    }
    getPageById(id: string) {
        return this.inner.getPageById(id);
    }
    deletePage(id: string, expectedRevision?: number) {
        return this.pageMutations.run(async () => {
            await this.pageMutations.deletion(id);
            return this.inner.deletePage(id, expectedRevision);
        });
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
        return this.pageMutations.run(async () => {
            const system = await this.inner.getSystem();
            const plan = planPagePaths(paths, system);
            return this.inner.setPagePaths!(id, plan.paths, system, expectedPaths, expectedRevision);
        });
    }
    deletePageWithAlternative(id: string, alternativeId: string | null, expectedRevision?: number) {
        if (!this.inner.deletePageWithAlternative) {
            throw new Error("Page deletion with alternatives is not available.");
        }
        return this.pageMutations.run(async () => {
            if (!alternativeId) {
                await this.pageMutations.deletion(id);
            }
            return this.inner.deletePageWithAlternative!(id, alternativeId, expectedRevision);
        });
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

    getSiteBlocsRevision(reads?: RenderingResourceReads): Promise<string> {
        return this.inner.getSiteBlocsRevision?.(reads) ?? Promise.resolve("[]");
    }

    // ── Pass-through: system (settings validated elsewhere) ────────────────
    getSystem(reads?: RenderingResourceReads): Promise<TSystem> {
        return this.inner.getSystem(reads);
    }
    getSystemRevision(reads?: RenderingResourceReads): Promise<number> {
        return this.inner.getSystemRevision(reads);
    }
    updateSystem(system: Partial<TSystem>, expectedRevision?: number): Promise<TSystem> {
        return this.pageMutations.run(() => this.inner.updateSystem(validateSettingsPatch(system), expectedRevision));
    }
}
