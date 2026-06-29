import {
    BAN_INTEGRATION,
    InMemoryIntegrationInstanceRepository,
    type IntegrationInstance,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    sourceDtoToSource,
    type Source,
    type SourceRepository,
} from "@bernouy/cms-sources";

const banSourceArtifact = BAN_INTEGRATION.artifacts?.find(artifact => artifact.type === "source");
if (!banSourceArtifact) throw new Error("BAN integration must declare a source artifact.");

export const BAN_SOURCE = sourceDtoToSource(banSourceArtifact.source);

export const searchParams = (value: string) => new URL(`http://local/?${value}`).searchParams;

export const banEndpoint = (urn: string) => BAN_SOURCE.endpoints.find(endpoint => endpoint.urn === urn)!;

export function sourceArtifact(id: string, targetUrl = "https://api.example.com/items") {
    return {
        type: "source" as const,
        source: {
            id,
            meta: { name: id },
            endpoints: [{
                endpointId: "list",
                method: "GET" as const,
                targetUrl,
                params: [],
            }],
        },
    };
}

export class FailingCreateSourceRepository implements SourceRepository {
    constructor(
        private readonly inner: SourceRepository,
        private readonly failUrn: string,
    ) {}

    createSource(source: Source): Promise<Source> {
        if (source.urn === this.failUrn) throw new Error(`create failed for ${source.urn}`);
        return this.inner.createSource(source);
    }

    updateSource(source: Source): Promise<Source | null> {
        return this.inner.updateSource(source);
    }

    deleteSource(urn: string): Promise<boolean> {
        return this.inner.deleteSource(urn);
    }

    getSource(urn: string): Promise<Source | null> {
        return this.inner.getSource(urn);
    }

    getAllSources(): Promise<Source[]> {
        return this.inner.getAllSources();
    }

    getEndpoint(urn: string) {
        return this.inner.getEndpoint(urn);
    }
}

export class DeleteFailingSecretStore extends InMemorySecretStore {
    async delete(key: string): Promise<void> {
        if (key === "B") throw new Error("delete failed");
        return super.delete(key);
    }
}

export class CreateFailingIntegrationInstanceRepository extends InMemoryIntegrationInstanceRepository {
    async create(): Promise<never> {
        throw new Error("instance create failed");
    }
}

export class SuccessReplaceFailingIntegrationInstanceRepository extends InMemoryIntegrationInstanceRepository {
    async replace(instance: IntegrationInstance): Promise<IntegrationInstance> {
        if (instance.status === "success" && instance.runCount === 2) {
            throw new Error("instance replace failed");
        }
        return super.replace(instance);
    }
}
