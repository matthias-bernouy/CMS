import { verifyManagementLease } from "./lease";
import { resolveManagementPages } from "./pages";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type {
    IntegrationManagementOperation,
    IntegrationManagementActor,
} from "../../../interfaces/Integration/management";
import { IntegrationRuntimeError, IntegrationManagementError } from "../../errors";
import type { IntegrationManagementDeps } from "./contracts";
import { managementSecrets, publicResult, readPath, saveGeneratedSecrets } from "./secrets";
import { record } from "./report";

export async function invokeManagement(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    functionId: string,
    operation: IntegrationManagementOperation,
    input: Record<string, unknown> = {},
    refs = installation.managementSecretRefs ?? {},
    allowGenerated = false,
    actor?: IntegrationManagementActor,
    actionId?: string,
) {
    if (!["health", "read-settings"].includes(operation)) {
        await verifyManagementLease(deps, installation);
    }
    const secrets = await managementSecrets(deps, installation, refs, ["health", "read-settings"].includes(operation));
    const resolvedPages = operation === "save-settings" ? await resolveManagementPages(deps, installation, input) : {};
    let result: unknown;
    try {
        result = await deps.invoke(
            installation,
            functionId,
            {
                operation,
                ...(actionId ? { actionId } : {}),
                resolvedPages,
                ...(actor ? { actor } : {}),
                installationId: installation.id,
                definitionVersion: installation.definitionVersion,
                input,
                secretValues: secrets.secretValues,
                generatedSecretValues: secrets.generatedSecretValues,
            },
            secrets.reader,
        );
    } catch (error) {
        const status = error instanceof IntegrationRuntimeError ? error.status : 502;
        const message =
            error instanceof IntegrationRuntimeError && status >= 400 && status < 500
                ? (publicResult(error.message, [
                      ...Object.values(secrets.secretValues),
                      ...Object.values(secrets.generatedSecretValues),
                  ]) as string)
                : "Integration management function is unavailable";
        throw new IntegrationManagementError(
            message,
            status,
            error instanceof IntegrationManagementError ? error.publicCode : undefined,
        );
    }
    if (operation === "health" && (!record(result) || result.generatedSecrets !== undefined)) {
        return { raw: {}, public: null, secretValues: secrets.secretValues };
    }
    if (!record(result)) {
        throw new IntegrationRuntimeError("Invalid integration management response", 502);
    }
    if (!allowGenerated && result.generatedSecrets !== undefined) {
        throw new IntegrationRuntimeError("Generated outputs are allowed only during apply", 502);
    }
    if (allowGenerated) {
        await verifyManagementLease(deps, installation);
    }
    const outputs = allowGenerated ? await saveGeneratedSecrets(deps, installation, result) : [];
    return {
        raw: result,
        public: publicResult(result, [
            ...Object.values(secrets.secretValues),
            ...Object.values(secrets.generatedSecretValues),
            ...outputs,
        ]),
        secretValues: secrets.secretValues,
    };
}
export async function syncManagementRuntime(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
    result: Record<string, unknown>,
    secretValues: Record<string, string>,
): Promise<void> {
    const bindings = installation.definitionSnapshot?.management?.runtimeSecrets;
    if (!bindings || !Object.keys(bindings).length) {
        return;
    }
    if (!deps.syncRuntimeSecrets) {
        throw new IntegrationRuntimeError("Integration runtime secret synchronization is unavailable", 503);
    }
    const values: Record<string, string> = {};
    for (const [name, binding] of Object.entries(bindings)) {
        const value =
            "generated" in binding
                ? await deps.secrets.get(installation.secretRefs[binding.generated]!)
                : (secretValues[binding.field] ?? readPath(result.values, binding.field));
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            throw new IntegrationRuntimeError("Integration runtime binding has no value", 502);
        }
        values[name] = String(value);
    }
    await verifyManagementLease(deps, installation);
    try {
        await deps.syncRuntimeSecrets(installation, values);
    } catch {
        throw new IntegrationRuntimeError("Integration runtime secret synchronization failed", 502);
    }
    await verifyManagementLease(deps, installation);
}
