import {
    IntegrationRuntimeError,
    type IntegrationInstallation,
    type IntegrationConnectorDeployer,
} from "@bernouy/cms-integrations";

export async function syncIntegrationRuntimeSecrets(
    deployers: IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer> | undefined,
    installation: IntegrationInstallation,
    values: Record<string, string>,
): Promise<void> {
    const ordinary =
        installation.connectorRuntimeTargets ??
        installation.runs
            .findLast((run) => run.status === "success")
            ?.connectors?.filter((connector) => !connector.lineageId)
            .map((connector) => ({ provider: connector.provider, outputs: connector.outputs ?? {} })) ??
        [];
    const bindings = [...Object.values(installation.connectorBindings ?? {}), ...ordinary];
    if (bindings.length !== 1) {
        throw new IntegrationRuntimeError("Runtime secret sync requires exactly one installed connector target", 409);
    }
    const binding = bindings[0]!;
    const deployer = Object.values(deployers ?? {}).find(({ provider }) => provider === binding.provider);
    if (!deployer?.syncSecrets) {
        throw new IntegrationRuntimeError("Connector runtime secret synchronization is unavailable", 503);
    }
    await deployer.syncSecrets(binding, values);
}
