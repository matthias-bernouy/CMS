import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { TBloc } from "content/blocs/interfaces/blocs";
import { extractRefs } from "content/blocs/core/markup/contentRefs";
import { assertContentRefsExist } from "content/blocs/core/markup/validation/assertContentRefsExist";
import { analyzePageLinks } from "content/pages/core/routing/analysis/analyze";
import { assertContentDiagnostics } from "./diagnostics";
import { ContentValidationError } from "./errors";

/** Validate indexed direct and indirect Page consumers before replacing a published Bloc. */
export async function assertBlocPageConsumers(repository: ContentRepository, artifact: TBloc): Promise<void> {
    const catalogue = await repository.getBlocsList({ includeHidden: true });
    const affected = new Set([artifact.id]);
    const references = catalogue.map((bloc) => ({ id: bloc.id, uses: [...extractRefs(bloc.markupHTML).blocs] }));
    let changed = true;
    while (changed) {
        changed = false;
        for (const bloc of references) {
            if (!affected.has(bloc.id) && bloc.uses.some((id) => affected.has(id))) {
                affected.add(bloc.id);
                changed = true;
            }
        }
    }
    const definitions = [...catalogue.filter((bloc) => bloc.id !== artifact.id), artifact];
    const seen = new Set<string>();
    let volume = 0;
    for (const tag of affected) {
        let cursor: string | undefined;
        do {
            const batch = await repository.scanPagesByContentReference({ kind: "bloc", tag }, cursor, 50);
            for (const page of batch.pages) {
                volume += page.content.length;
                if (volume > 16 * 1024 * 1024 || seen.size > 1000) {
                    throw new ContentValidationError(
                        "content",
                        "Bloc consumer analysis exceeded its bounded Page budget.",
                        { code: "page.consumer_analysis_budget" },
                    );
                }
                if (seen.has(page.id)) {
                    continue;
                }
                seen.add(page.id);
                const analysis = await assertContentRefsExist({ getBlocsList: async () => definitions }, page.content);
                if (analysis) {
                    assertContentDiagnostics(await analyzePageLinks(repository, analysis, page, [page.path]));
                }
            }
            cursor = batch.nextCursor;
        } while (cursor);
    }
}
