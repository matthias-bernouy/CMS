import type { IntegrationAnswerValue, IntegrationDefinition } from "./Integration";
import type { IntegrationArtifactResult, IntegrationSecretResult } from "./IntegrationImport";
import type { IntegrationConnectorDeployResult } from "./IntegrationConnectorDeployer";

export type IntegrationInstallationStatus = "success" | "failed" | "pending";

export type IntegrationRunError = {
    message: string;
    status?: number;
};

export type IntegrationRun = {
    id: string;
    runNumber: number;
    status: IntegrationInstallationStatus;
    startedAt: Date;
    finishedAt: Date;
    artifacts: IntegrationArtifactResult[];
    secrets?: IntegrationSecretResult[];
    connectors?: IntegrationConnectorDeployResult[];
    error?: IntegrationRunError;
};

export type IntegrationInstallation = {
    id: string;
    label: string;
    definitionVersion: string;
    definitionSnapshot?: IntegrationDefinition;
    packageDigest?: string;
    status: IntegrationInstallationStatus;
    createdAt: Date;
    updatedAt: Date;
    runCount: number;
    answersSnapshot: Record<string, IntegrationAnswerValue>;
    secretRefs: Record<string, string>;
    secretInputs: string[];
    artifacts: IntegrationArtifactResult[];
    runs: IntegrationRun[];
};
