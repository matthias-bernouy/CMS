import { findIntegration } from "../definitions/catalog";
import { DuplicateIntegrationInstallationError, IntegrationInputError } from "../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { integrationInstallationId } from "./ids";
import { successRun } from "./execution/runs";
import { depsWithPackageRoot, resolveCreatePackage } from "./packages";
import { assertSecretKeysAvailable } from "./secretRefs";
import { installationLabel, sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "./snapshots";
import type {
    RunIntegrationInstallationCreateRequest,
    RunIntegrationInstallationResult,
} from "./execution/runIntegrationInstallation";
import type { IntegrationInstallationCreate } from "../../interfaces/IntegrationInstallationRepository";

export async function runCreate(
    request: RunIntegrationInstallationCreateRequest,
): Promise<RunIntegrationInstallationResult> {
    const definition = findIntegration(request.dto.kind, request.siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${request.dto.kind}"`);
    }

    const integrationId = integrationInstallationId(request.dto.kind);
    if (await request.installations.get(integrationId)) {
        throw new DuplicateIntegrationInstallationError(integrationId);
    }
    const resolvedPackage = await resolveCreatePackage(request.packageResolver, definition);
    const importDefinition = resolvedPackage?.definition ?? definition;

    const secretInputs = declarativeSecretBindingNames(importDefinition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(importDefinition, request.dto.answers);
    await assertSecretKeysAvailable(request.installations, integrationId, plannedSecretRefs);
    const startedAt = new Date();

    const deps = {
        ...depsWithPackageRoot(request.deps, resolvedPackage),
        installations: request.deps.installations ?? request.installations,
    };
    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        deps,
        importDefinition,
        request.dto.answers,
        request.dto.options,
        async (result) => {
            const run = successRun(1, startedAt, result);
            const base: IntegrationInstallationCreate = {
                id: integrationId,
                label: installationLabel(importDefinition, request.dto),
                definitionVersion: importDefinition.version ?? "unversioned",
                definitionSnapshot: sanitizeDefinitionSnapshot(importDefinition),
                ...(resolvedPackage ? { packageDigest: resolvedPackage.digest } : {}),
                status: "success",
                artifacts: result.artifacts,
                answersSnapshot: sanitizeAnswers(importDefinition, request.dto.answers),
                secretRefs: updateSecretRefs({}, result, secretInputs),
                secretInputs,
                runs: [run],
            };
            return { installation: await request.installations.create(base), run };
        },
    );

    return { ...importResult, ...committed };
}
