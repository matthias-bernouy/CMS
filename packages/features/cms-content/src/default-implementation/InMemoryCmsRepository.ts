import { randomUUIDv7 } from "bun";
import type { BlocListItemResponse, CmsRepository, PageLink, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSnippet } from "cms-content/interfaces/snippets";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";
import { filterAndSortPages } from "cms-content/core/pagesQuery";
import { snippetRefPattern } from "cms-content/core/utils/contentRefs";
import { defaultSystem, mergeSystemUpdate } from "cms-content/core/system";
import { countValues, normalizeTags } from "cms-content/core/counts";
import { DuplicateBlocTagError } from "cms-content/core/errors";
import { isPublishedPage } from "cms-content/core/publication";

/**
 * In-memory implementation of `CmsRepository` for local dev and tests. No
 * persistence — data is lost when the process exits. Mirrors the semantics
 * of `MongoCmsRepository` so swapping providers in `App.ts` is transparent
 * to consumers.
 *
 * Reads and writes do shallow defensive copies so callers can't mutate
 * stored entries through returned references — the same isolation Mongo
 * gets for free through serialization.
 */
export class InMemoryCmsRepository implements CmsRepository {

    // ── Storage ──

    private _blocs         = new Map<string, TBloc>();          // by tag (= TBloc.id)
    private _pages         = new Map<string, TPage>();          // by path (unique key)
    private _snippets      = new Map<string, TSnippet>();       // by id
    private _templates     = new Map<string, TTemplate>();      // by id
    private _system: TSystem = defaultSystem();

    // ── Blocs ──

    async createBloc(bloc: TBloc): Promise<TBloc> {
        if (this._blocs.has(bloc.id)) {
            throw new DuplicateBlocTagError(bloc.id);
        }
        this._blocs.set(bloc.id, { ...bloc });
        return bloc;
    }

    async replaceBloc(bloc: TBloc): Promise<TBloc> {
        this._blocs.set(bloc.id, { ...bloc });
        return bloc;
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return Array.from(this._blocs.values()).map(b => ({
            id:       b.id,
            editorJS: b.editorJS,
            viewJS:   b.viewJS,
        }));
    }

    async getBlocsList(): Promise<BlocListItemResponse[]> {
        return Array.from(this._blocs.values()).map(b => ({
            id:          b.id,
            name:        b.name,
            group:       b.group       || "",
            description: b.description || "",
        }));
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        return this._blocs.get(htmlTag)?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        const source = this._blocs.get(htmlTag)?.source;
        return source ? { ...source } : null;
    }

    // ── Pages ──

    async getPage(path: string): Promise<TPage | null> {
        const found = this._pages.get(path);
        return found ? { ...found } : null;
    }

