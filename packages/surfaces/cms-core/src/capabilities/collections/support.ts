import { CoreCapabilityDispatchError } from "../../dispatch/registry";
import type { CollectionMigrationTarget } from "@bernouy/cms-content/migrations";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";

export function targets(value: unknown): readonly CollectionMigrationTarget[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const record = entry as Record<string, unknown>;
        const digest = requiredText(record.digest);
        const repositoryId = typeof record.repositoryId === "string" ? record.repositoryId : undefined;
        return { digest, ...(repositoryId ? { repositoryId } : {}) };
    });
}

export function parseConfiguration(value: unknown): unknown {
    if (typeof value !== "string") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return parseStrictJson(new TextEncoder().encode(value), MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
}

export async function collectionCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (status === 423) {
            throw new CoreCapabilityDispatchError("MIGRATION_IN_PROGRESS", 423);
        }
        if (error instanceof TypeError || error instanceof RangeError || status === 400 || status === 422) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        throw error;
    }
}

export function integer(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

export function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
