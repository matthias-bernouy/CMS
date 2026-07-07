import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { FunctionDto } from "@bernouy/cms-functions";
import type { SourceDto } from "@bernouy/cms-sources";

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

export type DeclarativeConnectorSchemaTemplate = {
    path: string;
};

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

export type DeclarativeSourceArtifactTemplate = {
    type: "source";
    source: SourceDto;
};

export type DeclarativeDashboardArtifactTemplate = {
    type: "dashboard";
    dashboard: DashboardDto;
};

export type DeclarativeFunctionArtifactTemplate = {
    type: "function";
    function: FunctionDto;
};

export type DeclarativeBlocArtifactTemplate = {
    type: "bloc";
    bloc: {
        tag: string;
        name: string;
        group?: string;
        description?: string;
        path?: string;
        view?: string;
        editor?: string | null;
        viewJS?: string;
        editorJS?: string | null;
        source?: Record<string, string>;
    };
};

export type DeclarativeArtifactTemplate =
    | DeclarativeSourceArtifactTemplate
    | DeclarativeFunctionArtifactTemplate
    | DeclarativeDashboardArtifactTemplate
    | DeclarativeBlocArtifactTemplate;

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
    secrets?: DeclarativeSecretTemplate[];
    generatedSecrets?: DeclarativeGeneratedSecretTemplate[];
    connectors?: DeclarativeConnectorTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
