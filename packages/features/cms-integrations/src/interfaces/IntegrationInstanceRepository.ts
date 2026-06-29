import type {
    IntegrationArtifactResult,
} from "./IntegrationImport";
import type {
    IntegrationInstance,
    IntegrationInstanceStatus,
    IntegrationRun,
} from "./IntegrationInstance";

export type IntegrationInstanceCreate = Omit<IntegrationInstance, "createdAt" | "updatedAt" | "runCount" | "runs" | "status" | "artifacts"> & {
    status?: IntegrationInstanceStatus;
    artifacts?: IntegrationArtifactResult[];
    runs?: IntegrationRun[];
};

export type IntegrationInstanceRepository = {
    list(): Promise<IntegrationInstance[]>;
    get(id: string): Promise<IntegrationInstance | null>;
    create(instance: IntegrationInstanceCreate): Promise<IntegrationInstance>;
    replace(instance: IntegrationInstance): Promise<IntegrationInstance>;
};
