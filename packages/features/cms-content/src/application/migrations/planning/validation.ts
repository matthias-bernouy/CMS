import { replaceCollectionAssetExpressions, type CollectionRelease } from "@bernouy/cms-repository/collections";
import {
    parseCollectionTextOverrides,
    replaceCollectionTextExpressions,
} from "@bernouy/cms-repository/collections/texts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import { composeCollectionThemes } from "cms-content/theme/core/collections";
import type { CollectionMigrationResourceChange } from "../interfaces";
import { referencesThemeToken } from "../transforms/themeTokenReferences";

export function validateTargetData(
    release: CollectionRelease,
    configuration: Readonly<Record<string, unknown>>,
    textOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>,
    blocked: string[],
): void {
    try {
        if (release.configuration) {
            validateSchemaValue(release.configuration.schema, configuration);
        } else if (Object.keys(configuration).length) {
            throw new TypeError("configuration remains but the target has no configuration schema");
        }
        parseCollectionTextOverrides(textOverrides, release.texts ?? []);
    } catch (error) {
        blocked.push(migrationIssue(`${release.collectionId} site-owned data is incompatible`, error));
    }
}

export async function validateTargetPages(
    repository: CmsRepository,
    installed: readonly { release: CollectionRelease }[],
    targets: readonly { artifact: { release: CollectionRelease } }[],
    pages: readonly { page: { path: string }; content: string }[],
    blocked: string[],
): Promise<void> {
    const targetIds = new Set(targets.map(({ artifact }) => artifact.release.collectionId));
    const oldIds = new Set(
        installed
            .filter(({ release }) => targetIds.has(release.collectionId))
            .flatMap(({ release }) => release.blocs.map((bloc) => bloc.id)),
    );
    const current = await repository.getBlocsList({ includeInactive: true });
    const targetBlocs = targets.flatMap(({ artifact }) =>
        artifact.release.blocs.map((bloc) => ({
            id: bloc.id,
            ...(bloc.kind === "component" && bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
            ...(bloc.kind === "component" && bloc.settings ? { collectionSettings: bloc.settings } : {}),
        })),
    );
    const finalBlocs = [...current.filter((bloc) => !oldIds.has(bloc.id)), ...targetBlocs];
    const texts = collectionTexts(finalReleases(installed, targets));
    for (const { page, content } of pages) {
        try {
            await assertContentRefsExist({ getBlocsList: async () => finalBlocs }, content);
            assertTextReferences(content, texts);
            assertAssetReferences(content, finalReleases(installed, targets));
        } catch (error) {
            blocked.push(migrationIssue(`Page ${page.path} is incompatible with the target collections`, error));
        }
    }
}

function assertAssetReferences(content: string, releases: readonly CollectionRelease[]): void {
    const assets = new Map(
        releases.map((release) => [release.collectionId, new Set(release.assets.map(({ id }) => id))]),
    );
    replaceCollectionAssetExpressions(content, (collectionId, assetId) => {
        if (!assets.get(collectionId)?.has(assetId)) {
            throw new Error(`references collection asset ${collectionId}.${assetId}`);
        }
        return "";
    });
}

export function validateTargetTheme(
    system: Awaited<ReturnType<CmsRepository["getSystem"]>>,
    releases: readonly CollectionRelease[],
    resources: readonly CollectionMigrationResourceChange[],
    pages: readonly { page: { path: string }; content: string }[],
    blocked: string[],
): void {
    validateTargetPageThemeReferences(resources, pages, blocked);
    for (const resource of resources.filter((change) => change.kind === "theme-token" && change.change === "removed")) {
        if (
            system.theme.themes.some(({ values }) =>
                [values.light, values.dark].some(
                    (mode) =>
                        Object.hasOwn(mode, resource.id) ||
                        Object.values(mode).some((value) => referencesThemeToken(value, resource.id)),
                ),
            )
        ) {
            blocked.push(`Site theme still references removed theme token ${resource.id}.`);
        }
    }
    try {
        composeCollectionThemes(system.theme, releases);
    } catch (error) {
        blocked.push(migrationIssue("Target theme graph is invalid", error));
    }
}

export function validateTargetPageThemeReferences(
    resources: readonly CollectionMigrationResourceChange[],
    pages: readonly { page: { path: string }; content: string }[],
    blocked: string[],
): void {
    for (const resource of resources.filter((change) => change.kind === "theme-token" && change.change === "removed")) {
        pages
            .filter(({ content }) => referencesThemeToken(content, resource.id))
            .forEach(({ page }) =>
                blocked.push(`Page ${page.path} still references removed theme token ${resource.id}.`),
            );
    }
}

export function migrationIssue(context: string, error: unknown): string {
    return `${context}: ${error instanceof Error ? error.message : "unknown validation error"}.`;
}

function finalReleases(
    installed: readonly { release: CollectionRelease }[],
    targets: readonly { artifact: { release: CollectionRelease } }[],
): CollectionRelease[] {
    const byId = new Map(targets.map(({ artifact }) => [artifact.release.collectionId, artifact.release]));
    return installed.map(({ release }) => byId.get(release.collectionId) ?? release);
}

function collectionTexts(releases: readonly CollectionRelease[]): Map<string, Set<string>> {
    return new Map(
        releases.map((release) => [release.collectionId, new Set((release.texts ?? []).map(({ id }) => id))]),
    );
}

function assertTextReferences(content: string, texts: ReadonlyMap<string, ReadonlySet<string>>): void {
    replaceCollectionTextExpressions(content, (collectionId, textId) => {
        if (!texts.get(collectionId)?.has(textId)) {
            throw new Error(`references collection text ${collectionId}.${textId}`);
        }
        return "";
    });
}
