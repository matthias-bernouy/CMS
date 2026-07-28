import type {
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorFunctionDeployment,
} from "../../interfaces/IntegrationConnectorDeployer";

export type SupabaseConnectorDeployerConfig = {
    projectRef: string;
    accessToken: string;
    apiBaseUrl?: string;
    fetch?: typeof fetch;
    functionSecrets?: SupabaseConnectorFunctionSecrets;
};

export type SupabaseConnectorFunctionSecrets =
    | Record<string, string | undefined>
    | ((input: {
          deployment: IntegrationConnectorDeployment;
          fn: IntegrationConnectorFunctionDeployment;
          context: IntegrationConnectorDeployContext;
      }) => Record<string, string | undefined>);

export type DataApiSchemaSyncResult = {
    action: "applied" | "skipped";
    schemas: string[];
};
