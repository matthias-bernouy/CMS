import type { DeclarativeArtifactTemplate } from "./IntegrationArtifacts";
import type { FunctionStep } from "@bernouy/cms-functions";
import type { DeclarativeConnectorTemplate } from "./IntegrationConnectorDeployer";

export type {
    DeclarativeArtifactTemplate,
    DeclarativeBlocArtifactTemplate,
    DeclarativeDashboardArtifactTemplate,
    DeclarativeDashboardRelationProjectionArtifactTemplate,
    DeclarativeFunctionArtifactTemplate,
    DeclarativeRelationArtifactTemplate,
    DeclarativeSourceArtifactTemplate,
    DeclarativeSourceOverlayArtifactTemplate,
    DeclarativeTriggerArtifactTemplate,
} from "./IntegrationArtifacts";
export type {
    DeclarativeConnectorCompatibility,
    DeclarativeConnectorFunctionCompatibility,
    DeclarativeConnectorFunctionHttpContract,
    DeclarativeConnectorFunctionHttpDataShape,
    DeclarativeConnectorFunctionHttpEndpointContract,
    DeclarativeConnectorFunctionHttpResponseContract,
    DeclarativeConnectorFunctionHttpStringFormat,
    DeclarativeConnectorFunctionTemplate,
    DeclarativeConnectorSchemaColumnContract,
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaContract,
    DeclarativeConnectorSchemaForeignKeyAction,
    DeclarativeConnectorSchemaNamespaceContract,
    DeclarativeConnectorSchemaRelationContract,
    DeclarativeConnectorSchemaRelationKind,
    DeclarativeConnectorSchemaTemplate,
    DeclarativeConnectorTemplate,
} from "./IntegrationConnectorDeployer";
export {
    OBSERVED_SCHEMA_CONTRACT_V1,
    type ObservedSchemaColumnV1,
    type ObservedSchemaConstraintV1,
    type ObservedSchemaContractIdentity,
    type ObservedSchemaContractV1,
    type ObservedSchemaNamespaceV1,
    type ObservedSchemaOwnerV1,
    type ObservedSchemaRelationV1,
} from "./IntegrationConnectorDeployer";

export type IntegrationIcon = { path: string };

export type IntegrationAnswerValue =
    | string
    | number
    | boolean
    | null
    | IntegrationAnswerValue[]
    | { [key: string]: IntegrationAnswerValue };

export type IntegrationInput = {
    name: string;
    label: string;
    type: "text" | "url" | "password" | "select" | "boolean" | "json";
    required?: boolean;
    defaultValue?: string | boolean;
    options?: Array<{ label: string; value: string }>;
    secret?: boolean;
};

export type IntegrationUiDefinition = {
    mark?: string;
    markClass?: string;
    emit?: string;
    instructions?: Array<[title: string, copy: string]>;
    scopes?: string[];
    checks?: string[];
    resources?: Array<[kind: string, label: string]>;
    review?: string[];
    sync?: string[];
    syncNote?: string;
};

export type IntegrationCspPolicy = {
    connect?: string[];
    media?: string[];
    style?: string[];
    script?: string[];
    frame?: string[];
};

export type IntegrationSecurityDefinition = {
    csp?: IntegrationCspPolicy;
};

export type IntegrationDependency = {
    name: string;
    kind: string;
    versionRange?: string;
    optional?: boolean;
};

export type DeclarativeSecretTemplate = {
    input: string;
    key: string;
};

export type DeclarativeGeneratedSecretTemplate = {
    name: string;
    key: string;
    generator?: "token";
    bytes?: number;
    prefix?: string;
};

export type DeclarativeProvisionOutputTemplate = {
    name: string;
    key: string;
};

export type DeclarativeProvisionTemplate = {
    provider: string;
    configuration: Record<string, IntegrationAnswerValue>;
    outputs: DeclarativeProvisionOutputTemplate[];
};

export type DeclarativeAfterInstallationTemplate = {
    id: string;
    requires?: string[];
    steps: FunctionStep[];
};

export type IntegrationDefinition = {
    kind: string;
    label: string;
    version?: string;
    category?: string;
    description?: string;
    icon?: IntegrationIcon;
    inputs: IntegrationInput[];
    ui?: IntegrationUiDefinition;
    security?: IntegrationSecurityDefinition;
    dependencies?: IntegrationDependency[];
    secrets?: DeclarativeSecretTemplate[];
    generatedSecrets?: DeclarativeGeneratedSecretTemplate[];
    connectors?: DeclarativeConnectorTemplate[];
    provisions?: DeclarativeProvisionTemplate[];
    afterInstallation?: DeclarativeAfterInstallationTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
