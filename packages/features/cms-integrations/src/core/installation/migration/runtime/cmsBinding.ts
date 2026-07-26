import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationRuntimeError } from "../../../errors";
import { previewConnectorOutputs } from "../../../import/connectorDeployments";
import { resolveDependencyContext } from "../../../import/dependencies";
import { buildSourceArtifacts } from "../../../import/declarative/builders/artifactBuilders";
import { buildSourceWrites } from "../../../import/declarative/builders/artifactWrites/sourceWrites";
import { writeSourcesWithRollback } from "../../../import/writes/sourceWrites";
import type { IntegrationImportDeps, IntegrationImportResult } from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepConfirmation,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";

export class CmsSourceBindingMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    constructor(private readonly deps: IntegrationImportDeps) {}

    async execute(context: IntegrationMigrationStepContext) {
        const target = await targetBinding(this.deps, context);
        if (!target) {
            return { externalOperationId: "cms-binding:none", importResult: emptyResult() };
        }
        const writes = await buildSourceWrites(this.deps, [target.source], { force: true });
        const artifacts = await writeSourcesWithRollback(this.deps.sources, writes);
        return {
            externalOperationId: `cms-binding:${target.digest}`,
            importResult: { artifacts, connectors: target.connectors },
        };
    }

    async confirm(
        context: IntegrationMigrationStepContext,
        _previous: { externalOperationId?: string; confirmationDigest?: string },
    ): Promise<IntegrationMigrationStepConfirmation> {
        const target = await targetBinding(this.deps, context);
        if (!target) {
            return { confirmed: true, externalOperationId: "cms-binding:none", importResult: emptyResult() };
        }
        const current = await this.deps.sources.getSource(target.source.urn);
        if (!current || (await sourceDigest(current)) !== target.digest) {
            return { confirmed: false };
        }
        return {
            confirmed: true,
            externalOperationId: `cms-binding:${target.digest}`,
            importResult: {
                artifacts: [{ type: "source", id: target.source.urn, action: "updated" }],
                connectors: target.connectors,
            },
        };
    }
}

async function targetBinding(deps: IntegrationImportDeps, context: IntegrationMigrationStepContext) {
    if (context.phase !== "switch-cms-binding") {
        throw new IntegrationRuntimeError(`CMS binding handler cannot execute phase "${context.phase}"`);
    }
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
    return {
        source,
        digest: await sourceDigest(source),
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

async function sourceDigest(source: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(source));
}

function emptyResult(): IntegrationImportResult {
    return { artifacts: [] };
}
