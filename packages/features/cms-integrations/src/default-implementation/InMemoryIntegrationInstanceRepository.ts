import { DuplicateIntegrationInstanceError } from "../core/errors";
import { trimIntegrationRuns } from "../core/instance/runRetention";
import type {
    IntegrationInstance,
} from "../interfaces/IntegrationInstance";
import type {
    IntegrationInstanceCreate,
    IntegrationInstanceRepository,
} from "../interfaces/IntegrationInstanceRepository";

export class InMemoryIntegrationInstanceRepository implements IntegrationInstanceRepository {
    private readonly instances = new Map<string, IntegrationInstance>();

    async list(): Promise<IntegrationInstance[]> {
        return Array.from(this.instances.values(), copy)
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    }

    async get(id: string): Promise<IntegrationInstance | null> {
        const instance = this.instances.get(id);
        return instance ? copy(instance) : null;
    }

    async create(input: IntegrationInstanceCreate): Promise<IntegrationInstance> {
        if (this.instances.has(input.id)) throw new DuplicateIntegrationInstanceError(input.id);
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
        this.instances.set(instance.id, copy(instance));
        return copy(instance);
    }

    async replace(instance: IntegrationInstance): Promise<IntegrationInstance> {
        const next = {
            ...instance,
            updatedAt: new Date(instance.updatedAt),
            createdAt: new Date(instance.createdAt),
            runs: trimIntegrationRuns(instance.runs),
        };
        this.instances.set(next.id, copy(next));
        return copy(next);
    }
}

function copy(instance: IntegrationInstance): IntegrationInstance {
    return structuredClone(instance);
}
