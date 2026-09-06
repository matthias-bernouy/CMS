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
        const settings = value.settings;
        if (!isRecord(settings)) {
            fail("settings must be an object");
        }
        const fields = parseFields(settings.fields, "definition.management.settings.fields");
        if (fields.some(({ path }) => !isSafeDashboardPath(path))) {
            fail("settings paths must be safe dotted data paths");
        }
        if (new Set(fields.map(({ path }) => path)).size !== fields.length) {
            fail("settings paths must be unique");
        }
        result.settings = {
            readFunctionId: identifier(settings.readFunctionId),
            ...(settings.dashboardId !== undefined ? { dashboardId: identifier(settings.dashboardId) } : {}),
            saveFunctionId: identifier(settings.saveFunctionId),
            ...(settings.applyFunctionId !== undefined
                ? { applyFunctionId: identifier(settings.applyFunctionId) }
                : {}),
            fields,
        };
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
            if (id === "apply-settings") {
                fail("apply-settings is reserved");
            }
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
                    if (!result.settings?.fields.some(({ path }) => path === field)) {
                        fail("runtime binding must reference a settings field");
                    }
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
        management.settings?.readFunctionId,
        management.settings?.saveFunctionId,
        management.settings?.applyFunctionId,
        ...(management.actions ?? []).map(({ functionId }) => functionId),
    ].filter((id): id is string => Boolean(id));
    for (const id of ids) {
        const fn = functions.find((candidate) => candidate.id === id);
        if (!fn || fn.access?.mode !== "system" || fn.method !== "POST") {
            fail(`function "${id}" must be an owned system POST function`);
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
