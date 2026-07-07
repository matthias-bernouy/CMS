import type {
    IntegrationAnswerValue,
    IntegrationArtifactResult,
    IntegrationDefinition,
    IntegrationInstallation,
    IntegrationRun,
} from "@bernouy/cms-integrations";

export type RemoteIntegrationListItem = {
    id: string;
};

export type RemoteIntegrationDetail = {
    id: string;
    label: string;
    definitionVersion: string;
    status: IntegrationInstallation["status"];
    createdAt: string | Date;
    updatedAt: string | Date;
    runCount: number;
    definition?: IntegrationDefinition;
    artifacts: Array<IntegrationArtifactResult & { exists?: boolean | "unknown" }>;
    answers?: Record<string, IntegrationAnswerValue>;
    secretInputs?: string[];
    runs?: IntegrationRun[];
};
