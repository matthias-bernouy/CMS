import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationRuntimeDeps } from "../management/contracts";
import { IntegrationRuntimeError } from "../../errors";
import { nextTime, verifyManagementLease } from "../management/lease";
import { saveGeneratedSecrets } from "../management/secrets";
import { syncIntegrationRuntime } from "./runtime";

/** Apply host-owned storage and runtime work after an integration endpoint succeeds. */
export async function completeIntegrationEndpoint(
    deps: IntegrationRuntimeDeps,
    installation: IntegrationInstallation,
    result: Record<string, unknown>,
    refs: Record<string, string>,
    secretValues: Record<string, string>,
): Promise<string[]> {
    const current = await verifyManagementLease(deps, installation);
    if (!sameRefs(current.managementSecretRefs ?? {}, refs)) {
        const saved = await deps.installations.compareAndSwapMigration!(current, {
            ...current,
            managementSecretRefs: refs,
            updatedAt: nextTime(deps, current),
        });
        if (!saved) {
            throw new IntegrationRuntimeError("Integration changed while references were saved", 409);
        }
    }
    const generated = await saveGeneratedSecrets(deps, installation, result);
    await syncIntegrationRuntime(deps, installation, result, secretValues);
    return generated;
}

function sameRefs(left: Record<string, string>, right: Record<string, string>): boolean {
    const names = Object.keys(left);
    return names.length === Object.keys(right).length && names.every((name) => left[name] === right[name]);
}
