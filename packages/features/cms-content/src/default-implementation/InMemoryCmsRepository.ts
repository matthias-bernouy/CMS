import { randomUUIDv7 } from "bun";
import type { CmsRepository } from "cms-content/interfaces/CmsRepository";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";
import { mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { InMemoryContentRepository } from "cms-content/default-implementation/repositories/memory/InMemoryContentRepository";

/** In-memory repository for local development and tests. */
export class InMemoryCmsRepository extends InMemoryContentRepository implements CmsRepository {
    async getTemplatesMetadata(): Promise<
        { id: string; identifier: string; name: string; category: string; createdAt: string }[]
    > {
        return Array.from(this.templates.values()).map((template) => ({
            id: template.id,
            identifier: template.identifier,
            name: template.name,
            category: template.category,
            createdAt: template.createdAt.toDateString(),
        }));
    }

    async getTagCounts() {
        return countValues(
            Array.from(this.pages.values()).flatMap((page) => normalizeTags((page as { tags: unknown }).tags)),
        );
    }

    async getCategoryCounts(_resource: "templates") {
        return countValues(Array.from(this.templates.values()).map((template) => template.category));
    }

    async getSystem(): Promise<TSystem> {
        return structuredClone(this.system);
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        this.system = mergeSystemUpdate(this.system, update);
        return this.getSystem();
    }

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        for (const stored of this.templates.values()) {
            if (stored.identifier === template.identifier) {
                throw new Error(`Template with identifier "${template.identifier}" already exists`);
            }
        }
        const stored: TTemplate = { ...template, id: randomUUIDv7() };
        this.templates.set(stored.id, stored);
        return { ...stored };
    }

    async getTemplateById(id: string): Promise<TTemplate | null> {
        const found = this.templates.get(id);
        return found ? { ...found } : null;
    }

    async getTemplateByIdentifier(identifier: string): Promise<TTemplate | null> {
        for (const template of this.templates.values()) {
            if (template.identifier === identifier) {
                return { ...template };
            }
        }
        return null;
    }

    async getAllTemplates(): Promise<TTemplate[]> {
        return Array.from(this.templates.values()).map((template) => ({ ...template }));
    }

    async getTemplateCategories(): Promise<string[]> {
        const categories = new Set<string>();
        for (const template of this.templates.values()) {
            if (template.category) {
                categories.add(template.category);
            }
        }
        return Array.from(categories).sort();
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const existing = this.templates.get(id);
        if (!existing) {
            return null;
        }
        const { id: _, identifier: __, createdAt: ___, ...rest } = data;
        const updated: TTemplate = { ...existing, ...rest };
        this.templates.set(id, updated);
        return { ...updated };
    }

    async deleteTemplate(id: string): Promise<void> {
        this.templates.delete(id);
    }
}
