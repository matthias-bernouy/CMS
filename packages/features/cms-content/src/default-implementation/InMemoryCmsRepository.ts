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
import { languageRoutesChanged } from "cms-content/core/lifecycle/pagePaths";
import { countValues, normalizeTags } from "cms-content/core/queries/counts";
import { InMemoryContentRepository } from "cms-content/default-implementation/repositories/memory/InMemoryContentRepository";

/** In-memory repository for local development and tests. */
export class InMemoryCmsRepository extends InMemoryContentRepository implements CmsRepository {
    private readonly collections = new Map<string, SiteBlocCollection>();
    private pendingSystem: TSystem | null = null;
    private systemUpdateTail: Promise<void> = Promise.resolve();

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
        const previous = this.systemUpdateTail;
        let release!: () => void;
        this.systemUpdateTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await this.applySystemUpdate(update);
        } finally {
            release();
        }
    }

    private async applySystemUpdate(update: Partial<TSystem>): Promise<TSystem> {
        if (this.pendingSystem) {
            await this.migrateLegacyPagePaths(this.pendingSystem, this.system.site.language, true);
            this.system = this.pendingSystem;
            this.pendingSystem = null;
        }
        const merged = mergeSystemUpdate(this.system, update);
        delete merged.pageRoutesUpdating;
        if (languageRoutesChanged(this.system, merged)) {
            await this.migrateLegacyPagePaths(merged, this.system.site.language, true, true);
            const previous = this.system;
            this.pendingSystem = merged;
            this.system = { ...previous, pageRoutesUpdating: true };
            await this.migrateLegacyPagePaths(merged, previous.site.language, true);
        }
        this.system = merged;
        this.pendingSystem = null;
        return this.getSystem();
    }
}
