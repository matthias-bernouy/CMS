import { buildBlocFoucShellCss, createBlocUsageResolver, type CmsRepository } from "@bernouy/cms-content";

type FrameBlocRepository = Pick<CmsRepository, "getBlocsList" | "getBlocViewJS">;

export async function buildEditorFrameFoucCss(content: string, repository: FrameBlocRepository): Promise<string> {
    const blocs = await repository.getBlocsList();
    const usedTags = await createBlocUsageResolver(blocs, repository)(content);
    return buildBlocFoucShellCss(usedTags);
}
