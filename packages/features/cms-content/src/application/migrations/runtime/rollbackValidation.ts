import { collectionThemeTokenId, type CollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { replaceCollectionTextExpressions } from "@bernouy/cms-repository/collections/texts";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { CollectionMigrationRecord } from "../interfaces";
import { referencesThemeToken } from "../transforms/themeTokenReferences";
import { forEachMigrationPage } from "./concurrency";
import { installationsMatch, migrationTargetsMatch } from "./helpers";

type RollbackValidationContext = {
    repository: CmsRepository;
    collections: CollectionStore;
};

export async function assertRollbackSafe(
    context: RollbackValidationContext,
    record: CollectionMigrationRecord,
): Promise<void> {
    const [state, system, pages, previousArtifacts] = await Promise.all([
        context.collections.snapshot(record.siteId),
        context.repository.getSystem(),
        context.repository.getAllPages(),
        Promise.all(record.installationsBefore.map(({ digest }) => context.collections.getRelease(digest))),
    ]);
    const restoredCollection =
        !!record.rollbackStartedAt &&
        state.revision === record.expectedCollectionRevision + 2 &&
        installationsMatch(state.collections, record.installationsBefore);
    if (
        state.revision !== record.expectedCollectionRevision &&
        (state.revision !== record.expectedCollectionRevision + 1 ||
            !migrationTargetsMatch(state.collections, record)) &&
        !restoredCollection
    ) {
        unsafe("Collections changed after the migration; rollback is unsafe");
    }
    if (
        ![
            record.systemBefore,
            record.systemAfterCollectionCommit,
            record.systemAfter,
            record.systemAfterCollectionRollback,
        ].some((expected) => isDeepStrictEqual(system, expected))
    ) {
        unsafe("System settings changed after the migration; rollback is unsafe");
    }
    if (previousArtifacts.some((artifact) => !artifact)) {
        unsafe("A collection release required by the rollback is no longer available");
    }
    const previousReleases = previousArtifacts.map((artifact) => artifact!.release);
    const prospectivePages = assertMigratedPagesUnchanged(record, pages);
    await assertProspectivePagesValid(context.repository, state.collections, previousReleases, prospectivePages);
}

function assertMigratedPagesUnchanged(record: CollectionMigrationRecord, pages: readonly TPage[]): TPage[] {
    const currentById = new Map(pages.map((page) => [page.id, page]));
    const prospectiveById = new Map(currentById);
    for (const change of record.pages) {
        const page = currentById.get(change.before.id);
        const untouched = page?.revision === change.before.revision && page.content === change.before.content;
        const appliedRevision = change.appliedRevision ?? change.before.revision + 1;
        const migrated = page?.revision === appliedRevision && page.content === change.afterContent;
        const restored =
            !!record.rollbackStartedAt &&
            page?.revision === (change.rolledBackRevision ?? appliedRevision + 1) &&
            page.content === change.before.content;
        if (!untouched && !migrated && !restored) {
            unsafe(`Page changed after migration: ${change.before.path}`);
        }
        prospectiveById.set(change.before.id, change.before);
    }
    return [...prospectiveById.values()];
}

async function assertProspectivePagesValid(
    repository: CmsRepository,
    currentCollections: readonly { release: CollectionRelease }[],
    previousReleases: readonly CollectionRelease[],
    pages: readonly TPage[],
): Promise<void> {
    const currentBlocIds = new Set(currentCollections.flatMap(({ release }) => release.blocs.map((bloc) => bloc.id)));
    const currentBlocs = await repository.getBlocsList({ includeInactive: true });
    const previousBlocs = previousReleases.flatMap((release) =>
        release.blocs.map((bloc) => ({
            id: bloc.id,
            ...(bloc.kind === "component" && bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
            ...(bloc.kind === "component" && bloc.settings ? { collectionSettings: bloc.settings } : {}),
        })),
    );
    const prospectiveBlocs = [...currentBlocs.filter(({ id }) => !currentBlocIds.has(id)), ...previousBlocs];
    const currentTokens = collectionTokenIds(currentCollections.map(({ release }) => release));
    const previousTokens = collectionTokenIds(previousReleases);
    const removedTokens = [...currentTokens].filter((id) => !previousTokens.has(id));
    const texts = new Map(
        previousReleases.map((release) => [release.collectionId, new Set((release.texts ?? []).map(({ id }) => id))]),
    );

    await forEachMigrationPage(pages, async (page) => {
        try {
            await assertContentRefsExist({ getBlocsList: async () => prospectiveBlocs }, page.content);
            for (const tokenId of removedTokens) {
                if (referencesThemeToken(page.content, tokenId)) {
                    throw new Error(`references theme token ${tokenId}`);
                }
            }
            replaceCollectionTextExpressions(page.content, (collectionId, textId) => {
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
    });
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
