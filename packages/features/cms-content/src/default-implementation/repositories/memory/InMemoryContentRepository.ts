import { randomUUIDv7 } from "bun";
import type { PageLink, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import { defaultSystem } from "cms-content/core/lifecycle/system";
import { filterAndSortPages } from "cms-content/core/queries/pagesQuery";
import { isPublishedPage } from "cms-content/core/lifecycle/publication";
import { InMemoryBlocRepository } from "cms-content/default-implementation/repositories/memory/InMemoryBlocRepository";
import { DuplicatePagePathError } from "cms-content/core/validation/errors";

export class InMemoryContentRepository extends InMemoryBlocRepository {
    protected readonly pages = new Map<string, TPage>();
    protected system: TSystem = defaultSystem();

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
        if (this.pages.has(path)) {
            throw new DuplicatePagePathError(path);
        }
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
        const collision = this.pages.get(merged.path);
        if (collision && collision.id !== existing.id) {
            throw new DuplicatePagePathError(merged.path);
        }
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
