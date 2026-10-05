import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { CmsFileMutation, CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";

type MutationDocument = Omit<CmsFileMutation, "id"> & { _id: string };

export class MongoCmsFileMutationJournal implements CmsFileMutationJournal {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: { collectionPrefix?: string } = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ resourceId: 1 }, { unique: true });
        await this.collection.createIndex({ createdAt: 1 });
    }

    async begin(operation: CmsFileMutation): Promise<boolean> {
        const { id: _id, ...document } = operation;
        try {
            await this.collection.insertOne({ _id, ...document } as OptionalUnlessRequiredId<MutationDocument>);
            return true;
        } catch (error) {
            if ((error as { code?: unknown })?.code === 11000) {
                return false;
            }
            throw error;
        }
    }

    async find(resourceId: string): Promise<CmsFileMutation | null> {
        const document = await this.collection.findOne({ resourceId });
        return document ? fromDocument(document) : null;
    }

    async list(limit = 100): Promise<readonly CmsFileMutation[]> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw new TypeError("File mutation journal limit must be between 1 and 1000");
        }
        return (await this.collection.find({}).sort({ createdAt: 1 }).limit(limit).toArray()).map(fromDocument);
    }

    async complete(id: string): Promise<void> {
        await this.collection.deleteOne({ _id: id });
    }

    private get collection(): Collection<MutationDocument> {
        return this.db.collection<MutationDocument>(this.prefix + "fileMutations");
    }
}

function fromDocument(document: MutationDocument): CmsFileMutation {
    const { _id: id, ...operation } = document;
    return { id, ...operation } as CmsFileMutation;
}
