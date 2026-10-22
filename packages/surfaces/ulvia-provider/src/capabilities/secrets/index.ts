import { CmsSecretConflict, CmsSecretNotFound, type CmsSecrets } from "@bernouy/cms-secrets";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";

export function registerSecretCapabilities(dispatcher: ProviderCapabilityRegistry, secrets: CmsSecrets): void {
    dispatcher.register("ulvia.cms.secrets", "create", async (input) =>
        secretCommand(() => secrets.create(text(input.name), text(input.value)), "ALREADY_EXISTS"),
    );
    dispatcher.register("ulvia.cms.secrets", "rotate", async (input) =>
        secretCommand(() =>
            secrets.rotate(text(input.secretId), positiveInteger(input.expectedVersion), text(input.value)),
        ),
    );
    dispatcher.register("ulvia.cms.secrets", "delete", async (input) =>
        secretCommand(async () => ({
            deleted: await secrets.delete(text(input.secretId), positiveInteger(input.expectedVersion)),
        })),
    );
    dispatcher.register("ulvia.cms.secrets", "get-metadata", async (input) =>
        secretCommand(() => secrets.get(text(input.secretId))),
    );
    dispatcher.register("ulvia.cms.secrets", "list", async (input) => ({
        items: (await secrets.list(input.limit === undefined ? 100 : positiveInteger(input.limit))).map(
            ({ secretId, name, version }) => ({ secretId, name, version }),
        ),
    }));
    dispatcher.register("ulvia.cms.secrets", "resolve", async (input) =>
        secretCommand(() => secrets.resolve(text(input.secretId))),
    );
}

async function secretCommand<T>(
    operation: () => Promise<T>,
    conflictCode: "ALREADY_EXISTS" | "VERSION_CONFLICT" = "VERSION_CONFLICT",
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CmsSecretNotFound) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (error instanceof CmsSecretConflict) {
            throw new ProviderCapabilityDispatchError(conflictCode, 409);
        }
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
}

function text(value: unknown): string {
    if (typeof value !== "string" || !value.length) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function positiveInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}
