import { dashboardSecretRefPaths, isSafeDashboardPath } from "@bernouy/cms-dashboards";
import { scopedSecretReader, secretKeyToRef, secretRefToKey, type SecretReader } from "@bernouy/cms-secrets";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationManagement } from "../../../interfaces/Integration/management";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationManagementDeps } from "./contracts";
import { record } from "./report";

export function declaredManagementSecretRefs(
    management: IntegrationManagement | undefined,
    refs: Record<string, string>,
): Record<string, string> {
    const fields = management?.settings?.fields ?? [];
    return Object.fromEntries(
        Object.entries(refs).filter(
            ([path, ref]) =>
                secretRefToKey(ref) &&
                fields.some((field) => {
                    if (!isSafeDashboardPath(field.path)) {
                        return false;
                    }
                    if (field.type === "secret-ref") {
                        return path === field.path;
                    }
                    if (field.type !== "reorderable-list" || !path.startsWith(`${field.path}.`)) {
                        return false;
                    }
                    const [row, ...parts] = path.slice(field.path.length + 1).split(".");
                    return (
                        /^(0|[1-9][0-9]*)$/.test(row ?? "") &&
                        field.fields.some(
                            (nested) =>
                                nested.type === "secret-ref" &&
                                isSafeDashboardPath(nested.path) &&
                                nested.path === parts.join("."),
                        )
                    );
                }),
        ),
    );
}

export function settingSecretRefs(
    management: IntegrationManagement,
    input: Record<string, unknown>,
    previous: Record<string, string>,
): Record<string, string> {
    const paths = dashboardSecretRefPaths(management.settings?.fields ?? [], input);
    const result = Object.fromEntries(Object.entries(previous).filter(([path]) => paths.includes(path)));
    for (const path of paths) {
        const value = readPath(input, path);
        if (value === undefined) {
            continue;
        }
        if (value === null || value === "") {
            delete result[path];
            continue;
        }
        if (typeof value !== "string" || !secretRefToKey(value)) {
            throw new IntegrationInputError(path, "must be an exact secret reference");
        }
        result[path] = value;
    }
    return result;
}
export async function managementSecrets(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    refs: Record<string, string>,
    allowMissing = false,
) {
    refs = declaredManagementSecretRefs(installation.definitionSnapshot?.management, refs);
    const generated = installation.definitionSnapshot?.management?.generatedSecrets ?? [];
    const generatedRefs = Object.fromEntries(
        generated.map((name) => {
            const key = installation.secretRefs[name];
            if (!key) {
                throw new IntegrationRuntimeError("Owned generated secret is unavailable", 503);
            }
            return [name, secretKeyToRef(key)];
        }),
    );
    const reader = scopedSecretReader(deps.secrets, [
        ...Object.values(refs),
        ...Object.values(generatedRefs),
        ...Object.values(installation.secretRefs).map(secretKeyToRef),
    ]);
    return {
        reader,
        secretValues: await resolve(reader, refs, allowMissing),
        generatedSecretValues: await resolve(reader, generatedRefs, allowMissing),
    };
}
async function resolve(
    reader: SecretReader,
    refs: Record<string, string>,
    allowMissing: boolean,
): Promise<Record<string, string>> {
    const entries = await Promise.all(
        Object.entries(refs).map(async ([name, ref]) => {
            let value: string | null;
            try {
                value = await reader.get(secretRefToKey(ref)!);
            } catch {
                throw new IntegrationRuntimeError("Granted secret is unavailable", 503);
            }
            if (value === null) {
                if (allowMissing) {
                    return [];
                }
                throw new IntegrationRuntimeError("Granted secret is unavailable", 503);
            }
            return [[name, value]];
        }),
    );
    return Object.fromEntries(entries.flat());
}
export async function saveGeneratedSecrets(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    response: Record<string, unknown>,
): Promise<string[]> {
    const value = response.generatedSecrets;
    if (value === undefined) {
        return [];
    }
    if (!record(value)) {
        throw new IntegrationRuntimeError("Invalid generated secret result", 502);
    }
    const names = installation.definitionSnapshot?.management?.generatedSecrets ?? [];
    const entries = Object.entries(value);
    for (const [name, secret] of entries) {
        if (!names.includes(name) || !installation.secretRefs[name] || typeof secret !== "string" || !secret) {
            throw new IntegrationRuntimeError("Generated secret output was not authorized", 502);
        }
    }
    for (const [name, secret] of entries) {
        try {
            await deps.secrets.set(installation.secretRefs[name]!, secret as string);
        } catch {
            throw new IntegrationRuntimeError("Generated secret could not be stored", 503);
        }
    }
    return entries.map(([, secret]) => secret as string);
}
export function readPath(value: unknown, path: string): unknown {
    return path
        .split(".")
        .reduce<unknown>(
            (current, key) =>
                (record(current) || Array.isArray(current)) && Object.hasOwn(current, key)
                    ? (current as Record<string, unknown>)[key]
                    : undefined,
            value,
        );
}
export function publicResult(value: unknown, secrets: readonly string[]): unknown {
    if (typeof value === "string") {
        return secrets.filter(Boolean).reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => publicResult(item, secrets));
    }
    if (!record(value)) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !["generatedSecrets", "secretValues", "generatedSecretValues"].includes(key))
            .map(([key, child]) => [key, publicResult(child, secrets)]),
    );
}
