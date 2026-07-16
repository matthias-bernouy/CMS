import {
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    InMemoryIntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import { supabaseUrl } from "../harness";

export async function installedBasicBlocs(): Promise<InMemoryIntegrationInstallationRepository> {
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create({
        id: "basic-blocs", label: "Basic Blocs", definitionVersion: "1.0.0", status: "success",
        answersSnapshot: {}, secretRefs: {}, secretInputs: [], runs: [],
        artifacts: [{ type: "bloc", id: "basic-input", action: "created" }],
    });
    return installations;
}

export function blocImporter(imported: IntegrationBlocArtifact[]) {
    return {
        async importBloc(artifact: IntegrationBlocArtifact) {
            imported.push(artifact);
            return { id: artifact.tag, action: "created" as const };
        },
    };
}

export function connectorDeployer(capture: (value: IntegrationConnectorDeployment) => void): IntegrationConnectorDeployer {
    return {
        provider: "supabase",
        async deploy(next) {
            capture(next);
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl: `${supabaseUrl}/functions/v1` },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-commerce", action: "deployed" },
                ],
            };
        },
    };
}
