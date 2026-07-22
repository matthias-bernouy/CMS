import { randomUUIDv7 } from "bun";
import type { BlocListItemResponse, PageLink, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";
import { defaultSystem } from "cms-content/core/lifecycle/system";
import { filterAndSortPages } from "cms-content/core/queries/pagesQuery";
import { DuplicateBlocTagError } from "cms-content/core/validation/errors";
import { isPublishedPage } from "cms-content/core/lifecycle/publication";

export class InMemoryContentRepository {
    protected readonly blocs = new Map<string, TBloc>();
    protected readonly pages = new Map<string, TPage>();
    protected readonly templates = new Map<string, TTemplate>();
    protected system: TSystem = defaultSystem();

    async createBloc(bloc: TBloc): Promise<TBloc> {
        if (this.blocs.has(bloc.id)) {
            throw new DuplicateBlocTagError(bloc.id);
        }
        this.blocs.set(bloc.id, { ...bloc });
        return bloc;
    }

    async replaceBloc(bloc: TBloc): Promise<TBloc> {
        this.blocs.set(bloc.id, { ...bloc });
        return bloc;
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return Array.from(this.blocs.values()).map((bloc) => ({
            id: bloc.id,
            editorJS: bloc.editorJS,
            viewJS: bloc.viewJS,
        }));
    }

    async getBlocsList(): Promise<BlocListItemResponse[]> {
        return Array.from(this.blocs.values()).map((bloc) => ({
            id: bloc.id,
            name: bloc.name,
            group: bloc.group || "",
            description: bloc.description || "",
        }));
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        return this.blocs.get(htmlTag)?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        const source = this.blocs.get(htmlTag)?.source;
        return source ? { ...source } : null;
    }

    async getPage(path: string): Promise<TPage | null> {
        const found = this.pages.get(path);
        return found ? { ...found } : null;
    }

    async getAllPages(): Promise<TPage[]> {
        return Array.from(this.pages.values()).map((page) => ({ ...page }));
    }

    async getPublishedPage(path: string): Promise<TPage | null> {
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }

    async insertPage(path: string, title: string): Promise<void> {
        const page: TPage = {
            id: randomUUIDv7(),
            path,
            title,
            content: "<p></p>",
            description: "",
            tags: [],
            visible: false,
        };
        this.pages.set(page.path, page);
    }

    async getPageById(id: string): Promise<TPage | null> {
        const entry = this.findPageEntryById(id);
        return entry ? { ...entry[1] } : null;
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const entry = this.findPageEntryById(page.id);
        if (!entry) {
            return;
        }
        const [oldPath, existing] = entry;
        const merged: TPage = { ...existing, ...page } as TPage;
        if (oldPath !== merged.path) {
            this.pages.delete(oldPath);
        }
        this.pages.set(merged.path, merged);
    }

    async deletePage(id: string): Promise<void> {
        const entry = this.findPageEntryById(id);
        if (entry) {
            this.pages.delete(entry[0]);
        }
    }

    async getLinks(): Promise<PageLink[]> {
        return Array.from(this.pages.values()).map((page) => ({ path: page.path, title: page.title }));
    }

    async getPagesMetadata(options: PagesQuery = {}): Promise<PageMeta[]> {
        return filterAndSortPages(
            Array.from(this.pages.values()).map((page) => ({
                id: page.id,
                path: page.path,
                title: page.title,
                tags: [...page.tags],
                visible: page.visible,
            })),
            options,
        );
    }

    private findPageEntryById(id: string): [string, TPage] | null {
        for (const [path, page] of this.pages) {
            if (page.id === id) {
                return [path, page];
            }
        }
        return null;
    }
}
