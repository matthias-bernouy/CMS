import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TPage, TSnippet } from "@bernouy/cms-content";
import { scanSnippets } from "cms-cli/push/snippets/scan";
import { serializeFrontmatter } from "cms-cli/push/shared/frontmatterWrite";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";

const FROZEN_DATE = new Date(0);

/**
 * Filesystem-backed snippet store. ID = identifier (filename) — stable
 * across dev restarts. createdAt/updatedAt are frozen since FS doesn't
 * carry useful editorial timestamps for our purposes. Files live under
 * `snippets/<category>/<identifier>.html`; category renames move the
 * file across folders.
 */
export class SnippetsStore {
    constructor(private readonly siteDir: string) {}

    async getAll(): Promise<TSnippet[]> {
        const local = await scanSnippets(this.siteDir);
        return local.map(s => this._toTSnippet(s.identifier, s.meta, s.content));
    }

    async getByIdentifier(identifier: string): Promise<TSnippet | null> {
        return (await this.getAll()).find(s => s.identifier === identifier) ?? null;
    }

    async getById(id: string): Promise<TSnippet | null> {
        return this.getByIdentifier(id);
    }

    async create(snippet: Omit<TSnippet, "id">): Promise<TSnippet> {
        const category = snippet.category ?? "";
        const file = this._fileFor(snippet.identifier, category);
        if (existsSync(file)) throw new Error(`Snippet "${snippet.identifier}" already exists`);
        await this._write(file, snippet.name, snippet.description ?? "", snippet.content ?? "<p></p>");
        return { ...snippet, id: snippet.identifier };
    }

    async update(id: string, data: Partial<TSnippet>): Promise<TSnippet | null> {
        const existing = await this.getById(id);
        if (!existing) return null;
        const merged: TSnippet = { ...existing, ...data, id: existing.id, identifier: existing.identifier };
        const oldFile = this._fileFor(existing.identifier, existing.category);
        const newFile = this._fileFor(merged.identifier,  merged.category);
        if (oldFile !== newFile && existsSync(oldFile)) await unlink(oldFile);
        await this._write(newFile, merged.name, merged.description, merged.content);
        return merged;
    }

    async delete(id: string): Promise<void> {
        const existing = await this.getById(id);
        if (!existing) return;
        const file = this._fileFor(existing.identifier, existing.category);
        if (existsSync(file)) await unlink(file);
    }

    async metadata(): Promise<{ id: string; identifier: string; name: string; category: string; updatedAt: string }[]> {
        return (await this.getAll()).map(s => ({
            id: s.id, identifier: s.identifier, name: s.name, category: s.category,
            updatedAt: s.updatedAt.toDateString(),
        }));
    }

    /** Pages whose content references `<w13c-snippet identifier="X">`. */
    async findPagesUsing(identifier: string, pages: TPage[]): Promise<TPage[]> {
        const re = new RegExp(`<w13c-snippet\\b[^>]*\\bidentifier\\s*=\\s*["']${escapeRegExp(identifier)}["']`, "i");
        return pages.filter(p => re.test(p.content));
    }

    private _toTSnippet(identifier: string, meta: { name: string; description: string; category: string }, content: string): TSnippet {
        return {
            id: identifier, identifier,
            name: meta.name, description: meta.description, category: meta.category,
            content,
            createdAt: FROZEN_DATE, updatedAt: FROZEN_DATE,
        };
    }

    private _fileFor(identifier: string, category: string): string {
        return join(this.siteDir, "snippets", categoryToFolder(category), `${identifier}.html`);
    }

    private async _write(file: string, name: string, description: string, content: string): Promise<void> {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, serializeFrontmatter({ name, description }) + content, "utf-8");
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
