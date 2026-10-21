import { ProviderCapabilityDispatchError } from "../../dispatch/registry";

export async function configurationCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409) {
            throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (String(error).includes("migration is in progress")) {
            throw new ProviderCapabilityDispatchError("MIGRATION_IN_PROGRESS", 423);
        }
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

export function languages(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return invalid();
    }
    return value.map(language);
}

export function language(value: unknown): string {
    const candidate = requiredText(value).trim();
    try {
        return Intl.getCanonicalLocales(candidate)[0] ?? invalid();
    } catch {
        return invalid();
    }
}

export function revision(value: unknown): number {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();
}

export function optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

export function requiredText(value: unknown): string {
    return optionalText(value) ?? invalid();
}

function invalid(): never {
    throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
}
