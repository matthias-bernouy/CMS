import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { SourceDto } from "@bernouy/cms-sources";

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

export type DeclarativeSourceArtifactTemplate = {
    type: "source";
    source: SourceDto;
};

export type DeclarativeDashboardArtifactTemplate = {
    type: "dashboard";
    dashboard: DashboardDto;
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
    | DeclarativeDashboardArtifactTemplate
    | DeclarativeBlocArtifactTemplate;

export type IntegrationDefinition = {
    kind: string;
    label: string;
    version?: string;
    category?: string;
    description?: string;
    inputs: IntegrationInput[];
    ui?: IntegrationUiDefinition;
    security?: IntegrationSecurityDefinition;
    secrets?: DeclarativeSecretTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
