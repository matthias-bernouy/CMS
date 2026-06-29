import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
} from "./Integration";
import type {
    IntegrationArtifactResult,
    IntegrationSecretResult,
} from "./IntegrationImport";

export type IntegrationInstanceStatus = "success" | "failed" | "pending";

export type IntegrationRunError = {
    message: string;
    status?: number;
};

export type IntegrationRun = {
    id: string;
    runNumber: number;
    status: IntegrationInstanceStatus;
    startedAt: Date;
    finishedAt: Date;
    artifacts: IntegrationArtifactResult[];
    secrets?: IntegrationSecretResult[];
    error?: IntegrationRunError;
};

export type IntegrationInstance = {
    id: string;
    kind: string;
    label: string;
    definitionVersion: string;
    definitionSnapshot?: IntegrationDefinition;
    status: IntegrationInstanceStatus;
    createdAt: Date;
    updatedAt: Date;
    runCount: number;
    answersSnapshot: Record<string, IntegrationAnswerValue>;
    secretRefs: Record<string, string>;
    secretInputs: string[];
    artifacts: IntegrationArtifactResult[];
    runs: IntegrationRun[];
};
