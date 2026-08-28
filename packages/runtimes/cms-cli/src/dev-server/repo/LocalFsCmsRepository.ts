import type {
    BlocListItemResponse,
    BlocRecord,
    CmsRepository,
    PageLink,
    PagesQuery,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBlocWrite,
} from "@bernouy/cms-content";
import { countValues, isPublishedPage, normalizeTags } from "@bernouy/cms-content";
import type { TBloc, TPage, TSystem } from "@bernouy/cms-content";
import type { BuiltBloc } from "../bloc-build/index";
import { PagesStore } from "./pages";
import { SystemStore } from "./system";
import { BlocsStore } from "./blocs";
import { type LocalSiteBlocPublicationGuard, SiteBlocsStore } from "./siteBlocs";

export type LocalFsCmsRepositoryOptions = {
    blocRootDir?: string;
};

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
    private readonly _pages: PagesStore;
    private readonly _system: SystemStore;
    private readonly _blocs: BlocsStore;
    private readonly _siteBlocs: SiteBlocsStore;

    constructor(siteDir: string, builtBlocs: Map<string, BuiltBloc>, options: LocalFsCmsRepositoryOptions = {}) {
        this._pages = new PagesStore(siteDir);
        this._system = new SystemStore(siteDir);
        this._blocs = new BlocsStore(siteDir, builtBlocs, { rootDir: options.blocRootDir });
        this._siteBlocs = new SiteBlocsStore(this._blocs);
    }

    // ── Bloc ──
    createBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this._blocs.create(bloc);
    }
    replaceBloc(bloc: TBlocWrite): Promise<TBloc> {
        return this._blocs.replace(bloc);
    }
    getBlocRecord(tag: string): Promise<BlocRecord | null> {
        return this._blocs.getRecord(tag);
    }
    getBlocRecords(): Promise<BlocRecord[]> {
        return this._blocs.getRecords();
    }
    createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord> {
        return this._siteBlocs.create(definition);
    }
    saveSiteBlocDraft(
        tag: string,
        draft: SiteBlocSnapshot,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        return this._siteBlocs.saveDraft(tag, draft, expectedDraftRevision);
    }
    async publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: LocalSiteBlocPublicationGuard,
    ): Promise<BlocRecord> {
        await publicationGuard?.assertHeld();
        return this._siteBlocs.publish(tag, artifact, expectedDraftRevision, publicationDate);
    }
    archiveSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this._siteBlocs.setArchived(tag, true, expectedDraftRevision);
    }
    restoreSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this._siteBlocs.setArchived(tag, false, expectedDraftRevision);
    }
    withSiteBlocPublicationLock<T>(operation: (guard: LocalSiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        return this._siteBlocs.withPublicationLock(operation);
    }
    getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return this._blocs.getAllJS();
    }
    getBlocsList(): Promise<BlocListItemResponse[]> {
        return this._blocs.getList();
    }
    getBlocViewJS(tag: string): Promise<string | null> {
        return this._blocs.getViewJS(tag);
    }
    getBlocSource(tag: string): Promise<Record<string, string> | null> {
        return this._blocs.getSource(tag);
    }

    // ── Page ──
    getPage(path: string): Promise<TPage | null> {
        return this._pages.getByPath(path);
    }
    getPageById(id: string): Promise<TPage | null> {
        return this._pages.getById(id);
    }
    getAllPages(): Promise<TPage[]> {
        return this._pages.getAll();
    }
    async getPublishedPage(path: string): Promise<TPage | null> {
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }
    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }
    insertPage(path: string, title: string): Promise<void> {
        return this._pages.insert(path, title);
    }
    updatePage(page: Partial<TPage>): Promise<void> {
        return this._pages.update(page);
    }
    deletePage(id: string): Promise<void> {
        return this._pages.delete(id);
    }
    getLinks(): Promise<PageLink[]> {
        return this._pages.links();
    }
    getPagesMetadata(opts?: PagesQuery) {
        return this._pages.metadata(opts);
    }
    async getTagCounts() {
        return countValues((await this._pages.getAll()).flatMap((p) => normalizeTags((p as { tags: unknown }).tags)));
    }

    // ── System ──
    getSystem(): Promise<TSystem> {
        return this._system.get();
    }
    updateSystem(patch: Partial<TSystem>): Promise<TSystem> {
        return this._system.update(patch);
    }
}
