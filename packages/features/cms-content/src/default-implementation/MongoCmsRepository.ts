import { randomUUIDv7 } from "bun";
import type { CmsRepository, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";
import { organizeThemeSettings, themeSettingsFromCss } from "cms-content/core/theme";
import { escapeRegex } from "cms-content/core/utils/escapeRegex";
import { defaultSystem, mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { MongoContentRepository } from "cms-content/default-implementation/repositories/mongo/MongoContentRepository";
import {
    SYSTEM_ID,
    type MongoCmsRepositoryConfig,
} from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";
import { fromTemplateDoc } from "cms-content/default-implementation/repositories/mongo/documents";

export type { MongoCmsRepositoryConfig } from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";

export class MongoCmsRepository extends MongoContentRepository implements CmsRepository {
    async getPagesMetadata(options: PagesQuery = {}): Promise<PageMeta[]> {
        const filter: Record<string, unknown> = {};
        const search = options.search?.trim();
        if (search) {
            const expression = { $regex: escapeRegex(search), $options: "i" };
            filter.$or = [{ title: expression }, { path: expression }];
        }
        if (options.tag) {
            filter.tags = options.tag;
        }
        if (options.visible === "published") {
            filter.visible = true;
        } else if (options.visible === "draft") {
            filter.visible = { $ne: true };
        }

        const sortField = options.sortBy ?? "title";
        const sort = { [sortField]: options.sortOrder === "desc" ? -1 : 1 } as Record<string, 1 | -1>;
        const documents = await this.pages
            .find(filter, { projection: { path: 1, title: 1, tags: 1, visible: 1 } })
            .collation({ locale: "en", strength: 1 })
            .sort(sort)
            .toArray();
        return documents.map((document) => ({
            id: document._id,
            path: document.path,
            title: document.title,
            tags: document.tags,
            visible: document.visible === true,
        }));
    }

    async getTemplatesMetadata(): Promise<
        { id: string; identifier: string; name: string; category: string; createdAt: string }[]
    > {
        const documents = await this.templates
            .find({}, { projection: { identifier: 1, name: 1, category: 1, createdAt: 1 } })
            .toArray();
        return documents.map((document) => ({
            id: document._id,
            identifier: document.identifier,
            name: document.name,
            category: document.category,
            createdAt: document.createdAt.toDateString(),
        }));
    }

    async getTagCounts() {
        const documents = await this.pages.find({}, { projection: { tags: 1 } }).toArray();
        return countValues(documents.flatMap((document) => normalizeTags((document as { tags: unknown }).tags)));
    }

    async getCategoryCounts(_resource: "templates") {
        const documents = await this.templates.find({}, { projection: { category: 1 } }).toArray();
        return countValues(documents.map((document) => document.category));
    }

    async getSystem(): Promise<TSystem> {
        const document = await this.system.findOne({ _id: SYSTEM_ID });
        if (document) {
            const { _id, ...rest } = document;
            const legacy = rest as Partial<TSystem>;
            legacy.theme = legacy.theme
                ? organizeThemeSettings(legacy.theme)
                : themeSettingsFromCss(legacy.site?.theme ?? "");
            return mergeSystemUpdate(defaultSystem(), rest);
        }
        const fresh = defaultSystem();
        await this.system.insertOne({ _id: SYSTEM_ID, ...fresh });
        return fresh;
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        const merged = mergeSystemUpdate(await this.getSystem(), update);
        await this.system.replaceOne({ _id: SYSTEM_ID }, merged, { upsert: true });
        return merged;
    }

    async createTemplate(template: Omit<TTemplate, "id">): Promise<TTemplate> {
        const id = randomUUIDv7();
        await this.templates.insertOne({ _id: id, ...template });
        return { id, ...template };
    }

    async getTemplateById(id: string): Promise<TTemplate | null> {
        return fromTemplateDoc(await this.templates.findOne({ _id: id }));
    }

    async getTemplateByIdentifier(identifier: string): Promise<TTemplate | null> {
        return fromTemplateDoc(await this.templates.findOne({ identifier }));
    }

    async getAllTemplates(): Promise<TTemplate[]> {
        const documents = await this.templates.find().toArray();
        return documents.map((document) => fromTemplateDoc(document)!);
    }

    async getTemplateCategories(): Promise<string[]> {
        const categories = await this.templates.distinct("category");
        return (categories as string[])
            .filter((category) => typeof category === "string" && category.length > 0)
            .sort();
    }

    async updateTemplate(id: string, data: Partial<TTemplate>): Promise<TTemplate | null> {
        const { id: _id, identifier: _identifier, createdAt: _createdAt, ...rest } = data;
        const document = await this.templates.findOneAndUpdate(
            { _id: id },
            { $set: rest },
            { returnDocument: "after" },
        );
        return fromTemplateDoc(document);
    }

    async deleteTemplate(id: string): Promise<void> {
        await this.templates.deleteOne({ _id: id });
    }
}
