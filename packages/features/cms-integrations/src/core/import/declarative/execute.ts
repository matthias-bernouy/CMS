import { secretKeyToRef } from "@bernouy/cms-secrets";
import { type TemplateContext } from "../../templates";
import { buildConnectorDeployments, deployConnectorDeployments } from "../connectorDeployments";
import { resolveDependencyContext } from "../dependencies";
import { writeSecretsWithRollback } from "../secretWrites";
import { writeSourcesWithRollback } from "../sourceWrites";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../../interfaces/IntegrationImport";
import { writeDeclarativeArtifactStack, type DeclarativeArtifactWriteResults } from "./artifactWriteStack";
import { applyIntegrationAccessGrants, buildIntegrationAccessGrants } from "./accessGrants";
import {
    buildBlocArtifacts,
    buildDashboardArtifacts,
    buildDashboardRelationProjectionArtifacts,
    buildFunctionArtifacts,
    buildRelationArtifacts,
    buildSourceArtifacts,
    buildSourceOverlayArtifacts,
    buildTriggerArtifacts,
} from "./artifactBuilders";
import { buildDashboardRelationProjectionWrites } from "./dashboardRelationWriteBuilders";
import { buildRelationWrites } from "./relationWriteBuilders";
import {
    assertUniqueSecretWrites,
    buildGeneratedSecretWrites,
    buildInputSecretWrites,
    sensitiveInputs,
} from "./secrets";
import { buildDashboardWrites, buildFunctionWrites, buildSourceWrites, importBlocArtifacts } from "./writeBuilders";
import { buildSourceOverlayWrites } from "./sourceOverlayWriteBuilders";
import { buildTriggerWrites } from "./triggerWriteBuilders";

export async function executeDeclarativeIntegration<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit?: (result: IntegrationImportResult) => Promise<T>,
): Promise<{
    result: { importResult: IntegrationImportResult } | { importResult: IntegrationImportResult; committed: T };
}> {
    const dependencies = await resolveDependencyContext(definition, deps.installations);
    const secretInputNames = sensitiveInputs(definition);
    const inputSecretWrites = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecretWrites = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, true);
    const secretWrites = [...inputSecretWrites, ...generatedSecretWrites];
    assertUniqueSecretWrites(secretWrites);
    const baseContext: TemplateContext = {
        answers,
        secrets: Object.fromEntries(secretWrites.map((secret) => [secret.input, secretKeyToRef(secret.key)])),
        dependencies,
        generated: Object.fromEntries(generatedSecretWrites.map((secret) => [secret.input, secret.value])),
        secretInputs: secretInputNames,
    };
    const connectorDeployments = buildConnectorDeployments(definition, {
        ...baseContext,
        connectorSecrets: Object.fromEntries(secretWrites.map((secret) => [secret.input, secret.value])),
    });

    return writeSecretsWithRollback(deps.secrets, secretWrites, async (secretResults) => {
        const connectorDeployResult = await deployConnectorDeployments(deps, connectorDeployments, baseContext);
        const context: TemplateContext = { ...baseContext, connectors: connectorDeployResult.outputs };
        const sourceArtifacts = buildSourceArtifacts(definition, context);
        const sourceWrites = await buildSourceWrites(deps, sourceArtifacts, options);
        const functionArtifacts = buildFunctionArtifacts(definition, context);
        const accessGrants = buildIntegrationAccessGrants(sourceArtifacts, functionArtifacts);
        const triggerArtifacts = buildTriggerArtifacts(definition, context);
        const dashboardArtifacts = buildDashboardArtifacts(definition, context);
        const dependencySourceIds = new Set(
            Object.values(dependencies)
                .map((dependency) => dependency.sourceId)
                .filter((sourceId): sourceId is string => typeof sourceId === "string"),
        );
        const dashboardWrites = await buildDashboardWrites(
            deps,
            dashboardArtifacts,
            sourceArtifacts,
            dependencySourceIds,
            options,
        );
        const sourceOverlayArtifacts = buildSourceOverlayArtifacts(definition, context);
        const sourceOverlayWrites = await buildSourceOverlayWrites(deps, sourceOverlayArtifacts);
        const relationArtifacts = buildRelationArtifacts(definition, context);
        const relationWrites = await buildRelationWrites(deps, relationArtifacts, sourceArtifacts, options);
        const projectionArtifacts = buildDashboardRelationProjectionArtifacts(definition, context);
        const projectionWrites = await buildDashboardRelationProjectionWrites(
            deps,
            projectionArtifacts,
            relationArtifacts,
            dashboardArtifacts,
            options,
        );
        const blocArtifacts = buildBlocArtifacts(definition, context);

        return writeSourcesWithRollback(deps.sources, sourceWrites, async (sourceResults) => {
            const functionWrites = await buildFunctionWrites(deps, functionArtifacts, options);
            const triggerWrites = await buildTriggerWrites(deps, triggerArtifacts, options);
            const finish = async (results: DeclarativeArtifactWriteResults) => {
                const blocImportResults = await importBlocArtifacts(deps, blocArtifacts, options);
                await applyIntegrationAccessGrants(deps.roles, accessGrants);
                const importResult = {
                    artifacts: [
                        ...results.sourceResults,
                        ...results.functionResults,
                        ...results.triggerResults,
                        ...results.dashboardResults,
                        ...results.sourceOverlayResults,
                        ...results.relationResults,
                        ...results.dashboardRelationProjectionResults,
                        ...blocImportResults,
                    ],
                    ...(secretResults.length ? { secrets: secretResults } : {}),
                    ...(connectorDeployResult.results.length ? { connectors: connectorDeployResult.results } : {}),
                };
                return commit ? { importResult, committed: await commit(importResult) } : { importResult };
            };
            return writeDeclarativeArtifactStack({
                deps,
                sourceResults,
                functionWrites,
                triggerWrites,
                dashboardWrites,
                sourceOverlayWrites,
                relationWrites,
                dashboardRelationProjectionWrites: projectionWrites,
                finish,
            });
        });
    });
}
