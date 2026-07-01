import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { SourceRepository } from "@bernouy/cms-sources";
import type { SecretStore } from "@bernouy/cms-secrets";
import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
} from "./Integration";

export type IntegrationArtifactType = "source" | "dashboard";

export type IntegrationArtifactAction = "created" | "updated" | "skipped";

export type IntegrationArtifactResult = {
    type: IntegrationArtifactType;
    id: string;
    action: IntegrationArtifactAction;
};

export type IntegrationSecretResult = {
    input?: string;
    key: string;
    action: IntegrationArtifactAction;
};

export type IntegrationImportResult = {
    artifacts: IntegrationArtifactResult[];
    secrets?: IntegrationSecretResult[];
};

export type IntegrationImportOptions = {
    force?: boolean;
};

export type IntegrationImportInstanceInput = {
    id?: string;
    label?: string;
};

export type IntegrationImportDto = {
    kind: string;
    answers: Record<string, IntegrationAnswerValue>;
    options: IntegrationImportOptions;
    instance?: IntegrationImportInstanceInput;
};

export type IntegrationImportRequest = {
    dto: IntegrationImportDto;
    siteIntegrations: IntegrationDefinition[];
};

export type IntegrationImportDeps = {
    sources: SourceRepository;
    secrets: SecretStore;
    dashboards?: DashboardRepository;
};
