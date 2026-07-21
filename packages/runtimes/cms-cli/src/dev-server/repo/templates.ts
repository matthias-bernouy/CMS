import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TTemplate } from "@bernouy/cms-content";
import { scanTemplates } from "cms-cli/push/templates/scan";
import { serializeFrontmatter } from "cms-cli/push/shared/frontmatterWrite";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";

const FROZEN_DATE = new Date(0);

/**
 * Filesystem-backed template store. ID = identifier (filename) — stable
 * across dev restarts. createdAt is frozen. Files live under
 * `templates/<category>/<identifier>.html`; category renames move the
 * file across folders.
 */
export class TemplatesStore {
    constructor(private readonly siteDir: string) {}

    async getAll(): Promise<TTemplate[]> {
        const local = await scanTemplates(this.siteDir);
        return local.map((t) => this._toTTemplate(t.identifier, t.meta, t.content));
    }

    async getByIdentifier(identifier: string): Promise<TTemplate | null> {
        return (await this.getAll()).find((t) => t.identifier === identifier) ?? null;
    }

    async getById(id: string): Promise<TTemplate | null> {
        return this.getByIdentifier(id);
    }

    async create(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        const category = template.category ?? "";
        const file = this._fileFor(template.identifier, category);
        if (existsSync(file)) {
            throw new Error(`Template "${template.identifier}" already exists`);
        }
        await this._write(file, template.name, template.description ?? "", template.content ?? "<p></p>");
        return { ...template, id: template.identifier };
    }

    async update(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const existing = await this.getById(id);
        if (!existing) {
            return null;
        }
        const merged: TTemplate = { ...existing, ...data, id: existing.id, identifier: existing.identifier };
        const oldFile = this._fileFor(existing.identifier, existing.category);
        const newFile = this._fileFor(merged.identifier, merged.category);
        if (oldFile !== newFile && existsSync(oldFile)) {
            await unlink(oldFile);
        }
        await this._write(newFile, merged.name, merged.description, merged.content);
        return merged;
    }

    async delete(id: string): Promise<void> {
        const existing = await this.getById(id);
        if (!existing) {
            return;
        }
        const file = this._fileFor(existing.identifier, existing.category);
        if (existsSync(file)) {
            await unlink(file);
        }
    }

    async categories(): Promise<string[]> {
        const set = new Set<string>();
        for (const t of await this.getAll()) {
            if (t.category) {
                set.add(t.category);
            }
        }
        return [...set].sort();
    }

    async metadata(): Promise<{ id: string; identifier: string; name: string; category: string; createdAt: string }[]> {
        return (await this.getAll()).map((t) => ({
            id: t.id,
            identifier: t.identifier,
            name: t.name,
            category: t.category,
            createdAt: t.createdAt.toDateString(),
        }));
    }

    private _toTTemplate(
        identifier: string,
        meta: { name: string; description: string; category: string },
        content: string,
    ): TTemplate {
        return {
            id: identifier,
            identifier,
            name: meta.name,
            description: meta.description,
            category: meta.category,
            content,
            createdAt: FROZEN_DATE,
        };
    }

    private _fileFor(identifier: string, category: string): string {
        return join(this.siteDir, "templates", categoryToFolder(category), `${identifier}.html`);
    }

    private async _write(file: string, name: string, description: string, content: string): Promise<void> {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, serializeFrontmatter({ name, description }) + content, "utf-8");
    }
}
