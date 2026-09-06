import { findIntegration } from "../definitions/catalog";
import { DuplicateIntegrationInstallationError, IntegrationInputError } from "../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { integrationInstallationId } from "./ids";
import { reconcileChangedInstallation } from "./execution/afterInstallation";
import { successRun } from "./execution/runs";
import { depsWithPackageRoot, resolveCreatePackage } from "./packages";
import { assertSecretKeysAvailable } from "./secretRefs";
import { installationLabel, sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "./snapshots";
import {
    connectorBindingsFromResult,
    connectorInstanceIds,
    connectorRuntimeTargetsFromResult,
} from "./migration/adoption/installationBindings";
import type {
    RunIntegrationInstallationCreateRequest,
    RunIntegrationInstallationResult,
} from "./execution/runIntegrationInstallation";
import type { IntegrationInstallationCreate } from "../../interfaces/IntegrationInstallationRepository";
import { assertCollectionConformance } from "../resources/conformance";
import { resolveCollectionSelection } from "../resources/selection";

export async function runCreate(
    request: RunIntegrationInstallationCreateRequest,
): Promise<RunIntegrationInstallationResult> {
    const definition = findIntegration(request.dto.kind, request.siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${request.dto.kind}"`);
    }

    const declaredInputs = new Set(definition.inputs.map(({ name }) => name));
    if (Object.keys(request.dto.answers).some((name) => !declaredInputs.has(name))) {
        throw new IntegrationInputError("answers", "undeclared installation inputs are not accepted");
    }
    const integrationId = integrationInstallationId(request.dto.kind);
    if (await request.installations.get(integrationId)) {
        throw new DuplicateIntegrationInstallationError(integrationId);
    }
    const resolvedPackage = await resolveCreatePackage(request.packageResolver, definition);
    const importDefinition = resolvedPackage?.definition ?? definition;
    const selection =
        importDefinition.schema === "cms.integration.definition.v2" && importDefinition.type === "collection"
            ? resolveCollectionSelection(importDefinition, request.dto.resources, undefined, request.siteIntegrations)
            : undefined;
    if (importDefinition.schema === "cms.integration.definition.v2" && importDefinition.type === "collection") {
        assertCollectionConformance(importDefinition, request.siteIntegrations ?? [], selection?.activeResources);
    }
    const instanceIds = connectorInstanceIds(importDefinition);

    const secretInputs = declarativeSecretBindingNames(importDefinition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(importDefinition, request.dto.answers);
    await assertSecretKeysAvailable(request.installations, integrationId, plannedSecretRefs);
    const startedAt = new Date();

    const deps = {
        ...depsWithPackageRoot(request.deps, resolvedPackage),
        connectorInstanceIds: instanceIds,
        installations: request.deps.installations ?? request.installations,
    };
    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        deps,
        importDefinition,
        request.dto.answers,
        { ...request.dto.options, ...(selection ? { activeResources: selection.activeResources } : {}) },
        async (result) => {
            const run = successRun(1, startedAt, result);
            const base: IntegrationInstallationCreate = {
                id: integrationId,
                label: installationLabel(importDefinition, request.dto),
                definitionVersion: importDefinition.version ?? "unversioned",
                definitionSnapshot: sanitizeDefinitionSnapshot(importDefinition),
                ...(resolvedPackage ? { packageDigest: resolvedPackage.digest } : {}),
                ...(Object.keys(instanceIds).length
                    ? { connectorBindings: connectorBindingsFromResult(importDefinition, result, instanceIds) }
                    : {}),
                connectorRuntimeTargets: connectorRuntimeTargetsFromResult(importDefinition, result),
                status: "success",
                artifacts: result.artifacts,
                ...(selection ? { activeResources: selection.activeResources } : {}),
                answersSnapshot: sanitizeAnswers(importDefinition, request.dto.answers),
                secretRefs: updateSecretRefs({}, result, secretInputs),
                secretInputs,
                runs: [run],
            };
            const committed = { installation: await request.installations.create(base), run };
            await reconcileChangedInstallation(deps, request.installations, committed.installation.id);
            return committed;
        },
    );

    return { ...importResult, ...committed };
}
