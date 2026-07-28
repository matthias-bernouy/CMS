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
export { MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES } from "./IntegrationConnectorDeployer";
export type {
    DeclarativeConnectorDatabaseClockDefaultProjection,
    DeclarativeConnectorLegacyAdoptionBaseline,
    DeclarativeConnectorInstallBaseline,
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorMigrationEquivalence,
    DeclarativeConnectorMigrationPlan,
    DeclarativeConnectorMigrationReference,
    DeclarativeConnectorMigrationSource,
    DeclarativeConnectorRepeatableDescriptor,
    IntegrationCmsMediatedCutover,
    IntegrationMigrationChecksum,
    IntegrationMigrationHttpSmoke,
    IntegrationProviderDirectCutover,
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
