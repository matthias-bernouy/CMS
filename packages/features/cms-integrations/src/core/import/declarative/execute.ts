import { secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationRuntimeError } from "../../errors";
import { type TemplateContext } from "../../templates";
import { buildConnectorDeployments, deployConnectorDeployments } from "../connectorDeployments";
import { resolveDependencyContext } from "../dependencies";
import { writeDashboardsWithRollback } from "../dashboardWrites";
import { writeFunctionsWithRollback } from "../functionWrites";
import { writeSecretsWithRollback } from "../secretWrites";
import { writeSourcesWithRollback } from "../sourceWrites";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../../interfaces/IntegrationImport";
import {
    buildBlocArtifacts,
    buildDashboardArtifacts,
    buildFunctionArtifacts,
    buildSourceArtifacts,
} from "./artifactBuilders";
import {
    assertUniqueSecretWrites,
    buildGeneratedSecretWrites,
    buildInputSecretWrites,
    sensitiveInputs,
} from "./secrets";
import {
    buildDashboardWrites,
    buildFunctionWrites,
    buildSourceWrites,
    importBlocArtifacts,
} from "./writeBuilders";

export async function executeDeclarativeIntegration<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit?: (result: IntegrationImportResult) => Promise<T>,
): Promise<{ result: { importResult: IntegrationImportResult } | { importResult: IntegrationImportResult; committed: T } }> {
    const dependencies = await resolveDependencyContext(definition, deps.installations);
    const secretInputNames = sensitiveInputs(definition);
    const inputSecretWrites = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecretWrites = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, true);
    const secretWrites = [...inputSecretWrites, ...generatedSecretWrites];
    assertUniqueSecretWrites(secretWrites);
    const baseContext: TemplateContext = {
        answers,
        secrets: Object.fromEntries(secretWrites.map(secret => [secret.input, secretKeyToRef(secret.key)])),
        dependencies,
        generated: Object.fromEntries(generatedSecretWrites.map(secret => [secret.input, secret.value])),
        secretInputs: secretInputNames,
    };
    const connectorDeployments = buildConnectorDeployments(definition, {
        ...baseContext,
        connectorSecrets: Object.fromEntries(secretWrites.map(secret => [secret.input, secret.value])),
    });

    return writeSecretsWithRollback(deps.secrets, secretWrites, async secretResults => {
        const connectorDeployResult = await deployConnectorDeployments(deps, connectorDeployments, baseContext);
        const context: TemplateContext = { ...baseContext, connectors: connectorDeployResult.outputs };
        const sourceArtifacts = buildSourceArtifacts(definition, context);
        const sourceWrites = await buildSourceWrites(deps, sourceArtifacts, options);
        const functionArtifacts = buildFunctionArtifacts(definition, context);
        const dashboardArtifacts = buildDashboardArtifacts(definition, context);
        const dashboardWrites = await buildDashboardWrites(deps, dashboardArtifacts, sourceArtifacts, options);
        const blocArtifacts = buildBlocArtifacts(definition, context);

        return writeSourcesWithRollback(deps.sources, sourceWrites, async artifacts => {
            const functionWrites = await buildFunctionWrites(deps, functionArtifacts, options);
            const buildResult = async (functionArtifacts: typeof artifacts, dashboardArtifacts: typeof artifacts) => {
                const blocImportResults = await importBlocArtifacts(deps, blocArtifacts, options);
                const importResult = {
                    artifacts: [...artifacts, ...functionArtifacts, ...dashboardArtifacts, ...blocImportResults],
                    ...(secretResults.length ? { secrets: secretResults } : {}),
                    ...(connectorDeployResult.results.length ? { connectors: connectorDeployResult.results } : {}),
                };
                return commit
                    ? { importResult, committed: await commit(importResult) }
                    : { importResult };
            };
            const writeDashboards = (functionArtifacts: typeof artifacts) => {
                if (!dashboardWrites.length) return buildResult(functionArtifacts, []);
                return writeDashboardsWithRollback(deps.dashboards ?? missingDashboardRepository(), dashboardWrites, dashboardArtifacts =>
                    buildResult(functionArtifacts, dashboardArtifacts));
            };
            if (!functionWrites.length) return writeDashboards([]);
            return writeFunctionsWithRollback(deps.functions ?? missingFunctionRepository(), functionWrites, writeDashboards);
        });
    });
}

function missingDashboardRepository(): never {
    throw new IntegrationRuntimeError("dashboard repository not configured");
}

function missingFunctionRepository(): never {
    throw new IntegrationRuntimeError("function repository not configured");
}
