import {
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
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

export async function installedConsent(): Promise<InMemoryIntegrationInstallationRepository> {
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create({
        id: "consent",
        label: "Consent",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:consent", action: "created" }],
    });
    return installations;
}
