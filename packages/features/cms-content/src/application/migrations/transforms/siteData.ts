import { collectionThemeTokenId, type CollectionMigrationOperation } from "@bernouy/cms-repository/collections";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { replaceThemeTokenReference } from "./themeTokenReferences";

export function migrateConfiguration(
    input: Readonly<Record<string, unknown>>,
    operations: readonly CollectionMigrationOperation[],
): Readonly<Record<string, unknown>> {
    const output = structuredClone(input);
    for (const operation of operations) {
        if (operation.kind === "move-configuration-value") {
            const moved = takePath(output, operation.from);
            if (moved.found) {
                putPath(output, operation.to, moved.value);
            }
        } else if (operation.kind === "set-configuration-default" && !readPath(output, operation.path).found) {
            putPath(output, operation.path, structuredClone(operation.value));
        } else if (operation.kind === "remove-configuration-value") {
            takePath(output, operation.path);
        } else if (operation.kind === "map-configuration-value") {
            const current = readPath(output, operation.path);
            const replacement = current.found
                ? operation.values.find((entry) => sameJson(entry.from, current.value))
                : undefined;
            if (replacement) {
                current.parent![current.key!] = structuredClone(replacement.to);
            }
        }
    }
    return output;
}

export function migrateTextOverrides(
    input: Readonly<Record<string, Readonly<Record<string, string>>>>,
    operations: readonly CollectionMigrationOperation[],
): Readonly<Record<string, Readonly<Record<string, string>>>> {
    const output = structuredClone(input) as Record<string, Readonly<Record<string, string>>>;
    for (const operation of operations) {
        if (operation.kind === "rename-text-override" && Object.hasOwn(output, operation.from)) {
            if (Object.hasOwn(output, operation.to)) {
                throw new Error(`Text override migration collides with ${operation.to}`);
            }
            output[operation.to] = output[operation.from]!;
            delete output[operation.from];
        } else if (operation.kind === "remove-text-override") {
            delete output[operation.id];
        }
    }
    return output;
}

export function migrateThemeTokens(
    system: TSystem,
    operationsByCollection: readonly {
        collectionId: string;
        operations: readonly CollectionMigrationOperation[];
    }[],
): TSystem {
    const next = structuredClone(system);
    for (const { collectionId, operations } of operationsByCollection) {
        for (const operation of operations) {
            if (operation.kind !== "rename-theme-token") {
                continue;
            }
            const from = collectionThemeTokenId(collectionId, operation.from);
            const to = collectionThemeTokenId(collectionId, operation.to);
            for (const theme of next.theme.themes) {
                for (const mode of ["light", "dark"] as const) {
                    if (Object.hasOwn(theme.values[mode], from)) {
                        if (Object.hasOwn(theme.values[mode], to)) {
                            throw new Error(`Theme migration collides with ${to}`);
                        }
                        theme.values[mode][to] = theme.values[mode][from]!;
                        delete theme.values[mode][from];
                    }
                    for (const [id, value] of Object.entries(theme.values[mode])) {
                        theme.values[mode][id] = replaceThemeTokenReference(value, from, to);
                    }
                }
            }
        }
    }
    return next;
}

function takePath(root: Record<string, unknown>, path: readonly string[]): { found: boolean; value?: unknown } {
    const current = readPath(root, path);
    if (!current.found) {
        return { found: false };
    }
    delete current.parent![current.key!];
    return { found: true, value: current.value };
}

function putPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
    let parent = root;
    for (const part of path.slice(0, -1)) {
        const current = parent[part];
        if (current === undefined) {
            parent[part] = {};
        } else if (!current || typeof current !== "object" || Array.isArray(current)) {
            throw new Error(`Configuration migration cannot create ${path.join(".")}`);
        }
        parent = parent[part] as Record<string, unknown>;
    }
    const key = path.at(-1)!;
    if (Object.hasOwn(parent, key)) {
        throw new Error(`Configuration migration collides with ${path.join(".")}`);
    }
    parent[key] = value;
}

function readPath(
    root: Record<string, unknown>,
    path: readonly string[],
): { found: boolean; value?: unknown; parent?: Record<string, unknown>; key?: string } {
    let parent = root;
    for (const part of path.slice(0, -1)) {
        const current = parent[part];
        if (!current || typeof current !== "object" || Array.isArray(current)) {
            return { found: false };
        }
        parent = current as Record<string, unknown>;
    }
    const key = path.at(-1)!;
    return Object.hasOwn(parent, key) ? { found: true, value: parent[key], parent, key } : { found: false };
}

function sameJson(left: unknown, right: unknown): boolean {
    return canonicalizeIJson(left) === canonicalizeIJson(right);
}
