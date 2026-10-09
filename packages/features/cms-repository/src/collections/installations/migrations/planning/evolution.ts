import {
    collectionThemeTokenId,
    type CollectionMigrationOperation,
    type CollectionRelease,
} from "@bernouy/cms-repository/collections";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";

export function migrationOperations(
    previous: CollectionRelease,
    next: CollectionRelease,
    blocked: string[],
): readonly CollectionMigrationOperation[] {
    const from = previous.dataGeneration ?? 1;
    const to = next.dataGeneration ?? 1;
    if (to < from) {
        blocked.push(`${next.collectionId} data generation decreases from ${from} to ${to}.`);
        return [];
    }
    const steps = (next.migrations ?? []).filter(
        (migration) => migration.fromGeneration >= from && migration.toGeneration <= to,
    );
    if (steps.length !== to - from || steps.some((step, index) => step.fromGeneration !== from + index)) {
        blocked.push(`${next.collectionId} does not contain the complete ${from} → ${to} migration chain.`);
        return [];
    }
    return steps.flatMap((step) => step.operations);
}

export function dependencyIssues(
    installed: readonly { release: CollectionRelease }[],
    targets: readonly CollectionRelease[],
): string[] {
    const final = new Map(installed.map(({ release }) => [release.collectionId, release]));
    targets.forEach((release) => final.set(release.collectionId, release));
    const issues: string[] = [];
    for (const release of final.values()) {
        for (const dependency of release.dependencies ?? []) {
            const target = final.get(dependency.collectionId);
            if (
                !target ||
                target.publisherId !== dependency.publisherId ||
                !satisfiesVersionRange(target.version, dependency.versionRange)
            ) {
                issues.push(`${release.collectionId} requires ${dependency.collectionId} ${dependency.versionRange}.`);
                continue;
            }
            const blocs = new Set(target.exports?.blocs ?? []);
            const tokens = new Set(target.exports?.themeTokens ?? []);
            const texts = new Set(target.exports?.texts ?? []);
            const assets = new Set(target.exports?.assets ?? []);
            const blocGenerations = new Map(target.blocs.map((item) => [item.id, item.generation ?? 1]));
            const tokenGenerations = new Map(
                target.theme?.categories.flatMap((category) =>
                    category.tokens.map((item) => [item.id, item.generation ?? 1] as const),
                ) ?? [],
            );
            const textGenerations = new Map((target.texts ?? []).map((item) => [item.id, item.generation ?? 1]));
            const assetGenerations = new Map(target.assets.map((item) => [item.id, item.generation ?? 1]));
            dependency.imports.blocs
                .filter(({ id, generation }) => !blocs.has(id) || blocGenerations.get(id) !== generation)
                .forEach(({ id, generation }) =>
                    issues.push(`${release.collectionId} requires bloc ${id} generation ${generation}.`),
                );
            dependency.imports.themeTokens
                .filter(({ id, generation }) => !tokens.has(id) || tokenGenerations.get(id) !== generation)
                .forEach(({ id, generation }) =>
                    issues.push(
                        `${release.collectionId} requires token ${collectionThemeTokenId(target.collectionId, id)} generation ${generation}.`,
                    ),
                );
            dependency.imports.texts
                ?.filter(({ id, generation }) => !texts.has(id) || textGenerations.get(id) !== generation)
                .forEach(({ id, generation }) =>
                    issues.push(
                        `${release.collectionId} requires text ${target.collectionId}.${id} generation ${generation}.`,
                    ),
                );
            dependency.imports.assets
                ?.filter(({ id, generation }) => !assets.has(id) || assetGenerations.get(id) !== generation)
                .forEach(({ id, generation }) =>
                    issues.push(
                        `${release.collectionId} requires asset ${target.collectionId}.${id} generation ${generation}.`,
                    ),
                );
        }
    }
    return issues;
}
