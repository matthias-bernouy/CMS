import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { SourceOverlay, SourceOverlayRepository } from "../interfaces/SourceOverlay";

export type MongoSourceOverlayRepositoryConfig = {
    collectionPrefix?: string;
};

type SourceOverlayDoc = Omit<SourceOverlay, "id"> & { _id: string };

export class MongoSourceOverlayRepository implements SourceOverlayRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoSourceOverlayRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.overlays.createIndex({ sourceId: 1 });
    }

    private get overlays(): Collection<SourceOverlayDoc> {
        return this.db.collection<SourceOverlayDoc>(this.prefix + "sourceOverlays");
    }

    async getOverlay(id: string): Promise<SourceOverlay | null> {
        return fromDoc(await this.overlays.findOne({ _id: id }));
    }

    async getOverlaysForSource(sourceId: string): Promise<SourceOverlay[]> {
        return (await this.overlays.find({ sourceId }).toArray()).map((doc) => fromDoc(doc)!);
    }

    async getAllOverlays(): Promise<SourceOverlay[]> {
        return (await this.overlays.find().toArray()).map((doc) => fromDoc(doc)!);
    }

    async upsertOverlay(overlay: SourceOverlay): Promise<SourceOverlay> {
        await this.overlays.replaceOne(
            { _id: overlay.id },
            toDoc(overlay) as OptionalUnlessRequiredId<SourceOverlayDoc>,
            { upsert: true },
        );
        return structuredClone(overlay);
    }

    async deleteOverlay(id: string): Promise<boolean> {
        return (await this.overlays.deleteOne({ _id: id })).deletedCount > 0;
    }
}

function toDoc(overlay: SourceOverlay): SourceOverlayDoc {
    const { id, ...rest } = overlay;
    return { _id: id, ...rest };
}

function fromDoc(doc: SourceOverlayDoc | null): SourceOverlay | null {
    if (!doc) {
        return null;
    }
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}
