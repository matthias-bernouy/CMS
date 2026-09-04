import type { Collection, Db } from "mongodb";
import type {
    IntegrationConnectorProvider,
    IntegrationConnectorProviderRepository,
} from "../../interfaces/IntegrationConnectorDeployer/provider";

export type MongoIntegrationConnectorProviderRepositoryConfig = {
    collectionPrefix?: string;
};

type IntegrationConnectorProviderDoc = Omit<IntegrationConnectorProvider, "provider"> & {
    _id: IntegrationConnectorProvider["provider"];
};

/** Mongo persistence for non-secret connector-provider configuration. */
export class MongoIntegrationConnectorProviderRepository implements IntegrationConnectorProviderRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoIntegrationConnectorProviderRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    private get providers(): Collection<IntegrationConnectorProviderDoc> {
        return this.db.collection<IntegrationConnectorProviderDoc>(this.prefix + "integrationConnectorProviders");
    }

    async get(provider: IntegrationConnectorProvider["provider"]): Promise<IntegrationConnectorProvider | null> {
        const document = await this.providers.findOne({ _id: provider });
        return document ? fromDoc(document) : null;
    }

    async upsert(provider: IntegrationConnectorProvider): Promise<IntegrationConnectorProvider> {
        const { _id, ...settings } = toDoc(provider);
        await this.providers.updateOne({ _id }, { $set: settings }, { upsert: true });
        return { ...provider };
    }
}

function toDoc(provider: IntegrationConnectorProvider): IntegrationConnectorProviderDoc {
    const { provider: id, ...rest } = provider;
    return { _id: id, ...rest };
}

function fromDoc(document: IntegrationConnectorProviderDoc): IntegrationConnectorProvider {
    const { _id, ...rest } = document;
    return { provider: _id, ...rest };
}
