import { ContentValidationError } from "cms-content/core/validation/errors";
import type { CmsRepository } from "cms-content/interfaces/CmsRepository";
import type { SiteBlocCollection } from "cms-content/interfaces/blocs";
import {
    createSiteBlocCollection,
    siteBlocCollections,
    validateSiteBlocCollectionInput,
    DEFAULT_SITE_BLOC_COLLECTION_ID,
} from "cms-content/core/lifecycle/siteBlocCollections";
import type { TSystem } from "cms-content/interfaces/settings";
import { mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { InMemoryContentRepository } from "cms-content/default-implementation/repositories/memory/InMemoryContentRepository";

/** In-memory repository for local development and tests. */
export class InMemoryCmsRepository extends InMemoryContentRepository implements CmsRepository {
    private readonly collections = new Map<string, SiteBlocCollection>();

    async updateSiteBlocCollection(id: string, input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        if (id !== DEFAULT_SITE_BLOC_COLLECTION_ID && !this.collections.has(id)) {
            throw new ContentValidationError("collectionId", "site collection was not found");
        }
        const collection = { id, ...validateSiteBlocCollectionInput(input) };
        this.collections.set(id, collection);
        return structuredClone(collection);
    }

    async getSiteBlocCollections(): Promise<SiteBlocCollection[]> {
        return siteBlocCollections([...this.collections.values()]);
    }

    async createSiteBlocCollection(input: Omit<SiteBlocCollection, "id">): Promise<SiteBlocCollection> {
        const collection = createSiteBlocCollection(input);
        this.collections.set(collection.id, collection);
        return structuredClone(collection);
    }

    async getTagCounts() {
        return countValues(
            Array.from(this.pages.values()).flatMap((page) => normalizeTags((page as { tags: unknown }).tags)),
        );
    }

    async getSystem(): Promise<TSystem> {
        return structuredClone(this.system);
    }

    async updateSystem(update: Partial<TSystem>): Promise<TSystem> {
        this.system = mergeSystemUpdate(this.system, update);
        return this.getSystem();
    }
}
