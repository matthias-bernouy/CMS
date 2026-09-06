import { IntegrationInputError } from "../errors";
import { secretRefToKey } from "@bernouy/cms-secrets";
import { declaredManagementSecretRefs } from "../security/management/secrets";
import type { IntegrationImportDeps } from "../../interfaces/IntegrationImport";
import type { IntegrationInstallationRepository } from "../../interfaces/IntegrationInstallationRepository";

export async function assertSecretKeysAvailable(
    installations: IntegrationInstallationRepository,
    ownerIntegrationId: string,
    secretRefs: Record<string, string>,
): Promise<void> {
    const keys = new Set(Object.values(secretRefs));
    if (!keys.size) {
        return;
    }

    for (const installation of await installations.list()) {
        if (installation.id === ownerIntegrationId) {
            continue;
        }
        for (const key of Object.values(installation.secretRefs)) {
            if (keys.has(key)) {
                throw new IntegrationInputError(
                    "secrets",
                    `secret key "${key}" is already used by integration installation "${installation.id}"`,
                );
            }
        }
    }
}

export async function deleteObsoleteSecretRefs(
    secrets: IntegrationImportDeps["secrets"],
    previous: Record<string, string>,
    next: Record<string, string>,
    installations?: IntegrationInstallationRepository,
): Promise<void> {
    const active = new Set(Object.values(next));
    for (const installation of (await installations?.list()) ?? []) {
        const grants = declaredManagementSecretRefs(
            installation.definitionSnapshot?.management,
            installation.managementSecretRefs ?? {},
        );
        for (const ref of Object.values(grants)) {
            const key = secretRefToKey(ref);
            if (key) {
                active.add(key);
            }
        }
    }
    const stale = new Set(Object.values(previous).filter((key) => !active.has(key)));
    await Promise.all(Array.from(stale, (key) => secrets.delete(key).catch(() => undefined)));
}
