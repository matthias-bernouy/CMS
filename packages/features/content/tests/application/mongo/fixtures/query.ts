export type StoredDocument = { _id: string } & Record<string, unknown>;
export type Filter = Record<string, unknown>;
export function matches(document: StoredDocument, filter: Filter): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === "$or" && Array.isArray(expected)) {
            return expected.some((condition) => matches(document, condition));
        }
        if (key === "$and" && Array.isArray(expected)) {
            return expected.every((condition) => matches(document, condition));
        }
        const { exists, value } = nestedValue(document, key);
        if (expected && typeof expected === "object" && !Array.isArray(expected)) {
            const operator = expected as {
                $regex?: string;
                $options?: string;
                $eq?: unknown;
                $exists?: boolean;
                $gt?: unknown;
                $gte?: unknown;
                $in?: unknown[];
                $lt?: unknown;
                $ne?: unknown;
            };
            if (operator.$regex !== undefined) {
                return typeof value === "string" && new RegExp(operator.$regex, operator.$options).test(value);
            }
            if (operator.$exists !== undefined && exists !== operator.$exists) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$ne") && value === operator.$ne) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$eq") && !Bun.deepEquals(value, operator.$eq)) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$gt") && String(value) <= String(operator.$gt)) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$gte") && Number(value) < Number(operator.$gte)) {
                return false;
            }
            if (operator.$in && !operator.$in.some((candidate) => Bun.deepEquals(value, candidate))) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$lt") && Number(value) >= Number(operator.$lt)) {
                return false;
            }
            if (
                operator.$exists !== undefined ||
                Object.prototype.hasOwnProperty.call(operator, "$ne") ||
                Object.prototype.hasOwnProperty.call(operator, "$eq") ||
                Object.prototype.hasOwnProperty.call(operator, "$gt") ||
                Object.prototype.hasOwnProperty.call(operator, "$gte") ||
                Object.prototype.hasOwnProperty.call(operator, "$in") ||
                Object.prototype.hasOwnProperty.call(operator, "$lt")
            ) {
                return true;
            }
        }
        return Array.isArray(value) && !Array.isArray(expected)
            ? value.some((entry) => Bun.deepEquals(entry, expected))
            : Bun.deepEquals(value, expected);
    });
}

function nestedValue(document: StoredDocument, path: string): { exists: boolean; value: unknown } {
    const segments = path.split(".");
    let value: unknown = document;
    for (const segment of segments) {
        if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, segment)) {
            return { exists: false, value: undefined };
        }
        value = (value as Record<string, unknown>)[segment];
    }
    return { exists: true, value };
}

export function project(document: StoredDocument, projection: Filter): StoredDocument {
    if (!Object.entries(projection).some(([key, included]) => key !== "_id" && included === 1)) {
        if (projection._id === 1) {
            return { _id: document._id };
        }
        const copy = structuredClone(document);
        for (const [path, included] of Object.entries(projection)) {
            if (included !== 0) {
                continue;
            }
            const segments = path.split(".");
            let target: Record<string, unknown> | undefined = copy;
            for (const segment of segments.slice(0, -1)) {
                const value = target?.[segment];
                target = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
            }
            if (target) {
                delete target[segments.at(-1)!];
            }
        }
        if (projection._id === 0) {
            delete (copy as Partial<StoredDocument>)._id;
        }
        return copy;
    }
    const result: StoredDocument = { _id: document._id };
    for (const [path, included] of Object.entries(projection)) {
        if (included !== 1) {
            continue;
        }
        const { value, exists } = nestedValue(document, path);
        if (!exists) {
            continue;
        }
        const parts = path.split(".");
        let target: Record<string, unknown> = result;
        for (const part of parts.slice(0, -1)) {
            target[part] ??= {};
            target = target[part] as Record<string, unknown>;
        }
        target[parts.at(-1)!] = structuredClone(value);
    }
    if (projection._id === 0) {
        delete (result as Partial<StoredDocument>)._id;
    }
    return result;
}
