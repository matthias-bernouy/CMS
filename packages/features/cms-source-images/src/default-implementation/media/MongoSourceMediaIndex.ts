import type { Collection, Db, OptionalUnlessRequiredId, UpdateFilter } from "mongodb";
import { sourceMediaAssetKey } from "../../core/jobs/media/identity";
import type {
    SourceMediaAsset,
    SourceMediaAssetInput,
    SourceMediaCompletedVariant,
    SourceMediaIndex,
} from "../../interfaces/media";

type MediaDocument = Omit<SourceMediaAsset, "key"> & { _id: string };

export class MongoSourceMediaIndex implements SourceMediaIndex {
    private readonly collection: Collection<MediaDocument>;

    constructor(db: Db, options: { collectionPrefix?: string } = {}) {
        this.collection = db.collection(`${options.collectionPrefix ?? ""}source_media`);
    }

    async init(): Promise<void> {
        await Promise.all([
            this.collection.createIndex({ sourceId: 1, endpointId: 1 }),
            this.collection.createIndex({ status: 1, updatedAt: 1 }),
            this.collection.createIndex({ generation: 1 }),
        ]);
    }

    async upsert(input: SourceMediaAssetInput, now: number): Promise<SourceMediaAsset> {
        const key = await sourceMediaAssetKey(input);
        for (;;) {
            const previous = await this.collection.findOne({ _id: key });
            if (previous?.generation === input.generation) {
                return fromDocument(previous);
            }
            const replacement = replacementDocument(key, input, previous, now);
            if (!previous) {
                try {
                    await this.collection.insertOne(replacement as OptionalUnlessRequiredId<MediaDocument>);
                    return fromDocument(replacement);
                } catch (error) {
                    if (isDuplicateKey(error)) {
                        continue;
                    }
                    throw error;
                }
            }
            const result = await this.collection.replaceOne({ _id: key, generation: previous.generation }, replacement);
            if (result.modifiedCount === 1) {
                return fromDocument(replacement);
            }
        }
    }

    async get(key: string): Promise<SourceMediaAsset | null> {
        const document = await this.collection.findOne({ _id: key });
        return document ? fromDocument(document) : null;
    }

    async remove(key: string): Promise<SourceMediaAsset | null> {
        const document = await this.collection.findOneAndDelete({ _id: key });
        return document ? fromDocument(document) : null;
    }

    markQueued(key: string, generation: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "queued", updatedAt: now, error: null });
    }

    markProcessing(key: string, generation: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "processing", updatedAt: now, error: null });
    }

    markReady(
        key: string,
        generation: string,
        variants: readonly SourceMediaCompletedVariant[],
        now: number,
    ): Promise<boolean> {
        return this.update(key, generation, {
            status: "ready",
            completedVariants: structuredClone(variants),
            updatedAt: now,
            error: null,
        });
    }

    markFailed(key: string, generation: string, error: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "failed", error, updatedAt: now });
    }

    async isCurrent(key: string, generation: string): Promise<boolean> {
        return (await this.collection.countDocuments({ _id: key, generation }, { limit: 1 })) === 1;
    }

    async takeObsoleteDerivativeKeys(key: string, generation: string): Promise<readonly string[]> {
        const document = await this.collection.findOneAndUpdate(
            { _id: key, generation },
            { $set: { obsoleteDerivativeKeys: [] } },
            { returnDocument: "before" },
        );
        return document?.obsoleteDerivativeKeys ?? [];
    }

    private async update(key: string, generation: string, values: Record<string, unknown>): Promise<boolean> {
        const { error, ...set } = values;
        const update: UpdateFilter<MediaDocument> =
            error === null ? { $set: set, $unset: { error: "" } } : { $set: values };
        const result = await this.collection.updateOne({ _id: key, generation }, update);
        return result.matchedCount === 1;
    }
}

function replacementDocument(
    key: string,
    input: SourceMediaAssetInput,
    previous: MediaDocument | null,
    now: number,
): MediaDocument {
    const obsolete = new Set(previous?.obsoleteDerivativeKeys ?? []);
    for (const variant of previous?.completedVariants ?? []) {
        obsolete.add(variant.derivativeKey);
    }
    return {
        ...structuredClone(input),
        _id: key,
        completedVariants: [],
        obsoleteDerivativeKeys: [...obsolete],
        status: "queued",
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
    };
}

function fromDocument(document: MediaDocument): SourceMediaAsset {
    const { _id, ...asset } = structuredClone(document);
    return { key: _id, ...asset };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
