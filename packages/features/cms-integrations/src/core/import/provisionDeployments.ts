import { IntegrationInputError, IntegrationRuntimeError } from "../errors";
import { resolveTemplates, type TemplateContext } from "../definitions/templating/templates";
import type { DeclarativeProvisionTemplate, IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../interfaces/IntegrationImport";
import type {
    IntegrationProvisionDeployment,
    IntegrationProvisioner,
    IntegrationProvisionResult,
} from "../../interfaces/IntegrationImport";
import type { IntegrationSecretWrite } from "./writes/secretWrites";

type ProvisionSecretWrite = IntegrationSecretWrite & { input: string };

export function buildProvisionDeployments(
    definition: Pick<IntegrationDefinition, "kind" | "version" | "provisions">,
    context: TemplateContext,
): IntegrationProvisionDeployment[] {
    return (definition.provisions ?? []).map((template) => buildDeployment(definition, template, context));
}

export async function provisionIntegrationResources(
    deps: IntegrationImportDeps,
    deployments: IntegrationProvisionDeployment[],
): Promise<{
    results: IntegrationProvisionResult[];
    secretWrites: ProvisionSecretWrite[];
    rollback: () => Promise<void>;
}> {
    const provisioners = provisionersByProvider(deps.provisioners);
    const results: IntegrationProvisionResult[] = [];
    const secretWrites: ProvisionSecretWrite[] = [];
    const rollbacks: Array<() => Promise<void>> = [];
    try {
        for (const deployment of deployments) {
            const provisioner = provisioners.get(deployment.provider);
            if (!provisioner) {
                throw new IntegrationRuntimeError(`provisioner "${deployment.provider}" not configured`);
            }
            const existingOutputs = await readExistingOutputs(deps, deployment);
            const result = await provisioner.provision(deployment, {
                existingOutputs,
                env: deps.env ?? {},
            });
            assertOutputs(deployment, result.outputs);
            secretWrites.push(
                ...deployment.outputs.map(({ name, key }) => ({ input: name, key, value: result.outputs[name]! })),
            );
            results.push({
                provider: deployment.provider,
                ...(result.resources?.length ? { resources: result.resources } : {}),
            });
            if (result.rollback) {
                rollbacks.push(result.rollback);
            }
        }
    } catch (error) {
        await rollbackAll(rollbacks);
        throw error;
    }
    return { results, secretWrites, rollback: () => rollbackAll(rollbacks) };
}

function buildDeployment(
    definition: Pick<IntegrationDefinition, "kind" | "version">,
    template: DeclarativeProvisionTemplate,
    context: TemplateContext,
): IntegrationProvisionDeployment {
    const resolved = resolveTemplates(template, context);
    return {
        integrationKind: definition.kind,
        ...(definition.version ? { version: definition.version } : {}),
        provider: resolved.provider,
        configuration: resolved.configuration,
        outputs: resolved.outputs,
    };
}

async function readExistingOutputs(
    deps: IntegrationImportDeps,
    deployment: IntegrationProvisionDeployment,
): Promise<Record<string, string>> {
    const values = await Promise.all(
        deployment.outputs.map(async ({ name, key }) => [name, await deps.secrets.get(key)] as const),
    );
    return Object.fromEntries(values.filter((entry): entry is [string, string] => entry[1] !== null));
}

function assertOutputs(deployment: IntegrationProvisionDeployment, values: Record<string, string>): void {
    for (const { name } of deployment.outputs) {
        if (!values[name]) {
            throw new IntegrationInputError(
                `provisions.${deployment.provider}.outputs.${name}`,
                "was not returned by the provisioner",
            );
        }
    }
}

function provisionersByProvider(
    provisioners: IntegrationImportDeps["provisioners"],
): Map<string, IntegrationProvisioner> {
    if (!provisioners) {
        return new Map();
    }
    if (Array.isArray(provisioners)) {
        return new Map(provisioners.map((provisioner) => [provisioner.provider, provisioner]));
    }
    return new Map(Object.entries(provisioners));
}

async function rollbackAll(rollbacks: Array<() => Promise<void>>): Promise<void> {
    for (const rollback of [...rollbacks].reverse()) {
        try {
            await rollback();
        } catch {
            // Best-effort rollback: continue deleting newly provisioned resources.
        }
    }
}
