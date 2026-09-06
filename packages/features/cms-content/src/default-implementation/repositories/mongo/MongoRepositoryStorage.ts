import type { SiteBlocCollection } from "cms-content/interfaces/blocs";
import type { Collection, Db } from "mongodb";
import {
    SYSTEM_ID,
    type BlocDoc,
    type PageDoc,
    type SiteBlocPublicationLockDoc,
    type SystemDoc,
} from "cms-content/default-implementation/repositories/mongo/documents";

export type MongoCmsRepositoryConfig = {
    /** Prefix prepended to every collection name for tenant isolation. */
    collectionPrefix?: string;
};

export class MongoRepositoryStorage {
    private readonly prefix: string;

    constructor(
        protected readonly db: Db,
        config: MongoCmsRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    /** Create the unique indexes required by the repository contract. */
    async init(): Promise<void> {
        await this.pages.createIndex({ path: 1 }, { unique: true });
    }

    protected get siteBlocCollections(): Collection<Omit<SiteBlocCollection, "id"> & { _id: string }> {
        return this.db.collection(this.prefix + "site_bloc_collections");
    }

    protected get blocs(): Collection<BlocDoc> {
        return this.db.collection<BlocDoc>(this.prefix + "blocs");
    }

    protected get pages(): Collection<PageDoc> {
        return this.db.collection<PageDoc>(this.prefix + "pages");
    }

    protected get system(): Collection<SystemDoc> {
        return this.db.collection<SystemDoc>(this.prefix + "system");
    }

    protected get siteBlocPublicationLocks(): Collection<SiteBlocPublicationLockDoc> {
        return this.db.collection<SiteBlocPublicationLockDoc>(this.prefix + "site_bloc_publication_locks");
    }
}

export { SYSTEM_ID };
