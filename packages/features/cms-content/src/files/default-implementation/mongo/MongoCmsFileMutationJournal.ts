import { randomUUID } from "node:crypto";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { CmsFileMutation, CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";

type MutationDocument = Omit<CmsFileMutation, "id"> & { _id: string };
type TreeLockDocument = { _id: "tree"; owner: string; expiresAt: Date };

const TREE_LOCK_LEASE_MS = 30_000;
const TREE_LOCK_HEARTBEAT_MS = 10_000;
const TREE_LOCK_WAIT_MS = 30_000;

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

    async withTreeWrite<T>(operation: () => Promise<T>): Promise<T> {
        const owner = randomUUID();
        await this.acquireTreeLock(owner);
        let lost: Error | null = null;
        const heartbeat = setInterval(() => {
            void this.renewTreeLock(owner).catch((error) => {
                lost = treeLockHeartbeatError(error);
            });
        }, TREE_LOCK_HEARTBEAT_MS);
        heartbeat.unref?.();
        try {
            await this.assertTreeLock(owner, lost);
            const result = await operation();
            await this.assertTreeLock(owner, lost);
            return result;
        } finally {
            clearInterval(heartbeat);
            await this.treeLocks.deleteOne({ _id: "tree", owner });
        }
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

    private get treeLocks(): Collection<TreeLockDocument> {
        return this.db.collection<TreeLockDocument>(this.prefix + "fileMutationLocks");
    }

    private async acquireTreeLock(owner: string): Promise<void> {
        const deadline = Date.now() + TREE_LOCK_WAIT_MS;
        while (Date.now() < deadline) {
            const now = new Date();
            try {
                const result = await this.treeLocks.updateOne(
                    { _id: "tree", $or: [{ expiresAt: { $lte: now } }, { owner }] },
                    { $set: { owner, expiresAt: new Date(now.getTime() + TREE_LOCK_LEASE_MS) } },
                    { upsert: true },
                );
                if (result.matchedCount === 1 || result.upsertedCount === 1) {
                    return;
                }
            } catch (error) {
                if ((error as { code?: unknown }).code !== 11000) {
                    throw error;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw Object.assign(new Error("The file tree is busy"), { status: 409 });
    }

    private async renewTreeLock(owner: string): Promise<void> {
        const result = await this.treeLocks.updateOne(
            { _id: "tree", owner },
            { $set: { expiresAt: new Date(Date.now() + TREE_LOCK_LEASE_MS) } },
        );
        if (result.matchedCount !== 1) {
            throw treeLockLostError();
        }
    }

    private async assertTreeLock(owner: string, lost: Error | null): Promise<void> {
        if (lost) {
            throw lost;
        }
        const current = await this.treeLocks.findOne({ _id: "tree", owner });
        if (!current || current.expiresAt.getTime() <= Date.now()) {
            throw treeLockLostError();
        }
    }
}

function fromDocument(document: MutationDocument): CmsFileMutation {
    const { _id: id, ...operation } = document;
    return { id, ...operation } as CmsFileMutation;
}

function treeLockLostError(): Error {
    return Object.assign(new Error("File tree mutation lock ownership was lost"), { status: 409 });
}

function treeLockHeartbeatError(error: unknown): Error {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    return Object.assign(new Error(`File tree mutation lock heartbeat failed${detail}`), { status: 503 });
}
