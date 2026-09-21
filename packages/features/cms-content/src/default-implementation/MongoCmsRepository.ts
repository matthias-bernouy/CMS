import { randomUUIDv7 } from "bun";
import { ContentValidationError } from "cms-content/core/validation/errors";
import type { CmsRepository, PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";
import type { SiteBlocCollection } from "cms-content/interfaces/blocs";
import {
    createSiteBlocCollection,
    siteBlocCollections,
    validateSiteBlocCollectionInput,
    DEFAULT_SITE_BLOC_COLLECTION_ID,
} from "cms-content/core/lifecycle/siteBlocCollections";
import type { TSystem } from "cms-content/interfaces/settings";
import { escapeRegex } from "cms-content/core/utils/escapeRegex";
import { mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { languageRoutesChanged } from "cms-content/core/lifecycle/pagePaths";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { MongoContentRepository } from "cms-content/default-implementation/repositories/mongo/MongoContentRepository";
import {
    claimRouteMigration,
    releaseRouteMigration,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/migrationFence";
import {
    readSystemDocument,
    systemFromDocument,
} from "cms-content/default-implementation/repositories/mongo/pageRoutes/systemFence";
import {
    SYSTEM_ID,
    type MongoCmsRepositoryConfig,
} from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";

export type { MongoCmsRepositoryConfig } from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";

export class MongoCmsRepository extends MongoContentRepository implements CmsRepository {
    async updateSiteBlocCollection(id: string, input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        const metadata = validateSiteBlocCollectionInput(input);
        const result = await this.siteBlocCollections.replaceOne({ _id: id }, metadata, {
            upsert: id === DEFAULT_SITE_BLOC_COLLECTION_ID,
        });
        if (!result.matchedCount && !result.upsertedCount) {
            throw new ContentValidationError("collectionId", "site collection was not found");
        }
        return { id, ...metadata };
    }

    async getSiteBlocCollections(): Promise<SiteBlocCollection[]> {
        const documents = await this.siteBlocCollections.find({}).toArray();
        return siteBlocCollections(documents.map(({ _id, ...metadata }) => ({ id: _id, ...metadata })));
    }

    async createSiteBlocCollection(input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        const collection = createSiteBlocCollection(input);
        const { id, ...metadata } = collection;
        await this.siteBlocCollections.insertOne({ _id: id, ...metadata });
        return structuredClone(collection);
    }

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
        return systemFromDocument(await readSystemDocument(this.system));
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const stored = await readSystemDocument(this.system);
            if (stored.routeMigration) {
                throw new Error("Page route migration is in progress.");
            }
            const current = systemFromDocument(stored);
            const merged = mergeSystemUpdate(current, update);
            delete merged.pageRoutesUpdating;
            const revision = stored.settingsRevision ?? 0;
            if (!languageRoutesChanged(current, merged)) {
                const saved = await this.system.updateOne(
                    { _id: SYSTEM_ID, settingsRevision: revision, routeMigration: { $exists: false } },
                    { $set: merged, $inc: { settingsRevision: 1 } },
                );
                if (saved.matchedCount) {
                    return merged;
                }
                continue;
            }

            const token = randomUUIDv7();
            const claimed = await claimRouteMigration(this.system, revision, {
                token,
                target: merged,
                previousDefaultLanguage: current.site.language,
                requestedAt: new Date(),
            });
            if (!claimed) {
                continue;
            }
            try {
                try {
                    await this.migrateLegacyPagePaths(merged, current.site.language, true, true);
                } catch (error) {
                    const released = await this.system.updateOne(
                        { _id: SYSTEM_ID, "routeMigration.token": token },
                        { $set: {}, $unset: { routeMigration: "" } },
                    );
                    if (!released.matchedCount) {
                        throw new Error("Page route migration changed during validation.");
                    }
                    throw error;
                }
                await this.migrateLegacyPagePaths(merged, current.site.language, true);
                const committed = await this.system.replaceOne(
                    { _id: SYSTEM_ID, "routeMigration.token": token, settingsRevision: revision },
                    { ...merged, settingsRevision: revision + 1, activePageWrites: 0 },
                );
                if (!committed.matchedCount) {
                    throw new Error("Page route migration changed before completion.");
                }
                return merged;
            } finally {
                releaseRouteMigration(token);
            }
        }
        throw new Error("System settings changed repeatedly; retry the save.");
    }
}
