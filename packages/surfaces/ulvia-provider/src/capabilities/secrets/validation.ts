import { CmsSecretConflict, CmsSecretNotAuthorized, CmsSecretNotFound } from "@bernouy/cms-secrets";
import { ProviderCapabilityDispatchError } from "../../dispatch/registry";

export async function secretCall<T>(
    operation: () => Promise<T>,
    conflictCode: "ALREADY_EXISTS" | "VERSION_CONFLICT" = "VERSION_CONFLICT",
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CmsSecretNotAuthorized) {
            throw new ProviderCapabilityDispatchError("NOT_AUTHORIZED", 403);
        }
        if (error instanceof CmsSecretNotFound) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (error instanceof CmsSecretConflict) {
            throw new ProviderCapabilityDispatchError(conflictCode, 409);
        }
        if (error instanceof TypeError) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
}

export function namespaceInput(input: Readonly<Record<string, unknown>>): { id: string; key: string } {
    return { id: text(input.namespaceId), key: text(input.namespaceKey) };
}

export function text(value: unknown): string {
    if (typeof value !== "string" || !value.length) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

export function positiveInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}
