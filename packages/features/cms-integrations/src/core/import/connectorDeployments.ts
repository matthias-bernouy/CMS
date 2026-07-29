import { IntegrationRuntimeError } from "../errors";
import { resolveTemplates, type TemplateContext } from "../definitions/templating/templates";
import type { DeclarativeConnectorTemplate, IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
} from "../../interfaces/IntegrationConnectorDeployer";
import type { IntegrationImportDeps } from "../../interfaces/IntegrationImport";

export function buildConnectorDeployments(
    definition: {
        kind: string;
        version?: string;
        connectors?: DeclarativeConnectorTemplate[];
    },
    context: TemplateContext,
    connectorInstanceIds: Record<string, string> = {},
): IntegrationConnectorDeployment[] {
    return (definition.connectors ?? []).map((connector) => {
        const resolved = resolveTemplates(connector, context);
        const connectorKey = resolved.connectorKey ?? resolved.provider;
        return {
            integrationKind: definition.kind,
            ...(definition.version ? { version: definition.version } : {}),
            provider: resolved.provider,
            ...(resolved.connectorKey ? { connectorKey } : {}),
            ...(resolved.migration && resolved.lineageId && resolved.migrationRevision !== undefined
                ? {
                      migration: {
                          connectorKey,
                          lineageId: resolved.lineageId,
                          migrationRevision: resolved.migrationRevision,
                          connectorInstanceId: requiredConnectorInstanceId(connectorKey, connectorInstanceIds),
                          plan: resolved.migration,
                      },
                  }
                : {}),
            ...(resolved.root ? { root: resolved.root } : {}),
            dataApiSchemas: resolved.dataApiSchemas ?? [],
            schemas: resolved.schemas ?? [],
            functions: resolved.functions ?? [],
        };
    });
}

function requiredConnectorInstanceId(connectorKey: string, connectorInstanceIds: Record<string, string>): string {
    const connectorInstanceId = connectorInstanceIds[connectorKey]?.trim();
    if (!connectorInstanceId) {
        throw new IntegrationRuntimeError(
            `migration-aware connector "${connectorKey}" requires a connector instance id`,
        );
    }
    return connectorInstanceId;
}

export async function deployConnectorDeployments(
    deps: IntegrationImportDeps,
    deployments: IntegrationConnectorDeployment[],
    context: Omit<TemplateContext, "secretInputs" | "connectors">,
): Promise<{
    results: IntegrationConnectorDeployResult[];
    outputs: Record<string, Record<string, string>>;
}> {
    if (!deployments.length) {
        return { results: [], outputs: {} };
    }
    const deployers = connectorDeployersByProvider(deps.connectorDeployers);
    const results: IntegrationConnectorDeployResult[] = [];
    const outputs: Record<string, Record<string, string>> = {};

    for (const deployment of deployments) {
        const deployer = deployers.get(deployment.provider);
        if (!deployer) {
            throw new IntegrationRuntimeError(`connector deployer "${deployment.provider}" not configured`);
        }
        const result = await deployer.deploy(deployment, {
            answers: context.answers,
            generated: context.generated ?? {},
            secrets: context.secrets,
            ...(deps.packageRoot ? { packageRoot: deps.packageRoot } : {}),
            ...(deps.packageDigest ? { packageDigest: deps.packageDigest } : {}),
            env: deps.env ?? {},
        });
        const connectorKey = deployment.connectorKey ?? deployment.provider;
        results.push(deployment.migration ? { ...result, connectorKey } : result);
        outputs[connectorKey] = {
            ...(outputs[connectorKey] ?? {}),
            ...(result.outputs ?? {}),
        };
    }

    return { results, outputs: connectorOutputsWithProviderAliases(deployments, outputs) };
}

export async function previewConnectorOutputs(
    deps: IntegrationImportDeps,
    definition: Pick<IntegrationDefinition, "connectors">,
    context: TemplateContext,
): Promise<Record<string, Record<string, string>>> {
    const deployers = connectorDeployersByProvider(deps.connectorDeployers);
    const outputs: Record<string, Record<string, string>> = {};
    const identities: Array<{ provider: string; connectorKey: string }> = [];
    for (const connector of definition.connectors ?? []) {
        const provider = resolveTemplates(connector.provider, context);
        const connectorKey = resolveTemplates(connector.connectorKey ?? provider, context);
        identities.push({ provider, connectorKey });
        const deployer = deployers.get(provider);
        if (!deployer) {
            throw new IntegrationRuntimeError(`connector deployer "${provider}" not configured`);
        }
        if (!deployer.previewOutputs) {
            continue;
        }
        outputs[connectorKey] = {
            ...(outputs[connectorKey] ?? {}),
            ...(await deployer.previewOutputs()),
        };
    }
    return connectorOutputsWithProviderAliases(identities, outputs);
}

export function connectorOutputsWithProviderAliases(
    connectors: ReadonlyArray<{ provider: string; connectorKey?: string }>,
    outputs: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
    const aliases = { ...outputs };
    const providerCounts = new Map<string, number>();
    for (const connector of connectors) {
        providerCounts.set(connector.provider, (providerCounts.get(connector.provider) ?? 0) + 1);
    }
    for (const connector of connectors) {
        const connectorKey = connector.connectorKey ?? connector.provider;
        const value = outputs[connectorKey];
        if (connectorKey !== connector.provider && providerCounts.get(connector.provider) === 1 && value) {
            aliases[connector.provider] ??= value;
        }
    }
    return aliases;
}

function connectorDeployersByProvider(
    deployers: IntegrationImportDeps["connectorDeployers"],
): Map<string, IntegrationConnectorDeployer> {
    const out = new Map<string, IntegrationConnectorDeployer>();
    if (!deployers) {
        return out;
    }
    if (Array.isArray(deployers)) {
        for (const deployer of deployers) {
            out.set(deployer.provider, deployer);
        }
        return out;
    }
    for (const [provider, deployer] of Object.entries(deployers)) {
        out.set(provider, deployer);
    }
    return out;
}
