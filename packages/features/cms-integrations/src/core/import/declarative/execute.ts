import { type TemplateContext } from "../../definitions/templating/templates";
import { deployConnectorDeployments } from "../connectorDeployments";
import { writeSecretsWithRollback } from "../writes/secretWrites";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../../interfaces/IntegrationImport";
import { executeDeclarativeArtifactWrites } from "./artifactExecution";
import { prepareDeclarativeIntegration } from "./preparation";

export async function executeDeclarativeIntegration<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit?: (result: IntegrationImportResult) => Promise<T>,
): Promise<{
    result: { importResult: IntegrationImportResult } | { importResult: IntegrationImportResult; committed: T };
}> {
    const prepared = await prepareDeclarativeIntegration(deps, definition, answers);
    try {
        return await writeSecretsWithRollback(deps.secrets, prepared.secretWrites, async (secretResults) => {
            const connectorDeployResult = await deployConnectorDeployments(
                deps,
                prepared.deployments,
                prepared.baseContext,
            );
            const context: TemplateContext = {
                ...prepared.baseContext,
                connectors: connectorDeployResult.outputs,
            };
            return await executeDeclarativeArtifactWrites({
                deps,
                definition,
                context,
                options,
                baseResult: {
                    ...(secretResults.length ? { secrets: secretResults } : {}),
                    ...(connectorDeployResult.results.length ? { connectors: connectorDeployResult.results } : {}),
                    ...(prepared.provisions.results.length ? { provisions: prepared.provisions.results } : {}),
                },
                commit,
            });
        });
    } catch (error) {
        await prepared.provisions.rollback();
        throw error;
    }
}
