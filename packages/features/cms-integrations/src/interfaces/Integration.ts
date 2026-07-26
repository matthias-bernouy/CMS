import type { DeclarativeArtifactTemplate } from "./IntegrationArtifacts";
import type { FunctionStep } from "@bernouy/cms-functions";

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

export type IntegrationThemeTokenType = "color" | "font-family" | "length" | "number" | "shadow" | "value";

export type IntegrationThemeTokenDefaults = {
    light: string;
    dark?: string;
};

export type IntegrationThemeToken = {
    /** Integration-local identifier. The CMS derives the final namespaced CSS variable. */
    id: string;
    label: string;
    description?: string;
    type: IntegrationThemeTokenType;
    defaults: IntegrationThemeTokenDefaults;
};

export type IntegrationThemeCategory = {
    id: string;
    label: string;
    description?: string;
    tokens: IntegrationThemeToken[];
};

export type IntegrationThemeDefinition = {
    categories: IntegrationThemeCategory[];
};

export type IntegrationDependency = {
    name: string;
    kind: string;
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

export type DeclarativeConnectorSchemaTemplate =
    | { path: string; manifest?: never }
    | { manifest: string; path?: never };

export type DeclarativeConnectorFunctionTemplate = {
    name: string;
    directory: string;
    configPath?: string;
    secrets?: Record<string, string>;
};

export type DeclarativeConnectorTemplate = {
    provider: string;
    root?: string;
    dataApiSchemas?: string[];
    schemas?: DeclarativeConnectorSchemaTemplate[];
    functions?: DeclarativeConnectorFunctionTemplate[];
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
    theme?: IntegrationThemeDefinition;
    security?: IntegrationSecurityDefinition;
    dependencies?: IntegrationDependency[];
    secrets?: DeclarativeSecretTemplate[];
    generatedSecrets?: DeclarativeGeneratedSecretTemplate[];
    connectors?: DeclarativeConnectorTemplate[];
    provisions?: DeclarativeProvisionTemplate[];
    afterInstallation?: DeclarativeAfterInstallationTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
