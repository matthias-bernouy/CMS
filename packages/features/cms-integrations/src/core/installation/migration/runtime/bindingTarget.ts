import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import type { Source } from "@bernouy/cms-sources";
import { IntegrationRuntimeError } from "../../../errors";
import { previewConnectorOutputs } from "../../../import/connectorDeployments";
import { resolveDependencyContext } from "../../../import/dependencies";
import { buildSourceArtifacts } from "../../../import/declarative/builders/artifactBuilders";
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
    const secrets = Object.fromEntries(
        Object.entries(context.installation.secretRefs).map(([name, key]) => [name, secretKeyToRef(key)]),
    );
    const dependencies = await resolveDependencyContext(context.targetDefinition, deps.installations);
    const existingOutputs = Object.fromEntries(
        Object.entries(context.installation.connectorBindings ?? {}).map(([key, binding]) => [key, binding.outputs]),
    );
    const previewed = await previewConnectorOutputs(deps, context.targetDefinition, {
        answers: context.installation.answersSnapshot,
        secrets,
        dependencies,
        connectors: existingOutputs,
        secretInputs: new Set(context.installation.secretInputs),
    });
    const outputs = { ...existingOutputs, ...previewed };
    const sources = buildSourceArtifacts(context.targetDefinition, {
        answers: context.installation.answersSnapshot,
        secrets,
        dependencies,
        connectors: outputs,
        secretInputs: new Set(context.installation.secretInputs),
    });
    if (sources.length !== 1) {
        throw new IntegrationRuntimeError(
            `atomic CMS binding switch requires exactly one Source aggregate; target declares ${sources.length}`,
        );
    }
    const source = sources[0]!;
    await assertOwnedSource(deps, context, source);
    return {
        source,
        digest: await cmsSourceDigest(source),
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

export async function cmsSourceDigest(source: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(source));
}

async function assertOwnedSource(
    deps: IntegrationImportDeps,
    context: IntegrationMigrationStepContext,
    source: Source,
): Promise<void> {
    const installedSourceIds = new Set(
        context.installation.artifacts.filter((artifact) => artifact.type === "source").map((artifact) => artifact.id),
    );
    const current = await deps.sources.getSource(source.urn);
    if (
        !current ||
        !installedSourceIds.has(source.urn) ||
        current.identityAuthority !== context.targetDefinition.kind
    ) {
        throw new IntegrationRuntimeError(`CMS binding Source "${source.urn}" is not owned by this installation`, 409);
    }
}
