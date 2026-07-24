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

export type IntegrationInputOption = {
    label: string;
    value: string;
};

type IntegrationInputBase = {
    name: string;
    label: string;
    required?: boolean;
};

export type IntegrationValueInput = IntegrationInputBase & {
    type: "text" | "url" | "password" | "select" | "boolean" | "json";
    defaultValue?: string | boolean;
    options?: IntegrationInputOption[];
    secret?: boolean;
};

type IntegrationObjectListFieldBase = {
    name: string;
    label: string;
    required?: boolean;
};

export type IntegrationObjectListField =
    | (IntegrationObjectListFieldBase & {
          type: "text" | "textarea" | "boolean" | "page-link";
      })
    | (IntegrationObjectListFieldBase & {
          type: "select";
          options: IntegrationInputOption[];
          multiple?: boolean;
      });

export type IntegrationObjectListInput = IntegrationInputBase & {
    type: "object-list";
    fields: IntegrationObjectListField[];
    addLabel?: string;
    minItems?: number;
    maxItems?: number;
};

export type IntegrationInput = IntegrationValueInput | IntegrationObjectListInput;

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
    security?: IntegrationSecurityDefinition;
    dependencies?: IntegrationDependency[];
    secrets?: DeclarativeSecretTemplate[];
    generatedSecrets?: DeclarativeGeneratedSecretTemplate[];
    connectors?: DeclarativeConnectorTemplate[];
    provisions?: DeclarativeProvisionTemplate[];
    afterInstallation?: DeclarativeAfterInstallationTemplate[];
    artifacts?: DeclarativeArtifactTemplate[];
};
