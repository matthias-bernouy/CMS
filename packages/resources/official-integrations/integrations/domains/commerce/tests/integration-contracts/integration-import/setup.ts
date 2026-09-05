import { type IntegrationConnectorDeployer, type IntegrationConnectorDeployment } from "@bernouy/cms-integrations";
import { supabaseUrl } from "../../harness";

export function connectorDeployer(
    capture: (value: IntegrationConnectorDeployment) => void,
): IntegrationConnectorDeployer {
    return {
        provider: "supabase",
        async deploy(next) {
            capture(next);
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl: `${supabaseUrl}/functions/v1` },
                resources: [
                    { type: "schema", id: "install/sql/schema.manifest.json", action: "applied" },
                    { type: "function", id: "cms-commerce", action: "deployed" },
                ],
            };
        },
    };
}
