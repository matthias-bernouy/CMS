import type { SecretStore } from "@bernouy/cms-secrets";
import { secretKeyError } from "@bernouy/cms-secrets";
import { IntegrationInputError } from "../errors";
import type { IntegrationSecretResult } from "../../interfaces/IntegrationImport";

export type IntegrationSecretWrite = {
    input?: string;
    key: string;
    value: string;
};

export async function writeSecretsWithRollback<T>(
    secretsStore: SecretStore,
    writes: IntegrationSecretWrite[],
    operation: (secrets: IntegrationSecretResult[]) => Promise<T>,
): Promise<{ result: T; secrets: IntegrationSecretResult[] }> {
    const previousValues: Array<{ key: string; value: string | null }> = [];
    const secrets: IntegrationSecretResult[] = [];

    try {
        for (const secret of writes) {
            assertSecretKey(secret.key);
            const previous = await secretsStore.get(secret.key);
            await secretsStore.set(secret.key, secret.value);
            previousValues.push({ key: secret.key, value: previous });
            secrets.push({
                ...(secret.input ? { input: secret.input } : {}),
                key: secret.key,
                action: previous === null ? "created" : "updated",
            });
        }

        return { result: await operation(secrets), secrets };
    } catch (error) {
        for (const previous of previousValues.reverse()) {
            try {
                if (previous.value === null) {
                    await secretsStore.delete(previous.key);
                } else {
                    await secretsStore.set(previous.key, previous.value);
                }
            } catch {
                // Best-effort rollback: keep restoring remaining secrets.
            }
        }
        throw error;
    }
}

function assertSecretKey(key: string): void {
    const error = secretKeyError(key);
    if (error) {
        throw new IntegrationInputError("secrets", error);
    }
}
