import { findUsedBlocTags, type BlocOwnership, type BlocRecord } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocDependencyGraph, transitiveDependencies } from "./validation/dependencies";

export type BlocCatalogueQuery = { search?: string; origin?: string; group?: string };

export async function siteBlocCatalogue(cms: ControlCms, query: BlocCatalogueQuery = {}) {
    const [records, pages] = await Promise.all([cms.repository.getBlocRecords(), cms.repository.getAllPages()]);
    const publishedGraph = siteBlocDependencyGraph(records);
    const draftGraph = new Map([...publishedGraph].map(([tag, dependencies]) => [tag, new Set(dependencies)]));
    for (const record of records) {
        if (record.siteDefinition) {
            draftGraph.set(record.tag, new Set(record.siteDefinition.draft.dependencies));
        }
    }
    const publishedTags = records.filter((record) => record.artifact).map((record) => ({ id: record.tag }));
    const pageRefs = pages.map((page) => ({ page, tags: new Set(findUsedBlocTags(page.content, publishedTags)) }));
    const normalizedSearch = query.search?.trim().toLowerCase() ?? "";

    return records
        .filter((record) => !record.artifact?.internal && record.artifact?.catalogue !== "inactive")
        .map((record) => {
            const definition = record.siteDefinition;
            const metadata = definition?.draft ?? record.artifact;
            const origin = ownershipView(record.ownership);
            const direct = definition?.draft.dependencies ?? [...(publishedGraph.get(record.tag) ?? [])].sort();
            const state: "archived" | "published" | "draft" = definition
                ? definition.lifecycle === "archived"
                    ? "archived"
                    : definition.publishedRevision === definition.draftRevision
                      ? "published"
                      : "draft"
                : "published";
            const usageCount =
                pageRefs.filter(({ tags }) => tags.has(record.tag)).length +
                records.filter(
                    (candidate) => candidate.tag !== record.tag && publishedGraph.get(candidate.tag)?.has(record.tag),
                ).length;
            const transitive = transitiveDependencies(draftGraph, record.tag);
            const publishedTransitive = transitiveDependencies(publishedGraph, record.tag);
            return {
                tag: record.tag,
                name: metadata?.name ?? record.tag,
                group: metadata?.group ?? "",
                description: metadata?.description ?? "",
                origin,
                state,
                stateLabel: state === "archived" ? "Archived" : state === "draft" ? "Draft" : "Published",
                stateColor: state === "archived" ? "secondary" : state === "draft" ? "warning" : "success",
                editable: origin.kind === "site-builder",
                editPath: origin.kind === "site-builder" ? `/editor/bloc?id=${encodeURIComponent(record.tag)}` : null,
                directDependencies: direct,
                directDependencyCount: direct.length,
                transitiveDependencies: transitive,
                transitiveDependencyCount: transitive.length,
                publishedTransitiveDependencies: publishedTransitive,
                usages: {
                    pages: pageRefs
                        .filter(({ tags }) => tags.has(record.tag))
                        .map(({ page }) => ({ id: page.id, label: page.title, path: page.path })),
                    blocs: records
                        .filter(
                            (candidate) =>
                                candidate.tag !== record.tag && publishedGraph.get(candidate.tag)?.has(record.tag),
                        )
                        .map((candidate) => ({ tag: candidate.tag, label: candidate.artifact?.name ?? candidate.tag })),
                },
                usageCount,
                usageLabel: `${usageCount} usage${usageCount === 1 ? "" : "s"}`,
                publishedRevision: definition?.publishedRevision ?? null,
                hasUnpublishedChanges:
                    definition !== undefined && definition.publishedRevision !== definition.draftRevision,
            };
        })
        .filter((item) => !query.origin || item.origin.kind === query.origin)
        .filter((item) => !query.group || item.group === query.group)
        .filter(
            (item) =>
                !normalizedSearch ||
                [item.name, item.tag, item.group, item.description].some((value) =>
                    value.toLowerCase().includes(normalizedSearch),
                ),
        )
        .sort((left, right) => left.name.localeCompare(right.name) || left.tag.localeCompare(right.tag));
}

function ownershipView(ownership: BlocOwnership) {
    if (ownership.kind === "integration") {
        return {
            ...ownership,
            label: "Integration",
            detail: `${ownership.integrationKind} · ${ownership.definitionVersion}`,
        };
    }
    if (ownership.kind === "site-builder") {
        return { ...ownership, label: "Site builder", detail: "Editable in this site" };
    }
    return { ...ownership, label: "Code managed", detail: "Managed through code or the CLI" };
}
