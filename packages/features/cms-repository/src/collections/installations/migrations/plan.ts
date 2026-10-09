import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { assertCollectionResourceIsolation } from "@bernouy/cms-repository/collections/installations";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { createHash } from "node:crypto";
import type { CmsRepository } from "@bernouy/cms-content";
import { composeCollectionThemes } from "../../integration/content/theme";
import { analyzeResourceChanges } from "./impact";
import type {
    CollectionMigrationTarget,
    CollectionMigrationResourceChange,
    CollectionMigrationParticipant,
    PreparedCollectionMigration,
} from "./interfaces";
import { migratePageContent } from "./transforms/page";
import { migrateConfiguration, migrateTextOverrides, migrateThemeTokens } from "./transforms/siteData";
import { dependencyIssues, migrationOperations } from "./planning/evolution";
import {
    migrationIssue,
    validateTargetData,
    validateTargetPages,
    validateTargetPageThemeReferences,
    validateTargetTheme,
} from "./planning/validation";
import { validateTargetSiteResources } from "./planning/siteResources";
import { snapshotMigrationParticipants } from "./planning/participants";
import { collectionPageBatches } from "./planning/pageScan";

export async function prepareCollectionMigration(
    repository: CmsRepository,
    collections: CollectionStore,
    siteId: string,
    targets: readonly CollectionMigrationTarget[],
    expectedRevision?: number,
    participants: readonly CollectionMigrationParticipant[] = [],
    options: CollectionMigrationPreparationOptions = {},
): Promise<PreparedCollectionMigration> {
    if (targets.length === 0 || targets.length > 256) {
        throw new TypeError("A migration needs between 1 and 256 target releases");
    }
    const [snapshot, system, blocRecords, referenceSnapshots] = await Promise.all([
        collections.snapshot(siteId),
        repository.getSystem(),
        repository.getBlocRecords(),
        snapshotMigrationParticipants(siteId, participants),
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
    await validateTargetSiteResources(
        repository,
        snapshot.collections,
        targetArtifacts,
        blocRecords,
        referenceSnapshots,
        resources.filter(({ kind, change }) => kind === "theme-token" && change === "removed").map(({ id }) => id),
        blockedReasons,
    );
    let migratedSystem = system;
    try {
        migratedSystem = migrateThemeTokens(system, operationGroups);
    } catch (error) {
        blockedReasons.push(migrationIssue("Site theme migration failed", error));
    }
    validateTargetTheme(migratedSystem, finalReleases, resources, [], blockedReasons);
    let systemAfterCollectionCommit = system;
    let systemAfter = migratedSystem;
    let systemAfterCollectionRollback = migratedSystem;
    try {
        systemAfterCollectionCommit = {
            ...system,
            theme: composeCollectionThemes(system.theme, finalReleases),
        };
        systemAfter = {
            ...migratedSystem,
            theme: composeCollectionThemes(migratedSystem.theme, finalReleases),
        };
        systemAfterCollectionRollback = {
            ...systemAfter,
            theme: composeCollectionThemes(
                systemAfter.theme,
                snapshot.collections.map(({ release }) => release),
            ),
        };
    } catch (error) {
        blockedReasons.push(migrationIssue("Collection theme transition is invalid", error));
    }
    const previewLimit = options.pagePreviewLimit ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(previewLimit) || previewLimit < 0) {
        throw new TypeError("Collection migration page preview limit must be a nonnegative integer");
    }
    const pageChanges: PreparedCollectionMigration["pages"][number][] = [];
    const pageChangesHash = createHash("sha256").update("ulvia-migration-pages/v2\n");
    let pageCount = 0;
    const pageRevisionHash = createHash("sha256").update("ulvia-page-revisions/v1\n");
    for await (const pages of collectionPageBatches(repository)) {
        const transformedPages = pages.map((page) => transformPage(page, operationGroups, blockedReasons));
        for (const { id, revision } of pages) {
            pageRevisionHash.update(canonicalizeIJson({ id, revision })).update("\n");
        }
        await validateTargetPages(repository, snapshot.collections, targetArtifacts, transformedPages, blockedReasons);
        validateTargetPageThemeReferences(resources, transformedPages, blockedReasons);
        const batchChanges: PreparedCollectionMigration["pages"][number][] = [];
        for (const { page, content, applied } of transformedPages) {
            if (applied) {
                const change = {
                    before: structuredClone(page),
                    afterContent: content,
                    operations: applied,
                    state: "pending" as const,
                };
                pageChangesHash.update(canonicalizeIJson(JSON.parse(JSON.stringify(change)))).update("\n");
                batchChanges.push(change);
            }
        }
        if (batchChanges.length) {
            await options.onPageChanges?.(batchChanges, pageCount);
            const available = Math.max(0, previewLimit - pageChanges.length);
            pageChanges.push(...batchChanges.slice(0, available));
            pageCount += batchChanges.length;
        }
    }
    const prepared = {
        siteId,
        expectedCollectionRevision: snapshot.revision,
        pageRevisionDigest: `sha256:${pageRevisionHash.digest("hex")}`,
        siteResourceDigest: collectionSiteResourceDigest(blocRecords, referenceSnapshots),
        installationsBefore: snapshot.collections.map(({ release: _release, ...installation }) => installation),
        replacements,
        operationGroups,
        resources,
        pageCount,
        pageChangesDigest: `sha256:${pageChangesHash.digest("hex")}`,
        pages: pageChanges,
        systemBefore: system,
        systemAfterCollectionCommit,
        systemAfter,
        systemAfterCollectionRollback,
        blockedReasons: [...new Set(blockedReasons)],
    };
    return { ...prepared, planDigest: collectionMigrationPlanDigest(prepared) };
}

export function collectionSiteResourceDigest(
    records: readonly unknown[],
    participants: readonly { id: string; digest: string }[],
): string {
    const normalized = JSON.parse(
        JSON.stringify({
            records: [...records].sort((left, right) =>
                String((left as { tag?: string }).tag ?? "").localeCompare(
                    String((right as { tag?: string }).tag ?? ""),
                ),
            ),
            participants: participants
                .map(({ id, digest }) => ({ id, digest }))
                .sort((left, right) => left.id.localeCompare(right.id)),
        }),
    );
    return `sha256:${createHash("sha256").update(canonicalizeIJson(normalized)).digest("hex")}`;
}

function collectionMigrationPlanDigest(plan: Omit<PreparedCollectionMigration, "planDigest">): string {
    const { pages: _pages, ...header } = plan;
    const normalized = JSON.parse(JSON.stringify(header));
    return `sha256:${createHash("sha256").update(canonicalizeIJson(normalized)).digest("hex")}`;
}

export type CollectionMigrationPreparationOptions = {
    /** Maximum exact page snapshots retained in the returned planning preview. */
    pagePreviewLimit?: number;
    /** Receives every affected page batch in stable ID order. */
    onPageChanges?: (pages: readonly PreparedCollectionMigration["pages"][number][], start: number) => Promise<void>;
};

function transformPage(
    page: PreparedCollectionMigration["pages"][number]["before"],
    operationGroups: PreparedCollectionMigration["operationGroups"],
    blockedReasons: string[],
) {
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
}
