import { collectionThemeTokenId, type CollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { replaceCollectionTextExpressions } from "@bernouy/cms-repository/collections/texts";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import { assertContentSupportsSurface } from "cms-content/blocs/core/markup/validation/assertContentSurface";
import type { CollectionMigrationParticipant, CollectionMigrationRecord } from "../interfaces";
import { snapshotMigrationParticipants } from "../planning/participants";
import { referencesThemeToken } from "../transforms/themeTokenReferences";
import { validateTargetSiteResources } from "../planning/siteResources";
import { migrationThemeTokenIds, themeTokenValuesMatch } from "./theme";
import { forEachMigrationPage, migrationPageBatches, migrationPageIterator } from "./concurrency";
import { migrationTargetInstallationsMatch } from "./helpers";
import { collectionPageBatches } from "../planning/pageScan";
import type { MigrationJournal } from "./journal";

type RollbackValidationContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    participants: readonly CollectionMigrationParticipant[];
    journal: MigrationJournal;
};

export async function assertRollbackSafe(
    context: RollbackValidationContext,
    record: CollectionMigrationRecord,
): Promise<void> {
    const [state, system, previousArtifacts, records, referenceSnapshots] = await Promise.all([
        context.collections.snapshot(record.siteId),
        context.repository.getSystem(),
        Promise.all(
            record.installationsBefore
                .filter(({ collectionId }) =>
                    record.replacements.some((replacement) => replacement.collectionId === collectionId),
                )
                .map(({ digest }) => context.collections.getRelease(digest)),
        ),
        context.repository.getBlocRecords(),
        snapshotMigrationParticipants(record.siteId, context.participants),
    ]);
    const targetsApplied = migrationTargetInstallationsMatch(state.collections, record, "after");
    const targetsRestored = migrationTargetInstallationsMatch(state.collections, record, "before");
    if (!targetsApplied && !targetsRestored) {
        unsafe("A migrated collection changed after the migration; rollback is unsafe");
    }
    if (
        !themeTokenValuesMatch(
            system.theme,
            [
                record.systemBefore.theme,
                record.systemAfterCollectionCommit.theme,
                record.systemAfter.theme,
                record.systemAfterCollectionRollback.theme,
            ],
            migrationThemeTokenIds(record),
        )
    ) {
        unsafe("Migrated theme token values changed after the migration; rollback is unsafe");
    }
    if (previousArtifacts.some((artifact) => !artifact)) {
        unsafe("A collection release required by the rollback is no longer available");
    }
    const previousReleases = previousArtifacts.map((artifact) => artifact!.release);
    await assertMigratedPagesUnchanged(context, record);
    await assertProspectivePagesValid(context, state.collections, previousReleases, record);
    const blocked: string[] = [];
    await validateTargetSiteResources(
        context.repository,
        state.collections,
        previousReleases.map((release) => ({ artifact: { release } })),
        records,
        referenceSnapshots,
        record.resources.filter(({ kind, change }) => kind === "theme-token" && change === "added").map(({ id }) => id),
        blocked,
    );
    if (blocked.length) {
        unsafe(`Rollback would invalidate site resources: ${blocked.join(" ")}`);
    }
}

async function assertMigratedPagesUnchanged(
    context: RollbackValidationContext,
    record: CollectionMigrationRecord,
): Promise<void> {
    for await (const pages of migrationPageBatches(context.journal, record)) {
        await forEachMigrationPage(pages, async (change) => {
            const page = await context.repository.getPageById(change.before.id);
            if (!page) {
                return;
            }
            if (page.content !== change.before.content && page.content !== change.afterContent) {
                unsafe(`Page changed after migration: ${change.before.path}`);
            }
        });
    }
}

async function assertProspectivePagesValid(
    context: RollbackValidationContext,
    currentCollections: readonly { release: CollectionRelease }[],
    previousReleases: readonly CollectionRelease[],
    record: CollectionMigrationRecord,
): Promise<void> {
    const targetIds = new Set(previousReleases.map(({ collectionId }) => collectionId));
    const replacedBlocIds = new Set(
        currentCollections
            .filter(({ release }) => targetIds.has(release.collectionId))
            .flatMap(({ release }) => release.blocs.map((bloc) => bloc.id)),
    );
    const currentBlocs = await context.repository.getBlocsList({ includeInactive: true });
    const previousBlocs = previousReleases.flatMap((release) =>
        release.blocs.map((bloc) => ({
            id: bloc.id,
            collectionSlots: bloc.slots,
            surfaces: bloc.surfaces,
            uses: bloc.uses,
            ...(bloc.kind === "composition" ? { compositionHTML: bloc.lightdom } : {}),
            ...(bloc.kind === "component" && bloc.lightdom ? { componentHTML: bloc.lightdom } : {}),
            ...(bloc.kind === "component" && bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
            ...(bloc.kind === "component" && bloc.settings ? { collectionSettings: bloc.settings } : {}),
        })),
    );
    const prospectiveBlocs = [...currentBlocs.filter(({ id }) => !replacedBlocIds.has(id)), ...previousBlocs];
    const finalReleases = [
        ...currentCollections
            .filter(({ release }) => !targetIds.has(release.collectionId))
            .map(({ release }) => release),
        ...previousReleases,
    ];
    const currentTokens = collectionTokenIds(
        currentCollections.filter(({ release }) => targetIds.has(release.collectionId)).map(({ release }) => release),
    );
    const previousTokens = collectionTokenIds(previousReleases);
    const removedTokens = [...currentTokens].filter((id) => !previousTokens.has(id));
    const texts = new Map(
        finalReleases.map((release) => [release.collectionId, new Set((release.texts ?? []).map(({ id }) => id))]),
    );

    const changes = migrationPageIterator(context.journal, record);
    let change = await changes.next();
    for await (const pages of collectionPageBatches(context.repository)) {
        for (const page of pages) {
            while (!change.done && change.value.before.id.localeCompare(page.id) < 0) {
                change = await changes.next();
            }
            const content =
                !change.done && change.value.before.id === page.id ? change.value.before.content : page.content;
            try {
                const prospectiveRepository = {
                    getBlocsList: async () => prospectiveBlocs,
                    getBlocViewJS: (tag: string) => context.repository.getBlocViewJS(tag),
                };
                await assertContentRefsExist(prospectiveRepository, content);
                await assertContentSupportsSurface(prospectiveRepository, content, page.surface);
                for (const tokenId of removedTokens) {
                    if (referencesThemeToken(content, tokenId)) {
                        throw new Error(`references theme token ${tokenId}`);
                    }
                }
                replaceCollectionTextExpressions(content, (collectionId, textId) => {
                    if (!texts.get(collectionId)?.has(textId)) {
                        throw new Error(`references collection text ${collectionId}.${textId}`);
                    }
                    return "";
                });
            } catch (error) {
                unsafe(
                    `Rollback would invalidate page ${page.path}: ${error instanceof Error ? error.message : "unknown error"}`,
                );
            }
        }
    }
}

function collectionTokenIds(releases: readonly CollectionRelease[]): Set<string> {
    return new Set(
        releases.flatMap((release) =>
            (release.theme?.categories ?? []).flatMap((category) =>
                category.tokens.map((token) => collectionThemeTokenId(release.collectionId, token.id)),
            ),
        ),
    );
}

function unsafe(message: string): never {
    throw Object.assign(new Error(message), { status: 409 });
}
