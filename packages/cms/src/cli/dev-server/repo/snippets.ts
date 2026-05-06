import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TPage, TSnippet } from "src/socle/interfaces/models";
import { scanSnippets } from "src/cli/push/snippets/scan";
import { serializeFrontmatter } from "src/cli/push/shared/frontmatterWrite";

const FROZEN_DATE = new Date(0);

/**
 * Filesystem-backed snippet store. ID = identifier (filename) — stable
 * across dev restarts. createdAt/updatedAt are frozen since FS doesn't
 * carry useful editorial timestamps for our purposes.
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
        const file = this._fileFor(snippet.identifier);
        if (existsSync(file)) throw new Error(`Snippet "${snippet.identifier}" already exists`);
        await this._write(file, snippet.name, snippet.description ?? "", snippet.category ?? "", snippet.content ?? "<p></p>");
        return { ...snippet, id: snippet.identifier };
    }

    async update(id: string, data: Partial<TSnippet>): Promise<TSnippet | null> {
        const existing = await this.getById(id);
        if (!existing) return null;
        const merged: TSnippet = { ...existing, ...data, id: existing.id, identifier: existing.identifier };
        await this._write(this._fileFor(existing.identifier), merged.name, merged.description, merged.category, merged.content);
        return merged;
    }

    async delete(id: string): Promise<void> {
        const existing = await this.getById(id);
        if (!existing) return;
        const file = this._fileFor(existing.identifier);
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

    private _fileFor(identifier: string): string {
        return join(this.siteDir, "snippets", `${identifier}.html`);
    }

    private async _write(file: string, name: string, description: string, category: string, content: string): Promise<void> {
        await mkdir(join(this.siteDir, "snippets"), { recursive: true });
        await writeFile(file, serializeFrontmatter({ name, description, category }) + content, "utf-8");
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
