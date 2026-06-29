import type {
    IntegrationDefinition,
    IntegrationImportDto,
    IntegrationInstanceStatus,
} from "@bernouy/cms-integrations";

export type IntegrationInstanceRow = {
    id: string;
    kind: string;
    label: string;
    status: IntegrationInstanceStatus;
    runCount: number;
    artifactCount: number;
    missingArtifactCount: number;
    updatedAt: string;
};

export type IntegrationImportPayload = Omit<IntegrationImportDto, "options"> & {
    options?: IntegrationImportDto["options"];
    definition?: IntegrationDefinition;
};

export type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationInput,
} from "@bernouy/cms-integrations";
