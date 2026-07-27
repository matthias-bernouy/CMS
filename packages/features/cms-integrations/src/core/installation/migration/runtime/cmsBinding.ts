import { IntegrationRuntimeError } from "../../../errors";
import { buildSourceWrites } from "../../../import/declarative/builders/artifactWrites/sourceWrites";
import { writeSourcesWithRollback } from "../../../import/writes/sourceWrites";
import type { IntegrationImportDeps, IntegrationImportResult } from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepConfirmation,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { buildCmsSourceBindingTarget, cmsSourceDigest } from "./bindingTarget";

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

    private assertPhase(context: IntegrationMigrationStepContext): void {
        if (context.phase !== "switch-cms-binding") {
            throw new IntegrationRuntimeError(`CMS binding handler cannot execute phase "${context.phase}"`);
        }
    }
}

function emptyResult(): IntegrationImportResult {
    return { artifacts: [] };
}
