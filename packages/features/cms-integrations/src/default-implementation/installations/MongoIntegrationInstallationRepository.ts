import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateIntegrationInstallationError } from "../../core/errors";
import { trimIntegrationRuns } from "../../core/installation/execution/runRetention";
import { assertIntegrationInstallationProvenance } from "../../core/installation/packages";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import type {
    IntegrationInstallationCreate,
    IntegrationInstallationRepository,
} from "../../interfaces/IntegrationInstallationRepository";

export type MongoIntegrationInstallationRepositoryConfig = {
    collectionPrefix?: string;
};

type IntegrationInstallationDoc = Omit<IntegrationInstallation, "id"> & { _id: string };

export class MongoIntegrationInstallationRepository implements IntegrationInstallationRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoIntegrationInstallationRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.installations.createIndex({ updatedAt: -1 });
    }

    private get installations(): Collection<IntegrationInstallationDoc> {
        return this.db.collection<IntegrationInstallationDoc>(this.prefix + "integrationInstallations");
    }

    async list(): Promise<IntegrationInstallation[]> {
        const docs = await this.installations.find().sort({ updatedAt: -1 }).toArray();
        return docs.map(fromDoc).map(validInstallation);
    }

    async get(id: string): Promise<IntegrationInstallation | null> {
        const doc = await this.installations.findOne({ _id: id });
        return doc ? validInstallation(fromDoc(doc)) : null;
    }

    async create(input: IntegrationInstallationCreate): Promise<IntegrationInstallation> {
        assertIntegrationInstallationProvenance(input);
        const now = new Date();
        const installation: IntegrationInstallation = {
            ...input,
            status: input.status ?? "pending",
            createdAt: now,
            updatedAt: now,
            runCount: input.runs?.length ?? 0,
            artifacts: input.artifacts ?? [],
            runs: trimIntegrationRuns(input.runs ?? []),
        };
        try {
            await this.installations.insertOne(
                toDoc(installation) as OptionalUnlessRequiredId<IntegrationInstallationDoc>,
            );
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateIntegrationInstallationError(installation.id);
            }
            throw error;
        }
        return structuredClone(installation);
    }

    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        assertIntegrationInstallationProvenance(installation);
        const next: IntegrationInstallation = {
            ...installation,
            runs: trimIntegrationRuns(installation.runs),
        };
        const { _id, ...replacement } = toDoc(next);
        await this.installations.replaceOne({ _id }, replacement, { upsert: true });
        return structuredClone(next);
    }

    async compareAndSwapMigration(
        expected: IntegrationInstallation,
        next: IntegrationInstallation,
    ): Promise<IntegrationInstallation | null> {
        assertIntegrationInstallationProvenance(expected);
        assertIntegrationInstallationProvenance(next);
        const { _id, ...replacement } = toDoc(next);
        const operation = expected.migrationOperation;
        const filter = operation
            ? {
                  _id,
                  updatedAt: expected.updatedAt,
                  "migrationOperation.id": operation.id,
                  "migrationOperation.revision": operation.revision,
                  "migrationOperation.fencingToken": operation.fencingToken,
              }
            : { _id, updatedAt: expected.updatedAt, migrationOperation: { $exists: false } };
        const stored = await this.installations.findOneAndReplace(filter, replacement, { returnDocument: "after" });
        return stored ? validInstallation(fromDoc(stored)) : null;
    }
}

function toDoc(installation: IntegrationInstallation): IntegrationInstallationDoc {
    const { id, ...rest } = installation;
    return { _id: id, ...rest };
}

function fromDoc(doc: IntegrationInstallationDoc): IntegrationInstallation {
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function validInstallation(installation: IntegrationInstallation): IntegrationInstallation {
    assertIntegrationInstallationProvenance(installation);
    return installation;
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
