import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { RelationRepository } from "@bernouy/cms-relations";
import type { TriggerRepository } from "@bernouy/cms-triggers";
import type { RolesRepository } from "@bernouy/cms-permissions";
import type { ExecutorDeps, SourceOverlayRepository, SourceRepository } from "@bernouy/cms-sources";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { IntegrationAnswerValue, IntegrationDefinition } from "./Integration";
import type { IntegrationInstallationRepository } from "./IntegrationInstallationRepository";
import type { IntegrationConnectorDeployer, IntegrationConnectorDeployResult } from "./IntegrationConnectorDeployer";

export type IntegrationProvisionOutput = {
    name: string;
    key: string;
};

export type IntegrationProvisionDeployment = {
    integrationKind: string;
    version?: string;
    provider: string;
    configuration: Record<string, IntegrationAnswerValue>;
    outputs: IntegrationProvisionOutput[];
};

export type IntegrationProvisionContext = {
    existingOutputs: Record<string, string>;
    env: Record<string, string | undefined>;
};

export type IntegrationProvisionResourceResult = {
    type: string;
    id: string;
    action: "created" | "updated" | "reused";
};

export type IntegrationProvisionExecutionResult = {
    outputs: Record<string, string>;
    resources?: IntegrationProvisionResourceResult[];
    rollback?: () => Promise<void>;
};

export type IntegrationProvisionResult = {
    provider: string;
    resources?: IntegrationProvisionResourceResult[];
};

export interface IntegrationProvisioner {
    provider: string;
    provision(
        deployment: IntegrationProvisionDeployment,
        context: IntegrationProvisionContext,
    ): Promise<IntegrationProvisionExecutionResult>;
}

export type IntegrationArtifactType =
    | "source"
    | "function"
    | "trigger"
    | "dashboard"
    | "bloc"
    | "sourceOverlay"
    | "relation"
    | "dashboardRelation";

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
    provisions?: IntegrationProvisionResult[];
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

export type IntegrationResolvedPage = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export type IntegrationPublishedPageResolver = (path: string) => Promise<IntegrationResolvedPage | null>;

export type IntegrationImportDeps = {
    sources: SourceRepository;
    functions?: FunctionRepository;
    triggers?: TriggerRepository;
    roles?: RolesRepository;
    secrets: SecretStore;
    dashboards?: DashboardRepository;
    relations?: RelationRepository;
    sourceOverlays?: SourceOverlayRepository;
    installations?: IntegrationInstallationRepository;
    blocs?: IntegrationBlocImporter;
    connectorDeployers?: IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer>;
    provisioners?: IntegrationProvisioner[] | Record<string, IntegrationProvisioner>;
    sourceExecutorDeps?: ExecutorDeps;
    env?: Record<string, string | undefined>;
    resolvePublishedPage?: IntegrationPublishedPageResolver;
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
