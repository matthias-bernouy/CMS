import { findIntegration } from "../catalog";
import {
    DuplicateIntegrationInstallationError,
    IntegrationInputError,
} from "../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { integrationInstallationId } from "./ids";
import { successRun } from "./runs";
import { assertSecretKeysAvailable } from "./secretRefs";
import {
    installationLabel,
    sanitizeAnswers,
    sanitizeDefinitionSnapshot,
    updateSecretRefs,
} from "./snapshots";
import type {
    RunIntegrationInstallationCreateRequest,
    RunIntegrationInstallationResult,
} from "./runIntegrationInstallation";
import type { IntegrationInstallationCreate } from "../../interfaces/IntegrationInstallationRepository";

export async function runCreate(request: RunIntegrationInstallationCreateRequest): Promise<RunIntegrationInstallationResult> {
    const definition = findIntegration(request.dto.kind, request.siteIntegrations);
    if (!definition) throw new IntegrationInputError("kind", `unknown integration "${request.dto.kind}"`);

    const integrationId = integrationInstallationId(request.dto.kind);
    if (await request.installations.get(integrationId)) throw new DuplicateIntegrationInstallationError(integrationId);

    const secretInputs = declarativeSecretBindingNames(definition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(definition, request.dto.answers);
    await assertSecretKeysAvailable(request.installations, integrationId, plannedSecretRefs);
    const startedAt = new Date();

    const deps = { ...request.deps, installations: request.deps.installations ?? request.installations };
    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        deps,
        definition,
        request.dto.answers,
        request.dto.options,
        async result => {
            const run = successRun(1, startedAt, result);
            const base: IntegrationInstallationCreate = {
                id: integrationId,
                label: installationLabel(definition, request.dto),
                definitionVersion: definition.version ?? "unversioned",
                definitionSnapshot: sanitizeDefinitionSnapshot(definition),
                status: "success",
                artifacts: result.artifacts,
                answersSnapshot: sanitizeAnswers(definition, request.dto.answers),
                secretRefs: updateSecretRefs({}, result, secretInputs),
                secretInputs,
                runs: [run],
            };
            return { installation: await request.installations.create(base), run };
        },
    );

    return { ...importResult, ...committed };
}
