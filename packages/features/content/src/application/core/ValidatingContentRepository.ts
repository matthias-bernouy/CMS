import type { RenderingResourceReads } from "content/application/core/RenderingResourceReads";
import { PageMutationValidation } from "content/pages/core/routing/mutations";
import type {
    ContentRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
} from "content/application/interfaces/ContentRepository";
import type {
    BlocRecord,
    SiteBlocGroup,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "content/blocs/interfaces/blocs";
import type { TPage } from "content/pages/interfaces/pages";
import { ContentValidationError } from "content/application/core/validation/errors";
import { planPagePaths } from "content/pages/core/lifecycle/pagePaths";
import { validateSiteBlocGroupInput } from "content/blocs/core/catalogue/siteBlocGroups";
import type { TSystem } from "content/settings/interfaces/settings";
import { validatePagePath, validatePageTitle, validatePagePatch } from "content/pages/core/validation/page";
import { assertContentRefsExist } from "content/blocs/core/markup/validation/assertContentRefsExist";
import { validateSettingsPatch } from "content/settings/core/validation";
import { validateSiteBlocDefinition, validateSiteBlocSnapshot } from "content/blocs/core/validation";
import { validateBlocArtifact } from "content/application/core/validation/blocArtifact";
import { assertBlocPageConsumers } from "content/application/core/validation/blocConsumers";
import type { ContentBindingValidationOptions } from "content/application/core/validation/bindingCapabilities";
import type { ContentDiagnostic, PageWriteFeedback, PageWriteResult } from "content/application/interfaces/diagnostics";
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
    async insertPage(path: string, title: string, content?: string): Promise<void | PageWriteFeedback> {
        const validPath = validatePagePath(path);
        const validTitle = validatePageTitle(title);
        return this.pageMutations.run(async () => {
            if (content === undefined) {
                return this.inner.insertPage(validPath, validTitle, undefined);
            }
            const validContent = validatePagePatch({ content }).content!;
            const analysis = await assertContentRefsExist(this.inner, validContent, this.bindingValidation);
            const diagnostics = await this.pageMutations.content(validContent, [validPath], false, analysis);
            await this.inner.insertPage(validPath, validTitle, validContent);
            return { diagnostics };
        });
    }

    async updatePage(page: Partial<TPage>, expectedRevision?: number): Promise<PageWriteResult | null> {
        const valid = validatePagePatch(page);
        return this.pageMutations.run(async () => {
            const current = valid.id ? await this.inner.getPageById(valid.id) : null;
            let diagnostics: readonly ContentDiagnostic[] = [];
            if (valid.visible === false && current?.visible === true) {
                diagnostics = await this.pageMutations.unpublication(current.id);
            }
            if (valid.content !== undefined || (valid.visible === true && current)) {
                const html = valid.content ?? current!.content;
                const analysis = await assertContentRefsExist(this.inner, html, this.bindingValidation);
                diagnostics = await this.pageMutations.content(
                    html,
                    [...(current ? [current.path] : []), ...(valid.path ? [valid.path] : [])],
                    valid.visible ?? current?.visible ?? false,
                    analysis,
                    current?.id,
                );
            }
            const updated = await this.inner.updatePage(valid, expectedRevision);
            return updated ? { ...updated, diagnostics } : null;
        });
    }

    // ── Pass-through: blocs (compiled + validated upstream) ────────────────
    async createBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this.inner.createBloc(await validateBlocArtifact(this.inner, bloc, this.bindingValidation));
    }
    async replaceBloc(bloc: TBlocWrite): Promise<TBloc> {
        const artifact = await validateBlocArtifact(this.inner, bloc, this.bindingValidation);
        return this.pageMutations.run(async () => {
            await assertBlocPageConsumers(this.inner, artifact);
            return this.inner.replaceBloc(artifact);
        });
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
        const validated = await validateBlocArtifact(this.inner, artifact, this.bindingValidation);
        return this.pageMutations.run(async () => {
            await assertBlocPageConsumers(this.inner, validated);
            return this.inner.publishSiteBloc(tag, validated, expectedDraftRevision, publicationDate, publicationGuard);
        });
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
    getPagesByIds(ids: readonly string[]) {
        return (
            this.inner.getPagesByIds?.(ids) ??
            Promise.all(ids.map((id) => this.inner.getPageById(id))).then((pages) =>
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
