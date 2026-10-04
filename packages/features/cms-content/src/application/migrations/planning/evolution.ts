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
            dependency.imports.blocs
                .filter((id) => !blocs.has(id))
                .forEach((id) => issues.push(`${release.collectionId} imports removed bloc ${id}.`));
            dependency.imports.themeTokens
                .filter((id) => !tokens.has(id))
                .forEach((id) =>
                    issues.push(
                        `${release.collectionId} imports removed token ${collectionThemeTokenId(target.collectionId, id)}.`,
                    ),
                );
            dependency.imports.texts
                ?.filter((id) => !texts.has(id))
                .forEach((id) =>
                    issues.push(`${release.collectionId} imports removed text ${target.collectionId}.${id}.`),
                );
            dependency.imports.assets
                ?.filter((id) => !assets.has(id))
                .forEach((id) =>
                    issues.push(`${release.collectionId} imports removed asset ${target.collectionId}.${id}.`),
                );
        }
    }
    return issues;
}
