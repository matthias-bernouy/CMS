import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { assertCollectionResourceIsolation } from "@bernouy/cms-repository/collections/installations";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { createHash } from "node:crypto";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { analyzeResourceChanges } from "./impact";
import type {
    CollectionMigrationTarget,
    CollectionMigrationResourceChange,
    PreparedCollectionMigration,
} from "./interfaces";
import { migratePageContent } from "./transforms/page";
import { migrateConfiguration, migrateTextOverrides, migrateThemeTokens } from "./transforms/siteData";
import { dependencyIssues, migrationOperations } from "./planning/evolution";
import { migrationIssue, validateTargetData, validateTargetPages, validateTargetTheme } from "./planning/validation";

export async function prepareCollectionMigration(
    repository: CmsRepository,
    collections: CollectionStore,
    siteId: string,
    targets: readonly CollectionMigrationTarget[],
    expectedRevision?: number,
): Promise<PreparedCollectionMigration> {
    if (targets.length === 0 || targets.length > 256) {
        throw new TypeError("A migration needs between 1 and 256 target releases");
    }
    const [snapshot, pages, system] = await Promise.all([
        collections.snapshot(siteId),
        repository.getAllPages(),
        repository.getSystem(),
    ]);
    if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) {
        throw Object.assign(new Error("Collection state changed; reload the migration plan"), { status: 409 });
    }
    const targetArtifacts = await Promise.all(
        targets.map(async (target) => {
            const artifact = await collections.getRelease(target.digest);
            if (!artifact) {
                throw Object.assign(new Error(`Unknown collection release ${target.digest}`), { status: 404 });
            }
            return { target, artifact };
        }),
    );
    const ids = targetArtifacts.map(({ artifact }) => artifact.release.collectionId);
    if (new Set(ids).size !== ids.length) {
        throw new TypeError("Migration targets contain duplicate collection IDs");
    }
    const blockedReasons: string[] = [];
    const resources: CollectionMigrationResourceChange[] = [];
    const operationGroups: PreparedCollectionMigration["operationGroups"][number][] = [];
    const replacements: PreparedCollectionMigration["replacements"][number][] = [];
    const targetById = new Map(
        targetArtifacts.map(({ artifact }) => [artifact.release.collectionId, artifact.release]),
    );
    const finalReleases = snapshot.collections.map(({ release }) => targetById.get(release.collectionId) ?? release);
    try {
        assertCollectionResourceIsolation(finalReleases);
    } catch (error) {
        blockedReasons.push(migrationIssue("Target collection graph is invalid", error));
    }
    for (const { target, artifact } of targetArtifacts) {
        const previous = snapshot.collections.find((item) => item.collectionId === artifact.release.collectionId);
        if (!previous) {
            throw Object.assign(new Error(`Collection is not installed: ${artifact.release.collectionId}`), {
                status: 404,
            });
        }
        if (
            previous.release.publisherId !== artifact.release.publisherId ||
            compareSemVer(artifact.release.version, previous.release.version) <= 0
        ) {
            blockedReasons.push(`${artifact.release.collectionId} is not a newer release from the same publisher.`);
        }
        const operations = migrationOperations(previous.release, artifact.release, blockedReasons);
        const impact = await analyzeResourceChanges(previous.release, artifact.release);
        resources.push(...impact.changes);
        blockedReasons.push(...impact.blocked);
        if (
            impact.changes.some((change) => change.change === "contract-breaking" || change.change === "removed") &&
            (artifact.release.dataGeneration ?? 1) <= (previous.release.dataGeneration ?? 1)
        ) {
            blockedReasons.push(
                `${artifact.release.collectionId} has breaking resources without a data-generation bump.`,
            );
        }
        operationGroups.push({ collectionId: artifact.release.collectionId, operations });
        let configuration = previous.release.configuration
            ? previous.configuration
            : (artifact.release.configuration?.defaults ?? previous.configuration);
        let textOverrides = previous.textOverrides;
        try {
            configuration = migrateConfiguration(configuration, operations);
        } catch (error) {
            blockedReasons.push(
                migrationIssue(`${artifact.release.collectionId} configuration migration failed`, error),
            );
        }
        try {
            textOverrides = migrateTextOverrides(textOverrides, operations);
        } catch (error) {
            blockedReasons.push(migrationIssue(`${artifact.release.collectionId} text migration failed`, error));
        }
        validateTargetData(artifact.release, configuration, textOverrides, blockedReasons);
        replacements.push({
            collectionId: previous.collectionId,
            digest: artifact.digest,
            ...(target.repositoryId ? { repositoryId: target.repositoryId } : {}),
            configuration,
            textOverrides,
        });
    }
    blockedReasons.push(
        ...dependencyIssues(
            snapshot.collections,
            targetArtifacts.map(({ artifact }) => artifact.release),
        ),
    );
    const transformedPages = pages.map((page) => {
        let content = page.content;
        let applied = 0;
        for (const group of operationGroups) {
            try {
                const migrated = migratePageContent(content, group.operations, group.collectionId);
                content = migrated.content;
                applied += migrated.applied;
            } catch (error) {
                blockedReasons.push(migrationIssue(`Page ${page.path} migration failed`, error));
            }
        }
        return { page, content, applied };
    });
    await validateTargetPages(repository, snapshot.collections, targetArtifacts, transformedPages, blockedReasons);
    const pageChanges = transformedPages.flatMap(({ page, content, applied }) =>
        applied
            ? [{ before: structuredClone(page), afterContent: content, operations: applied, state: "pending" as const }]
            : [],
    );
    let systemAfter = system;
    try {
        systemAfter = migrateThemeTokens(system, operationGroups);
    } catch (error) {
        blockedReasons.push(migrationIssue("Site theme migration failed", error));
    }
    validateTargetTheme(systemAfter, finalReleases, resources, transformedPages, blockedReasons);
    return {
        siteId,
        expectedCollectionRevision: snapshot.revision,
        pageRevisionDigest: collectionPageRevisionDigest(pages),
        installationsBefore: snapshot.collections.map(({ release: _release, ...installation }) => installation),
        replacements,
        operationGroups,
        resources,
        pages: pageChanges,
        systemBefore: system,
        systemAfter,
        blockedReasons: [...new Set(blockedReasons)],
    };
}

export function collectionPageRevisionDigest(pages: readonly { id: string; revision: number }[]): string {
    const entries = pages
        .map(({ id, revision }) => ({ id, revision }))
        .sort((left, right) => left.id.localeCompare(right.id));
    return `sha256:${createHash("sha256").update(canonicalizeIJson(entries)).digest("hex")}`;
}
