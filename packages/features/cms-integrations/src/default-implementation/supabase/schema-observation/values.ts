export function rowText(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (typeof value !== "string" || !value) {
        throw invalidRow(key, "a non-empty string");
    }
    return value;
}

export function rowString(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (typeof value !== "string") {
        throw invalidRow(key, "a string");
    }
    return value;
}

export function rowOptionalText(row: Record<string, unknown>, key: string): string | undefined {
    const value = row[key];
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !value) {
        throw invalidRow(key, "a non-empty string or null");
    }
    return value;
}

export function rowBoolean(row: Record<string, unknown>, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean") {
        throw invalidRow(key, "a boolean");
    }
    return value;
}

export function rowOptionalBoolean(row: Record<string, unknown>, key: string): boolean | undefined {
    const value = row[key];
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "boolean") {
        throw invalidRow(key, "a boolean or null");
    }
    return value;
}

export function rowTextArray(row: Record<string, unknown>, key: string): string[] {
    const value = row[key];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
        throw invalidRow(key, "an array of non-empty strings");
    }
    return [...value];
}

export function compareObservedText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function invalidRow(key: string, expected: string): TypeError {
    return new TypeError(`PostgreSQL schema observation row field "${key}" must be ${expected}`);
}
