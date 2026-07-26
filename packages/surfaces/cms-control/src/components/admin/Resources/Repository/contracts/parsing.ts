const MAX_ITEMS = 4_096;
const MAX_TEXT = 16_384;

export class RepositoryUiContractError extends Error {
    constructor() {
        super("Repository response is invalid");
        this.name = "RepositoryUiContractError";
    }
}

export function readRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryUiContractError();
    }
    return value as Readonly<Record<string, unknown>>;
}

export function readArray(value: unknown, maximum = MAX_ITEMS): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maximum) {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readText(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT) {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readOptionalText(value: unknown): string | undefined {
    return value === undefined || value === null ? undefined : readText(value);
}

export function readBoolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readCount(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new RepositoryUiContractError();
    }
    return value as number;
}

export function optionalProperty<Key extends string, Value>(
    key: Key,
    value: Value | undefined,
): Partial<Record<Key, Value>> {
    return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}
