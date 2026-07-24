export function parseArguments(values: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (let index = 0; index < values.length; index++) {
        const token = values[index]!;
        if (!token.startsWith("--")) {
            throw new Error(`Unexpected argument: ${token}`);
        }
        const name = token.slice(2);
        const next = values[index + 1];
        if (!next || next.startsWith("--")) {
            result.set(name, "true");
            continue;
        }
        result.set(name, next);
        index++;
    }
    return result;
}

export function textArgument(args: Map<string, string>, name: string): string {
    const value = args.get(name)?.trim();
    if (!value) {
        throw new Error(`Missing --${name}`);
    }
    return value;
}

export function positiveIntegerArgument(args: Map<string, string>, name: string, fallback: number): number {
    const raw = args.get(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`--${name} must be a positive integer`);
    }
    return value;
}

export function integerListArgument(args: Map<string, string>, name: string, fallback: number[]): number[] {
    const raw = args.get(name);
    if (!raw) {
        return [...fallback];
    }
    const values = raw.split(",").map(Number);
    if (values.length === 0 || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
        throw new Error(`--${name} must be a comma-separated positive integer list`);
    }
    return values;
}

export function numberArgument(args: Map<string, string>, name: string, fallback: number): number {
    const raw = args.get(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`--${name} must be a non-negative number`);
    }
    return value;
}