    async getAllPages(): Promise<TPage[]> {
        return Array.from(this._pages.values()).map(p => ({ ...p }));
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
            id:          randomUUIDv7(),
            path,
            title,
            content:     "<p></p>",
            description: "",
            tags:        [],
            visible:     false,
        };
        this._pages.set(page.path, page);
    }

    async getPageById(id: string): Promise<TPage | null> {
        for (const p of this._pages.values()) {
            if (p.id === id) return { ...p };
        }
        return null;
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) throw new Error("updatePage requires `id` on the input.");
        const entry = this._findPageEntryById(page.id);
        if (!entry) return;
        const [oldPath, existing] = entry;
        const merged: TPage = { ...existing, ...page } as TPage;
        // Path may have changed — re-index under the new key so `getPage`
        // doesn't keep returning the stale entry at the old path.
        if (oldPath !== merged.path) this._pages.delete(oldPath);
        this._pages.set(merged.path, merged);
    }

    async deletePage(id: string): Promise<void> {
        const entry = this._findPageEntryById(id);
        if (entry) this._pages.delete(entry[0]);
    }

    async getLinks(): Promise<PageLink[]> {
        return Array.from(this._pages.values()).map(p => ({
            path:  p.path,
            title: p.title,
        }));
    }

    async getPagesMetadata(opts: PagesQuery = {}): Promise<PageMeta[]> {
        return filterAndSortPages(
            Array.from(this._pages.values()).map(p => ({
                id:      p.id,
                path:    p.path,
                title:   p.title,
                tags:    [...p.tags],
                visible: p.visible,
            })),
            opts,
        );
    }

    async getTemplatesMetadata(): Promise<{ id: string; identifier: string; name: string; category: string; createdAt: string }[]> {
        return Array.from(this._templates.values()).map(t => ({
            id:         t.id,
            identifier: t.identifier,
            name:       t.name,
            category:   t.category,
            createdAt:  t.createdAt.toDateString(),
        }));
    }

    async getTagCounts() {
        return countValues(
            Array.from(this._pages.values()).flatMap(p => normalizeTags((p as { tags: unknown }).tags)),
        );
    }

    async getCategoryCounts(resource: "snippets" | "templates") {
        const values = resource === "snippets"
            ? Array.from(this._snippets.values()).map(s => s.category)
            : Array.from(this._templates.values()).map(t => t.category);
        return countValues(values);
    }

    private _findPageEntryById(id: string): [string, TPage] | null {
        for (const [path, page] of this._pages) {
            if (page.id === id) return [path, page];
        }
        return null;
    }

    // ── System ──

    async getSystem(): Promise<TSystem> {
        return structuredClone(this._system);
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        this._system = mergeSystemUpdate(this._system, update);
        return this.getSystem();
    }

    // ── Templates ──

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        // Identifier uniqueness — same constraint as snippets.
        for (const t of this._templates.values()) {
            if (t.identifier === template.identifier) {
                throw new Error(`Template with identifier "${template.identifier}" already exists`);
            }
        }
        const stored: TTemplate = { ...template, id: randomUUIDv7() };
        this._templates.set(stored.id, stored);
        return { ...stored };
    }

    async getTemplateById(id: string): Promise<TTemplate | null> {
        const found = this._templates.get(id);
        return found ? { ...found } : null;
    }

    async getTemplateByIdentifier(identifier: string): Promise<TTemplate | null> {
        for (const t of this._templates.values()) {
            if (t.identifier === identifier) return { ...t };
        }
        return null;
    }

    async getAllTemplates(): Promise<TTemplate[]> {
        return Array.from(this._templates.values()).map(t => ({ ...t }));
    }

    async getTemplateCategories(): Promise<string[]> {
        const set = new Set<string>();
        for (const t of this._templates.values()) {
            if (t.category) set.add(t.category);
        }
        return Array.from(set).sort();
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const existing = this._templates.get(id);
        if (!existing) return null;
        // Strip immutable fields so callers can't rewrite them.
        const { id: _, identifier: __, createdAt: ___, ...rest } = data;
        const updated: TTemplate = { ...existing, ...rest };
        this._templates.set(id, updated);
        return { ...updated };
    }

    async deleteTemplate(id: string): Promise<void> {
        this._templates.delete(id);
    }

    // ── Snippets ──

    async createSnippet(snippet: Omit<TSnippet, "id">): Promise<TSnippet> {
        // Mirrors the unique index on `identifier` in the Mongo provider.
        for (const s of this._snippets.values()) {
            if (s.identifier === snippet.identifier) {
                throw new Error(`Snippet with identifier "${snippet.identifier}" already exists`);
            }
        }
        const stored: TSnippet = { ...snippet, id: randomUUIDv7() };
        this._snippets.set(stored.id, stored);
        return { ...stored };
    }

    async getSnippetById(id: string): Promise<TSnippet | null> {
        const found = this._snippets.get(id);
        return found ? { ...found } : null;
    }

    async getSnippetByIdentifier(identifier: string): Promise<TSnippet | null> {
        for (const s of this._snippets.values()) {
            if (s.identifier === identifier) return { ...s };
        }
        return null;
    }

    async getAllSnippets(): Promise<TSnippet[]> {
        return Array.from(this._snippets.values()).map(s => ({ ...s }));
    }

    async getSnippetsMetadata(): Promise<{ id: string; identifier: string; name: string; category: string; updatedAt: string }[]> {
        return Array.from(this._snippets.values()).map(s => ({
            id:         s.id,
            identifier: s.identifier,
            name:       s.name,
            category:   s.category,
            updatedAt:  s.updatedAt.toDateString(),
        }));
    }

    async updateSnippet(id: string, data: Partial<TSnippet>): Promise<TSnippet | null> {
        const existing = this._snippets.get(id);
        if (!existing) return null;
        // Strip immutable fields so callers can't accidentally rewrite them.
        const { id: _, identifier: __, createdAt: ___, ...rest } = data;
        const updated: TSnippet = { ...existing, ...rest, updatedAt: new Date() };
        this._snippets.set(id, updated);
        return { ...updated };
    }

    async deleteSnippet(id: string): Promise<void> {
        this._snippets.delete(id);
    }

    async findPagesUsingSnippet(identifier: string): Promise<TPage[]> {
        const regex = new RegExp(snippetRefPattern(identifier), "i");
        return Array.from(this._pages.values())
            .filter(p => regex.test(p.content ?? ""))
            .map(p => ({ ...p }));
    }
}
