import type { DataShape, HTTPMethod } from "@bernouy/cms-sources";
import type { IntegrationAnswerValue, IntegrationDefinition } from "./Integration";

export type DeclarativeConnectorSchemaTemplate =
    | { path: string; manifest?: never }
    | { manifest: string; path?: never };

export type DeclarativeConnectorFunctionHttpResponseContract = {
    status: string;
    body?: DataShape;
};

export type DeclarativeConnectorFunctionHttpEndpointContract = {
    route: string;
    method: HTTPMethod;
    requiredInputs: string[];
    requiredHeaders: string[];
    responses: DeclarativeConnectorFunctionHttpResponseContract[];
};

export type DeclarativeConnectorFunctionHttpContract = {
    endpoints: DeclarativeConnectorFunctionHttpEndpointContract[];
    requiredSecrets: string[];
};

export type DeclarativeConnectorFunctionCompatibility = {
    http?: DeclarativeConnectorFunctionHttpContract;
};

export type DeclarativeConnectorFunctionTemplate = {
    name: string;
    directory: string;
    configPath?: string;
    secrets?: Record<string, string>;
    compatibility?: DeclarativeConnectorFunctionCompatibility;
};

export type DeclarativeConnectorSchemaColumnContract = {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
};

export type DeclarativeConnectorSchemaForeignKeyAction =
    | "no-action"
    | "restrict"
    | "cascade"
    | "set-null"
    | "set-default";

export type DeclarativeConnectorSchemaConstraintContract =
    | { kind: "primary-key"; name: string; columns: string[] }
    | { kind: "unique"; name: string; columns: string[]; nullsNotDistinct: boolean }
    | {
          kind: "foreign-key";
          name: string;
          columns: string[];
          references: { namespace: string; relation: string; columns: string[] };
          onUpdate: DeclarativeConnectorSchemaForeignKeyAction;
          onDelete: DeclarativeConnectorSchemaForeignKeyAction;
      }
    | { kind: "check"; name: string; expression: string };

export type DeclarativeConnectorSchemaRelationContract = {
    name: string;
    columns: DeclarativeConnectorSchemaColumnContract[];
    constraints: DeclarativeConnectorSchemaConstraintContract[];
};

export type DeclarativeConnectorSchemaNamespaceContract = {
    name: string;
    relations: DeclarativeConnectorSchemaRelationContract[];
};

export type DeclarativeConnectorSchemaContract = {
    namespaces: DeclarativeConnectorSchemaNamespaceContract[];
};

export type DeclarativeConnectorCompatibility = {
    schema?: DeclarativeConnectorSchemaContract;
};

export type DeclarativeConnectorTemplate = {
    provider: string;
    root?: string;
    dataApiSchemas?: string[];
    schemas?: DeclarativeConnectorSchemaTemplate[];
    functions?: DeclarativeConnectorFunctionTemplate[];
    compatibility?: DeclarativeConnectorCompatibility;
};

export type IntegrationPackageResolutionReason = "create" | "rerun" | "upgrade";

export type ResolveIntegrationPackageRequest = {
    kind: string;
    version: string;
    reason: IntegrationPackageResolutionReason;
    expectedDigest?: string;
    expectedDefinition?: IntegrationDefinition;
    allowEmbeddedFallback: boolean;
};

export type ResolvedIntegrationPackageRoot = {
    root: string;
    kind: string;
    version: string;
    digest: string;
    definition: IntegrationDefinition;
};

export interface IntegrationPackageResolver {
    resolve(request: ResolveIntegrationPackageRequest): Promise<ResolvedIntegrationPackageRoot>;
}

export type IntegrationConnectorSchemaDeployment =
    | { path: string; manifest?: never }
    | { manifest: string; path?: never };

export type IntegrationConnectorFunctionDeployment = {
    name: string;
    directory: string;
    configPath?: string;
    secrets?: Record<string, string>;
};

export type IntegrationConnectorDeployment = {
    integrationKind: string;
    version?: string;
    provider: string;
    root?: string;
    dataApiSchemas: string[];
    schemas: IntegrationConnectorSchemaDeployment[];
    functions: IntegrationConnectorFunctionDeployment[];
};

export type IntegrationConnectorDeployContext = {
    answers: Record<string, IntegrationAnswerValue>;
    generated: Record<string, string>;
    secrets: Record<string, string>;
    packageRoot?: string;
    env: Record<string, string | undefined>;
};

export type IntegrationConnectorResourceResult = {
    type: "schema" | "function" | "secret" | "config";
    id: string;
    action: "applied" | "deployed" | "set" | "skipped";
};

export type IntegrationConnectorDeployResult = {
    provider: string;
    outputs?: Record<string, string>;
    resources?: IntegrationConnectorResourceResult[];
};

export interface IntegrationConnectorDeployer {
    provider: string;
    previewOutputs?(): Promise<Record<string, string>>;
    deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult>;
}
