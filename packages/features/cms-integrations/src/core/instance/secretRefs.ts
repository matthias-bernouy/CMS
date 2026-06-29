import { IntegrationInputError } from "../errors";
import type { IntegrationImportDeps } from "../../interfaces/IntegrationImport";
import type { IntegrationInstanceRepository } from "../../interfaces/IntegrationInstanceRepository";

export async function assertSecretKeysAvailable(
    instances: IntegrationInstanceRepository,
    ownerInstanceId: string,
    secretRefs: Record<string, string>,
): Promise<void> {
    const keys = new Set(Object.values(secretRefs));
    if (!keys.size) return;

    for (const instance of await instances.list()) {
        if (instance.id === ownerInstanceId) continue;
        for (const key of Object.values(instance.secretRefs)) {
            if (keys.has(key)) {
                throw new IntegrationInputError("secrets", `secret key "${key}" is already used by integration instance "${instance.id}"`);
            }
        }
    }
}

export async function deleteObsoleteSecretRefs(
    secrets: IntegrationImportDeps["secrets"],
    previous: Record<string, string>,
    next: Record<string, string>,
): Promise<void> {
    const active = new Set(Object.values(next));
    const stale = new Set(Object.values(previous).filter(key => !active.has(key)));
    await Promise.all(Array.from(stale, key => secrets.delete(key).catch(() => undefined)));
}
