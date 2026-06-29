import type {
    IntegrationAnswerValue,
    IntegrationArtifactResult,
    IntegrationDefinition,
    IntegrationInstance,
    IntegrationRun,
} from "@bernouy/cms-integrations";

export type RemoteIntegrationListItem = {
    id: string;
};

export type RemoteIntegrationDetail = {
    id: string;
    kind: string;
    label: string;
    definitionVersion: string;
    status: IntegrationInstance["status"];
    createdAt: string | Date;
    updatedAt: string | Date;
    runCount: number;
    definition?: IntegrationDefinition;
    artifacts: Array<IntegrationArtifactResult & { exists?: boolean | "unknown" }>;
    answers?: Record<string, IntegrationAnswerValue>;
    secretInputs?: string[];
    runs?: IntegrationRun[];
};
