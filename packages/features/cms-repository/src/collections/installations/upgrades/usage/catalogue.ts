import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageReference } from "./interfaces";
import { documentReferences } from "./scan";

export function collectionUsageInventory(releases: readonly CollectionRelease[]): readonly UsageReference[] {
    const references: UsageReference[] = [];
    const ownerOf = (id: string) =>
        releases.find((release) => release.blocs.some((bloc) => bloc.id === id))?.collectionId;
    for (const release of releases) {
        for (const [field, kind] of [
            ["blocs", "bloc"],
            ["themeTokens", "theme-token"],
            ["texts", "text"],
            ["assets", "asset"],
            ["pages", "page"],
            ["states", "state"],
        ] as const) {
            for (const id of release.exports?.[field] ?? []) {
                references.push({
                    type: "resource",
                    collectionId: release.collectionId,
                    kind,
                    id,
                    location: `collection:${release.collectionId}/exports/${field}/${id}`,
                    scope: "catalogue",
                });
            }
        }
        for (const category of release.theme?.categories ?? []) {
            for (const entry of category.entries) {
                const location = `collection:${release.collectionId}/theme/${entry.id}`;
                if (entry.type === "font-face") {
                    references.push({
                        type: "resource",
                        collectionId: release.collectionId,
                        kind: "asset",
                        id: entry.asset,
                        location,
                        scope: "catalogue",
                    });
                } else {
                    for (const value of Object.values(entry.defaults)) {
                        references.push(...documentReferences(value, location, "catalogue", releases));
                    }
                }
            }
        }

        for (const dependency of release.dependencies ?? []) {
            for (const [field, kind] of [
                ["blocs", "bloc"],
                ["themeTokens", "theme-token"],
                ["texts", "text"],
                ["assets", "asset"],
                ["pages", "page"],
                ["states", "state"],
            ] as const) {
                for (const item of dependency.imports[field] ?? []) {
                    references.push({
                        type: "resource",
                        collectionId: dependency.collectionId,
                        kind,
                        id: item.id,
                        location: `collection:${release.collectionId}/imports/${field}/${item.id}`,
                        scope: "runtime",
                    });
                }
            }
        }
        for (const bloc of release.blocs) {
            const location = `collection:${release.collectionId}/bloc:${bloc.id}`;
            references.push(...documentReferences(bloc.markup, `${location}/markup`, "catalogue", releases));
            for (const requirement of bloc.requires) {
                references.push({
                    ...requirement,
                    type: "capability",
                    location: `${location}/requires`,
                    scope: "catalogue",
                });
            }
            for (const id of [
                ...bloc.uses,
                ...Object.values(bloc.slots).flatMap(
                    (slot) =>
                        slot.accepts?.flatMap((accept) => (accept.kind === "component" ? [accept.tag] : [])) ?? [],
                ),
            ]) {
                const owner =
                    ownerOf(id) ??
                    release.dependencies?.find((dependency) => dependency.imports.blocs.some((item) => item.id === id))
                        ?.collectionId;
                if (owner) {
                    references.push({
                        type: "resource",
                        collectionId: owner,
                        kind: "bloc",
                        id,
                        location: `${location}/contract`,
                        scope: "catalogue",
                    });
                }
            }
        }
        for (const page of release.pages ?? []) {
            const location = `collection:${release.collectionId}/page:${page.id}`;
            references.push(...documentReferences(page.document.html, location, "runtime", releases));
            for (const requirement of page.requires) {
                references.push({ ...requirement, type: "capability", location, scope: "runtime" });
            }
        }
        for (const example of release.examples ?? []) {
            references.push(
                ...documentReferences(
                    example.document.html,
                    `collection:${release.collectionId}/example:${example.id}`,
                    "catalogue",
                    releases,
                ),
            );
        }
    }
    return references;
}
