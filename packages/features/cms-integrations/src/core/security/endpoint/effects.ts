import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationRuntimeDeps } from "../management/contracts";
import { IntegrationRuntimeError } from "../../errors";
import { nextTime, verifyManagementLease } from "../management/lease";
import { saveGeneratedSecrets } from "../management/secrets";
import { syncIntegrationRuntime } from "./runtime";
import { record } from "../management/report";

/** Execute only effects requested by the integration and allowed by its installed grants. */
export async function applyIntegrationEffects(
    deps: IntegrationRuntimeDeps,
    installation: IntegrationInstallation,
    directive: Record<string, unknown>,
    result: Record<string, unknown>,
    refs: Record<string, string>,
    values: Record<string, string>,
): Promise<string[]> {
    for (const key of Object.keys(directive)) {
        if (!["rememberSecrets", "generatedSecrets", "syncRuntime", "continue"].includes(key)) {
            throw new IntegrationRuntimeError("Unsupported integration effect", 502);
        }
    }
    for (const key of ["rememberSecrets", "syncRuntime"]) {
        if (directive[key] !== undefined && directive[key] !== true) {
            throw new IntegrationRuntimeError("Invalid integration effect", 502);
        }
    }
    if (
        directive.continue !== undefined &&
        (!record(directive.continue) || JSON.stringify(directive.continue).length > 4096)
    ) {
        throw new IntegrationRuntimeError("Invalid integration continuation", 502);
    }
    await verifyManagementLease(deps, installation);
    if (directive.rememberSecrets) {
        const current = await verifyManagementLease(deps, installation);
        const saved = await deps.installations.compareAndSwapMigration!(current, {
            ...current,
            managementSecretRefs: refs,
            updatedAt: nextTime(deps, current),
        });
        if (!saved) {
            throw new IntegrationRuntimeError("Integration changed while references were saved", 409);
        }
    }
    const generated = await saveGeneratedSecrets(deps, installation, directive);
    if (directive.syncRuntime) {
        await syncIntegrationRuntime(deps, installation, result, values);
    }
    return generated;
}
