import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import { readPersistedSource, type Source } from "@bernouy/cms-sources";
import { IntegrationRuntimeError } from "../../../errors";
import { connectorOutputsWithProviderAliases, previewConnectorOutputs } from "../../../import/connectorDeployments";
import { resolveDependencyContext } from "../../../import/dependencies";
import { buildSourceArtifacts } from "../../../import/declarative/builders/artifactBuilders";
import type { IntegrationDefinition } from "../../../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationConnectorDeployResult,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";

export type CmsSourceBindingTarget = {
    source: Source;
    digest: string;
    connectors: IntegrationConnectorDeployResult[];
};

export async function buildCmsSourceBindingTarget(
    deps: IntegrationImportDeps,
    context: IntegrationMigrationStepContext,
): Promise<CmsSourceBindingTarget | null> {
    const mediated = context.connectors.filter((connector) => connector.plan.cmsMediated);
    if (!mediated.length) {
        return null;
    }
    const secrets = integrationSecretRefs(context);
    const dependencies = await resolveDependencyContext(context.targetDefinition, deps.installations);
    const existingOutputs = connectorOutputsWithProviderAliases(
        context.targetDefinition.connectors ?? [],
        currentConnectorOutputs(context),
    );
    const previewed = await previewConnectorOutputs(deps, context.targetDefinition, {
        answers: context.installation.answersSnapshot,
        secrets,
        dependencies,
        connectors: existingOutputs,
        secretInputs: new Set(context.installation.secretInputs),
    });
    const outputs = { ...existingOutputs, ...previewed };
    const binding = await buildCmsSourceBindingSnapshot(deps, context, context.targetDefinition, outputs);
    return {
        ...binding,
        connectors: mediated.map((connector) => ({
            provider: connector.provider,
            connectorKey: connector.connectorKey,
            connectorInstanceId: connector.connectorInstanceId,
            lineageId: connector.lineageId,
            migrationRevision: connector.fromRevision,
            outputs: outputs[connector.connectorKey] ?? {},
        })),
    };
}

export async function buildCmsSourceBindingSnapshot(
    deps: IntegrationImportDeps,
    context: IntegrationMigrationStepContext,
    definition: IntegrationDefinition,
    connectorOutputs: Record<string, Record<string, string>> = currentConnectorOutputs(context),
): Promise<Pick<CmsSourceBindingTarget, "source" | "digest">> {
    const secrets = integrationSecretRefs(context);
    const dependencies = await resolveDependencyContext(definition, deps.installations);
    const sources = buildSourceArtifacts(definition, {
        answers: context.installation.answersSnapshot,
        secrets,
        dependencies,
        connectors: connectorOutputsWithProviderAliases(definition.connectors ?? [], connectorOutputs),
        secretInputs: new Set(context.installation.secretInputs),
    });
    if (sources.length !== 1) {
        throw new IntegrationRuntimeError(
            `atomic CMS binding switch requires exactly one Source aggregate; target declares ${sources.length}`,
        );
    }
    const source = sources[0]!;
    await assertOwnedSource(deps, context, source, definition.kind);
    return {
        source,
        digest: await cmsSourceDigest(source),
    };
}

export async function cmsSourceDigest(source: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(source));
}

async function assertOwnedSource(
    deps: IntegrationImportDeps,
    context: IntegrationMigrationStepContext,
    source: Source,
    identityAuthority: string,
): Promise<void> {
    const installedSourceIds = new Set(
        context.installation.artifacts.filter((artifact) => artifact.type === "source").map((artifact) => artifact.id),
    );
    const current = await readPersistedSource(deps.sources, source.urn);
    if (!current || !installedSourceIds.has(source.urn) || current.identityAuthority !== identityAuthority) {
        throw new IntegrationRuntimeError(`CMS binding Source "${source.urn}" is not owned by this installation`, 409);
    }
}

function currentConnectorOutputs(context: IntegrationMigrationStepContext): Record<string, Record<string, string>> {
    return Object.fromEntries(
        Object.entries(context.installation.connectorBindings ?? {}).map(([key, binding]) => [key, binding.outputs]),
    );
}

function integrationSecretRefs(context: IntegrationMigrationStepContext): Record<string, string> {
    return Object.fromEntries(
        Object.entries(context.installation.secretRefs).map(([name, key]) => [name, secretKeyToRef(key)]),
    );
}
