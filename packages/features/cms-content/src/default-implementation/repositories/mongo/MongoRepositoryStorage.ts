import type { Collection, Db } from "mongodb";
import {
    SYSTEM_ID,
    type BlocDoc,
    type PageDoc,
    type SystemDoc,
    type TemplateDoc,
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
        await this.templates.updateMany(
            { $or: [{ identifier: { $exists: false } }, { identifier: null }, { identifier: "" }] } as never,
            [{ $set: { identifier: "$_id" } }] as never,
        );
        await Promise.all([
            this.pages.createIndex({ path: 1 }, { unique: true }),
            this.templates.createIndex({ identifier: 1 }, { unique: true }),
        ]);
    }

    protected get blocs(): Collection<BlocDoc> {
        return this.db.collection<BlocDoc>(this.prefix + "blocs");
    }

    protected get pages(): Collection<PageDoc> {
        return this.db.collection<PageDoc>(this.prefix + "pages");
    }

    protected get templates(): Collection<TemplateDoc> {
        return this.db.collection<TemplateDoc>(this.prefix + "templates");
    }

    protected get system(): Collection<SystemDoc> {
        return this.db.collection<SystemDoc>(this.prefix + "system");
    }
}

export { SYSTEM_ID };
