import { integrationReferenceFields } from "../../../security/endpoint/fields";
import { isSafeDashboardPath } from "@bernouy/cms-dashboards";
import type { IntegrationManagement } from "../../../../interfaces/Integration/management";
import type { IntegrationDefinition } from "../../../../interfaces/Integration";
import { IntegrationInputError } from "../../../errors";
import { parseFields } from "../../artifacts/dashboard/fields";
import { isRecord } from "../values";

export function parseManagement(value: unknown): IntegrationManagement | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value) || value.schemaVersion !== 1) {
        fail("must declare schemaVersion 1");
    }
    const result: IntegrationManagement = { schemaVersion: 1 };
    if (value.health !== undefined) {
        if (!isRecord(value.health)) {
            fail("health must be an object");
        }
        result.health = { functionId: identifier(value.health.functionId) };
    }
    if (value.settings !== undefined) {
        fail("settings is obsolete: declare ordinary source endpoints and dashboard views");
    }
    if (value.actions !== undefined) {
        if (!Array.isArray(value.actions)) {
            fail("actions must be an array");
        }
        result.actions = value.actions.map((action) => {
            if (!isRecord(action) || typeof action.label !== "string" || !action.label.trim()) {
                fail("action must declare a label");
            }
            const id = identifier(action.id);
            const fields =
                action.fields === undefined
                    ? undefined
                    : parseFields(action.fields, `definition.management.actions.${id}.fields`);
            if (
                fields &&
                (fields.some(({ path }) => !isSafeDashboardPath(path)) ||
                    new Set(fields.map(({ path }) => path)).size !== fields.length)
            ) {
                fail("action field paths must be safe and unique");
            }
            return {
                id,
                label: action.label,
                functionId: identifier(action.functionId),
                ...(fields ? { fields } : {}),
            };
        });
        if (new Set(result.actions.map(({ id }) => id)).size !== result.actions.length) {
            fail("action ids must be unique");
        }
    }
    if (value.generatedSecrets !== undefined) {
        if (!Array.isArray(value.generatedSecrets)) {
            fail("generatedSecrets must be an array");
        }
        result.generatedSecrets = value.generatedSecrets.map(identifier);
    }
    if (value.runtimeSecrets !== undefined) {
        if (!isRecord(value.runtimeSecrets)) {
            fail("runtimeSecrets must be an object");
        }
        result.runtimeSecrets = Object.fromEntries(
            Object.entries(value.runtimeSecrets).map(([name, binding]) => {
                if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !isRecord(binding)) {
                    fail("invalid runtime secret binding");
                }
                if (binding.field !== undefined && binding.generated === undefined) {
                    const field = identifier(binding.field);
                    return [name, { field }];
                }
                const generated = identifier(binding.generated);
                if (binding.field !== undefined || !result.generatedSecrets?.includes(generated)) {
                    fail("runtime binding must reference a granted generated secret");
                }
                return [name, { generated }];
            }),
        );
    }
    return result;
}

export function validateManagement(definition: IntegrationDefinition): void {
    const management = definition.management;
    if (!management) {
        return;
    }
    parseManagement(management);
    if (definition.inputs.length) {
        fail("managed integrations cannot declare installation inputs");
    }
    const functions = (definition.artifacts ?? []).flatMap((artifact) =>
        artifact.type === "function" ? [artifact.function] : [],
    );
    const ids = [
        management.health?.functionId,
        ...(management.actions ?? []).map(({ functionId }) => functionId),
    ].filter((id): id is string => Boolean(id));
    for (const id of ids) {
        const fn = functions.find((candidate) => candidate.id === id);
        if (!fn || fn.access?.mode !== "system" || fn.method !== "POST") {
            fail(`function "${id}" must be an owned system POST function`);
        }
    }
    for (const binding of Object.values(management.runtimeSecrets ?? {})) {
        if (
            "field" in binding &&
            !integrationReferenceFields(definition).some((field) => field.path === binding.field)
        ) {
            fail("runtime binding must reference a declared view field");
        }
    }
    for (const name of management.generatedSecrets ?? []) {
        if (!definition.generatedSecrets?.some((secret) => secret.name === name)) {
            fail("generated secret grant must reference an owned generated secret");
        }
    }
}
export function parseExtension(value: unknown): { kind: string } | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        fail("extensionOf must be an object");
    }
    return { kind: identifier(value.kind) };
}
function identifier(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) {
        fail("must reference a declared identifier");
    }
    return value;
}
function fail(message: string): never {
    throw new IntegrationInputError("definition.management", message);
}
