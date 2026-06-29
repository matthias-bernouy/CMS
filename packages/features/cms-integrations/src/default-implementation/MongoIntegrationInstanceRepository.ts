import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateIntegrationInstanceError } from "../core/errors";
import { trimIntegrationRuns } from "../core/instance/runRetention";
import type {
    IntegrationInstance,
} from "../interfaces/IntegrationInstance";
import type {
    IntegrationInstanceCreate,
    IntegrationInstanceRepository,
} from "../interfaces/IntegrationInstanceRepository";

export type MongoIntegrationInstanceRepositoryConfig = {
    collectionPrefix?: string;
};

type IntegrationInstanceDoc = Omit<IntegrationInstance, "id"> & { _id: string };

export class MongoIntegrationInstanceRepository implements IntegrationInstanceRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoIntegrationInstanceRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.instances.createIndex({ kind: 1 });
        await this.instances.createIndex({ updatedAt: -1 });
    }

    private get instances(): Collection<IntegrationInstanceDoc> {
        return this.db.collection<IntegrationInstanceDoc>(this.prefix + "integrationInstances");
    }

    async list(): Promise<IntegrationInstance[]> {
        const docs = await this.instances.find().sort({ updatedAt: -1 }).toArray();
        return docs.map(fromDoc);
    }

    async get(id: string): Promise<IntegrationInstance | null> {
        const doc = await this.instances.findOne({ _id: id });
        return doc ? fromDoc(doc) : null;
    }

    async create(input: IntegrationInstanceCreate): Promise<IntegrationInstance> {
        const now = new Date();
        const instance: IntegrationInstance = {
            ...input,
            status: input.status ?? "pending",
            createdAt: now,
            updatedAt: now,
            runCount: input.runs?.length ?? 0,
            artifacts: input.artifacts ?? [],
            runs: trimIntegrationRuns(input.runs ?? []),
        };
        try {
            await this.instances.insertOne(toDoc(instance) as OptionalUnlessRequiredId<IntegrationInstanceDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) throw new DuplicateIntegrationInstanceError(instance.id);
            throw error;
        }
        return structuredClone(instance);
    }

    async replace(instance: IntegrationInstance): Promise<IntegrationInstance> {
        const next: IntegrationInstance = {
            ...instance,
            runs: trimIntegrationRuns(instance.runs),
        };
        const { _id, ...replacement } = toDoc(next);
        await this.instances.replaceOne({ _id }, replacement, { upsert: true });
        return structuredClone(next);
    }
}

function toDoc(instance: IntegrationInstance): IntegrationInstanceDoc {
    const { id, ...rest } = instance;
    return { _id: id, ...rest };
}

function fromDoc(doc: IntegrationInstanceDoc): IntegrationInstance {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
