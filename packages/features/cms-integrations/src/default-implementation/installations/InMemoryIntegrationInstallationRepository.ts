import { DuplicateIntegrationInstallationError } from "../../core/errors";
import { trimIntegrationRuns } from "../../core/installation/execution/runRetention";
import { assertIntegrationInstallationProvenance } from "../../core/installation/packages";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import type {
    IntegrationInstallationCreate,
    IntegrationInstallationRepository,
} from "../../interfaces/IntegrationInstallationRepository";

export class InMemoryIntegrationInstallationRepository implements IntegrationInstallationRepository {
    private readonly installations = new Map<string, IntegrationInstallation>();

    async list(): Promise<IntegrationInstallation[]> {
        const installations = Array.from(this.installations.values(), copy);
        installations.forEach(assertIntegrationInstallationProvenance);
        return installations.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    }

    async get(id: string): Promise<IntegrationInstallation | null> {
        const installation = this.installations.get(id);
        if (!installation) {
            return null;
        }
        assertIntegrationInstallationProvenance(installation);
        return copy(installation);
    }

    async create(input: IntegrationInstallationCreate): Promise<IntegrationInstallation> {
        assertIntegrationInstallationProvenance(input);
        if (this.installations.has(input.id)) {
            throw new DuplicateIntegrationInstallationError(input.id);
        }
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
        this.installations.set(installation.id, copy(installation));
        return copy(installation);
    }

    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        assertIntegrationInstallationProvenance(installation);
        const next = {
            ...installation,
            updatedAt: new Date(installation.updatedAt),
            createdAt: new Date(installation.createdAt),
            runs: trimIntegrationRuns(installation.runs),
        };
        this.installations.set(next.id, copy(next));
        return copy(next);
    }

    async compareAndSwapMigration(
        expected: IntegrationInstallation,
        next: IntegrationInstallation,
    ): Promise<IntegrationInstallation | null> {
        assertIntegrationInstallationProvenance(expected);
        assertIntegrationInstallationProvenance(next);
        const current = this.installations.get(expected.id);
        if (!current || !sameMigrationRevision(current, expected)) {
            return null;
        }
        this.installations.set(next.id, copy(next));
        return copy(next);
    }
}

function sameMigrationRevision(current: IntegrationInstallation, expected: IntegrationInstallation): boolean {
    return (
        current.updatedAt.getTime() === expected.updatedAt.getTime() &&
        current.migrationOperation?.id === expected.migrationOperation?.id &&
        current.migrationOperation?.revision === expected.migrationOperation?.revision &&
        current.migrationOperation?.fencingToken === expected.migrationOperation?.fencingToken
    );
}

function copy(installation: IntegrationInstallation): IntegrationInstallation {
    return structuredClone(installation);
}
