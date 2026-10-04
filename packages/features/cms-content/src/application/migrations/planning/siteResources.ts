import type { CollectionRelease } from "@bernouy/cms-repository/collections";
import { replaceCollectionTextExpressions } from "@bernouy/cms-repository/collections/texts";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { assertContentRefsExist } from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
import type { BlocRecord, SiteBlocNode } from "cms-content/blocs/interfaces/blocs";
import type { CollectionMigrationReferenceSnapshot } from "../interfaces";
import { referencesThemeToken } from "../transforms/themeTokenReferences";
import { migrationIssue } from "./validation";

export async function validateTargetSiteResources(
    repository: CmsRepository,
    installed: readonly { release: CollectionRelease }[],
    targets: readonly { artifact: { release: CollectionRelease } }[],
    records: readonly BlocRecord[],
    references: readonly CollectionMigrationReferenceSnapshot[],
    removedThemeTokens: readonly string[],
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
    const releases = finalReleases(installed, targets);
    const texts = new Map(
        releases.map((release) => [release.collectionId, new Set((release.texts ?? []).map(({ id }) => id))]),
    );
    const finalViews = new Set(
        releases.flatMap((release) => (release.views ?? []).map((view) => `${release.collectionId}:${view.id}`)),
    );
    for (const record of records.filter(({ collectionId }) => !collectionId)) {
        for (const [location, content] of recordContents(record)) {
            try {
                await assertContentRefsExist({ getBlocsList: async () => finalBlocs }, content);
                assertTextReferences(content, texts);
                for (const tokenId of removedThemeTokens) {
                    if (referencesThemeToken(content, tokenId)) {
                        throw new Error(`references theme token ${tokenId}`);
                    }
                }
            } catch (error) {
                blocked.push(migrationIssue(`Site bloc ${record.tag} ${location} is incompatible`, error));
            }
        }
    }
    for (const snapshot of references) {
        for (const reference of snapshot.references) {
            if (reference.kind === "view" && !finalViews.has(`${reference.collectionId}:${reference.id}`)) {
                blocked.push(
                    `${reference.location} still references removed collection view ${reference.collectionId}:${reference.id}.`,
                );
            }
        }
    }
}

function finalReleases(
    installed: readonly { release: CollectionRelease }[],
    targets: readonly { artifact: { release: CollectionRelease } }[],
): CollectionRelease[] {
    const byId = new Map(targets.map(({ artifact }) => [artifact.release.collectionId, artifact.release]));
    return installed.map(({ release }) => byId.get(release.collectionId) ?? release);
}

function assertTextReferences(content: string, texts: ReadonlyMap<string, ReadonlySet<string>>): void {
    replaceCollectionTextExpressions(content, (collectionId, textId) => {
        if (!texts.get(collectionId)?.has(textId)) {
            throw new Error(`references collection text ${collectionId}.${textId}`);
        }
        return "";
    });
}

function recordContents(record: BlocRecord): [string, string][] {
    const contents: [string, string][] = [];
    for (const [name, value] of Object.entries({
        composition: record.artifact?.compositionHTML,
        component: record.artifact?.componentHTML,
        default: record.artifact?.defaultContent,
    })) {
        if (value) {
            contents.push([name, value]);
        }
    }
    for (const [name, snapshot] of [
        ["draft", record.siteDefinition?.draft],
        ["published", record.siteDefinition?.published],
    ] as const) {
        if (!snapshot) {
            continue;
        }
        contents.push([`${name} default`, snapshot.defaultContent]);
        contents.push([`${name} structure`, serializeNodes(snapshot.structure)]);
        for (const slot of snapshot.slots) {
            for (const accept of slot.accepts) {
                if (accept.kind === "component") {
                    contents.push([`${name} slot ${slot.id}`, `<${accept.tag}></${accept.tag}>`]);
                }
            }
        }
    }
    return contents;
}

function serializeNodes(nodes: readonly SiteBlocNode[]): string {
    return nodes
        .map((node) => {
            if (node.kind === "text") {
                return escapeHtml(node.value);
            }
            if (node.kind === "slot") {
                return "";
            }
            const attributes = Object.entries(node.attributes)
                .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
                .join("");
            return `<${node.tag}${attributes}>${serializeNodes(node.children)}</${node.tag}>`;
        })
        .join("");
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
