import { buildBlocFoucShellCss, createBlocUsageResolver, type CmsRepository } from "@bernouy/cms-content";

type FrameBlocRepository = Pick<CmsRepository, "getBlocsList" | "getBlocViewJS">;

export async function buildEditorFrameFoucCss(content: string, repository: FrameBlocRepository): Promise<string> {
    const blocs = await repository.getBlocsList({ includeInactive: true });
    const resolvedTags = await createBlocUsageResolver(blocs, repository)(content);
    const views = await Promise.all(
        resolvedTags.map(async (tag) => ({ tag, viewJS: await repository.getBlocViewJS(tag) })),
    );
    const usedTags = views.filter((entry) => !!entry.viewJS).map((entry) => entry.tag);
    return buildBlocFoucShellCss(usedTags);
}
