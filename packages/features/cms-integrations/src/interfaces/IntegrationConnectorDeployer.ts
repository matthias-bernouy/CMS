import type { IntegrationAnswerValue } from "./Integration";

export type IntegrationConnectorSchemaDeployment = {
    path: string;
};

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
    deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult>;
}
