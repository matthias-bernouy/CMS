import { IntegrationRuntimeError } from "../../../errors";
import { buildSourceWrites } from "../../../import/declarative/builders/artifactWrites/sourceWrites";
import { writeSourcesWithRollback } from "../../../import/writes/sourceWrites";
import type { IntegrationImportDeps, IntegrationImportResult } from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepConfirmation,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { buildCmsSourceBindingSnapshot, buildCmsSourceBindingTarget, cmsSourceDigest } from "./bindingTarget";

export class CmsSourceBindingMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    constructor(private readonly deps: IntegrationImportDeps) {}

    async execute(context: IntegrationMigrationStepContext) {
        this.assertPhase(context);
        const target = await buildCmsSourceBindingTarget(this.deps, context);
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
        this.assertPhase(context);
        const target = await buildCmsSourceBindingTarget(this.deps, context);
        if (!target) {
            return { confirmed: true, externalOperationId: "cms-binding:none", importResult: emptyResult() };
        }
        const current = await this.deps.sources.getSource(target.source.urn);
        if (!current || (await cmsSourceDigest(current)) !== target.digest) {
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

    async compensate(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        this.assertPhase(context);
        const target = await buildCmsSourceBindingTarget(this.deps, context);
        if (!target) {
            return { compensated: true, externalOperationId: "cms-binding-rollback:none" };
        }
        if (previous.externalOperationId !== `cms-binding:${target.digest}`) {
            throw new IntegrationRuntimeError("CMS binding compensation receipt does not match the target Source", 409);
        }
        if (context.operation.activatedAt && !context.operation.sourceState) {
            throw new IntegrationRuntimeError("activated legacy migration has no rollback state", 409);
        }
        const sourceOutputs = Object.fromEntries(
            Object.entries(
                context.operation.sourceState?.connectorBindings ?? context.installation.connectorBindings ?? {},
            ).map(([key, binding]) => [key, binding.outputs]),
        );
        const source = await buildCmsSourceBindingSnapshot(this.deps, context, context.sourceDefinition, sourceOutputs);
        if (source.source.urn !== target.source.urn) {
            throw new IntegrationRuntimeError("CMS binding compensation cannot change the Source identity", 409);
        }
        const current = await this.deps.sources.getSource(source.source.urn);
        if (!current) {
            throw new IntegrationRuntimeError(`CMS binding Source "${source.source.urn}" disappeared`, 409);
        }
        const currentDigest = await cmsSourceDigest(current);
        if (currentDigest === source.digest) {
            return { compensated: true, externalOperationId: `cms-binding-rollback:${source.digest}` };
        }
        if (currentDigest !== target.digest) {
            throw new IntegrationRuntimeError(
                `CMS binding Source "${source.source.urn}" changed outside the migration`,
                409,
            );
        }
        const writes = await buildSourceWrites(this.deps, [source.source], { force: true });
        await writeSourcesWithRollback(this.deps.sources, writes);
        const restored = await this.deps.sources.getSource(source.source.urn);
        if (!restored || (await cmsSourceDigest(restored)) !== source.digest) {
            throw new IntegrationRuntimeError(
                `CMS binding Source "${source.source.urn}" rollback was not confirmed`,
                409,
            );
        }
        return { compensated: true, externalOperationId: `cms-binding-rollback:${source.digest}` };
    }

    private assertPhase(context: IntegrationMigrationStepContext): void {
        if (context.phase !== "switch-cms-binding") {
            throw new IntegrationRuntimeError(`CMS binding handler cannot execute phase "${context.phase}"`);
        }
    }
}

function emptyResult(): IntegrationImportResult {
    return { artifacts: [] };
}
