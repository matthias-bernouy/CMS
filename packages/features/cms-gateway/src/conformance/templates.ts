export function resolveConformanceTemplate(value: unknown, captures: ReadonlyMap<string, unknown>): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => resolveConformanceTemplate(item, captures));
    }
    if (!record(value)) {
        return value;
    }
    if (Object.keys(value).length === 1 && Object.hasOwn(value, "$literal")) {
        return structuredClone(value.$literal);
    }
    if (Object.keys(value).length === 1 && typeof value.$capture === "string") {
        if (!captures.has(value.$capture)) {
            throw new Error(`Missing conformance capture ${value.$capture}`);
        }
        return structuredClone(captures.get(value.$capture));
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolveConformanceTemplate(item, captures)]),
    );
}

export function readConformancePointer(value: unknown, pointer: string): { present: boolean; value?: unknown } {
    let current = value;
    if (!pointer) {
        return { present: true, value: current };
    }
    for (const segment of pointer
        .slice(1)
        .split("/")
        .map((item) => item.replaceAll("~1", "/").replaceAll("~0", "~"))) {
        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
                return { present: false };
            }
            current = current[index];
        } else if (record(current) && Object.hasOwn(current, segment)) {
            current = current[segment];
        } else {
            return { present: false };
        }
    }
    return { present: true, value: current };
}

function record(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
