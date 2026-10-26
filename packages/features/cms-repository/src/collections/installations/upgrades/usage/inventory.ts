import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageContributor, UsageInventory, UsageReference } from "./interfaces";
import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionStore } from "../../core/CollectionStore";
import { collectionUsageInventory } from "./catalogue";
import { documentBlocIds, documentReferences } from "./scan";
import { localBlocDocuments } from "./localDocuments";
import { readUsageSnapshot, usageDigest, type UsageSnapshot } from "./snapshot";

export async function siteUsageInventory(
    repository: ContentRepository,
    collections: CollectionStore,
    siteId: string,
    contributors: readonly UsageContributor[],
    requiredConsumers: readonly string[],
): Promise<UsageInventory> {
    const before = await readUsageSnapshot(repository, collections, siteId, contributors);
    const inventory = inventoryFromSnapshot(siteId, before, requiredConsumers);
    const after = await readUsageSnapshot(repository, collections, siteId, contributors);
    if (before.digest !== after.digest) {
        const unknown = [...inventory.unknown, "Site changed while collecting usage; retry the analysis"];
        return { ...inventory, complete: false, unknown, digest: usageDigest({ ...inventory, unknown }) };
    }
    return inventory;
}

export function inventoryFromSnapshot(
    siteId: string,
    snapshot: UsageSnapshot,
    requiredConsumers: readonly string[],
    fallbackReleases: readonly CollectionRelease[] = [],
): UsageInventory {
    const releases = snapshot.installed.collections.map(({ release }) => release);
    const referenceReleases = [...releases, ...fallbackReleases];
    const references = [...collectionUsageInventory(releases)];
    const unknown: string[] = [];
    const local = new Map(
        snapshot.records.filter(({ contributionId }) => !contributionId).map((record) => [record.tag, record]),
    );
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    const walk = (html: string, location: string, seen = new Set<string>()) => {
        if (references.length > 100_000) {
            unknown.push("Usage reference limit exceeded");
            return;
        }
        try {
            references.push(...documentReferences(html, location, "runtime", referenceReleases));
        } catch (error) {
            unknown.push(`${location}: ${error instanceof Error ? error.message : "unanalysable document"}`);
            return;
        }
        for (const id of documentBlocIds(html)) {
            if (seen.has(id)) {
                continue;
            }
            const visited = new Set([...seen, id]);
            const bloc = blocs.get(id);
            if (bloc) {
                for (const requirement of bloc.requires) {
                    references.push({
                        ...requirement,
                        type: "capability",
                        scope: "runtime",
                        location: `${location}/bloc:${id}/requires`,
                    });
                }
                walk(bloc.markup, `${location}/bloc:${id}`, visited);
                for (const used of bloc.uses) {
                    walk(`<div cms-bloc="${used}"></div>`, `${location}/bloc:${id}/uses`, visited);
                }
            } else {
                const record = local.get(id);
                if (!record) {
                    if (!fallbackReleases.some((release) => release.blocs.some((bloc) => bloc.id === id))) {
                        unknown.push(`${location}: unknown Bloc ${id}`);
                    }
                } else {
                    for (const [name, document] of Object.entries(localBlocDocuments(record))) {
                        walk(document, `${location}/bloc:${id}/${name}`, visited);
                    }
                }
            }
        }
    };
    for (const release of releases) {
        for (const page of release.pages ?? []) {
            walk(page.document.html, `collection:${release.collectionId}/page:${page.id}`);
        }
    }
    for (const page of snapshot.pages) {
        const location = `page:${page.id}:${page.path}/${page.visible ? "published" : "draft"}`;
        walk(page.content, location);
        const entity = page.indexing?.entity;
        if (entity) {
            for (const capabilityId of [entity.resolve.capabilityId, entity.discover?.capabilityId].filter(
                (id): id is string => Boolean(id),
            )) {
                references.push({
                    type: "capability",
                    contractId: entity.contractId,
                    capabilityId,
                    scope: "runtime",
                    location: `${location}/indexing`,
                });
            }
        }
    }
    for (const record of local.values()) {
        for (const [name, document] of Object.entries(localBlocDocuments(record))) {
            walk(document, `local-bloc:${record.tag}/${name}`);
        }
    }
    const siteSystem = structuredClone(snapshot.system);
    siteSystem.theme.sources = siteSystem.theme.sources.filter((source) => source.owner?.kind !== "contribution");
    for (const theme of siteSystem.theme.themes) {
        for (const [mode, values] of Object.entries(theme.values)) {
            for (const key of Object.keys(values)) {
                const owner = [...referenceReleases]
                    .sort((a, b) => b.collectionId.length - a.collectionId.length)
                    .find(({ collectionId }) => key.startsWith(`${collectionId}-`));
                if (owner) {
                    references.push({
                        type: "resource",
                        kind: "theme-token",
                        collectionId: owner.collectionId,
                        id: key.slice(owner.collectionId.length + 1),
                        location: `site/system/theme/${theme.id}/${mode}/${key}`,
                        scope: "runtime",
                    });
                }
            }
        }
    }
    collectValues(siteSystem, "site/system", referenceReleases, references);
    for (const installation of snapshot.installed.collections) {
        collectValues(
            installation.configuration,
            `collection:${installation.collectionId}/configuration`,
            referenceReleases,
            references,
        );
        for (const id of Object.keys(installation.textOverrides)) {
            references.push({
                type: "resource",
                kind: "text",
                collectionId: installation.collectionId,
                id,
                scope: "runtime",
                location: `collection:${installation.collectionId}/text-overrides/${id}`,
            });
        }
    }
    for (const required of requiredConsumers) {
        if (!snapshot.extensionSnapshots.some(({ id }) => id === required)) {
            unknown.push(`Missing authoritative consumer inventory: ${required}`);
        }
    }
    for (const extension of snapshot.extensionSnapshots) {
        references.push(...extension.references);
        unknown.push(...(extension.unknown ?? []));
        if (!extension.complete) {
            unknown.push(`Consumer ${extension.id} inventory is incomplete`);
        }
    }
    if (references.length > 100_000) {
        unknown.push("Usage reference limit exceeded");
    }
    const unique = [...new Map(references.map((reference) => [usageDigest(reference), reference])).values()].sort(
        (a, b) => usageDigest(a).localeCompare(usageDigest(b)),
    );
    const result = {
        siteId,
        complete: !unknown.length,
        references: unique,
        unknown: [...new Set(unknown)].sort(),
        revisions: snapshot.revisions,
    };
    return { ...result, digest: usageDigest(result) };
}

function collectValues(
    value: unknown,
    location: string,
    releases: readonly CollectionRelease[],
    references: UsageReference[],
): void {
    if (typeof value === "string") {
        references.push(...documentReferences(value, location, "runtime", releases));
    } else if (value && typeof value === "object") {
        const page = value as Record<string, unknown>;
        if (
            page.kind === "contribution" &&
            typeof page.contributionId === "string" &&
            typeof page.pageId === "string"
        ) {
            references.push({
                type: "resource",
                collectionId: page.contributionId,
                kind: "page",
                id: page.pageId,
                location,
                scope: "runtime",
            });
        }
        for (const [key, child] of Object.entries(value)) {
            collectValues(child, `${location}/${key}`, releases, references);
        }
    }
}
