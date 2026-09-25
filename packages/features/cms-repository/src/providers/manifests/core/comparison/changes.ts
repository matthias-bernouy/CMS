import type {
    ProviderManifestChange,
    ProviderManifestChangeCategory,
} from "cms-repository/providers/manifests/interfaces/ProviderManifestComparison";
import { compareOrdinal } from "../values";

type RecordValue = Record<string, unknown>;

export function compareValues(
    before: unknown,
    after: unknown,
    path: string,
    category: ProviderManifestChangeCategory,
    changes: ProviderManifestChange[],
): void {
    if (before === after) {
        return;
    }
    if (isRecord(before) && isRecord(after)) {
        for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareOrdinal)) {
            compareValues(
                Object.hasOwn(before, key) ? before[key] : undefined,
                Object.hasOwn(after, key) ? after[key] : undefined,
                `${path}[${JSON.stringify(key)}]`,
                category,
                changes,
            );
        }
        return;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
        for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
            compareValues(before[index], after[index], `${path}[${index}]`, category, changes);
        }
        return;
    }
    changes.push({
        category,
        kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
        path,
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
    });
}

export function compareKeyedValues<T>(
    before: readonly T[],
    after: readonly T[],
    keyOf: (value: T) => string,
    path: string,
    category: ProviderManifestChangeCategory,
    changes: ProviderManifestChange[],
    compare: (left: T, right: T, path: string) => void = (left, right, itemPath) =>
        compareValues(left, right, itemPath, category, changes),
): void {
    const previous = new Map(before.map((value) => [keyOf(value), value]));
    const next = new Map(after.map((value) => [keyOf(value), value]));
    for (const key of [...new Set([...previous.keys(), ...next.keys()])].sort(compareOrdinal)) {
        const left = previous.get(key);
        const right = next.get(key);
        const itemPath = `${path}[${JSON.stringify(key)}]`;
        if (left !== undefined && right !== undefined) {
            compare(left, right, itemPath);
        } else {
            compareValues(left, right, itemPath, category, changes);
        }
    }
}

function isRecord(value: unknown): value is RecordValue {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
