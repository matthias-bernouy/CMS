import type { IntegrationArtifactResult } from "./IntegrationImport";
import type { IntegrationInstallation, IntegrationInstallationStatus, IntegrationRun } from "./IntegrationInstallation";

export type IntegrationInstallationCreate = Omit<
    IntegrationInstallation,
    "createdAt" | "updatedAt" | "runCount" | "runs" | "status" | "artifacts"
> & {
    status?: IntegrationInstallationStatus;
    artifacts?: IntegrationArtifactResult[];
    runs?: IntegrationRun[];
};

export type IntegrationInstallationRepository = {
    list(): Promise<IntegrationInstallation[]>;
    get(id: string): Promise<IntegrationInstallation | null>;
    create(installation: IntegrationInstallationCreate): Promise<IntegrationInstallation>;
    replace(installation: IntegrationInstallation): Promise<IntegrationInstallation>;
    compareAndSwapMigration?(
        expected: IntegrationInstallation,
        next: IntegrationInstallation,
    ): Promise<IntegrationInstallation | null>;
};
