import { DuplicateIntegrationInstallationError } from "../../core/errors";
import { trimIntegrationRuns } from "../../core/installation/execution/runRetention";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import type {
    IntegrationInstallationCreate,
    IntegrationInstallationRepository,
} from "../../interfaces/IntegrationInstallationRepository";

export class InMemoryIntegrationInstallationRepository implements IntegrationInstallationRepository {
    private readonly installations = new Map<string, IntegrationInstallation>();

    async list(): Promise<IntegrationInstallation[]> {
        return Array.from(this.installations.values(), copy).sort(
            (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        );
    }

    async get(id: string): Promise<IntegrationInstallation | null> {
        const installation = this.installations.get(id);
        return installation ? copy(installation) : null;
    }

    async create(input: IntegrationInstallationCreate): Promise<IntegrationInstallation> {
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
        const next = {
            ...installation,
            updatedAt: new Date(installation.updatedAt),
            createdAt: new Date(installation.createdAt),
            runs: trimIntegrationRuns(installation.runs),
        };
        this.installations.set(next.id, copy(next));
        return copy(next);
    }
}

function copy(installation: IntegrationInstallation): IntegrationInstallation {
    return structuredClone(installation);
}
