import type { SiteBlocGroup } from "content/blocs/interfaces/blocs";
import type { Collection, Db } from "mongodb";
import { referenceWriteCollection } from "content/application/default-implementation/mongo/repositories/siteBlocPublication/references";
import { ContentStorageFormatError } from "content/application/core/validation/errors";
import {
    SYSTEM_ID,
    type BlocDoc,
    type PageDoc,
    type PageRouteDoc,
    type SiteBlocPublicationLockDoc,
    type SystemDoc,
} from "content/application/default-implementation/mongo/repositories/documents";

export type MongoContentRepositoryConfig = {
    /** Prefix prepended to every collection name for tenant isolation. */
    collectionPrefix?: string;
};

export class MongoRepositoryStorage {
    private readonly prefix: string;
    private blocCollection?: Collection<BlocDoc>;
    private pageCollection?: Collection<PageDoc>;
    private referencesReady = false;

    constructor(
        protected readonly db: Db,
        config: MongoContentRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    /** Create the unique indexes required by the repository contract. */
    async init(): Promise<void> {
        await this.requireReferenceFormat(true);
        await this.pages.createIndex({ path: 1 }, { unique: true });
        await this.pages.createIndex({ "deletionIntent.requestedAt": 1 }, { sparse: true });
        await this.pages.createIndex({ "pathUpdateIntent.requestedAt": 1 }, { sparse: true });
        await this.pages.createIndex({ contentReferences: 1, _id: 1 });
        await this.blocs.createIndex({ contentReferences: 1, _id: 1 });
        await this.pageRoutes.createIndex({ pageId: 1 });
        await this.pageRoutes.createIndex({ pageInsertToken: 1 }, { sparse: true });
    }

    /** A readiness marker proves that every Bloc write used the indexed projection format. */
    protected async requireReferenceFormat(initialize = false): Promise<void> {
        if (this.referencesReady) {
            return;
        }
        const metadata = this.db.collection<{
            _id: string;
            version: number;
            upgradeToken?: string;
            maintenance?: unknown;
        }>(this.prefix + "content_metadata");
        const id = "bloc-references";
        let format = await metadata.findOne({ _id: id });
        if (!format && initialize) {
            if (await this.blocs.findOne({}, { projection: { _id: 1 } })) {
                throw new ContentStorageFormatError(
                    "Populated Content storage requires an explicit Bloc reference projection upgrade",
                );
            }
            try {
                await metadata.insertOne({ _id: id, version: 1 });
            } catch (error) {
                if (!(error && typeof error === "object" && Reflect.get(error, "code") === 11000)) {
                    throw error;
                }
            }
            format = await metadata.findOne({ _id: id });
        }
        if (format?.version !== 1 || format.upgradeToken || format.maintenance) {
            throw new ContentStorageFormatError("Content storage requires Bloc reference projection format v1");
        }
        this.referencesReady = true;
    }

    protected get siteBlocGroups(): Collection<Omit<SiteBlocGroup, "id"> & { _id: string }> {
        return this.db.collection(this.prefix + "site_bloc_groups");
    }

    protected get blocs(): Collection<BlocDoc> {
        return (this.blocCollection ??= referenceWriteCollection(
            this.db,
            this.siteBlocPublicationLocks,
            this.db.collection<BlocDoc>(this.prefix + "blocs"),
        ));
    }

    protected get pages(): Collection<PageDoc> {
        return (this.pageCollection ??= referenceWriteCollection(
            this.db,
            this.siteBlocPublicationLocks,
            this.db.collection<PageDoc>(this.prefix + "pages"),
        ));
    }

    protected get pageRoutes(): Collection<PageRouteDoc> {
        return this.db.collection<PageRouteDoc>(this.prefix + "page_routes");
    }

    protected get system(): Collection<SystemDoc> {
        return this.db.collection<SystemDoc>(this.prefix + "system");
    }

    protected get siteBlocPublicationLocks(): Collection<SiteBlocPublicationLockDoc> {
        return this.db.collection<SiteBlocPublicationLockDoc>(this.prefix + "site_bloc_publication_locks");
    }
}

export { SYSTEM_ID };
