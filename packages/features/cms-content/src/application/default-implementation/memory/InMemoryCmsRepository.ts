import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { SiteBlocGroup } from "cms-content/blocs/interfaces/blocs";
import {
    createSiteBlocGroup,
    siteBlocGroups,
    validateSiteBlocGroupInput,
    DEFAULT_SITE_BLOC_GROUP_ID,
} from "cms-content/blocs/core/catalogue/siteBlocGroups";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { mergeSystemUpdate } from "cms-content/settings/core/system";
import { languageRoutesChanged } from "cms-content/pages/core/lifecycle/pagePaths";
import { countValues, normalizeTags } from "cms-content/pages/core/queries/counts";
import { InMemoryContentRepository } from "cms-content/application/default-implementation/memory/InMemoryContentRepository";

/** In-memory repository for local development and tests. */
export class InMemoryCmsRepository extends InMemoryContentRepository implements CmsRepository {
    private readonly groups = new Map<string, SiteBlocGroup>();
    private pendingSystem: TSystem | null = null;
    private systemRevision = 0;
    private systemUpdateTail: Promise<void> = Promise.resolve();

    async updateSiteBlocGroup(id: string, input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup> {
        if (id !== DEFAULT_SITE_BLOC_GROUP_ID && !this.groups.has(id)) {
            throw new ContentValidationError("groupId", "site Bloc group was not found");
        }
        const group = { id, ...validateSiteBlocGroupInput(input) };
        this.groups.set(id, group);
        return structuredClone(group);
    }

    async getSiteBlocGroups(): Promise<SiteBlocGroup[]> {
        return siteBlocGroups([...this.groups.values()]);
    }

    async createSiteBlocGroup(input: Omit<SiteBlocGroup, "id">): Promise<SiteBlocGroup> {
        const group = createSiteBlocGroup(input);
        this.groups.set(group.id, group);
        return structuredClone(group);
    }

    async getTagCounts() {
        return countValues(
            Array.from(this.pages.values()).flatMap((page) => normalizeTags((page as { tags: unknown }).tags)),
        );
    }

    async getSystem(): Promise<TSystem> {
        return structuredClone(this.system);
    }

    async getSystemRevision(): Promise<number> {
        return this.systemRevision;
    }

    async updateSystem(update: Partial<TSystem>, expectedRevision?: number): Promise<TSystem> {
        const previous = this.systemUpdateTail;
        let release!: () => void;
        this.systemUpdateTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            if (expectedRevision !== undefined && expectedRevision !== this.systemRevision) {
                throw Object.assign(new Error("system settings revision conflict"), { status: 409 });
            }
            return await this.applySystemUpdate(update);
        } finally {
            release();
        }
    }

    private async applySystemUpdate(update: Partial<TSystem>): Promise<TSystem> {
        if (this.pendingSystem) {
            await this.reconfigurePageRoutes(this.pendingSystem, this.system.site.language);
            this.system = this.pendingSystem;
            this.pendingSystem = null;
        }
        const merged = mergeSystemUpdate(this.system, update);
        delete merged.pageRoutesUpdating;
        if (languageRoutesChanged(this.system, merged)) {
            await this.reconfigurePageRoutes(merged, this.system.site.language, true);
            const previous = this.system;
            this.pendingSystem = merged;
            this.system = { ...previous, pageRoutesUpdating: true };
            await this.reconfigurePageRoutes(merged, previous.site.language);
        }
        this.system = merged;
        this.pendingSystem = null;
        this.systemRevision += 1;
        return this.getSystem();
    }
}
