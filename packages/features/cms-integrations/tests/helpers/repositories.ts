import { InMemoryIntegrationInstallationRepository, type IntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import type { Source, SourceRepository } from "@bernouy/cms-sources";

export class FailingCreateSourceRepository implements SourceRepository {
    constructor(
        private readonly inner: SourceRepository,
        private readonly failUrn: string,
    ) {}

    createSource(source: Source): Promise<Source> {
        if (source.urn === this.failUrn) {
            throw new Error(`create failed for ${source.urn}`);
        }
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
        if (key === "B") {
            throw new Error("delete failed");
        }
        return super.delete(key);
    }
}

export class CreateFailingIntegrationInstallationRepository extends InMemoryIntegrationInstallationRepository {
    async create(): Promise<never> {
        throw new Error("installation create failed");
    }
}

export class SuccessReplaceFailingIntegrationInstallationRepository extends InMemoryIntegrationInstallationRepository {
    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        if (installation.status === "success" && installation.runCount === 2) {
            throw new Error("installation replace failed");
        }
        return super.replace(installation);
    }

    override async compareAndSwapMigration(
        expected: IntegrationInstallation,
        next: IntegrationInstallation,
    ): Promise<IntegrationInstallation | null> {
        if (next.status === "success" && next.runCount === 2) {
            throw new Error("installation replace failed");
        }
        return await super.compareAndSwapMigration(expected, next);
    }
}
