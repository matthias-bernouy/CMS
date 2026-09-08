import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationRuntimeDeps } from "../management/contracts";
import { IntegrationRuntimeError } from "../../errors";
import { verifyManagementLease } from "../management/lease";
import { readPath } from "../management/secrets";

export async function syncIntegrationRuntime(
    deps: IntegrationRuntimeDeps,
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
