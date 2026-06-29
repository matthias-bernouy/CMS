import { findIntegration } from "../catalog";
import {
    DuplicateIntegrationInstanceError,
    IntegrationInputError,
} from "../errors";
import {
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { sensitiveInputNames } from "../shared/inputSensitivity";
import { createIntegrationInstanceId } from "./ids";
import { successRun } from "./runs";
import { assertSecretKeysAvailable } from "./secretRefs";
import {
    instanceLabel,
    sanitizeAnswers,
    sanitizeDefinitionSnapshot,
    updateSecretRefs,
} from "./snapshots";
import type {
    RunIntegrationInstanceCreateRequest,
    RunIntegrationInstanceResult,
} from "./runIntegrationInstance";
import type { IntegrationInstanceCreate } from "../../interfaces/IntegrationInstanceRepository";

export async function runCreate(request: RunIntegrationInstanceCreateRequest): Promise<RunIntegrationInstanceResult> {
    const definition = findIntegration(request.dto.kind, request.siteIntegrations);
    if (!definition) throw new IntegrationInputError("kind", `unknown integration "${request.dto.kind}"`);

    const instanceId = createIntegrationInstanceId(request.dto.kind, request.dto.answers, request.dto.instance);
    if (!instanceId) throw new IntegrationInputError("instance.id", "is required for tracked imports without answers.id");
    if (await request.instances.get(instanceId)) throw new DuplicateIntegrationInstanceError(instanceId);

    const secretInputs = sensitiveInputNames(definition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(definition, request.dto.answers);
    await assertSecretKeysAvailable(request.instances, instanceId, plannedSecretRefs);
    const startedAt = new Date();

    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        request.deps,
        definition,
        request.dto.answers,
        request.dto.options,
        async result => {
            const run = successRun(1, startedAt, result);
            const base: IntegrationInstanceCreate = {
                id: instanceId,
                kind: request.dto.kind,
                label: instanceLabel(definition, request.dto),
                definitionVersion: definition.version ?? "unversioned",
                definitionSnapshot: sanitizeDefinitionSnapshot(definition),
                status: "success",
                artifacts: result.artifacts,
                answersSnapshot: sanitizeAnswers(definition, request.dto.answers),
                secretRefs: updateSecretRefs({}, result, secretInputs),
                secretInputs,
                runs: [run],
            };
            return { instance: await request.instances.create(base), run };
        },
    );

    return { ...importResult, ...committed };
}
