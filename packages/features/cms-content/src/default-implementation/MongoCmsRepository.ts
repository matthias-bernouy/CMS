import type { CmsRepository, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { TSystem } from "cms-content/interfaces/settings";
import { escapeRegex } from "cms-content/core/utils/escapeRegex";
import { defaultSystem, mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { MongoContentRepository } from "cms-content/default-implementation/repositories/mongo/MongoContentRepository";
import {
    SYSTEM_ID,
    type MongoCmsRepositoryConfig,
} from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";

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

    async getTagCounts() {
        const documents = await this.pages.find({}, { projection: { tags: 1 } }).toArray();
        return countValues(documents.flatMap((document) => normalizeTags((document as { tags: unknown }).tags)));
    }

    async getSystem(): Promise<TSystem> {
        const document = await this.system.findOne({ _id: SYSTEM_ID });
        if (document) {
            const { _id, ...stored } = document;
            const rest = stored as Partial<TSystem> & { editor?: unknown };
            delete rest.editor;
            return mergeSystemUpdate(defaultSystem(), rest as Partial<TSystem>);
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
}
