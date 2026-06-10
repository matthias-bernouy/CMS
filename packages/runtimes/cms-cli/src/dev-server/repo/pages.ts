import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TPage, PageMeta, PagesQuery } from "@bernouy/cms-content";
import { filterAndSortPages } from "@bernouy/cms-content";
import { scanPages } from "cms-cli/push/pages/scan";
import { serializeFrontmatter } from "cms-cli/push/shared/frontmatterWrite";

/**
 * Filesystem-backed page store. IDs are the URL path itself (`/about`, `/`)
 * — stable across dev restarts so editor URLs don't break on reload.
 */
export class PagesStore {
    constructor(private readonly siteDir: string) {}

    async getAll(): Promise<TPage[]> {
        const local = await scanPages(this.siteDir);
        return local.map(p => this._toTPage(p.path, p.frontmatter, p.content));
    }

    async getByPath(path: string): Promise<TPage | null> {
        return (await this.getAll()).find(p => p.path === path) ?? null;
    }

    async getById(id: string): Promise<TPage | null> {
        return this.getByPath(id);
    }

    async insert(path: string, title: string): Promise<void> {
        const file = this._fileForPath(path);
        if (existsSync(file)) throw new Error(`Page already exists at ${path}`);
        await this._write(file, { title, description: "", visible: true, tags: [] }, "<p></p>");
    }

    async update(page: Partial<TPage>): Promise<void> {
        if (!page.path) throw new Error("updatePage requires `path`");
        const file = this._fileForPath(page.path);
        await this._write(file, {
            title:       page.title       ?? "",
            description: page.description ?? "",
            visible:     page.visible     ?? true,
            tags:        page.tags        ?? [],
        }, page.content ?? "");
    }

    async links(): Promise<{ path: string; title: string }[]> {
        return (await this.getAll()).map(p => ({ path: p.path, title: p.title }));
    }

    async metadata(opts: PagesQuery = {}): Promise<PageMeta[]> {
        const all: PageMeta[] = (await this.getAll()).map(p => ({
            id: p.id, path: p.path, title: p.title, tags: p.tags, visible: p.visible,
        }));
        return filterAndSortPages(all, opts);
    }

    private _toTPage(path: string, fm: { title: string; description: string; visible: boolean; tags: string[] }, content: string): TPage {
        return { id: path, path, title: fm.title, description: fm.description, content, visible: fm.visible, tags: fm.tags };
    }

    private _fileForPath(urlPath: string): string {
        const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "") + ".html";
        return join(this.siteDir, "pages", ...rel.split("/"));
    }

    private async _write(file: string, fm: { title: string; description: string; visible: boolean; tags: string[] }, content: string): Promise<void> {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, serializeFrontmatter(fm) + content, "utf-8");
    }

    async delete(path: string): Promise<void> {
        const file = this._fileForPath(path);
        if (existsSync(file)) await unlink(file);
    }
}

