import { IntegrationRuntimeError } from "../errors";
import { resolveTemplates, type TemplateContext } from "../definitions/templates";
import type { DeclarativeConnectorTemplate } from "../../interfaces/Integration";
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
): IntegrationConnectorDeployment[] {
    return (definition.connectors ?? []).map((connector) => {
        const resolved = resolveTemplates(connector, context);
        return {
            integrationKind: definition.kind,
            ...(definition.version ? { version: definition.version } : {}),
            provider: resolved.provider,
            ...(resolved.root ? { root: resolved.root } : {}),
            dataApiSchemas: resolved.dataApiSchemas ?? [],
            schemas: resolved.schemas ?? [],
            functions: resolved.functions ?? [],
        };
    });
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
            env: deps.env ?? {},
        });
        results.push(result);
        outputs[deployment.provider] = {
            ...(outputs[deployment.provider] ?? {}),
            ...(result.outputs ?? {}),
        };
    }

    return { results, outputs };
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
