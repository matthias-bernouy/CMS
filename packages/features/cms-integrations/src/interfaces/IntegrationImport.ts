import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { RelationRepository } from "@bernouy/cms-relations";
import type { TriggerRepository } from "@bernouy/cms-triggers";
import type { SourceOverlayRepository, SourceRepository } from "@bernouy/cms-sources";
import type { SecretStore } from "@bernouy/cms-secrets";
import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
} from "./Integration";
import type { IntegrationInstallationRepository } from "./IntegrationInstallationRepository";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployResult,
} from "./IntegrationConnectorDeployer";

export type IntegrationArtifactType = "source" | "function" | "trigger" | "dashboard" | "bloc" | "sourceOverlay" | "relation" | "dashboardRelation";

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
    connectors?: IntegrationConnectorDeployResult[];
};

export type IntegrationImportOptions = {
    force?: boolean;
};

export type IntegrationImportDto = {
    kind: string;
    answers: Record<string, IntegrationAnswerValue>;
    options: IntegrationImportOptions;
};

export type IntegrationImportRequest = {
    dto: IntegrationImportDto;
    siteIntegrations: IntegrationDefinition[];
};

export type IntegrationImportDeps = {
    sources: SourceRepository;
    functions?: FunctionRepository;
    triggers?: TriggerRepository;
    secrets: SecretStore;
    dashboards?: DashboardRepository;
    relations?: RelationRepository;
    sourceOverlays?: SourceOverlayRepository;
    installations?: IntegrationInstallationRepository;
    blocs?: IntegrationBlocImporter;
    connectorDeployers?: IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer>;
    env?: Record<string, string | undefined>;
};

export type IntegrationBlocArtifact = {
    tag: string;
    name: string;
    group?: string;
    description?: string;
    viewJS: string;
    editorJS?: string | null;
    source?: Record<string, string>;
};

export type IntegrationBlocImporter = {
    importBloc(
        artifact: IntegrationBlocArtifact,
        options: IntegrationImportOptions,
    ): Promise<{ id: string; action: IntegrationArtifactAction }>;
};
