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

export type DeclarativeSecretTemplate = {
    input: string;
    key: string;
};

export type DeclarativeSourceArtifactTemplate = {
    type: "source";
    source: SourceDto;
};

export type DeclarativeArtifactTemplate = DeclarativeSourceArtifactTemplate;

export type IntegrationDefinition = {
    kind: string;
    label: string;
    version?: string;
    category?: string;
    description?: string;
    inputs: IntegrationInput[];
    ui?: IntegrationUiDefinition;
    secrets?: DeclarativeSecretTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
