import { findIntegration } from "../catalog";
import { IntegrationInputError, MissingIntegrationInstanceError } from "../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { parseIntegrationImportDto } from "../parsing/parseIntegrationImportDto";
import { isSensitiveInput } from "../shared/inputSensitivity";
import { hasAnswer } from "./ids";
import { appendRun, failedRun, successRun } from "./runs";
import { assertSecretKeysAvailable, deleteObsoleteSecretRefs } from "./secretRefs";
import { sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "./snapshots";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationImportDeps, IntegrationImportDto, IntegrationImportResult } from "../../interfaces/IntegrationImport";
import type { IntegrationInstance, IntegrationRun } from "../../interfaces/IntegrationInstance";
import type { RunIntegrationInstanceRerunRequest, RunIntegrationInstanceResult } from "./runIntegrationInstance";

export async function runRerun(request: RunIntegrationInstanceRerunRequest): Promise<RunIntegrationInstanceResult> {
    const instance = await request.instances.get(request.instanceId);
    if (!instance) throw new MissingIntegrationInstanceError(request.instanceId);

    const siteIntegrations = [
        ...(request.siteIntegrations ?? []),
        ...(instance.definitionSnapshot ? [instance.definitionSnapshot] : []),
    ];
    const definition = findIntegration(instance.kind, siteIntegrations);
    if (!definition) throw new IntegrationInputError("kind", `unknown integration "${instance.kind}"`);

    const pending = { ...instance, status: "pending" as const, updatedAt: new Date() };
    await request.instances.replace(pending);
    const startedAt = new Date();

    try {
        return await runRerunImport(request, pending, definition, startedAt, siteIntegrations);
    } catch (error) {
        const run = failedRun(instance.runCount + 1, startedAt, error);
        await request.instances.replace(appendRun(pending, run, { status: "failed" }));
        throw error;
    }
}

async function runRerunImport(
    request: RunIntegrationInstanceRerunRequest,
    instance: IntegrationInstance,
    definition: IntegrationDefinition,
    startedAt: Date,
    siteIntegrations: IntegrationDefinition[],
): Promise<RunIntegrationInstanceResult> {
    const dto = await buildRerunDto(request.deps, instance, definition, request.body ?? {}, siteIntegrations);
    const secretInputs = declarativeSecretBindingNames(definition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(definition, dto.answers);
    await assertSecretKeysAvailable(request.instances, instance.id, plannedSecretRefs);

    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        request.deps,
        definition,
        dto.answers,
        dto.options,
        async result => commitSuccessfulRerun(request, instance, definition, dto, secretInputs, startedAt, result),
    );
    return { ...importResult, ...committed };
}

async function commitSuccessfulRerun(
    request: RunIntegrationInstanceRerunRequest,
    instance: IntegrationInstance,
    definition: IntegrationDefinition,
    dto: IntegrationImportDto,
    secretInputs: string[],
    startedAt: Date,
    result: IntegrationImportResult,
): Promise<{ instance: IntegrationInstance; run: IntegrationRun }> {
    const run = successRun(instance.runCount + 1, startedAt, result);
    const nextSecretRefs = updateSecretRefs(instance.secretRefs, result, secretInputs);
    const next = appendRun(instance, run, {
        status: "success",
        artifacts: result.artifacts,
        answersSnapshot: sanitizeAnswers(definition, dto.answers),
        secretRefs: nextSecretRefs,
        secretInputs,
        definitionVersion: definition.version ?? instance.definitionVersion,
        definitionSnapshot: sanitizeDefinitionSnapshot(definition),
    });
    const saved = await request.instances.replace(next);
    await deleteObsoleteSecretRefs(request.deps.secrets, instance.secretRefs, saved.secretRefs);
    return { instance: saved, run };
}

async function buildRerunDto(
    deps: IntegrationImportDeps,
    instance: IntegrationInstance,
    definition: IntegrationDefinition,
    body: Record<string, unknown>,
    siteIntegrations: IntegrationDefinition[],
): Promise<IntegrationImportDto> {
    const rawAnswers = isRecord(body.answers)
        ? { ...instance.answersSnapshot, ...rerunAnswerOverrides(definition, instance, body.answers) }
        : { ...instance.answersSnapshot };
    const missing = definition.inputs.filter(input => isSensitiveInput(input) && !hasAnswer(rawAnswers[input.name]));
    const restored = await Promise.all(missing.map(input => restoreSecretAnswer(deps, instance, input.name)));
    for (const [name, value] of restored) rawAnswers[name] = value;
    const rawOptions = isRecord(body.options) ? body.options : {};
    return parseIntegrationImportDto({
        kind: instance.kind,
        answers: rawAnswers,
        options: { ...rawOptions, force: true },
        instance: { id: instance.id, label: instance.label },
    }, siteIntegrations);
}

async function restoreSecretAnswer(
    deps: IntegrationImportDeps,
    instance: IntegrationInstance,
    inputName: string,
): Promise<readonly [string, string]> {
    const key = instance.secretRefs[inputName];
    if (!key) throw new IntegrationInputError(`answers.${inputName}`, "secret must be provided");
    const value = await deps.secrets.get(key);
    if (!value) throw new IntegrationInputError(`answers.${inputName}`, "stored secret is missing");
    return [inputName, value] as const;
}

function rerunAnswerOverrides(
    definition: IntegrationDefinition,
    instance: IntegrationInstance,
    answers: Record<string, unknown>,
): Record<string, unknown> {
    const overrides = { ...answers };
    if (Object.prototype.hasOwnProperty.call(overrides, "id")) {
        const hasIdentityInput = definition.inputs.some(input => input.name === "id");
        if (hasIdentityInput && !sameAnswer(overrides.id, instance.answersSnapshot.id)) {
            throw new IntegrationInputError("answers.id", "cannot be changed on rerun");
        }
        delete overrides.id;
    }
    return overrides;
}

function sameAnswer(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
