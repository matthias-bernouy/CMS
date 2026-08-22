import { detectPageIndexingCandidates, type PageIndexingConfiguration, type TPage } from "@bernouy/cms-content";
import type { SourceRepository } from "@bernouy/cms-sources";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { pageIndexingCandidateValue } from "cms-control/core/content/page/pageIndexingEditor";

export type PageIndexingSelectionUpdate = {
    enabled: boolean;
    candidate?: string;
};

export async function resolvePageIndexingSelection(
    page: TPage,
    repository: SourceRepository | null | undefined,
    update: PageIndexingSelectionUpdate,
): Promise<PageIndexingConfiguration> {
    if (!update.candidate) {
        return { enabled: update.enabled };
    }
    if (!repository) {
        throw new InvalidParam("indexingCandidate", "Data sources are not configured.");
    }

    const sources = await repository.getAllSources();
    const detection = detectPageIndexingCandidates(page.content, sources);
    const candidate = detection.candidates.find(
        (item) =>
            pageIndexingCandidateValue({
                sourceUrn: item.sourceUrn,
                entityId: item.entityId,
                pageQueryParam: item.identity.pageQueryParam,
            }) === update.candidate,
    );
    if (!candidate) {
        throw new InvalidParam("indexingCandidate", "It no longer matches an indexable binding on this page.");
    }

    return {
        enabled: update.enabled,
        entity: {
            sourceUrn: candidate.sourceUrn,
            entityId: candidate.entityId,
            pageQueryParam: candidate.identity.pageQueryParam,
        },
    };
}
