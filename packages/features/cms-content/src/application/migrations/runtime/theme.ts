import { collectionThemeTokenId } from "@bernouy/cms-repository/collections";
import { isDeepStrictEqual } from "node:util";
import type { ThemeSettings } from "cms-content/theme/interfaces/theme";
import type { CollectionMigrationRecord } from "../interfaces";

export function migrationThemeTokenIds(record: CollectionMigrationRecord): Set<string> {
    const ids = new Set(
        record.resources
            .filter(
                ({ kind, change }) =>
                    kind === "theme-token" && ["added", "removed", "contract-breaking"].includes(change),
            )
            .map(({ id }) => id),
    );
    for (const group of record.operationGroups) {
        for (const operation of group.operations) {
            if (operation.kind === "rename-theme-token") {
                ids.add(collectionThemeTokenId(group.collectionId, operation.from));
                ids.add(collectionThemeTokenId(group.collectionId, operation.to));
            }
        }
    }
    return ids;
}

export function themeTokenValuesMatch(
    actual: ThemeSettings,
    candidates: readonly ThemeSettings[],
    tokenIds: ReadonlySet<string>,
): boolean {
    return candidates.some((candidate) => {
        const byId = new Map(candidate.themes.map((theme) => [theme.id, theme]));
        return actual.themes.every((theme) => {
            const expected = byId.get(theme.id);
            return (["light", "dark"] as const).every((mode) =>
                [...tokenIds].every((tokenId) =>
                    isDeepStrictEqual(theme.values[mode][tokenId], expected?.values[mode][tokenId]),
                ),
            );
        });
    });
}

export function restoreThemeTokenValues(
    current: ThemeSettings,
    before: ThemeSettings,
    tokenIds: ReadonlySet<string>,
): ThemeSettings {
    const restored = structuredClone(current);
    const beforeById = new Map(before.themes.map((theme) => [theme.id, theme]));
    for (const theme of restored.themes) {
        const previous = beforeById.get(theme.id);
        for (const mode of ["light", "dark"] as const) {
            for (const tokenId of tokenIds) {
                const value = previous?.values[mode][tokenId];
                if (value === undefined) {
                    delete theme.values[mode][tokenId];
                } else {
                    theme.values[mode][tokenId] = value;
                }
            }
        }
    }
    return restored;
}
