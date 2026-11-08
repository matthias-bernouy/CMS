import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { PageCapabilityRequirement } from "content/application/interfaces/ContentReader";
import type { RenderingResourceReads } from "content/application/core/RenderingResourceReads";
import type { TPage } from "content/pages/interfaces/pages";
import { createBlocUsageResolver } from "./resolveUsedBlocTags";

type RequirementReader = Pick<ContentRepository, "getBlocsList" | "getBlocViewJS" | "getBlocViewsJS">;

/** Ordinary stored artifacts retain constraints through nested markup and browser Bloc references. */
export async function declaredPageRequirements(
    repository: RequirementReader,
    page: Pick<TPage, "content">,
    reads?: RenderingResourceReads,
): Promise<readonly PageCapabilityRequirement[]> {
    const content = page.content;
    const blocs = await repository.getBlocsList({ projection: "rendering", includeHidden: true }, reads);
    if (!blocs.some((bloc) => bloc.requires?.length)) {
        return [];
    }
    const used = new Set(await createBlocUsageResolver(blocs, repository)(content));
    const requirements = new Map<string, PageCapabilityRequirement>();
    for (const bloc of blocs) {
        if (!used.has(bloc.id)) {
            continue;
        }
        for (const requirement of bloc.requires ?? []) {
            const key = `${requirement.contractId}:${requirement.capabilityId}:${requirement.versionRange}`;
            requirements.set(key, { ...requirement });
        }
    }
    return [...requirements].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, requirement]) => requirement);
}
